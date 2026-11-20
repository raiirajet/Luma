const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const { applicationDefault, deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const {
  elasticListingIndexProvider, elasticListingSearchProvider, listingSearchMappings, listingSearchProjection,
  searchListingsHandler,
} = require('../listing-search');
const { lookupListingPlacesHandler } = require('../listing-places');
const { matchesSearch } = require('../search');

const DATASET_SIZE = 1000;
const DEFAULT_SESSIONS = 100;
const DEFAULT_WORKERS = 8;
const REGION = 'europe-west6';

function readLimit(envName, fallback, max) {
  const value = Number(process.env[envName] || fallback);
  assert.ok(Number.isInteger(value) && value >= 1 && value <= max, `Invalid ${envName}.`);
  return value;
}

async function syntheticData(marker) {
  const lookup = lookupListingPlacesHandler();
  const places = await Promise.all([
    ['Pristina', 'XK'], ['Prizren', 'XK'], ['Tirana', 'AL'], ['Zagreb', 'HR'], ['Sofia', 'BG'],
  ].map(async ([query, country]) => (await lookup({ data: { query, country } })).places[0]));
  assert.ok(places.every(Boolean));
  const makes = ['Volkswagen', 'Mercedes-Benz', 'Škoda', 'Citroën'];
  const models = ['Golf', 'C Klasse', 'Octavia', 'C3'];
  const data = new Map();
  const lastPublish = Date.now();
  for (let index = 0; index < DATASET_SIZE; index++) {
    const brand = index % makes.length;
    const place = places[index % places.length];
    data.set(`${marker}-${String(index).padStart(4, '0')}`, {
      category: 'vehicles', status: 'active', title: `${makes[brand]} ${models[brand]}`,
      make: makes[brand], model: models[brand], country: place.country, city: place.name, placeId: place.id,
      description: `${marker} ${index % 3 === 0 ? 'turbo performance' : 'regular service'} synthetic staging listing`,
      createdAt: lastPublish - Math.floor(index / 4) * 1000,
      price: 3000 + (index % 90) * 300, year: 2005 + (index % 21), mileage: 10_000 + index * 100,
      power: 90 + (index % 60), engineCapacity: 1400 + (index % 7) * 100, engineName: '1.8 TSI',
      fuel: index % 7 ? 'petrol' : 'diesel', body: 'hatchback', transmission: index % 2 ? 'automatic' : 'manual',
      sellerType: index % 3 ? 'privateSeller' : 'dealer', condition: 'used',
    });
  }
  return { data, center: places[0] };
}

function localCallable(data, provider) {
  const db = {
    collection() { return { doc: id => id }; },
    async getAll(...ids) { return ids.map(id => ({ id, data: () => data.get(id) })); },
  };
  const callable = searchListingsHandler(db, () => provider, () => 'local-only-cursor-secret-for-synthetic-benchmark');
  return async payload => callable({ data: payload });
}

function localSearch(data) {
  const pits = new Map();
  const provider = {
    async open() {
      const id = randomUUID();
      pits.set(id, [...data]);
      return id;
    },
    async page(criteria, { pit, after, size }) {
      const field = criteria.sort === 'recent' ? 'createdAt' : 'price';
      const order = criteria.sort === 'priceLow' ? 1 : -1;
      const hits = pits.get(pit).filter(([, listing]) => matchesSearch(listing, criteria))
        .map(([id, listing]) => ({ id, sort: [listing[field], id] }))
        .sort((left, right) => order * (left.sort[0] - right.sort[0]) || left.id.localeCompare(right.id, 'en'));
      const start = after ? hits.findIndex(hit => hit.id === after[1]) + 1 : 0;
      return { pit, hits: hits.slice(start, start + size) };
    },
    async close(pit) { pits.delete(pit); },
  };
  return localCallable(data, provider);
}

async function loopbackSearch(data, alias, run) {
  const port = readLimit('LIMBA_BENCHMARK_ELASTIC_PORT', 9200, 65_535);
  const origin = `http://127.0.0.1:${port}`;
  const index = `${alias}-v1`;
  const apiKey = process.env.LIMBA_BENCHMARK_LOOPBACK_API_KEY || 'local-elastic-benchmark';
  const headers = { 'Content-Type': 'application/json', Authorization: `ApiKey ${apiKey}` };
  async function admin(method, path, body) {
    const response = await fetch(`${origin}${path}`, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(12_000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Loopback Elasticsearch returned ${response.status} for ${method} ${path}.`);
    return result;
  }
  const info = await admin('GET', '/');
  assert.ok(info.version?.number, 'Expected an Elasticsearch service on loopback.');
  const indexConfig = { mappings: listingSearchMappings, aliases: { [alias]: { is_write_index: true } } };
  await admin('PUT', `/${index}`, indexConfig);
  try {
    const config = {
      baseUrl: 'https://loopback.invalid', alias, apiKey,
      fetchImpl: (url, request) => fetch(`${origin}${new URL(url).pathname}${new URL(url).search}`, request),
    };
    const indexer = elasticListingIndexProvider(config);
    const entries = [...data].map(([id, listing]) => ({ id, version: 1, doc: listingSearchProjection(id, listing) }));
    for (let start = 0; start < entries.length; start += 150) await indexer.putBatch(entries.slice(start, start + 150));
    await admin('POST', `/${index}/_refresh`);
    console.log(`Local Elasticsearch version ${info.version.number}`);
    return await run(localCallable(data, elasticListingSearchProvider(config)), 'loopback-elasticsearch');
  } finally {
    await admin('DELETE', `/${index}`);
  }
}

async function stagingSearch(data, run) {
  const projectId = process.env.LIMBA_BENCHMARK_STAGING_PROJECT;
  const appCheckToken = process.env.LIMBA_BENCHMARK_APP_CHECK_TOKEN;
  assert.match(projectId || '', /^[a-z][a-z0-9-]*-staging(?:-[a-z0-9-]+)?$/);
  assert.ok(projectId !== 'limba-auto' && !process.env.FIRESTORE_EMULATOR_HOST, 'Use an isolated staging project.');
  assert.ok(appCheckToken, 'Supply a Firestore staging app App Check token.');
  const endpoint = `https://${REGION}-${projectId}.cloudfunctions.net/searchListings`;
  const app = initializeApp({ projectId, credential: applicationDefault() });
  const db = getFirestore(app);
  const inserted = [];
  const invoke = async payload => {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckToken },
      body: JSON.stringify({ data: payload }),
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(`Staging callable returned ${body.error?.status || response.status}.`);
    }
    assert.ok(Array.isArray(body.result?.items), 'Unexpected staging callable response.');
    return body.result;
  };
  try {
    await invoke({ filters: { keyword: 'limba-staging-preflight' } });
    const seedStart = performance.now();
    const seed = db.bulkWriter();
    const stored = [...data].map(([id, listing]) => {
      const ref = db.collection('listings').doc(id);
      return seed.create(ref, { ...listing, createdAt: Timestamp.fromMillis(listing.createdAt) })
        .then(() => inserted.push(ref));
    });
    const seedResults = await Promise.allSettled([...stored, seed.close()]);
    if (seedResults.some(result => result.status === 'rejected')) throw new Error('Staging seeding failed.');
    return await run(invoke, 'staging', Math.round(performance.now() - seedStart));
  } finally {
    try {
      if (inserted.length) {
        const cleanup = db.bulkWriter();
        const deletions = inserted.map(ref => cleanup.delete(ref));
        const cleanupResults = await Promise.allSettled([...deletions, cleanup.close()]);
        if (cleanupResults.some(result => result.status === 'rejected')) {
          console.error('Staging cleanup failed for one or more owned run records.');
          process.exitCode = 1;
        }
      }
    } finally {
      await deleteApp(app);
    }
  }
}

async function countPages(search, input) {
  const ids = new Set();
  const seenCursors = new Set();
  let cursor;
  do {
    const result = await search({ ...input, ...(cursor ? { cursor } : {}) });
    for (const item of result.items) {
      assert.ok(!ids.has(item.id), `Duplicate result ID ${item.id}.`);
      ids.add(item.id);
    }
    cursor = result.nextCursor;
    if (cursor) {
      assert.ok(!seenCursors.has(cursor) && seenCursors.size < 100, 'The index returned an invalid page sequence.');
      seenCursors.add(cursor);
    }
  } while (cursor);
  return ids.size;
}

async function benchmark(search, mode, marker, center, sessions, workers, seedMs) {
  const profiles = [
    { filters: { keyword: marker }, countries: [], sort: 'recent' },
    { filters: { keyword: marker, make: 'VW', yearFrom: '2012', mileageTo: '96000' }, sort: 'priceLow' },
    { filters: { keyword: `${marker} turbo`, priceFrom: '7000', powerTo: '143' }, sort: 'priceHigh' },
    { filters: { keyword: marker }, countries: ['XK', 'AL'], radius: { placeId: center.id, km: 100 } },
  ];
  const freshnessStart = performance.now();
  const attempts = mode === 'staging' ? 20 : 1;
  let indexedCount;
  for (let round = 0; round < attempts; round++) {
    indexedCount = await countPages(search, profiles[0]);
    if (indexedCount === DATASET_SIZE) break;
    if (round + 1 < attempts) await sleep(2000);
  }
  assert.equal(indexedCount, DATASET_SIZE, 'The fresh index did not expose every test record.');
  const initialCoverageMs = Math.round(performance.now() - freshnessStart);

  const durations = [];
  let sessionsStarted = 0;
  let returnedCards = 0;
  async function timedSearch(input) {
    const start = performance.now();
    const result = await search(input);
    durations.push(performance.now() - start);
    returnedCards += result.items.length;
    assert.ok(result.items.length <= 24);
    return result;
  }
  const started = performance.now();
  const load = await Promise.allSettled(Array.from({ length: workers }, async () => {
    while (sessionsStarted < sessions) {
      const sequence = sessionsStarted++;
      const profile = profiles[sequence % profiles.length];
      const first = await timedSearch(profile);
      if (sequence % 16 < 4 && first.nextCursor) await timedSearch({ ...profile, cursor: first.nextCursor });
    }
  }));
  for (const result of load) if (result.status === 'rejected') throw result.reason;
  const elapsed = performance.now() - started;
  durations.sort((left, right) => left - right);
  const percentile = p => Math.round(durations[Math.max(0, Math.ceil(durations.length * p) - 1)] * 10) / 10;
  console.log(JSON.stringify({
    mode, dataset: DATASET_SIZE, marker, indexedCount,
    ...(seedMs === undefined ? {} : { seedMs, coverageFromSeedStartMs: seedMs + initialCoverageMs }),
    initialCoverageMs, sessions, workers, calls: durations.length, returnedCards,
    requestsPerSecond: Math.round(1000 * durations.length / elapsed), p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    maxMs: percentile(1), elapsedMs: Math.round(elapsed),
  }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(!args.length || (args.length === 1 && ['--staging', '--loopback'].includes(args[0])),
    'Expected no argument, --staging or --loopback.');
  const sessions = readLimit('LIMBA_BENCHMARK_SESSIONS', DEFAULT_SESSIONS, 1000);
  const workers = readLimit('LIMBA_BENCHMARK_WORKERS', DEFAULT_WORKERS, 24);
  const marker = `limba-bench-${randomUUID().slice(0, 12)}`;
  const { data, center } = await syntheticData(marker);
  const run = (search, mode, seedMs) => benchmark(search, mode, marker, center, sessions, workers, seedMs);
  if (args[0] === '--staging') {
    console.log(`Isolated staging run prefix ${marker}`);
    await stagingSearch(data, run);
  } else if (args[0] === '--loopback') {
    await loopbackSearch(data, marker, run);
  } else {
    await run(localSearch(data), 'local-in-memory');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
