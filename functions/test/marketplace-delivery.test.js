const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { chatHandlers } = require('../chat');
const { deliveryHandlers } = require('../marketplace-delivery');

const listing = {
  uid: 'dealer', status: 'active', category: 'vehicles', sellerType: 'dealer',
  title: 'BMW M4', price: 12500,
};
const request = (uid, data, emailVerified = true) => ({ auth: { uid, token: { email_verified: emailVerified } }, data });
const withEmulator = { skip: !process.env.FIRESTORE_EMULATOR_HOST };

function firebaseForTest(t) {
  const project = `demo-delivery-${randomUUID().slice(0, 8)}`;
  const app = initializeApp({ projectId: project }, project);
  t.after(() => deleteApp(app));
  return getFirestore(app);
}

function shareResponse() {
  return {
    headers: {},
    set(headers, value) {
      Object.assign(this.headers, typeof headers === 'string' ? { [headers]: value } : headers);
      return this;
    },
    type(value) { this.contentType = value; return this; },
    status(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

test('share response provides safely escaped fresh metadata for active listings only', async () => {
  const photo = 'https://firebasestorage.googleapis.com/v0/b/limba-auto.firebasestorage.app/o/' +
    'listings%2Fdealer%2Fcar%2Fclean-0.jpg?alt=media&token=test';
  const seenReads = [];
  let current = {
    ...listing, title: 'BMW \"<script>& Test', contactEmail: 'private@example.test',
    images: ['https://example.test/image.jpg', photo],
  };
  let moderation = false;
  const db = {
    collection: name => ({ doc: id => ({ get: async () => {
      seenReads.push(`${name}/${id}`);
      return name === 'listingModeration' ? { exists: moderation } : { data: () => current };
    } }) }),
  };
  const { renderListingShare } = deliveryHandlers(db);
  const get = (path = '/inserat/car', method = 'GET') => renderListingShare({ path, method }, shareResponse());
  const page = await get();
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['Cache-Control'], 'no-store');
  assert.match(page.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.match(page.body, /BMW &quot;&lt;script&gt;&amp; Test/);
  assert.match(page.body, /href="\/#ad=car"/);
  assert.match(page.body, /https:\/\/limba-auto.web.app\/inserat\/car/);
  assert.match(page.body, /12\.500\s+€/u);
  assert.ok(page.body.includes(photo.replace('&', '&amp;')));
  assert.doesNotMatch(page.body, /<script>|private@example|example\.test\/image/);
  assert.deepEqual(seenReads, ['listings/car', 'listingModeration/car']);
  assert.equal((await get('/inserat/../car')).statusCode, 404);
  assert.equal((await get('/inserat/car', 'POST')).statusCode, 405);
  assert.equal(seenReads.length, 2);
  assert.equal((await get('/inserat/car', 'HEAD')).statusCode, 200);
  current = { ...current, images: [], image: photo.replace('%2Fcar%2F', '%2Fanother%2F') };
  assert.match((await get()).body, /apple-touch-icon\.png/);
  moderation = true;
  assert.doesNotMatch((await get()).body, /og:title|BMW/);
  moderation = false;
  current.status = 'sold';
  assert.equal((await get()).statusCode, 404);
  current = undefined;
  assert.equal((await get()).statusCode, 404);
});

test('Android push is opted in, recipient scoped, private and retry-safe', withEmulator, async t => {
  const db = firebaseForTest(t);
  let now = Date.now();
  const sent = [];
  const seen = [];
  const dealerToken = 'dealer-installation-token';
  const buyerToken = 'buyer-installation-token';
  const staleToken = 'stale-installation-token';
  const blockedToken = 'blocked-installation-token';
  let temporaryFailure = true;
  const messaging = { send: async message => {
    seen.push(message.token);
    if (message.token === staleToken) {
      throw Object.assign(new Error('Stale'), { code: 'messaging/registration-token-not-registered' });
    }
    if (message.token === dealerToken && temporaryFailure) {
      temporaryFailure = false;
      throw Object.assign(new Error('Transient'), { code: 'messaging/server-unavailable' });
    }
    sent.push(message);
  } };
  const auth = { getUser: async uid => ({ disabled: uid === 'disabled', emailVerified: true }) };
  const delivery = deliveryHandlers(db, messaging, auth, () => now);
  const register = (uid, installationId, token, overrides = {}) => delivery.setAndroidPushRegistration(request(uid, {
    installationId, token, messages: true, searchMatches: true, locale: 'de-CH', ...overrides,
  }));
  await Promise.all([
    db.doc('listings/car').set(listing),
    db.doc('chatThreads/t').set({ buyerUid: 'buyer', sellerUid: 'dealer', participants: ['dealer', 'buyer'], listingId: 'car', blockedBy: [] }),
    register('dealer', 'dealer-install', dealerToken),
    register('buyer', 'buyer-install', buyerToken, { messages: false }),
    register('disabled', 'disabled-install', blockedToken),
  ]);
  await register('dealer', 'stale-install', staleToken);
  await assert.rejects(delivery.setAndroidPushRegistration(request('dealer', {
    installationId: 'dealer-install', token: dealerToken, messages: true, searchMatches: true,
  }, false)), { code: 'failed-precondition' });
  assert.deepEqual(await delivery.deleteAndroidPushRegistration(request('buyer', { installationId: 'dealer-install' })), { deleted: false });

  now += 10;
  const message = { params: { threadId: 't', messageId: 'secret' }, data: { data: () => ({
    senderUid: 'buyer', text: 'private message', createdAt: Timestamp.fromMillis(now),
  }) } };
  await assert.rejects(delivery.deliverChatMessagePush(message), /needs retry/);
  await delivery.deliverChatMessagePush(message);
  await delivery.deliverChatMessagePush(message);
  assert.deepEqual(seen.sort(), [dealerToken, dealerToken, staleToken].sort());
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].data, { kind: 'message', uid: 'dealer', threadId: 't', eventId: sent[0].data.eventId });
  assert.match(sent[0].data.eventId, /^[a-f0-9]{64}$/);
  assert.equal(sent[0].notification, undefined);
  assert.equal((await db.doc('androidPushAccounts/dealer').get()).get('installations').length, 1);

  await db.doc('chatThreads/t').update({ blockedBy: ['dealer'] });
  await delivery.deliverChatMessagePush({ ...message, params: { ...message.params, messageId: 'blocked' } });
  await Promise.all(['buyer', 'dealer', 'disabled'].map(uid => db.doc(`users/${uid}/notifications/match`).set({
    listingId: 'car', read: false, createdAt: Timestamp.fromMillis(now), searchName: 'Sensitive search',
  })));
  for (const uid of ['buyer', 'dealer', 'disabled']) {
    await delivery.deliverSearchMatchPush({ params: { uid, notificationId: 'match' } });
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].data, { kind: 'searchMatch', uid: 'buyer', listingId: 'car', eventId: sent[1].data.eventId });
  assert.deepEqual(await delivery.deleteAndroidPushRegistration(request('buyer', { installationId: 'buyer-install' }, false)), { deleted: true });
  await db.doc('users/buyer/notifications/new').set({ listingId: 'car', read: false, createdAt: Timestamp.fromMillis(now) });
  await delivery.deliverSearchMatchPush({ params: { uid: 'buyer', notificationId: 'new' } });
  assert.equal(sent.length, 2);
});

test('dealer statistics deduplicate daily views and actual new buyer inquiries', withEmulator, async t => {
  const db = firebaseForTest(t);
  let now = Date.now() + 10000;
  const day = 86_400_000;
  const delivery = deliveryHandlers(db, undefined, undefined, () => now);
  const chat = chatHandlers(db);
  const id = { listingId: 'car' };
  await Promise.all([
    db.doc('listings/car').set(listing),
    db.doc('dealerApplications/dealer').set({ status: 'approved' }),
    db.doc('dealerApplications/other').set({ status: 'approved' }),
  ]);
  await assert.rejects(delivery.getDealerStatistics(request('buyer', { days: 7, uid: 'dealer' })), { code: 'permission-denied' });
  await assert.rejects(delivery.recordDealerListingView(request('buyer', id, false)), { code: 'failed-precondition' });
  await delivery.recordDealerListingView(request('dealer', id));
  await Promise.all([delivery.recordDealerListingView(request('buyer', id)), delivery.recordDealerListingView(request('buyer', id))]);
  now -= 8 * day;
  await delivery.recordDealerListingView(request('buyer', id));
  now += 8 * day;

  const { threadId } = await chat.startListingChat(request('buyer', id));
  const send = (uid, retryId) => chat.sendListingMessage(request(uid, { threadId, messageId: retryId, text: 'Actual message.' }));
  const stats = (uid, days) => delivery.getDealerStatistics(request(uid, { days }));
  assert.deepEqual(await stats('dealer', 7), { views: 1, inquiries: 0, days: 7 });
  const messages = await Promise.all([send('dealer', 'hello'), send('buyer', 'first'), send('buyer', 'second')]);
  const events = await Promise.all(messages.map(async ({ messageId }) => ({
    params: { threadId, messageId }, data: await db.doc(`chatThreads/${threadId}/messages/${messageId}`).get(),
  })));
  assert.equal(events.filter(event => event.data.get('dealerInquiry') === true).length, 1);
  await Promise.all([...events, ...events].map(delivery.recordDealerInquiry));
  assert.deepEqual(await stats('dealer', 7), { views: 1, inquiries: 1, days: 7 });
  assert.deepEqual(await stats('dealer', 30), { views: 2, inquiries: 1, days: 30 });
  assert.deepEqual(await stats('other', 7), { views: 0, inquiries: 0, days: 7 });
  await db.doc('dealerApplications/dealer').update({ status: 'rejected' });
  await assert.rejects(stats('dealer', 7), { code: 'permission-denied' });
});
