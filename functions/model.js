const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

function stableId(...parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function verifiedUid(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email address first.');
  }
  return request.auth.uid;
}

function inputObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Expected an object.');
  }
  return data;
}

function inputId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  }
  return value;
}

function inputText(value, maxLength, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  }
  return text;
}

function activeVehicle(listing) {
  return listing?.category === 'vehicles' && listing.status === 'active';
}

async function createOnce(ref, data) {
  try {
    await ref.create(data);
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
  }
}

module.exports = { activeVehicle, createOnce, inputId, inputObject, inputText, stableId, verifiedUid };
