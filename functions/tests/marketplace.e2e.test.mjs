import assert from 'node:assert/strict';
import test from 'node:test';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';

const projectId=process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || 'demo-limba';
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Firebase Auth emulator is required');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator is required');
initializeApp({projectId});
const auth=getAuth();
const db=getFirestore();
const url='http://127.0.0.1:5001/'+projectId+'/europe-west6/';
const create = async (name,phone,verified=true) => {
  const email=name+'@limba-test.example';
  const user=await auth.createUser({email,password:'LimbaDemo12345!',emailVerified:verified,...(phone?{phoneNumber:phone}:{})});
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'LimbaDemo12345!',returnSecureToken:true})});
  const value=await response.json();
  assert.equal(response.ok,true,'sign in '+name+': '+JSON.stringify(value));
  const claims=await auth.verifyIdToken(value.idToken);
  assert.equal(claims.email_verified,verified,'verified email claim');
  if(phone) assert.equal(claims.phone_number,phone,'linked phone token claim');
  return {uid:user.uid,token:value.idToken};
};
const invoke=async (name,user,data={})=>{
  const response=await fetch(url+name,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+user.token
  },body:JSON.stringify({data})});
  const payload=await response.json();
  return {ok:response.ok,status:response.status,result:payload.result,error:payload.error};
};
const success=async(name,user,data)=>{const result=await invoke(name,user,data);assert.equal(result.ok,true,name+': '+JSON.stringify(result));return result.result};
const denied=async(name,user,data)=>{const result=await invoke(name,user,data);assert.equal(result.ok,false,name+' should reject');return result.error};
const hours=h=>new Date(Date.now()+h*3600000).toISOString();

test('verified 2-party sale, third-party isolation, no phone, role checks and reviews',async()=>{
  const seller=await create('seller','+15550001111');
  const buyer=await create('buyer','+15550002222');
  const third=await create('third','+15550003333');
  const noPhone=await create('nophone',null);
  const unverified=await create('unverified','+15550004444',false);
  const listingId='limba_e2e_1';
  await db.doc('appConfig/marketplace').set({chat:true,offers:true,reviews:true,push:false,requireAppCheck:false});
  await db.doc('listings/'+listingId).set({status:'active',uid:seller.uid,category:'vehicles'});
  await denied('createConversation',noPhone,{listingId});
  await denied('createConversation',unverified,{listingId});
  await denied('createConversation',seller,{listingId});
  const {conversationId}=await success('createConversation',buyer,{listingId});
  const repeated=await success('createConversation',buyer,{listingId});
  assert.equal(conversationId,repeated.conversationId,'idempotent pair');
  const other=await success('createConversation',third,{listingId});
  await success('sendMessage',buyer,{conversationId,text:'Hallo, Fahrzeug verfügbar?'});
  const message=await db.collection('conversations').doc(conversationId).collection('messages').get();
  assert.equal(message.size,1);
  await denied('sendMessage',third,{conversationId,text:'not participant'});
  await denied('sendMessage',noPhone,{conversationId,text:'not verified'});
  await success('createOffer',third,{conversationId:other.conversationId,amountEur:11000,validUntil:hours(2)});
  const quotaStart=await success('getOfferQuota',buyer,{});
  assert.equal(quotaStart.limit,3);
  assert.equal(quotaStart.remaining,3);
  const {offerId}=await success('createOffer',buyer,{conversationId,amountEur:12000,validUntil:hours(2)});
  assert.equal((await success('getOfferQuota',buyer,{})).remaining,2);
  assert.equal((await success('getOfferQuota',third,{})).remaining,2);
  await denied('createOffer',seller,{conversationId,amountEur:10000,validUntil:hours(2)});
  await denied('createOffer',buyer,{conversationId,amountEur:13000,validUntil:hours(2)});
  await denied('respondToOffer',buyer,{offerId,action:'accept'});
  await denied('respondToOffer',third,{offerId,action:'accept'});
  const transaction=await success('respondToOffer',seller,{offerId,action:'accept'});
  assert.equal(transaction.status,'reserved');
  assert.equal((await db.doc('listings/'+listingId).get()).get('status'),'reserved');
  await denied('respondToOffer',seller,{offerId:other.conversationId+'~bad',action:'accept'});
  await denied('createOffer',third,{conversationId:other.conversationId,amountEur:12500,validUntil:hours(2)});
  await denied('confirmPurchase',buyer,{transactionId:conversationId});
  await denied('confirmHandover',buyer,{transactionId:conversationId});
  await success('confirmHandover',seller,{transactionId:conversationId});
  assert.equal((await db.doc('listings/'+listingId).get()).get('status'),'reserved');
  await denied('confirmPurchase',third,{transactionId:conversationId});
  await success('confirmPurchase',buyer,{transactionId:conversationId});
  assert.equal((await db.doc('listings/'+listingId).get()).get('status'),'sold');
  assert.equal((await db.doc('transactions/'+conversationId).get()).get('status'),'completed');
  assert.equal((await db.doc('profiles/'+seller.uid).get()).get('completedSales'),1);
  assert.equal((await db.doc('profiles/'+buyer.uid).get()).get('completedPurchases'),1);
  await denied('submitReview',third,{transactionId:conversationId,stars:1,tags:[],comment:''});
  await denied('submitReview',buyer,{transactionId:conversationId,stars:6,tags:[],comment:''});
  await denied('submitReview',buyer,{transactionId:conversationId,stars:5,tags:['reliable','reliable'],comment:''});
  const submitted=await success('submitReview',buyer,{transactionId:conversationId,stars:5,tags:['reliable','goodCommunication'],comment:'Alles gut'});
  assert.equal(submitted.reviewId,conversationId+'_'+buyer.uid);
  await denied('submitReview',buyer,{transactionId:conversationId,stars:5,tags:[],comment:''});
  assert.equal((await db.doc('profiles/'+seller.uid).get()).get('sellerRatingAverage'),5);
  await success('editReview',buyer,{reviewId:submitted.reviewId,stars:3,tags:['reliable'],comment:'Korrigiert'});
  assert.equal((await db.doc('profiles/'+seller.uid).get()).get('sellerRatingAverage'),3);
  const rating=await success('submitReview',seller,{transactionId:conversationId,stars:4,tags:['punctual'],comment:'Pünktlich'});
  assert.equal((await db.doc('profiles/'+buyer.uid).get()).get('buyerRatingAverage'),4);
  await success('withdrawReview',buyer,{reviewId:submitted.reviewId});
  assert.equal((await db.doc('profiles/'+seller.uid).get()).get('sellerRatingCount'),0);
  assert.equal((await db.doc('profiles/'+seller.uid).get()).get('sellerRatingAverage'),0);
  await denied('editReview',buyer,{reviewId:submitted.reviewId,stars:2,tags:[],comment:''});
  const reviewSnap=await db.doc('reviews/'+rating.reviewId).get();
  assert.equal(reviewSnap.get('status'),'visible');
  await db.doc('reviews/'+rating.reviewId).update({createdAt:Timestamp.fromMillis(Date.now()-31*60000)});
  await denied('editReview',seller,{reviewId:rating.reviewId,stars:5,tags:[],comment:''});
  // Moderation uses admin claim in addition to verification and phone.
  await denied('moderateReview',third,{reviewId:rating.reviewId,action:'hide'});
  await auth.setCustomUserClaims(third.uid,{admin:true});
  const signed=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'third@limba-test.example',password:'LimbaDemo12345!',returnSecureToken:true})});
  const newer=await signed.json();third.token=newer.idToken;
  await success('moderateReview',third,{reviewId:rating.reviewId,action:'hide'});
  assert.equal((await db.doc('profiles/'+buyer.uid).get()).get('buyerRatingCount'),0);
  await success('moderateReview',third,{reviewId:rating.reviewId,action:'restore'});
  assert.equal((await db.doc('profiles/'+buyer.uid).get()).get('buyerRatingAverage'),4);
});

test('price offers: global three per buyer per Zurich day, never client-bypassable',async()=>{
  const seller=await create('quotaseller','+15551117777');
  const buyer=await create('quotabuyer','+15551118888');
  const other=await create('quotaother','+15551119999');
  const ids=[];
  for(let i=0;i<4;i++) {
    const lid='limba_quota_'+i;
    await db.doc('listings/'+lid).set({status:'active',uid:seller.uid,category:'vehicles'});
    const {conversationId}=await success('createConversation',buyer,{listingId:lid});
    ids.push(conversationId);
  }
  for(let i=0;i<3;i++) {
    const created=await success('createOffer',buyer,{conversationId:ids[i],amountEur:5000+i*250,validUntil:hours(4)});
    assert.equal(created.quotaRemaining,2-i);
  }
  assert.equal((await success('getOfferQuota',buyer,{})).remaining,0);
  const denial=await denied('createOffer',buyer,{conversationId:ids[3],amountEur:6000,validUntil:hours(4)});
  assert.equal(denial.status,'RESOURCE_EXHAUSTED','server rejects the fourth offer');
  const quotaDocs=await db.collection('offerQuotas').where('uid','==',buyer.uid).get();
  assert.equal(quotaDocs.size,1);
  assert.equal(quotaDocs.docs[0].get('usedCount'),3);
  assert.equal(quotaDocs.docs[0].get('date').length,8);
  // Different verified buyer has an independent limit, and the seller cannot create fake bids.
  const {conversationId}=await success('createConversation',other,{listingId:'limba_quota_3'});
  assert.equal((await success('getOfferQuota',other,{})).remaining,3);
  const created=await success('createOffer',other,{conversationId,amountEur:6000,validUntil:hours(4)});
  assert.equal(created.quotaRemaining,2);
  await denied('createOffer',seller,{conversationId,amountEur:1000,validUntil:hours(4)});
});
