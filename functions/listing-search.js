const { listingBadges } = require('./listing-badges.mjs');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');
const { activeVehicle, inputObject, stableId } = require('./model');
const { findListingPlace, listingDistanceKm } = require('./listing-places');
const {
  EXACT_FILTERS, RANGE_FILTERS, matchesSearch, normalizeSearchCriteria, normalizeMake, normalizeListingMake,
  normalizeSearchText, listingSearchText, listingSearchPlace, listingSearchNumber,
} = require('./search');

const PAGE_SIZE = 24;
const MAX_BATCHES = 4;
const MAX_SEARCH_WORK_MS = 12_000;
const RECONCILE_BATCH = 150;
const PIT_KEEP_ALIVE = '2m';
const CURSOR_IDLE_MS = 2 * 60_000;
const CURSOR_MAX_MS = 10 * 60_000;
const MAX_CURSOR_LENGTH = 16_384;
const LISTING_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CARD_TEXT_FIELDS = [
  'title', 'make', 'model', 'modelExtension', 'country', 'city', 'condition', 'engineName', 'fuel',
  'transmission', 'body', 'sellerType', 'image', 'accidentStatus', 'customsStatus', 'customsCountry',
];
const SORTS = {
  recent: { field: 'createdAt', order: 'desc' },
  priceLow: { field: 'price', order: 'asc' },
  priceHigh: { field: 'price', order: 'desc' },
};
const MISSING_PRICE = { asc: Number.MAX_SAFE_INTEGER, desc: -Number.MAX_SAFE_INTEGER };

const listingSearchMappings = {
  dynamic: 'strict',
  properties: {
    id: { type: 'keyword' },
    visible: { type: 'boolean' },
    createdAt: { type: 'long' },
    country: { type: 'keyword' },
    keywordText: { type: 'wildcard' },
    makeText: { type: 'wildcard' },
    modelText: { type: 'wildcard' },
    engineText: { type: 'wildcard' },
    location: { type: 'geo_point' },
    ...Object.fromEntries(EXACT_FILTERS.map(field => [field, { type: 'keyword' }])),
    ...Object.fromEntries(Object.keys(RANGE_FILTERS).map(field => [field, { type: 'double' }])),
  },
};

function timestampMillis(timestamp) {
  if (typeof timestamp?.toMillis === 'function') return Math.floor(timestamp.toMillis());
  return Number.isSafeInteger(timestamp) ? timestamp : 0;
}

function publicSearchListing(id, data) {
  return activeVehicle(data) && typeof data.make === 'string' && data.make &&
    typeof data.model === 'string' && data.model && !data.isDemo && !data.isPreview && !id.startsWith('demo-');
}

function listingCard(id, listing, radius) {
  const card = { id, category: 'vehicles', status: 'active', createdAt: timestampMillis(listing.createdAt) };
  for (const field of CARD_TEXT_FIELDS) {
    if (typeof listing[field] === 'string') card[field] = listing[field];
  }
  for (const field of Object.keys(RANGE_FILTERS)) {
    const value = listingSearchNumber(listing, field);
    if (value !== undefined) card[field] = value;
  }
  card.performance = ['modelExtension', 'modificationNotes'].some(field =>
    typeof listing[field] === 'string' && listing[field].trim() !== '');
  card.tuningBadges = listingBadges(listing);
  if (radius) {
    const distance = listingDistanceKm(listingSearchPlace(listing), findListingPlace(radius.placeId));
    if (Number.isFinite(distance)) card.distanceKm = Math.round(distance * 10) / 10;
  }
  return card;
}

function listingSearchProjection(id, listing) {
  if (!publicSearchListing(id, listing)) return { id, visible: false };
  const doc = {
    id,
    visible: true,
    createdAt: timestampMillis(listing.createdAt),
    keywordText: listingSearchText(listing),
    makeText: normalizeListingMake(listing.make),
    modelText: normalizeMake(listing.model),
    engineText: normalizeSearchText(listing.engineName),
  };
  for (const field of ['country', ...EXACT_FILTERS]) {
    if (typeof listing[field] === 'string') doc[field] = listing[field];
  }
  for (const field of Object.keys(RANGE_FILTERS)) {
    const value = listingSearchNumber(listing, field);
    if (value !== undefined) doc[field] = value;
  }
  const place = listingSearchPlace(listing);
  if (place) doc.location = { lat: place.lat, lon: place.lon };
  return doc;
}

function normalizeListingQuery(data) {
  inputObject(data);
  if (Object.keys(data).some(key => !['filters', 'countries', 'radius', 'sort', 'cursor'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Unknown listing search option.');
  }
  const criteria = normalizeSearchCriteria({ ...data, filters: data.filters ?? {}, countries: data.countries ?? [] });
  const sort = data.sort == null || data.sort === 'latest' ? 'recent' : data.sort;
  if (typeof sort !== 'string' || !Object.hasOwn(SORTS, sort)) {
    throw new HttpsError('invalid-argument', 'Invalid listing sort.');
  }
  for (const [min, max] of Object.values(RANGE_FILTERS)) {
    if (criteria.filters[min] && criteria.filters[max] && Number(criteria.filters[min]) > Number(criteria.filters[max])) {
      throw new HttpsError('invalid-argument', 'The lower search limit exceeds the upper limit.');
    }
  }
  return { ...criteria, sort };
}

function wildcardLiteral(value) {
  return `*${value.replace(/[\\*?]/g, '\\$&')}*`;
}

function listingSearchQuery(criteria) {
  const { filters, countries, radius } = criteria;
  const filter = [{ term: { visible: true } }];
  if (countries.length) filter.push({ terms: { country: countries } });
  for (const field of EXACT_FILTERS) {
    if (filters[field]) filter.push({ term: { [field]: filters[field] } });
  }
  const textFilters = {
    keywordText: normalizeSearchText(filters.keyword),
    makeText: normalizeListingMake(filters.make),
    modelText: normalizeMake(filters.model),
    engineText: normalizeSearchText(filters.engineTerm),
  };
  for (const [field, value] of Object.entries(textFilters)) {
    if (value) filter.push({ wildcard: { [field]: { value: wildcardLiteral(value) } } });
  }
  for (const [field, [min, max]] of Object.entries(RANGE_FILTERS)) {
    const range = {};
    if (filters[min]) range.gte = Number(filters[min]);
    if (filters[max]) range.lte = Number(filters[max]);
    if (filters[min] || filters[max]) filter.push({ range: { [field]: range } });
  }
  if (radius) {
    const point = findListingPlace(radius.placeId);
    filter.push({ geo_distance: { distance: `${radius.km}km`, location: { lat: point.lat, lon: point.lon } } });
  }
  return { bool: { filter } };
}

function expiredCursor() {
  return new HttpsError('failed-precondition', 'The listing search expired. Start it again.', { reason: 'cursor-expired' });
}

function invalidCursor() {
  return new HttpsError('invalid-argument', 'Invalid listing search cursor.', { reason: 'cursor-invalid' });
}

function cursorSignature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

function writeCursor(context, secret) {
  const payload = Buffer.from(JSON.stringify(context)).toString('base64url');
  return `${payload}.${cursorSignature(payload, secret).toString('base64url')}`;
}

function readCursor(token, key, secret, now) {
  if (typeof token !== 'string' || token.length > MAX_CURSOR_LENGTH || !/^[\w-]+\.[\w-]{43}$/.test(token)) {
    throw invalidCursor();
  }
  const [payload, signature] = token.split('.');
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.toString('base64url') !== signature || !timingSafeEqual(supplied, cursorSignature(payload, secret))) {
    throw invalidCursor();
  }
  let context;
  try { context = JSON.parse(Buffer.from(payload, 'base64url')); } catch { throw invalidCursor(); }
  if (context.v !== 1 || context.key !== key || typeof context.pit !== 'string' ||
      !Array.isArray(context.after) || !Number.isSafeInteger(context.startedAt) ||
      !Number.isSafeInteger(context.expiresAt)) throw invalidCursor();
  if (context.expiresAt <= now) throw expiredCursor();
  return context;
}

class ElasticRequestError extends Error {
  constructor(operation, status) {
    super(`Elastic listing ${operation} failed (${status})`);
    this.operation = operation;
    this.status = status;
  }
}

function elasticTransport({ baseUrl, alias, apiKey, fetchImpl = fetch }) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      typeof alias !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(alias) ||
      typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Invalid Elastic listing search configuration.');
  }

  return async function elasticRequest(operation, method, path, body, { bulk = false, timeout = 8000 } = {}) {
    let response;
    try {
      response = await fetchImpl(`${url.origin}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `ApiKey ${apiKey}`,
          ...(body === undefined ? {} : { 'Content-Type': bulk ? 'application/x-ndjson' : 'application/json' }),
        },
        body: body === undefined || bulk ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new ElasticRequestError(operation, 'transport');
    }
    if (!response.ok) throw new ElasticRequestError(operation, response.status);
    try { return await response.json(); } catch { throw new ElasticRequestError(operation, 'invalid response'); }
  };
}

function validateSearchResponse(result, operation) {
  if (result.timed_out || result._shards?.failed || !Array.isArray(result.hits?.hits)) {
    throw new ElasticRequestError(operation, 'incomplete response');
  }
  return result.hits.hits;
}

function elasticListingSearchProvider(config) {
  const request = elasticTransport(config);
  return {
    async open() {
      const result = await request('open', 'POST', `/${config.alias}/_pit?keep_alive=${PIT_KEEP_ALIVE}`,
        undefined, { timeout: 4000 });
      if (typeof result.id !== 'string' || !result.id) throw new ElasticRequestError('open', 'invalid PIT');
      return result.id;
    },
    async page(criteria, { pit, after, size }) {
      const sort = SORTS[criteria.sort];
      const result = await request('page', 'POST', '/_search?allow_partial_search_results=false', {
        query: listingSearchQuery(criteria),
        size,
        sort: [
          sort.field === 'price' ? { price: { order: sort.order, missing: MISSING_PRICE[sort.order] } } :
            { createdAt: sort.order },
          { id: 'asc' },
        ],
        pit: { id: pit, keep_alive: PIT_KEEP_ALIVE },
        ...(after ? { search_after: after } : {}),
        _source: false,
        track_total_hits: false,
        timeout: '3s',
      }, { timeout: 4000 });
      const hits = validateSearchResponse(result, 'page').map(hit => ({ id: hit._id, sort: hit.sort }));
      if (hits.some(hit => typeof hit.id !== 'string' || !LISTING_ID.test(hit.id) || !Array.isArray(hit.sort))) {
        throw new ElasticRequestError('page', 'invalid hit');
      }
      return { pit: result.pit_id || pit, hits };
    },
    async close(pit) {
      await request('close', 'DELETE', '/_pit', { id: pit }, { timeout: 2000 });
    },
  };
}

function elasticListingIndexProvider(config) {
  const request = elasticTransport(config);
  return {
    alias: config.alias,
    async putBatch(entries) {
      if (!entries.length) return;
      const body = entries.flatMap(({ id, version, doc }) => [
        JSON.stringify({ index: { _index: config.alias, _id: id, version, version_type: 'external' } }),
        JSON.stringify(doc),
      ]).join('\n') + '\n';
      const result = await request('index', 'POST', '/_bulk?require_alias=true', body, { bulk: true });
      if (!Array.isArray(result.items) || result.items.length !== entries.length || result.items.some(({ index }) =>
        !(index && ((index.status >= 200 && index.status < 300) || index.status === 409)))) {
        throw new ElasticRequestError('index', 'write failed');
      }
    },
    async pageIds(after, size) {
      const result = await request('reconcile', 'POST', `/${config.alias}/_search?allow_partial_search_results=false`, {
        query: { term: { visible: true } },
        sort: [{ id: 'asc' }],
        size,
        ...(after ? { search_after: [after] } : {}),
        _source: false,
        track_total_hits: false,
        timeout: '3s',
      });
      const ids = validateSearchResponse(result, 'reconcile').map(hit => hit._id);
      if (ids.some(id => typeof id !== 'string' || !LISTING_ID.test(id))) {
        throw new ElasticRequestError('reconcile', 'invalid hit');
      }
      return ids;
    },
  };
}

async function closePit(provider, pit) {
  try { await provider.close(pit); } catch (error) {
    logger.warn('Search snapshot cleanup failed', { status: error.status });
  }
}

function searchListingsHandler(db, getProvider, getCursorSecret) {
  return async function searchListings(request) {
    const criteria = normalizeListingQuery(request.data);
    const provider = getProvider();
    const secret = provider && getCursorSecret();
    if (!provider || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
      throw new HttpsError('failed-precondition', 'Listing search is unavailable.', { reason: 'search-disabled' });
    }

    const now = Date.now();
    const key = stableId(criteria);
    const token = request.data.cursor;
    let context = token == null ? null : readCursor(token, key, secret, now);
    const resumed = Boolean(context);
    try {
      if (!context) context = { v: 1, key, pit: await provider.open(), startedAt: now };
      const items = [];
      let more = true;
      for (let batch = 0; batch < MAX_BATCHES && more && items.length < PAGE_SIZE; batch++) {
        if (batch > 0 && Date.now() - now >= MAX_SEARCH_WORK_MS) break;
        const size = PAGE_SIZE + 1;
        const { hits, pit } = await provider.page(criteria, { ...context, size });
        context.pit = pit;
        if (!hits.length) { more = false; break; }
        const snapshots = await db.getAll(...hits.map(hit => db.collection('listings').doc(hit.id)));
        const listings = new Map(snapshots.map(snapshot => [snapshot.id, snapshot.data()]));
        let consumed = 0;
        for (const hit of hits) {
          if (items.length === PAGE_SIZE) break;
          consumed++;
          context.after = hit.sort;
          const listing = listings.get(hit.id);
          if (!publicSearchListing(hit.id, listing) || !matchesSearch(listing, criteria)) continue;
          const card = listingCard(hit.id, listing, criteria.radius);
          // Values changed while paging get their new position on the next search.
          const sort = SORTS[criteria.sort];
          const sortValue = card[sort.field] ?? MISSING_PRICE[sort.order];
          if (sortValue !== hit.sort[0]) continue;
          items.push(card);
        }
        more = consumed < hits.length || hits.length === size;
      }

      const expiresAt = Math.min(context.startedAt + CURSOR_MAX_MS, Date.now() + CURSOR_IDLE_MS);
      if (!more || !context.after) {
        await closePit(provider, context.pit);
        return { items, nextCursor: null };
      }
      if (expiresAt <= Date.now()) throw expiredCursor();
      return { items, nextCursor: writeCursor({ ...context, expiresAt }, secret) };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (resumed && error instanceof ElasticRequestError && error.operation === 'page' && error.status === 404) {
        throw expiredCursor();
      }
      if (!resumed && context?.pit) await closePit(provider, context.pit);
      logger.error('Listing search failed', { operation: error.operation, status: error.status || error.code });
      throw new HttpsError('unavailable', 'Listing search is temporarily unavailable.');
    }
  };
}

function newIndexEntry(snapshot) {
  // Existing documents use their version, so periodic scans cannot rewrite unchanged entries.
  // For hard deletes a newer server read time fences off work that saw the previous document.
  const time = snapshot.updateTime ?? snapshot.readTime;
  const version = time?.seconds * 1_000_000 + Math.floor(time?.nanoseconds / 1000);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Missing listing read version.');
  return { id: snapshot.id, version, doc: listingSearchProjection(snapshot.id, snapshot.data()) };
}

function syncListingSearchHandler(db, getIndexer) {
  return async function syncListingSearch(event) {
    const provider = getIndexer();
    const id = event.params?.listingId;
    if (!provider || typeof id !== 'string' || !LISTING_ID.test(id)) return;
    // Use the current Firestore state when delivery is repeated or out of order.
    const current = await db.collection('listings').doc(id).get();
    await provider.putBatch([newIndexEntry(current)]);
  };
}

function reconcileListingSearchHandler(db, getIndexer) {
  return async function reconcileListingSearch() {
    const provider = getIndexer();
    if (!provider) return;
    const stateRef = db.collection('listingSearchState').doc(provider.alias);
    const state = (await stateRef.get()).data() || {};
    const listings = db.collection('listings');

    let query = listings.orderBy(FieldPath.documentId()).limit(RECONCILE_BATCH);
    if (state.sourceAfter) query = query.startAfter(state.sourceAfter);
    const source = await query.get();
    const sourceEntries = source.docs.filter(doc => LISTING_ID.test(doc.id)).map(newIndexEntry);
    await provider.putBatch(sourceEntries);

    // A scan of visible index IDs also removes orphan records after missed hard deletes.
    const indexIds = await provider.pageIds(state.indexAfter, RECONCILE_BATCH);
    if (indexIds.length) {
      const indexed = await db.getAll(...indexIds.map(id => listings.doc(id)));
      await provider.putBatch(indexed.filter(snapshot => !publicSearchListing(snapshot.id, snapshot.data()))
        .map(newIndexEntry));
    }

    await stateRef.set({
      sourceAfter: source.size === RECONCILE_BATCH ? source.docs.at(-1).id : null,
      indexAfter: indexIds.length === RECONCILE_BATCH ? indexIds.at(-1) : null,
      checkedAt: FieldValue.serverTimestamp(),
    });
  };
}

module.exports = {
  elasticListingIndexProvider, elasticListingSearchProvider, listingSearchMappings, listingSearchProjection,
  listingSearchQuery, normalizeListingQuery, reconcileListingSearchHandler, searchListingsHandler, syncListingSearchHandler,
};
