import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT?.startsWith('demo-') ? process.env.GCLOUD_PROJECT : 'demo-limba';
const host = '127.0.0.1';
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { host, port: 8082 }),
    rules: fs.readFileSync('firestore.rules', 'utf8')
  },
  storage: {
    ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? {} : { host, port: 9199 }),
    rules: fs.readFileSync('storage.rules', 'utf8')
  }
});

const authenticated = (id, verified) => env.authenticatedContext(id, {
  email: `${id}@example.test`,
  email_verified: verified
});
const alice = authenticated('alice', true);
const bob = authenticated('bob', true);
const charlie = authenticated('charlie', true);
const unverified = authenticated('unverified', false);
const publicUser = env.unauthenticatedContext();
const dbA = alice.firestore();
const dbB = bob.firestore();
const dbC = charlie.firestore();
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
  // Public vehicle passport: optional seller statements, never verified data.
  await assertSucceeds(updateDoc(tuned, {
    serviceHistory:'Oil and filter service at 50000 km',
    modificationNotes:'MTM tuning stated by seller',
    documentNotes:'Service invoices available on request'
  }));
  await assertFails(updateDoc(tuned, {serviceHistory:'x'.repeat(501)}));
  await assertFails(updateDoc(tuned, {modificationNotes:'x'.repeat(501)}));
  await assertFails(updateDoc(tuned, {documentNotes:'x'.repeat(241)}));
  await assertFails(updateDoc(tuned, {serviceHistory:{trusted:true}}));
  await assertFails(updateDoc(tuned, {documentsVerified:true}));
  await assertSucceeds(updateDoc(tuned, {engineName:'2.0 TDI',engineCapacity:1968}));
  await assertFails(updateDoc(tuned, {engineName:'x'.repeat(81)}));
  await assertFails(updateDoc(tuned, {engineCapacity:12001}));
  await assertFails(updateDoc(tuned, {engineCapacity:-1}));
  await assertFails(updateDoc(tuned, {engineCapacity:'1968'}));
  await assertSucceeds(updateDoc(tuned, {engineName:deleteField(),engineCapacity:deleteField()}));

  await assertSucceeds(updateDoc(tuned, {serviceHistory:deleteField()}));

  const photoDetails = { '0': { kind: 'damage', note: 'Small scratch on right door' } };
  const batteryReport = { health: 94.7, measuredAt: '2026-10-15', issuer: 'Example Inspection', url: 'https://example.test/report.pdf' };
  const electric = doc(dbA, 'listings', 'electric');
  await assertSucceeds(setDoc(electric, { ...car('electric'), fuel: 'electric', photoDetails, batteryReport }));
  await assertSucceeds(updateDoc(electric, { conditionNote: 'Legacy editor update' }));
  await assertFails(updateDoc(electric, { photoDetails: { '1': photoDetails['0'] } }));
  await assertFails(updateDoc(electric, { photoDetails: { '0': { kind: 'damage', note: 'x'.repeat(161) } } }));
  await assertFails(updateDoc(electric, { batteryReport: { ...batteryReport, health: 101 } }));
  await assertFails(updateDoc(electric, { batteryReport: { ...batteryReport, url: 'http://example.test/report.pdf' } }));
  await assertSucceeds(updateDoc(electric, { photoDetails: {}, batteryReport: deleteField() }));

  const allPhotos = Array.from({ length: 6 }, (_, slot) => photoUrl('all-photos', 'alice', `${slot}.jpg`));
  const allPhotoDetails = Object.fromEntries(allPhotos.map((_, slot) => [String(slot), photoDetails['0']]));
  const fullListing = doc(dbA, 'listings', 'all-photos');
  await assertSucceeds(setDoc(fullListing, {
    ...car('all-photos'), fuel: 'electric', image: allPhotos[0], images: allPhotos,
    photoDetails: allPhotoDetails, batteryReport, modelExtension: 'Special', title: 'Nissan GT-R Special',
    serviceHistory: 'Service details', modificationNotes: 'Modification details', documentNotes: 'Documents on request',
    engineName: 'Electric', engineCapacity: 0
  }));
  await assertSucceeds(updateDoc(fullListing, { price: 29000 }));

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

  // Release 1.7 collections are populated by the trusted backend.
  const sentAt = new Date();
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, 'chatThreads', 'thread1'), {
        listingId: 'car1', listingTitle: 'Nissan GT-R', buyerUid: 'bob', sellerUid: 'alice',
        participants: ['bob', 'alice'], blockedBy: [], updatedAt: sentAt, createdAt: sentAt, lastMessage: 'Is it available?'
      }),
      setDoc(doc(database, 'chatThreads', 'thread1', 'messages', 'message1'), {
        text: 'Is it available?', senderUid: 'bob', createdAt: sentAt
      }),
      setDoc(doc(database, 'listings', 'car1', 'priceHistory', 'event1'), {
        price: 28000, previousPrice: 29000, changedAt: sentAt
      }),
      setDoc(doc(database, 'users', 'bob', 'searchAlerts', 'alert1'), { ...validSearch, createdAt: sentAt }),
      setDoc(doc(database, 'users', 'bob', 'notifications', 'notice1'), {
        listingId: 'car1', listingTitle: 'Nissan GT-R', searchName: 'Nissan', createdAt: sentAt, read: false
      })
    ]);
  });

  const inbox = (database, uid) => query(collection(database, 'chatThreads'),
    where('participants', 'array-contains', uid), orderBy('updatedAt', 'desc'), limit(50));
  await assertSucceeds(getDocs(inbox(dbB, 'bob')));
  await assertSucceeds(getDocs(inbox(dbA, 'alice')));
  await assertFails(getDocs(inbox(dbC, 'bob')));
  await assertFails(getDocs(query(collection(dbB, 'chatThreads'), where('participants', 'array-contains', 'bob'))));
  await assertFails(getDoc(doc(dbC, 'chatThreads', 'thread1')));
  await assertSucceeds(getDocs(collection(dbB, 'chatThreads', 'thread1', 'messages')));
  await assertFails(getDocs(collection(dbC, 'chatThreads', 'thread1', 'messages')));
  await assertFails(updateDoc(doc(dbB, 'chatThreads', 'thread1'), { blockedBy: ['bob'] }));
  await assertFails(setDoc(doc(dbB, 'chatThreads', 'thread1', 'messages', 'message2'), {
    text: 'Yes', senderUid: 'bob', createdAt: serverTimestamp()
  }));

  const priceEvent = (database) => doc(database, 'listings', 'car1', 'priceHistory', 'event1');
  await assertSucceeds(getDoc(priceEvent(dbGuest)));
  await assertFails(updateDoc(priceEvent(dbA), { price: 1 }));
  await assertSucceeds(updateDoc(listed, { status: 'paused' }));
  await assertFails(getDoc(priceEvent(dbGuest)));
  await assertFails(getDoc(priceEvent(dbB)));
  await assertSucceeds(getDoc(priceEvent(dbA)));
  await assertSucceeds(updateDoc(listed, { status: 'active' }));

  const alert = (database) => doc(database, 'users', 'bob', 'searchAlerts', 'alert1');
  await assertSucceeds(getDoc(alert(dbB)));
  await assertFails(getDoc(alert(dbA)));
  await assertFails(updateDoc(alert(dbB), { name: 'Other search' }));
  const notification = (database) => doc(database, 'users', 'bob', 'notifications', 'notice1');
  await assertSucceeds(getDoc(notification(dbB)));
  await assertFails(getDoc(notification(dbA)));
  await assertFails(updateDoc(notification(dbA), { read: true }));
  await assertFails(updateDoc(notification(dbB), { read: true, listingId: 'electric' }));
  await assertSucceeds(updateDoc(notification(dbB), { read: true }));
  await assertFails(updateDoc(notification(dbB), { read: false }));

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
  await assertSucceeds(setDoc(searches,{items:[{...validSearch,filters:{...validSearch.filters,mileageFrom:'30000',powerFrom:'100',powerTo:'600',engineTerm:'TDI',capacityFrom:'1500',capacityTo:'3000'}}]}));
  await assertFails(setDoc(searches,{items:[{...validSearch,filters:{...validSearch.filters,capacityFrom:100}}]}));
  await assertFails(setDoc(searches,{items:[{...validSearch,filters:{...validSearch.filters,engineTerm:'x'.repeat(81)}}]}));


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
  await assertFails(getDoc(priceEvent(dbA)));
  console.log('PASS: Limba listing, chat, alert, price history and Storage access rules');
} finally {
  await env.cleanup();
}
