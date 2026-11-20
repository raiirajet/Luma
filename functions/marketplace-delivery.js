const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { activeVehicle, inputId, inputObject, stableId, verifiedUid } = require('./model');

const DAY = 86_400_000;
const PUSH_LIFETIME = DAY;
const REGISTRATION_LIFETIME = 60 * DAY;
const INQUIRY_LIFETIME = 32 * DAY;
const PUSH_LEASE = 75_000;
const MAX_INSTALLATIONS = 8;
const VIEWS_PER_DAY = 60;
const ORIGIN = 'https://limba-auto.web.app';
const STORAGE_ORIGIN = 'https://firebasestorage.googleapis.com';
const STORAGE_PREFIX = '/v0/b/limba-auto.firebasestorage.app/o/';
const SHARE_CSP = "default-src 'none'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const priceFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const invalidTokens = new Set([
  'messaging/invalid-registration-token', 'messaging/registration-token-not-registered',
]);
const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function html(value) {
  return String(value).replace(/[&<>"']/g, character => htmlEntities[character]);
}

function photoForShare(listing, listingId) {
  const images = Array.isArray(listing.images) ? listing.images.slice(0, 6) : [];
  for (const candidate of [...images, listing.image]) {
    if (typeof candidate !== 'string' || candidate.length > 2048) continue;
    try {
      const url = new URL(candidate);
      if (url.origin !== STORAGE_ORIGIN || !url.pathname.startsWith(STORAGE_PREFIX) ||
          url.username || url.password || url.hash || url.searchParams.get('alt') !== 'media') continue;
      const object = decodeURIComponent(url.pathname.slice(STORAGE_PREFIX.length)).split('/');
      if (object.length === 4 && object[0] === 'listings' && object[1] === listing.uid &&
          object[2] === listingId && /^(?:clean-)?[0-5]\.(?:jpg|png|webp)$/.test(object[3])) {
        return url.href;
      }
    } catch (error) {
      if (!(error instanceof TypeError || error instanceof URIError)) throw error;
    }
  }
  return `${ORIGIN}/apple-touch-icon.png`;
}

function sharePage(listing, listingId) {
  const title = listing.title.trim().slice(0, 110);
  const price = priceFormat.format(listing.price);
  const canonical = `${ORIGIN}/inserat/${listingId}`;
  const description = `${price} · Limba Auto`;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)} · Limba Auto</title>
<link rel="canonical" href="${canonical}"><meta name="description" content="${html(description)}">
<meta property="og:site_name" content="Limba Auto"><meta property="og:type" content="website">
<meta property="og:url" content="${canonical}"><meta property="og:title" content="${html(title)}">
<meta property="og:description" content="${html(description)}"><meta property="og:image" content="${html(photoForShare(listing, listingId))}">
<meta property="og:image:alt" content="${html(title)}"><meta name="twitter:card" content="summary_large_image">
<script defer src="/limba-share.js"></script>
</head><body><main><h1>${html(title)}</h1><p>${html(price)}</p>
<a href="/#ad=${listingId}">Inserat auf Limba öffnen</a></main></body></html>`;
}

function shareUnavailable(response, status) {
  return response.status(status).send(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>Limba Auto</title></head><body><main>
<h1>Inserat nicht verfügbar</h1><a href="/">Zur Fahrzeugsuche</a></main></body></html>`);
}

function utcDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function millis(value) {
  return value?.toMillis?.() ?? 0;
}

function expiry(time) {
  return { expiresAt: Timestamp.fromMillis(time) };
}

function isRecent(time, now, age) {
  return time > now - age && time <= now;
}

function deliveryHandlers(db, messaging, auth, clock = Date.now) {
  const pushAccounts = db.collection('androidPushAccounts');
  const deliveryReceipts = db.collection('androidPushDeliveries');
  const listings = db.collection('listings');
  const approvals = db.collection('dealerApplications');
  const dealerStats = db.collection('dealerAnalytics');

  function installations(snapshot, now) {
    return (snapshot.get('installations') || []).filter(device =>
      isRecent(millis(device.updatedAt), now, REGISTRATION_LIFETIME));
  }

  function writeDevices(transaction, ref, devices) {
    if (!devices.length) {
      transaction.delete(ref);
      return;
    }
    const latestUpdate = Math.max(...devices.map(device => millis(device.updatedAt)));
    transaction.set(ref, { installations: devices, ...expiry(latestUpdate + REGISTRATION_LIFETIME) });
  }

  async function removeDevice(uid, installationId, token) {
    const ref = pushAccounts.doc(uid);
    return db.runTransaction(async transaction => {
      const devices = installations(await transaction.get(ref), clock());
      const remaining = devices.filter(device => device.installationId !== installationId ||
        (token !== undefined && device.token !== token));
      if (remaining.length === devices.length) return false;
      writeDevices(transaction, ref, remaining);
      return true;
    });
  }

  async function setAndroidPushRegistration(request) {
    const uid = verifiedUid(request);
    const { installationId, token, messages, searchMatches, locale = '' } = inputObject(request.data);
    inputId(installationId, 'installation ID');
    if (typeof token !== 'string' || !/^[A-Za-z0-9_:\-.]{20,4096}$/.test(token) ||
        typeof messages !== 'boolean' || typeof searchMatches !== 'boolean' ||
        typeof locale !== 'string' || (locale && !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8}){0,3}$/.test(locale))) {
      throw new HttpsError('invalid-argument', 'Invalid Android push registration.');
    }
    if (!messages && !searchMatches) {
      await removeDevice(uid, installationId);
      return { registered: false };
    }
    const ref = pushAccounts.doc(uid);
    const now = clock();
    const time = Timestamp.fromMillis(now);
    await db.runTransaction(async transaction => {
      const devices = installations(await transaction.get(ref), now);
      const previous = devices.find(device => device.installationId === installationId);
      if (previous?.token === token && previous.messages === messages &&
          previous.searchMatches === searchMatches &&
          isRecent(millis(previous.updatedAt), now, DAY)) return;
      const recent = devices.filter(device => device.installationId !== installationId && device.token !== token)
        .sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)).slice(0, MAX_INSTALLATIONS - 1);
      const device = { installationId, token, messages, searchMatches, updatedAt: time };
      if (messages) device.messagesSince = previous?.messagesSince ?? time;
      if (searchMatches) device.searchMatchesSince = previous?.searchMatchesSince ?? time;
      writeDevices(transaction, ref, [device, ...recent]);
    });
    return { registered: true };
  }

  async function deleteAndroidPushRegistration(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
    const installationId = inputId(inputObject(request.data).installationId, 'installation ID');
    return { deleted: await removeDevice(request.auth.uid, installationId) };
  }

  async function pushAccountEligible(uid) {
    if (!auth) return true;
    try {
      const account = await auth.getUser(uid);
      return account.emailVerified && !account.disabled;
    } catch (error) {
      if (error.code === 'auth/user-not-found') return false;
      throw error;
    }
  }

  async function sendAndroidDevice({ uid, eventId, kind, target, device, createdAt, now }) {
    const receipt = deliveryReceipts.doc(stableId(eventId, device.installationId));
    const leaseUntil = now + PUSH_LEASE;
    const expires = expiry(createdAt + 2 * DAY);
    const lease = await db.runTransaction(async transaction => {
      const seen = await transaction.get(receipt);
      if (seen.get('complete')) return 'complete';
      if (seen.get('leaseUntil') > now) return 'busy';
      transaction.set(receipt, { leaseUntil, ...expires });
      return 'claimed';
    });
    if (lease === 'complete') return;
    if (lease === 'busy') throw new Error('Android push delivery is in progress.');
    const finish = complete => db.runTransaction(async transaction => {
      if ((await transaction.get(receipt)).get('leaseUntil') !== leaseUntil) return;
      if (complete) transaction.set(receipt, { complete, ...expires });
      else transaction.delete(receipt);
    });
    try {
      await messaging.send({
        token: device.token,
        data: { eventId, kind, uid, ...target },
        android: { priority: 'high', ttl: createdAt + PUSH_LIFETIME - now },
      });
    } catch (error) {
      if (!invalidTokens.has(error.code)) {
        await finish(false);
        throw new Error('Android push delivery failed.');
      }
      await removeDevice(uid, device.installationId, device.token);
    }
    await finish(true);
  }

  async function deliverAndroidPush({ uid, kind, target, sourceId, createdAt }) {
    const now = clock();
    if (!isRecent(createdAt, now, PUSH_LIFETIME)) return;
    const optIn = kind === 'message' ? 'messagesSince' : 'searchMatchesSince';
    const devices = installations(await pushAccounts.doc(uid).get(), now)
      .filter(device => device[optIn] && millis(device[optIn]) <= createdAt);
    if (!devices.length || !(await pushAccountEligible(uid))) return;
    const eventId = stableId('android-push', uid, kind, sourceId);
    const sent = await Promise.allSettled(devices.map(device =>
      sendAndroidDevice({ uid, eventId, kind, target, device, createdAt, now })));
    if (sent.some(result => result.status === 'rejected')) throw new Error('Android push delivery needs retry.');
  }

  async function deliverChatMessagePush(event) {
    const message = event.data?.data();
    if (!message) return;
    const { threadId, messageId } = event.params;
    const thread = (await db.collection('chatThreads').doc(threadId).get()).data();
    if (!thread || thread.blockedBy?.length || !thread.participants?.includes(message.senderUid)) return;
    const uid = message.senderUid === thread.buyerUid ? thread.sellerUid : thread.buyerUid;
    if (uid === message.senderUid || !thread.participants.includes(uid)) return;
    const listing = (await listings.doc(thread.listingId).get()).data();
    if (!activeVehicle(listing) || listing.uid !== thread.sellerUid) return;
    return deliverAndroidPush({ uid, kind: 'message', target: { threadId },
      sourceId: `${threadId}/${messageId}`, createdAt: millis(message.createdAt) });
  }

  async function deliverSearchMatchPush(event) {
    const { uid, notificationId } = event.params;
    const match = (await db.doc(`users/${uid}/notifications/${notificationId}`).get()).data();
    if (!match || match.read !== false || typeof match.listingId !== 'string') return;
    const listing = (await listings.doc(match.listingId).get()).data();
    if (!activeVehicle(listing) || listing.uid === uid) return;
    return deliverAndroidPush({ uid, kind: 'searchMatch', target: { listingId: match.listingId },
      sourceId: notificationId, createdAt: millis(match.createdAt) });
  }

  async function renderListingShare(request, response) {
    response.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': SHARE_CSP,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }).type('html');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.set('Allow', 'GET, HEAD');
      return shareUnavailable(response, 405);
    }
    const listingId = /^\/inserat\/([A-Za-z0-9_-]{1,128})$/.exec(request.path)?.[1];
    if (!listingId) return shareUnavailable(response, 404);
    const listing = (await listings.doc(listingId).get()).data();
    if (!activeVehicle(listing) || typeof listing.title !== 'string' || !listing.title.trim() ||
        !Number.isInteger(listing.price) || listing.price < 1) return shareUnavailable(response, 404);
    if ((await db.collection('listingModeration').doc(listingId).get()).exists) {
      return shareUnavailable(response, 404);
    }
    return response.status(200).send(sharePage(listing, listingId));
  }

  async function recordDealerListingView(request) {
    const uid = verifiedUid(request);
    const listingId = inputId(inputObject(request.data).listingId, 'listing ID');
    const now = clock();
    const day = utcDay(now);
    const seen = db.collection('dealerAnalyticsViews').doc(stableId(day, uid, listingId));
    const viewer = db.collection('dealerAnalyticsViewers').doc(stableId(day, uid));
    await db.runTransaction(async transaction => {
      const listing = (await transaction.get(listings.doc(listingId))).data();
      if (!activeVehicle(listing) || listing.sellerType !== 'dealer' || listing.uid === uid) return;
      const [marker, quota, approval] = await transaction.getAll(seen, viewer, approvals.doc(listing.uid));
      if (marker.exists || (quota.get('count') ?? 0) >= VIEWS_PER_DAY || approval.get('status') !== 'approved') return;
      transaction.create(seen, expiry(now + 2 * DAY));
      transaction.set(viewer, { count: FieldValue.increment(1), ...expiry(now + 2 * DAY) }, { merge: true });
      transaction.set(dealerStats.doc(listing.uid).collection('dealerAnalyticsDays').doc(day), {
        views: FieldValue.increment(1), ...expiry(now + INQUIRY_LIFETIME),
      }, { merge: true });
    });
    return {};
  }

  async function recordDealerInquiry(event) {
    const message = event.data?.data();
    if (message?.dealerInquiry !== true) return;
    const createdAt = millis(message.createdAt);
    const now = clock();
    if (!isRecent(createdAt, now, INQUIRY_LIFETIME)) return;
    const { threadId } = event.params;
    const receipt = db.collection('dealerAnalyticsInquiries').doc(threadId);
    const threadRef = db.collection('chatThreads').doc(threadId);
    await db.runTransaction(async transaction => {
      const [processed, threadSnapshot] = await transaction.getAll(receipt, threadRef);
      if (processed.exists) return;
      const thread = threadSnapshot.data();
      if (!thread || thread.buyerUid !== message.senderUid || thread.firstBuyerMessageId !== event.params.messageId) return;
      const approval = await transaction.get(approvals.doc(thread.sellerUid));
      if (approval.get('status') !== 'approved') return;
      transaction.create(receipt, expiry(createdAt + INQUIRY_LIFETIME));
      transaction.set(dealerStats.doc(thread.sellerUid).collection('dealerAnalyticsDays').doc(utcDay(createdAt)), {
        inquiries: FieldValue.increment(1), ...expiry(createdAt + INQUIRY_LIFETIME),
      }, { merge: true });
    });
  }

  async function getDealerStatistics(request) {
    const uid = verifiedUid(request);
    const { days } = inputObject(request.data);
    if (days !== 7 && days !== 30) throw new HttpsError('invalid-argument', 'Choose 7 or 30 days.');
    if ((await approvals.doc(uid).get()).get('status') !== 'approved') {
      throw new HttpsError('permission-denied', 'Dealer approval is required.');
    }
    const now = clock();
    const daily = dealerStats.doc(uid).collection('dealerAnalyticsDays');
    const daysToRead = Array.from({ length: days }, (_, index) => daily.doc(utcDay(now - index * DAY)));
    const snapshots = await db.getAll(...daysToRead);
    return {
      views: snapshots.reduce((total, snapshot) => total + (snapshot.get('views') ?? 0), 0),
      inquiries: snapshots.reduce((total, snapshot) => total + (snapshot.get('inquiries') ?? 0), 0),
      days,
    };
  }

  return { setAndroidPushRegistration, deleteAndroidPushRegistration,
    deliverChatMessagePush, deliverSearchMatchPush, renderListingShare,
    recordDealerListingView, recordDealerInquiry, getDealerStatistics };
}

module.exports = { deliveryHandlers };
