const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { chatHandlers } = require('../chat');
const { processSearchJobsHandler, searchAlertHandler, trackListingHandler } = require('../alerts');
const { matchesSearch, normalizeSearch } = require('../search');

const search = (overrides = {}) => ({ name: 'Golf', filters: { make: 'VW' }, countries: ['HR'], ...overrides });
const fixture = {
  category: 'vehicles', status: 'active', uid: 'seller', title: 'Golf GTI', make: 'Volkswagen', model: 'Golf',
  country: 'HR', price: 13000, year: 2018, mileage: 74000, power: 220, engineCapacity: 1984,
  engineName: '2.0 TSI', body: 'hatchback', fuel: 'petrol', sellerType: 'privateSeller',
};
const request = (uid, data, emailVerified = true) => ({ auth: { uid, token: { email_verified: emailVerified } }, data });

test('canonical search identity ignores whitespace, omitted filters and country order', () => {
  const canonical = normalizeSearch(search({ countries: ['RS', 'HR'] }));
  assert.deepEqual(canonical, normalizeSearch(search({
    name: ' Golf ', filters: { make: ' VW ', mileageTo: '' }, countries: ['HR', 'RS', 'HR'],
  })));
  assert.equal(Object.keys(canonical.filters).length, 18);
  assert.throws(() => normalizeSearch(search({ countries: ['DE'] })), { code: 'invalid-argument' });
  assert.throws(() => normalizeSearch(search({ countries: [], filters: { priceTo: 'false' } })), { code: 'invalid-argument' });
  assert.throws(() => normalizeSearch(search({ countries: [], filters: { other: 'unknown' } })), { code: 'invalid-argument' });
});

test('search matching honors make aliases, countries, limits and missing engine capacity', () => {
  const query = normalizeSearch(search({
    countries: ['HR'], filters: { make: 'vw', model: 'golf', keyword: 'gti', engineTerm: 'TSI',
      yearFrom: '2018', mileageTo: '75000', priceTo: '14000', powerFrom: '220', capacityFrom: '1900',
      body: 'hatchback', fuel: 'petrol', sellerType: 'privateSeller' },
  }));
  assert.equal(matchesSearch(fixture, query), true);
  assert.equal(matchesSearch({ ...fixture, make: 'VW' }, {
    ...query, filters: { ...query.filters, make: 'Volkswagen' },
  }), true);
  assert.equal(matchesSearch({ ...fixture, country: 'RS' }, query), false);
  assert.equal(matchesSearch({ ...fixture, price: 15000 }, query), false);
  assert.equal(matchesSearch({ ...fixture, engineCapacity: undefined }, query), false);
  assert.equal(matchesSearch({ ...fixture, engineName: '2.0 TDI' }, query), false);
});

test('Firestore emulator transactions isolate chat activity and deduplicate listing events', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async t => {
  const project = `demo-backend-${randomUUID().slice(0, 8)}`;
  const app = initializeApp({ projectId: project }, project);
  t.after(() => deleteApp(app));
  const db = getFirestore(app);
  const chat = chatHandlers(db);
  const alert = searchAlertHandler(db);
  const track = trackListingHandler(db);
  const processJobs = processSearchJobsHandler(db);
  const listing = db.collection('listings').doc('integration-car');
  const match = search({ countries: ['HR'], enabled: true });

  await assert.rejects(alert(request('unverified', match, false)), { code: 'failed-precondition' });
  const { alertId } = await alert(request('buyer', match));
  assert.equal((await alert(request('buyer', match))).alertId, alertId);
  await alert(request('buyer', { ...match, name: 'Volkswagen' }));
  await alert(request('off', match));
  await alert(request('off', { ...match, enabled: false }));
  await alert(request('region', { ...match, countries: ['RS'] }));
  const otherSearch = normalizeSearch(search({ countries: ['RS'] }));
  const earlierPage = db.batch();
  for (let i = 0; i < 100; i++) {
    earlierPage.create(db.doc(`users/another-${i}/searchAlerts/generic-golf`), {
      ...otherSearch, createdAt: FieldValue.serverTimestamp(),
    });
  }
  await earlierPage.commit();
  const beforeCreate = await listing.get();
  await listing.create(fixture);
  const afterCreate = await listing.get();
  await alert(request('late', match));

  const creation = { id: 'create-1', data: { before: beforeCreate, after: afterCreate } };
  await Promise.all([track(creation), track(creation)]);
  await processJobs();
  assert.equal((await db.collection('users/buyer/notifications').get()).size, 0);
  await processJobs();
  await processJobs();
  assert.equal((await db.collection('users/buyer/notifications').get()).size, 1);
  for (const uid of ['off', 'region', 'late']) {
    assert.equal((await db.collection(`users/${uid}/notifications`).get()).size, 0, uid);
  }
  await listing.update({ price: 12500 });
  const revised = await listing.get();
  const update = { id: 'price-1', data: { before: afterCreate, after: revised } };
  await Promise.all([track(update), track(update)]);
  const priceEvents = await listing.collection('priceHistory').get();
  assert.equal(priceEvents.size, 1);
  assert.equal(priceEvents.docs[0].get('previousPrice'), 13000);
  assert.equal(priceEvents.docs[0].get('price'), 12500);

  const listingId = listing.id;
  await assert.rejects(chat.startListingChat(request('seller', { listingId })), { code: 'failed-precondition' });
  const { threadId } = await chat.startListingChat(request('buyer', { listingId }));
  assert.equal((await chat.startListingChat(request('buyer', { listingId }))).threadId, threadId);
  const msg = { threadId, text: 'Still available?', messageId: 'retry-1' };
  const retry = await Promise.all([chat.sendListingMessage(request('buyer', msg)), chat.sendListingMessage(request('buyer', msg))]);
  assert.equal(retry[0].messageId, retry[1].messageId);
  assert.equal((await db.collection(`chatThreads/${threadId}/messages`).get()).size, 1);
  await assert.rejects(chat.sendListingMessage(request('outsider', msg)), { code: 'permission-denied' });
  await assert.rejects(chat.sendListingMessage(request('buyer', { ...msg, text: 'Different' })), { code: 'already-exists' });
  await chat.setListingChatBlocked(request('seller', { threadId, blocked: true }));
  await chat.setListingChatBlocked(request('buyer', { threadId, blocked: false }));
  await assert.rejects(chat.sendListingMessage(request('buyer', { ...msg, messageId: 'retry-2' })), { code: 'failed-precondition' });
  await chat.reportListingChat(request('seller', { threadId, reason: 'Report reason' }));
  await chat.reportListingChat(request('seller', { threadId, reason: 'Retry' }));
  assert.equal((await db.collection('chatReports').get()).size, 1);
  await chat.setListingChatBlocked(request('seller', { threadId, blocked: false }));
  await listing.update({ status: 'sold' });
  await assert.rejects(chat.sendListingMessage(request('buyer', { ...msg, messageId: 'retry-3' })), { code: 'failed-precondition' });
});
