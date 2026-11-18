import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, query,
  serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-limba';
const host = '127.0.0.1';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host, port: 8082, rules: fs.readFileSync('firestore.rules', 'utf8') },
  storage: { host, port: 9199, rules: fs.readFileSync('storage.rules', 'utf8') }
});

const authenticated = (id, verified) => env.authenticatedContext(id, {
  email: `${id}@example.test`,
  email_verified: verified
});
const alice = authenticated('alice', true);
const bob = authenticated('bob', true);
const unverified = authenticated('unverified', false);
const publicUser = env.unauthenticatedContext();
const dbA = alice.firestore();
const dbB = bob.firestore();
const dbU = unverified.firestore();
const dbGuest = publicUser.firestore();

const photoUrl = (id, owner = 'alice', file = '0.jpg') =>
  `https://firebasestorage.googleapis.com/v0/b/limba-auto.firebasestorage.app/o/listings%2F${owner}%2F${id}%2F${file}?alt=media&token=example`;

function car(id, uid = 'alice') {
  return {
    category: 'vehicles',
    uid,
    status: 'active',
    createdAt: serverTimestamp(),
    title: 'Nissan GT-R',
    description: 'Very good condition. Full history available on request.',
    price: 28000,
    country: 'AL',
    city: 'Tirana',
    condition: 'used',
    contactEmail: '',
    make: 'Nissan',
    model: 'GT-R',
    year: 2018,
    mileage: 77000,
    power: 550,
    fuel: 'petrol',
    transmission: 'automatic',
    body: 'coupe',
    sellerType: 'privateSeller',
    accidentStatus: 'no',
    conditionNote: 'Very good',
    image: photoUrl(id, uid),
    images: [photoUrl(id, uid)]
  };
}

const validSearch = {
  name: 'Nissan',
  filters: {
    keyword: '', make: 'Nissan', model: '', priceTo: '', yearFrom: '', mileageTo: '',
    fuel: '', transmission: '', body: '', sellerType: '', priceFrom: '', yearTo: ''
  },
  countries: ['AL']
};

try {
  const listed = doc(dbA, 'listings', 'car1');

  // Positive marketplace path.
  await assertSucceeds(setDoc(listed, car('car1')));
  await assertSucceeds(getDoc(doc(dbGuest, 'listings', 'car1')));
  const tuned = doc(dbA, 'listings', 'tuned');
  await assertSucceeds(setDoc(tuned, {...car('tuned'),modelExtension:'MTM',title:'Nissan GT-R MTM'}));
  await assertFails(updateDoc(tuned, {modelExtension:'x'.repeat(41),title:'Nissan GT-R '+ 'x'.repeat(41)}));
  await assertFails(updateDoc(tuned, {modelExtension:'ABT'}));
  await assertSucceeds(getDocs(query(collection(dbGuest, 'listings'), where('status', '==', 'active'))));

  // Public-list exploit and authentication/ownership attacks.
  await assertFails(getDocs(collection(dbGuest, 'listings')));
  await assertFails(setDoc(doc(dbGuest, 'listings', 'anonymous'), car('anonymous')));
  await assertFails(setDoc(doc(dbU, 'listings', 'unverified'), car('unverified', 'unverified')));
  await assertFails(setDoc(doc(dbB, 'listings', 'impersonation'), car('impersonation', 'alice')));
  await assertFails(updateDoc(doc(dbB, 'listings', 'car1'), { price: 1 }));
  await assertFails(deleteDoc(doc(dbB, 'listings', 'car1')));

  // Schema, PII, type, size, path and immutable-field attacks.
  await assertFails(setDoc(doc(dbA, 'listings', 'pii'), { ...car('pii'), contactEmail: 'alice@example.test' }));
  await assertFails(setDoc(doc(dbA, 'listings', 'wrong-bucket'), {
    ...car('wrong-bucket'),
    image: photoUrl('wrong-bucket').replace('limba-auto.firebasestorage.app', 'attacker.example'),
    images: [photoUrl('wrong-bucket').replace('limba-auto.firebasestorage.app', 'attacker.example')]
  }));
  await assertFails(updateDoc(listed, { description: 'x'.repeat(3001) }));
  await assertFails(updateDoc(listed, { price: 'free' }));
  await assertFails(updateDoc(listed, { extraData: 'schema pollution' }));
  await assertFails(updateDoc(listed, { description: deleteField() }));
  await assertFails(updateDoc(listed, { uid: 'bob' }));
  await assertFails(updateDoc(listed, { createdAt: new Date(0) }));
  await assertFails(updateDoc(listed, { status: 'archived' }));

  // Owner workflow and private account paths.
  await assertSucceeds(updateDoc(listed, { status: 'sold' }));
  await assertFails(getDoc(doc(dbGuest, 'listings', 'car1')));
  await assertFails(getDoc(doc(dbB, 'listings', 'car1')));
  await assertSucceeds(getDoc(listed));
  await assertSucceeds(updateDoc(listed, { status: 'active' }));

  const favorite = doc(dbA, 'users', 'alice', 'favorites', 'car1');
  await assertSucceeds(setDoc(favorite, { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(dbB, 'users', 'alice', 'favorites', 'car1'), { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(dbA, 'users', 'alice', 'favorites', 'missing'), { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(dbA, 'users', 'alice', 'favorites', 'car1'), {
    createdAt: serverTimestamp(), extra: true
  }));

  const searches = doc(dbA, 'users', 'alice', 'data', 'searches');
  await assertSucceeds(setDoc(searches, { items: [validSearch] }));
  await assertFails(setDoc(doc(dbB, 'users', 'alice', 'data', 'searches'), { items: [validSearch] }));
  await assertFails(setDoc(searches, { items: [{ ...validSearch, name: 'x'.repeat(121) }] }));
  await assertFails(setDoc(searches, { items: [{ ...validSearch, filters: { keyword: '' } }] }));
  await assertFails(setDoc(searches, { items: Array.from({ length: 21 }, () => validSearch) }));

  const preferences = doc(dbA, 'users', 'alice', 'data', 'preferences');
  await assertSucceeds(setDoc(preferences, { countries: ['AL', 'HR'] }));
  await assertFails(setDoc(preferences, { countries: ['CH'] }));
  await assertFails(setDoc(preferences, { countries: ['AL'], extra: true }));

  // Deterministic report IDs prevent replay/spam for the same user/listing pair.
  const report = doc(dbA, 'reports', 'alice_car1');
  const reportData = {
    listingId: 'car1', reporterUid: 'alice', reason: 'fraud', createdAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(report, reportData));
  await assertFails(setDoc(report, reportData));
  await assertFails(setDoc(doc(dbA, 'reports', 'random'), reportData));
  await assertFails(getDoc(report));
  await assertFails(setDoc(doc(dbU, 'reports', 'unverified_car1'), {
    listingId: 'car1', reporterUid: 'unverified', reason: 'fraud', createdAt: serverTimestamp()
  }));

  // Storage path, verification, content type and file-slot enforcement.
  const storeAlice = alice.storage('gs://limba-auto.firebasestorage.app');
  const storeBob = bob.storage('gs://limba-auto.firebasestorage.app');
  const storeU = unverified.storage('gs://limba-auto.firebasestorage.app');
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  await assertSucceeds(uploadBytes(ref(storeAlice, 'listings/alice/car1/0.jpg'), bytes, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storeBob, 'listings/alice/car1/1.jpg'), bytes, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storeU, 'listings/unverified/car1/1.jpg'), bytes, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storeAlice, 'listings/alice/car1/6.jpg'), bytes, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storeAlice, 'listings/alice/car1/1.html'), bytes, { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(storeAlice, 'listings/alice/invalid id/1.jpg'), bytes, { contentType: 'image/jpeg' }));

  await assertSucceeds(deleteDoc(listed));
  console.log('PASS: Limba rules block public-list, ownership, PII, update, schema, replay and Storage attacks');
} finally {
  await env.cleanup();
}
