const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { defineBoolean } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentDeleted, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { marketHandlers } = require('./marketplace-security');
const { chatHandlers } = require('./chat');
const { processSearchJobsHandler, searchAlertHandler, trackListingHandler } = require('./alerts');

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
