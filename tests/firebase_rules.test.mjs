import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId='demo-limba';
const host='127.0.0.1';
const env=await initializeTestEnvironment({
  projectId,
  firestore:{host,port:8082,rules:fs.readFileSync('firestore.rules','utf8')},
  storage:{host,port:9199,rules:fs.readFileSync('storage.rules','utf8')}
});
const authenticated=(id,verified)=>env.authenticatedContext(id,{email_verified:verified});
const alice=authenticated('alice',true);
const bob=authenticated('bob',true);
const unverified=authenticated('unverified',false);
const publicUser=env.unauthenticatedContext();
const dbA=alice.firestore(),dbB=bob.firestore(),dbU=unverified.firestore(),dbGuest=publicUser.firestore();
const photoUrl=id=>`https://firebasestorage.googleapis.com/v0/b/demo-limba.appspot.com/o/listings%2Falice%2F${id}%2F0.jpg?alt=media&token=example`;
function car(id,uid='alice'){
  return {
    category:'vehicles',uid,status:'active',createdAt:serverTimestamp(),
    title:'Nissan GT-R',description:'Very good condition. Full history available on request.',
    price:28000,country:'AL',city:'Tirana',condition:'used',
    contactEmail:'',make:'Nissan',model:'GT-R',year:2018,mileage:77000,power:550,
    fuel:'petrol',transmission:'automatic',body:'coupe',sellerType:'privateSeller',
    accidentStatus:'no',conditionNote:'Very good',
    image:photoUrl(id),images:[photoUrl(id)]
  };
}
try {
  const listed=doc(dbA,'listings','car1');
  await assertSucceeds(setDoc(listed,car('car1')));
  await assertSucceeds(getDoc(doc(dbGuest,'listings','car1')));
  await assertSucceeds(getDocs(query(collection(dbGuest,'listings'),where('status','==','active'))));
  await assertFails(setDoc(doc(dbGuest,'listings','anonymous'),car('anonymous')));
  await assertFails(setDoc(doc(dbU,'listings','unverified'),car('unverified','unverified')));
  await assertFails(setDoc(doc(dbB,'listings','impersonation'),car('impersonation','alice')));
  await assertFails(updateDoc(doc(dbB,'listings','car1'),{price:1}));
  await assertFails(deleteDoc(doc(dbB,'listings','car1')));
  await assertSucceeds(updateDoc(listed,{status:'sold'}));
  await assertFails(getDoc(doc(dbGuest,'listings','car1')));
  await assertFails(getDoc(doc(dbB,'listings','car1')));
  await assertSucceeds(getDoc(listed));
  await assertSucceeds(updateDoc(listed,{status:'active'}));
  const favorite=doc(dbA,'users','alice','favorites','car1');
  await assertSucceeds(setDoc(favorite,{createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(dbB,'users','alice','favorites','car1'),{createdAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(dbA,'reports','report1'),{listingId:'car1',reporterUid:'alice',reason:'fraud',createdAt:serverTimestamp()}));
  await assertFails(getDoc(doc(dbA,'reports','report1')));
  await assertFails(setDoc(doc(dbU,'reports','report2'),{listingId:'car1',reporterUid:'unverified',reason:'fraud',createdAt:serverTimestamp()}));
  const storeAlice=alice.storage('gs://demo-limba.appspot.com');
  const storeBob=bob.storage('gs://demo-limba.appspot.com');
  const storeU=unverified.storage('gs://demo-limba.appspot.com');
  const bytes=new Uint8Array([0xff,0xd8,0xff,0xd9]);
  await assertSucceeds(uploadBytes(ref(storeAlice,'listings/alice/car1/0.jpg'),bytes,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(storeBob,'listings/alice/car1/1.jpg'),bytes,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(storeU,'listings/unverified/car1/1.jpg'),bytes,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(storeAlice,'listings/alice/car1/6.jpg'),bytes,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(storeAlice,'listings/alice/car1/1.html'),bytes,{contentType:'text/html'}));
  await assertSucceeds(deleteDoc(listed));
  console.log('PASS: Limba Firestore ownership, verification, statuses, favorites, reports and Storage rules');
} finally {
  await env.cleanup();
}
