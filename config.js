/* Limba Auto public Firebase WEB client configuration.
 * Firebase Console > Project settings > Your apps > Web app > SDK setup.
 * These CLIENT identifiers are public. Never place admin keys, service-account
 * files or server tokens in this file.
 *
 * Leave apiKey / projectId blank for offline demo mode. Do not put a DEMO user
 * into production Authentication.
 */
window.LIMBA_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
// Older third-party integrations may still expect the historical LUMA name.
window.LUMA_FIREBASE_CONFIG = window.LIMBA_FIREBASE_CONFIG;
