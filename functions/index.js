const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { chatHandlers } = require('./chat');
const { processSearchJobsHandler, searchAlertHandler, trackListingHandler } = require('./alerts');

initializeApp();
const db = getFirestore();
const region = 'europe-west1';
const callableOptions = { region, maxInstances: 10 };
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
