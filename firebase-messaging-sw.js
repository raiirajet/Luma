/* Limba Web Push service worker: privacy-preserving generic notifications. */
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:'AIzaSyDPvZuTu_seOb8dK3Y5RyZBIXPqAQOL3Po',
  authDomain:'limba-auto.firebaseapp.com',
  projectId:'limba-auto',
  messagingSenderId:'190623494655',
  appId:'1:190623494655:web:92f21575e57de7a4a077ca'
});
firebase.messaging();
