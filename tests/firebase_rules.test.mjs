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
  await assertSucceeds(updateDoc(listed,{allowOffers:false}));
  await assertSucceeds(updateDoc(listed,{allowOffers:true}));
  await assertFails(updateDoc(listed,{allowOffers:'yes'}));
  await assertFails(setDoc(doc(dbA,'listings','badopt'),{...car('badopt'),allowOffers:1}));
  await assertSucceeds(getDoc(doc(dbGuest, 'listings', 'car1')));
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
  await assertFails(updateDoc(listed, { status: 'sold' }));
  await assertFails(updateDoc(listed, { status: 'reserved' }));
  await assertSucceeds(updateDoc(listed, { status: 'paused' }));
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


  // Server-seeded social records. Clients can only read their own private paths.
  const three = authenticated('charlie', true).firestore();
  const convId = 'conversation_a';
  const transactionId = 'transaction_a';
  const reviewId = 'transaction_a_bob';
  await env.withSecurityRulesDisabled(async ctx => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, 'conversations', convId), {
      listingId:'car1',participantUids:['alice','bob'],sellerUid:'alice',buyerUid:'bob',
      status:'open',lastMessageAt:null
    });
    await setDoc(doc(admin,'conversations',convId,'messages','m1'), {
      senderUid:'alice', type:'text',text:'private',createdAt:new Date()
    });
    await setDoc(doc(admin,'conversations',convId,'offers','o1'), {
      creatorUid:'bob',status:'open',amountEur:20000,createdAt:new Date()
    });
    await setDoc(doc(admin,'transactions',transactionId), {
      listingId:'car1',sellerUid:'alice',buyerUid:'bob',status:'completed'
    });
    await setDoc(doc(admin,'reviews',reviewId), {
      transactionId,reviewerUid:'bob',revieweeUid:'alice',
      reviewerRole:'buyer',revieweeRole:'seller',stars:5,status:'visible'
    });
    await setDoc(doc(admin,'reviews','hidden_a'), {
      reviewerUid:'bob',revieweeUid:'alice',status:'hidden'
    });
    await setDoc(doc(admin,'profiles','alice'),{
      alias:'Alice',memberSince:new Date(),sellerRatingAverage:5,sellerRatingCount:1,
      phoneVerified:true,emailVerified:true
    });
    await setDoc(doc(admin,'users','alice','deviceTokens','token1'),{token:'secret'});
    await setDoc(doc(admin,'appConfig','marketplace'),{chat:false,offers:false,reviews:false,push:false});
  });
  await assertSucceeds(getDoc(doc(dbA,'conversations',convId)));
  await assertSucceeds(getDoc(doc(dbB,'conversations',convId,'messages','m1')));
  await assertSucceeds(getDoc(doc(dbB,'conversations',convId,'offers','o1')));
  await assertFails(getDoc(doc(three,'conversations',convId)));
  await assertFails(getDoc(doc(three,'conversations',convId,'messages','m1')));
  await assertFails(getDoc(doc(three,'conversations',convId,'offers','o1')));
  await assertFails(setDoc(doc(dbB,'conversations','forged'),{sellerUid:'alice'}));
  await assertFails(setDoc(doc(dbB,'conversations',convId,'messages','forged'),{
    senderUid:'bob',type:'text',text:'bypass',createdAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(dbB,'conversations',convId,'offers','o1'),{status:'accepted'}));
  const quotaRef=doc(dbB,'offerQuotas','bob_20261118');
  await assertFails(setDoc(quotaRef,{uid:'bob',date:'20261118',usedCount:0}));
  await assertFails(getDoc(quotaRef));
  await assertFails(setDoc(doc(dbA,'offerQuotas','bob_20261118'),{uid:'bob',usedCount:0}));
  await assertFails(setDoc(doc(dbA,'priceAlerts','fake'),{uid:'alice',listingId:'car1',enabled:true}));
  await assertFails(getDoc(doc(dbA,'priceAlerts','fake')));
  await assertFails(setDoc(doc(dbA,'listingPriceHistory','car1','entries','fake'),{newPriceEur:10}));
  await assertSucceeds(getDoc(doc(dbA,'listingPriceHistory','car1','entries','fake')));
  await assertFails(getDoc(doc(three,'listingPriceHistory','missing-listing','entries','fake')));
  await assertSucceeds(getDoc(doc(dbA,'transactions',transactionId)));
  await assertSucceeds(getDoc(doc(dbB,'transactions',transactionId)));
  await assertFails(getDoc(doc(three,'transactions',transactionId)));
  await assertFails(updateDoc(doc(dbA,'transactions',transactionId),{status:'refunded'}));
  await assertFails(setDoc(doc(dbB,'reviews','faked'),{stars:5}));
  await assertSucceeds(getDoc(doc(dbGuest,'reviews',reviewId)));
  await assertFails(getDoc(doc(dbGuest,'reviews','hidden_a')));
  await assertSucceeds(getDoc(doc(dbGuest,'profiles','alice')));
  await assertFails(updateDoc(doc(dbA,'profiles','alice'),{sellerRatingAverage:1}));
  await assertSucceeds(updateDoc(doc(dbA,'profiles','alice'),{alias:'Alice M.'}));
  await assertFails(updateDoc(doc(dbB,'profiles','alice'),{alias:'Impersonated'}));
  await assertFails(getDoc(doc(dbA,'users','alice','deviceTokens','token1')));
  await assertFails(setDoc(doc(dbA,'users','alice','deviceTokens','token2'),{token:'fake'}));
  await assertSucceeds(getDoc(doc(dbGuest,'appConfig','marketplace')));
  await assertFails(updateDoc(doc(dbA,'appConfig','marketplace'),{chat:true}));

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
