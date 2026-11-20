const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const { defineBoolean, defineSecret, defineString } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentDeleted, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { marketHandlers } = require('./marketplace-security');
const { chatHandlers } = require('./chat');
const { processSearchJobsHandler, searchAlertHandler, trackListingHandler } = require('./alerts');
const { deliveryHandlers } = require('./marketplace-delivery');
const { lookupListingPlacesHandler } = require('./listing-places');
const {
  elasticListingIndexProvider, elasticListingSearchProvider, reconcileListingSearchHandler,
  searchListingsHandler, syncListingSearchHandler,
} = require('./listing-search');

initializeApp();
const db = getFirestore();
const region = 'europe-west1';
// Enable after both clients have registered App Check providers and passed staging.
const enforceMarketplaceAppCheck = defineBoolean('ENFORCE_MARKETPLACE_APP_CHECK', { default: false });
const callableOptions = { region, maxInstances: 10, enforceAppCheck: enforceMarketplaceAppCheck };
const chat = chatHandlers(db);

exports.startListingChat = onCall(callableOptions, chat.startListingChat);
exports.sendListingMessage = onCall(callableOptions, chat.sendListingMessage);
exports.setListingChatBlocked = onCall(callableOptions, chat.setListingChatBlocked);
exports.reportListingChat = onCall(callableOptions, chat.reportListingChat);
exports.setSavedSearchAlert = onCall(callableOptions, searchAlertHandler(db));

exports.trackListingChanges = onDocumentWritten({
  region,
  document: 'listings/{listingId}',
  retry: true,
  maxInstances: 10,
}, trackListingHandler(db));

exports.processListingSearchAlerts = onSchedule({
  region,
  schedule: '* * * * *',
  timeoutSeconds: 120,
  maxInstances: 1,
  concurrency: 1,
}, processSearchJobsHandler(db));

const securityRegion = 'europe-west6';
const protectedOptions = { ...callableOptions, region: securityRegion };
const market = marketHandlers(db, getStorage().bucket());

exports.reserveListingUpload = onCall(protectedOptions, market.reserveListingUpload);
exports.uploadListingPhoto = onCall({
  ...protectedOptions, memory: '512MiB', concurrency: 2, maxInstances: 5, timeoutSeconds: 120,
}, market.uploadListingPhoto);
exports.submitListingReport = onCall(protectedOptions, market.submitListingReport);
exports.cleanupListingUploads = onSchedule({
  region: securityRegion, schedule: 'every 30 minutes', timeoutSeconds: 540, maxInstances: 1, concurrency: 1,
}, market.cleanupUploads);
exports.cleanupDeletedListingPhotos = onDocumentDeleted({
  region: securityRegion, document: 'listings/{listingId}', retry: true, maxInstances: 5,
}, market.cleanupDeletedListing);

const delivery = deliveryHandlers(db, getMessaging(), getAuth());
exports.setAndroidPushRegistration = onCall(protectedOptions, delivery.setAndroidPushRegistration);
exports.deleteAndroidPushRegistration = onCall(protectedOptions, delivery.deleteAndroidPushRegistration);
exports.recordDealerListingView = onCall(protectedOptions, delivery.recordDealerListingView);
exports.getDealerStatistics = onCall(protectedOptions, delivery.getDealerStatistics);
exports.lookupListingPlaces = onCall(protectedOptions, lookupListingPlacesHandler());
exports.renderListingShare = onRequest({ region, maxInstances: 10, timeoutSeconds: 10 }, delivery.renderListingShare);

const chatDelivery = { region, document: 'chatThreads/{threadId}/messages/{messageId}', retry: true, maxInstances: 5 };
exports.deliverChatMessagePush = onDocumentCreated(chatDelivery, delivery.deliverChatMessagePush);
exports.recordDealerInquiry = onDocumentCreated(chatDelivery, delivery.recordDealerInquiry);
exports.deliverSearchMatchPush = onDocumentCreated({
  region, document: 'users/{uid}/notifications/{notificationId}', retry: true, maxInstances: 5,
}, delivery.deliverSearchMatchPush);

// Firebase resolves the secrets of every exported function during discovery.
// A release without the paid search endpoint must never declare those secrets.
if (process.env.LIMBA_ELASTIC_URL) {
  const searchUrl = defineString('LIMBA_ELASTIC_URL', { default: '' });
  const searchAlias = defineString('LIMBA_ELASTIC_ALIAS', { default: 'limba-listings' });
  const searchReader = defineSecret('LIMBA_ELASTIC_READER_KEY');
  const searchWriter = defineSecret('LIMBA_ELASTIC_WRITER_KEY');
  const cursorSecret = defineSecret('LIMBA_SEARCH_CURSOR_KEY');

  function elasticConfig(key) {
    const baseUrl = searchUrl.value();
    return baseUrl ? { baseUrl, alias: searchAlias.value(), apiKey: key.value() } : null;
  }

  function searchProvider() {
    const config = elasticConfig(searchReader);
    return config && elasticListingSearchProvider(config);
  }

  function indexProvider() {
    const config = elasticConfig(searchWriter);
    return config && elasticListingIndexProvider(config);
  }

  const publicListings = searchListingsHandler(db, searchProvider, () => cursorSecret.value());
  exports.searchListings = onCall({
    ...protectedOptions, maxInstances: 5, concurrency: 10, timeoutSeconds: 20, secrets: [searchReader, cursorSecret],
  }, async request => {
    const release = await db.doc('marketplaceRelease/v1_9').get();
    if (release.get('searchEnabled') !== true) {
      throw new HttpsError('failed-precondition', 'Listing search is unavailable.', { reason: 'search-disabled' });
    }
    return publicListings(request);
  });

  exports.syncListingSearch = onDocumentWritten({
    region: securityRegion, document: 'listings/{listingId}', retry: true, maxInstances: 5, secrets: [searchWriter],
  }, syncListingSearchHandler(db, indexProvider));
  exports.reconcileListingSearch = onSchedule({
    region: securityRegion, schedule: 'every 5 minutes', maxInstances: 1,
    concurrency: 1, timeoutSeconds: 180, secrets: [searchWriter],
  }, reconcileListingSearchHandler(db, indexProvider));
}
