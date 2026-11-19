/* Limba Auto public Firebase Web client configuration for limba-auto.
 * These CLIENT identifiers are public. Never place admin keys, service-account
 * files or server tokens in this file. The local limba/demo identity remains
 * separate from Firebase Authentication.
 */
window.LIMBA_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDPvZuTu_seOb8dK3Y5RyZBIXPqAQOL3Po',
  authDomain: 'limba-auto.firebaseapp.com',
  projectId: 'limba-auto',
  storageBucket: 'limba-auto.firebasestorage.app',
  messagingSenderId: '190623494655',
  appId: '1:190623494655:web:92f21575e57de7a4a077ca',
  recaptchaEnterpriseSiteKey: '6LcOeScuAAAAAN-rVxUbQJkSAAnk3q0_qSwLDiSg'
};
// Older third-party integrations may still expect the historical LUMA name.
window.LUMA_FIREBASE_CONFIG = window.LIMBA_FIREBASE_CONFIG;
