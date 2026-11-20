const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { stableId } = require('../model');
const { lookupListingPlacesHandler } = require('../listing-places');
const { matchesSearch, normalizeSearch } = require('../search');
const {
  elasticListingIndexProvider, elasticListingSearchProvider, listingSearchProjection, listingSearchQuery,
  normalizeListingQuery, reconcileListingSearchHandler, searchListingsHandler, syncListingSearchHandler,
} = require('../listing-search');

const SECRET = 'a dedicated local test cursor secret with at least 32 bytes';
const fixture = {
  category: 'vehicles', status: 'active', title: 'Volkswagen Golf GTI', make: 'Volkswagen', model: 'Golf',
  country: 'XK', city: 'Pristina', price: 13000, year: 2018, mileage: 74000, power: 220, engineCapacity: 1984,
  engineName: '2.0 TSI', body: 'hatchback', fuel: 'petrol', sellerType: 'dealer',
  description: 'Auer special edition with original wheels', createdAt: 1748800000000,
};

const options = (data = {}) => ({ data });
const elasticConfig = fetchImpl => ({
  baseUrl: 'https://example.invalid/', alias: 'limba-listings', apiKey: 'mock-api-key', fetchImpl,
});

async function placeFrom(city, country) {
  const result = await lookupListingPlacesHandler()(options({ query: city, country }));
  return result.places[0];
}

function snapshot(id, data, timestamp = 1) {
  return {
    id,
    data: () => data,
    readTime: { seconds: 1_748_800_000 + timestamp, nanoseconds: 1000 },
    ...(data ? { updateTime: { seconds: 1_748_800_000 + timestamp, nanoseconds: 1000 } } : {}),
  };
}

test('listing query interprets literal substrings and combines filters in the provider', async () => {
  const { id } = await placeFrom('Prishtinë', 'XK');
  const query = normalizeListingQuery({ filters: {
    make: ' VW ', model: 'gOl', keyword: '*au?er\\', priceFrom: '12000', priceTo: '14000', mileageTo: '74000',
    yearFrom: '2010', capacityTo: '2100', powerFrom: '200', sellerType: 'dealer', fuel: 'petrol',
  }, countries: ['RS', 'XK', 'RS'], sort: 'latest', radius: { placeId: id, km: 50 } });
  assert.equal(query.sort, 'recent');
  const filters = listingSearchQuery(query).bool.filter;
  assert.deepEqual(filters.slice(0, 4), [
    { term: { visible: true } }, { terms: { country: ['RS', 'XK'] } },
    { term: { fuel: 'petrol' } }, { term: { sellerType: 'dealer' } },
  ]);
  assert.deepEqual(filters.find(filter => filter.wildcard?.keywordText), {
    wildcard: { keywordText: { value: String.raw`*\*au\?er\\*` } },
  });
  assert.deepEqual(filters.find(filter => filter.wildcard?.makeText), { wildcard: { makeText: { value: '*volkswagen*' } } });
  assert.deepEqual(filters.find(filter => filter.range?.price), { range: { price: { gte: 12000, lte: 14000 } } });
  assert.equal(filters.at(-1).geo_distance.distance, '50km');
  assert.throws(() => normalizeListingQuery({ filters: { priceFrom: '3', priceTo: '2' } }), { code: 'invalid-argument' });
  assert.throws(() => normalizeListingQuery({ sort: ['priceLow'] }), { code: 'invalid-argument' });
  assert.throws(() => normalizeListingQuery({ radius: { placeId: id, km: 501 } }), { code: 'invalid-argument' });
  assert.throws(() => normalizeListingQuery({ radius: { placeId: 'gn-0', km: 50 } }), { code: 'invalid-argument' });
});

test('index uses only allowlisted search data and official locations', async () => {
  const place = await placeFrom('Pristina', 'XK');
  const indexed = listingSearchProjection('car-1', {
    ...fixture, city: place.name, placeId: place.id, contactEmail: 'private@example.invalid',
    uid: 'private-owner', image: 'https://example.invalid/private-token', latitude: 42, longitude: 99,
    documentNotes: 'private paperwork', arbitrary: 'not indexed',
  });
  assert.equal(indexed.updatedAt, undefined);
  for (const privateField of ['uid', 'contactEmail', 'image', 'latitude', 'longitude', 'documentNotes', 'arbitrary', 'placeId']) {
    assert.ok(!Object.hasOwn(indexed, privateField), privateField);
  }
  assert.ok(indexed.keywordText.includes('auer special'));
  assert.ok(indexed.location.lat > 42 && indexed.location.lon < 22);
  assert.equal(listingSearchProjection('car-1', { ...fixture, placeId: place.id, city: 'Prizren' }).location, undefined);
  assert.ok(listingSearchProjection('car-1', { ...fixture, city: 'Приштина' }).location);
  assert.deepEqual(listingSearchProjection('car-1', { ...fixture, status: 'sold' }), { id: 'car-1', visible: false });
  assert.deepEqual(listingSearchProjection('demo-car', fixture), { id: 'demo-car', visible: false });
});

test('optional saved-search radius preserves legacy alert IDs and matches with live criteria', async () => {
  const legacy = { name: 'Golf', filters: { keyword: 'uer Sp', mileageTo: '75000' }, countries: ['XK'] };
  const normalized = normalizeSearch(legacy);
  assert.equal(stableId(normalized), 'd8cb387aa230b2ef60816f29c086711752f956cb57c52dc5f72ae5683e502aaf');
  assert.equal(stableId(normalized), stableId(normalizeSearch({ ...legacy, radius: null })));
  assert.equal(Object.hasOwn(normalized, 'radius'), false);
  const { id } = await placeFrom('Приштина', 'XK');
  const nearby = normalizeSearch({ ...legacy, radius: { placeId: id, km: 50 } });
  assert.notEqual(stableId(nearby), stableId(normalized));
  assert.equal(matchesSearch(fixture, nearby), true);
  assert.equal(matchesSearch({ ...fixture, city: 'Prizren' }, nearby), false);
  assert.equal(matchesSearch({ ...fixture, city: 'Prizren' }, { ...nearby, radius: { placeId: id, km: 75 } }), true);
});

function pagedTestBackend(source) {
  const contexts = new Map();
  const requests = [];
  let nextPit = 0;
  const provider = {
    async open() {
      const pit = `pit-${nextPit++}`;
      contexts.set(pit, [...source].map(([id, data]) => [id, { ...data }]));
      return pit;
    },
    async page(criteria, { pit, size, after }) {
      const order = criteria.sort === 'priceLow' ? 1 : -1;
      const field = criteria.sort === 'recent' ? 'createdAt' : 'price';
      const hits = contexts.get(pit).filter(([, car]) => matchesSearch(car, criteria))
        .map(([id, car]) => ({ id, sort: [car[field], id, 0] }))
        .sort((a, b) => (a.sort[0] - b.sort[0]) * order || (a.id < b.id ? -1 : a.id === b.id ? 0 : 1));
      const start = after ? hits.findIndex(hit => hit.id === after[1]) + 1 : 0;
      return { pit, hits: hits.slice(start, start + size) };
    },
    async close(pit) { contexts.delete(pit); },
  };
  const db = {
    collection() { return { doc: id => id }; },
    async getAll(...ids) {
      requests.push(ids.length);
      return ids.map(id => snapshot(id, source.get(id)));
    },
  };
  return { provider, db, requests, contexts };
}

test('bounded pages cover more than 300 records and handle edits and removals across the cursor', async () => {
  const source = new Map();
  for (let i = 0; i < 450; i++) {
    source.set(`car-${String(i).padStart(3, '0')}`, {
      ...fixture, uid: 'owner', contactEmail: 'hidden@example.invalid', modificationNotes: 'Auspuffanlage',
    });
  }
  const { provider, db, requests, contexts } = pagedTestBackend(source);
  const api = searchListingsHandler(db, () => provider, () => SECRET);
  const { id } = await placeFrom('Pristina', 'XK');
  const query = { sort: 'priceLow', filters: { keyword: 'uer Sp', yearFrom: '2014' }, radius: { placeId: id, km: 15 } };
  const first = await api(options(query));
  assert.equal(first.items.length, 24);
  assert.equal(first.items[0].distanceKm, 0);
  assert.equal(first.items[0].id, 'car-000');
  assert.equal(first.items[23].id, 'car-023');
  assert.equal(first.items[0].uid, undefined);
  assert.equal(first.items[0].contactEmail, undefined);
  assert.equal(first.items[0].modificationNotes, undefined);
  assert.equal(first.items[0].performance, true);
  assert.ok(first.nextCursor);
  await assert.rejects(api(options({ ...query, sort: 'priceHigh', cursor: first.nextCursor })), {
    code: 'invalid-argument', details: { reason: 'cursor-invalid' },
  });
  await assert.rejects(api(options({ ...query, cursor: `${first.nextCursor}a` })), { code: 'invalid-argument' });

  source.delete('car-024');
  source.get('car-025').status = 'paused';
  source.get('car-026').price = 15000;
  source.set('car-new', { ...fixture, price: 2000 });
  const ids = first.items.map(item => item.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const { items, nextCursor } = await api(options({ ...query, cursor }));
    ids.push(...items.map(item => item.id));
    cursor = nextCursor;
  }
  assert.equal(contexts.size, 0);
  assert.deepEqual(ids, [...source.keys()].filter(id => !['car-025', 'car-026', 'car-new'].includes(id)));
  assert.ok(requests.every(size => size <= 25));
  assert.equal(ids.length, 447);
});

test('direct search remains explicitly unavailable without a configured provider', async () => {
  const api = searchListingsHandler(null, () => null, () => SECRET);
  await assert.rejects(api(options()), { code: 'failed-precondition', details: { reason: 'search-disabled' } });
});

test('Elastic Serverless transport uses PIT updates and alias guarded versioned writes', async () => {
  const requests = [];
  const data = [
    { id: 'pit-initial' },
    { pit_id: 'pit-latest', hits: { hits: [{ _id: 'car-1', sort: [13_000, 'car-1', 4] }] } },
    { hits: { hits: [] } },
    { succeeded: true },
    { items: [{ index: { status: 409 } }, { index: { status: 200 } }] },
  ];
  const fetchImpl = async (url, request) => {
    requests.push({ url, ...request });
    return new Response(JSON.stringify(data.shift()));
  };
  const reader = elasticListingSearchProvider(elasticConfig(fetchImpl));
  const writer = elasticListingIndexProvider(elasticConfig(fetchImpl));
  const pit = await reader.open();
  const query = normalizeListingQuery({ sort: 'priceLow' });
  const page = await reader.page(query, { pit, size: 25 });
  assert.equal(page.pit, 'pit-latest');
  await reader.page(query, { pit: page.pit, after: page.hits[0].sort, size: 25 });
  await reader.close(page.pit);
  await writer.putBatch([
    { id: 'car-1', version: 100, doc: { id: 'car-1', visible: false } },
    { id: 'car-2', version: 101, doc: listingSearchProjection('car-2', fixture) },
  ]);
  assert.equal(requests[0].url, 'https://example.invalid/limba-listings/_pit?keep_alive=2m');
  assert.equal(requests[0].headers.Authorization, 'ApiKey mock-api-key');
  assert.deepEqual(JSON.parse(requests[2].body).search_after, [13000, 'car-1', 4]);
  assert.deepEqual(JSON.parse(requests[2].body).pit, { id: 'pit-latest', keep_alive: '2m' });
  assert.equal(requests[3].method, 'DELETE');
  assert.equal(requests[4].url, 'https://example.invalid/_bulk?require_alias=true');
  assert.deepEqual(JSON.parse(requests[4].body.split('\n')[0]), {
    index: { _index: 'limba-listings', _id: 'car-1', version: 100, version_type: 'external' },
  });
});

test('late changes read the latest listing and reconciliation repairs missing and orphaned entries', async () => {
  const writes = [];
  const stateWrites = [];
  const provider = {
    alias: 'limba-listings',
    async putBatch(entries) { writes.push(entries); },
    async pageIds() { return ['orphan']; },
  };
  const listings = {
    doc(id) { return { id, get: async () => snapshot(id, { ...fixture, status: 'sold' }, 10) }; },
    orderBy() {
      return { limit: () => ({ get: async () => ({ docs: [snapshot('existing', fixture)], size: 1 }) }) };
    },
  };
  const db = {
    collection(name) {
      if (name === 'listings') return listings;
      assert.equal(name, 'listingSearchState');
      return { doc: () => ({ get: async () => snapshot('state'), set: async value => stateWrites.push(value) }) };
    },
    async getAll(...refs) { return refs.map(({ id }) => snapshot(id, undefined, 20)); },
  };
  await syncListingSearchHandler(db, () => provider)({ params: { listingId: 'existing' }, data: { after: fixture } });
  assert.deepEqual(writes[0][0].doc, { id: 'existing', visible: false });
  await reconcileListingSearchHandler(db, () => provider)();
  assert.equal(writes[1][0].doc.visible, true);
  assert.equal(writes[1][0].id, 'existing');
  assert.deepEqual(writes[2][0].doc, { id: 'orphan', visible: false });
  assert.ok(writes[2][0].version > writes[0][0].version);
  assert.equal(stateWrites[0].sourceAfter, null);
  assert.equal(stateWrites[0].indexAfter, null);
});

test('Firestore emulator supplies server timestamps, public card batches and deletion versions', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async t => {
  const project = `demo-search-${randomUUID().slice(0, 8)}`;
  const app = initializeApp({ projectId: project }, project);
  t.after(() => deleteApp(app));
  const db = getFirestore(app);
  const carId = 'test-listing';
  const docRef = db.collection('listings').doc(carId);
  await docRef.create({ ...fixture, createdAt: Timestamp.fromMillis(fixture.createdAt) });
  const writes = [];
  const indexer = {
    alias: 'search-test',
    async putBatch(entries) { writes.push(...entries); },
    async pageIds() { return [carId]; },
  };
  const sync = syncListingSearchHandler(db, () => indexer);
  await sync({ params: { listingId: carId } });
  assert.equal(writes[0].doc.visible, true);
  assert.equal(writes[0].doc.createdAt, fixture.createdAt);
  assert.ok(Number.isSafeInteger(writes[0].version));

  const state = new Map([[carId, fixture]]);
  const { provider } = pagedTestBackend(state);
  const api = searchListingsHandler(db, () => provider, () => SECRET);
  assert.equal((await api(options())).items[0].id, carId);
  await docRef.delete();
  assert.deepEqual(await api(options()), { items: [], nextCursor: null });
  await reconcileListingSearchHandler(db, () => indexer)();
  assert.deepEqual(writes.at(-1).doc, { id: carId, visible: false });
  assert.ok(writes.at(-1).version > writes[0].version);
});
