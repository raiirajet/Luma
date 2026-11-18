'use strict';
// Limba 1.5: all transaction, messaging and trust transitions are server owned.
const crypto = require('node:crypto');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, Timestamp, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
initializeApp();
const db = getFirestore();
const region = 'europe-west6';
const callableOptions = {region, enforceAppCheck: false, maxInstances: 50};
const NOW = () => Timestamp.now();
const fail = (code, message) => {throw new HttpsError(code, message);};
const assert = (ok, code = 'failed-precondition', message = 'Aktion nicht zulässig') => {if (!ok) fail(code, message);};
const str = (s, min, max, name) => {
  assert(typeof s === 'string' && s.trim().length >= min && s.trim().length <= max, 'invalid-argument', name + ' ungültig');
  return s.trim();
};
const id = (s, name = 'ID') => {
  const value = str(s, 1, 180, name);
  assert(/^[A-Za-z0-9_-]+$/.test(value), 'invalid-argument', name + ' ungültig');
  return value;
};
const money = n => {assert(Number.isSafeInteger(n) && n >= 1 && n <= 999999999, 'invalid-argument', 'Betrag ungültig'); return n;};
const userRef = uid => db.collection('users').doc(uid);
const listingRef = id => db.collection('listings').doc(id);
const convRef = id => db.collection('conversations').doc(id);
const txnRef = id => db.collection('transactions').doc(id);
const profileRef = uid => db.collection('profiles').doc(uid);
const reviewRef = (transactionId, uid) => db.collection('reviews').doc(transactionId + '_' + uid);
// Every buyer has a maximum of 3 submitted price offers per Zurich calendar day.
// All listings/sellers share one quota. The counter is modified only transactionally.
const OFFER_DAILY_LIMIT = 3;
const zurichDate = (time = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(time).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
  return parts.year + parts.month + parts.day;
};
const offerQuotaRef = (uid,dateKey=zurichDate()) => db.collection('offerQuotas').doc(uid + '_' + dateKey);
const isParticipant = (conv, uid) => Array.isArray(conv.participantUids) && conv.participantUids.includes(uid);
const auth = request => {
  assert(request.auth?.uid, 'unauthenticated', 'Bitte anmelden');
  assert(request.auth.token?.email_verified === true, 'permission-denied', 'E-Mail zuerst bestätigen');
  assert(typeof request.auth.token?.phone_number === 'string' && request.auth.token.phone_number.length >= 7, 'permission-denied', 'Telefonnummer zuerst verknüpfen und bestätigen');
  return request.auth.uid;
};
const secureCall = (flag, handler) => onCall(callableOptions, async request => {
  const uid = auth(request);
  const config = (await db.doc('appConfig/marketplace').get()).data() || {};
  assert(config[flag] === true, 'failed-precondition', 'Funktion ist noch nicht freigeschaltet');
  assert(!config.requireAppCheck || !!request.app, 'permission-denied', 'App Check erforderlich');
  return handler(request.data || {}, uid, request);
});
const blocked = async (a, b, tx) => {
  const first = userRef(a).collection('blocked').doc(b);
  const second = userRef(b).collection('blocked').doc(a);
  const result = tx ? await tx.getAll(first, second) : await db.getAll(first, second);
  return result.some(s => s.exists);
};
const getConv = async (tx, conversationId, uid) => {
  const ref = convRef(id(conversationId, 'Unterhaltung'));
  const snap = await tx.get(ref);
  assert(snap.exists && isParticipant(snap.data(), uid), 'permission-denied', 'Unterhaltung nicht zugänglich');
  return [ref, snap.data()];
};
const activePair = async (tx, conv, uid) => {
  const other = conv.sellerUid === uid ? conv.buyerUid : conv.sellerUid;
  assert(!(await blocked(uid, other, tx)), 'permission-denied', 'Kontakt blockiert');
};
const parseOffer = value => {
  const raw = str(value, 3, 300, 'Angebot');
  const parts = raw.split('~');
  assert(parts.length === 2, 'invalid-argument', 'Angebots-ID ungültig');
  return [id(parts[0]), id(parts[1])];
};
const profileDefault = (uid, data = {}) => ({
  alias: data.alias || 'Mitglied',
  memberSince: data.memberSince || NOW(),
  sellerRatingTotal: Number(data.sellerRatingTotal || 0),
  sellerRatingCount: Number(data.sellerRatingCount || 0),
  buyerRatingTotal: Number(data.buyerRatingTotal || 0),
  buyerRatingCount: Number(data.buyerRatingCount || 0)
});
const updateAggregate = (tx, ref, previous, role, changeStars, changeCount) => {
  assert(['buyer','seller'].includes(role), 'internal', 'Rolle');
  const field = role === 'seller' ? 'seller' : 'buyer';
  const countKey = field + 'RatingCount';
  const totalKey = field + 'RatingTotal';
  const avgKey = field + 'RatingAverage';
  const current = profileDefault(ref.id, previous);
  const count = current[countKey] + changeCount;
  const total = current[totalKey] + changeStars;
  assert(count >= 0 && total >= 0, 'internal', 'Bewertungsaggregate beschädigt');
  tx.set(ref, {alias:current.alias, memberSince:current.memberSince,
    [countKey]:count,[totalKey]:total,[avgKey]:count ? Math.round((total/count)*100)/100 : 0}, {merge:true});
};
const tags = (role, value) => {
  const seller = ['descriptionAccurate','goodCommunication','reliable','goodHandover'];
  const buyer = ['goodCommunication','punctual','reliable','smoothClosing'];
  assert(Array.isArray(value) && value.length <= 3 && value.every(t => typeof t === 'string' && (role === 'seller' ? seller : buyer).includes(t)) && new Set(value).size === value.length,
    'invalid-argument', 'Bewertungsmerkmale ungültig');
  return value;
};
const reviewPayload = (data, role) => {
  assert(Number.isInteger(data.stars) && data.stars >= 1 && data.stars <= 5, 'invalid-argument', '1–5 Sterne erforderlich');
  assert(data.comment == null || (typeof data.comment === 'string' && data.comment.length <= 500), 'invalid-argument', 'Kommentar zu lang');
  return {stars:data.stars, tags:tags(role, data.tags || []), comment:data.comment || ''};
};
const dateFromInput = value => {
  assert(typeof value === 'string', 'invalid-argument', 'Ablaufdatum erforderlich');
  const ms = Date.parse(value);
  assert(Number.isFinite(ms) && ms >= Date.now() + 60000 && ms <= Date.now() + 7*86400000, 'invalid-argument', 'Angebot 1 Minute bis 7 Tage gültig');
  return Timestamp.fromMillis(ms);
};

// Synchronize verification badges from Firebase Auth, never from client input.
exports.syncPublicProfile = secureCall('chat', async (_data, uid) => {
  const record = await require('firebase-admin/auth').getAuth().getUser(uid);
  const ref = profileRef(uid);
  const old = await ref.get();
  const memberSince = Timestamp.fromMillis(Date.parse(record.metadata.creationTime) || Date.now());
  const fields = {emailVerified:record.emailVerified===true,phoneVerified:!!record.phoneNumber};
  if (!old.exists) Object.assign(fields,{
    alias:(record.displayName || record.email?.split('@')[0] || 'Mitglied').slice(0,60),
    photoUrl:'',memberSince,sellerRatingCount:0,sellerRatingAverage:0,sellerRatingTotal:0,
    buyerRatingCount:0,buyerRatingAverage:0,buyerRatingTotal:0,
    completedSales:0,completedPurchases:0,responseRate:0,badges:[]
  });
  await ref.set(fields,{merge:true});
  return {synced:true};
});

exports.createConversation = secureCall('chat', async ({listingId}, uid) => {
  const lid = id(listingId, 'Inserat');
  const lref = listingRef(lid);
  const buyer = uid;
  const ref = convRef(crypto.createHash('sha256').update(lid + '\x00' + buyer).digest('hex').slice(0,48));
  return db.runTransaction(async tx => {
    const [listing, existing] = await Promise.all([tx.get(lref),tx.get(ref)]);
    assert(listing.exists && listing.data().status === 'active', 'failed-precondition', 'Inserat ist nicht verfügbar');
    const seller = listing.data().uid;
    assert(seller !== buyer, 'permission-denied', 'Keine Unterhaltung mit sich selbst');
    assert(!(await blocked(seller, buyer, tx)), 'permission-denied', 'Kontakt blockiert');
    if (!existing.exists) tx.create(ref, {
      listingId: lid, sellerUid:seller, buyerUid:buyer, participantUids:[seller,buyer],
      status:'open', createdAt:NOW(),lastMessageAt:null,lastMessagePreview:'',lastReadAt:{},offerPointers:{}
    });
    else assert(existing.data().listingId === lid && existing.data().buyerUid === uid &&
      existing.data().sellerUid === seller, 'permission-denied', 'Unterhaltung nicht zugänglich');
    return {conversationId:ref.id};
  });
});

exports.sendMessage = secureCall('chat', async ({conversationId,text}, uid) => {
  const body = str(text, 1, 1000, 'Nachricht');
  const now = NOW();
  return db.runTransaction(async tx => {
    const [ref,conv] = await getConv(tx,conversationId,uid);
    assert(['open','reserved','handover_confirmed'].includes(conv.status), 'failed-precondition', 'Unterhaltung geschlossen');
    await activePair(tx,conv,uid);
    const windowStart = conv.messageWindowStart?.toMillis?.() || 0;
    const sameWindow = now.toMillis() - windowStart < 60000;
    const count = sameWindow ? (conv.messageWindowCount || 0) : 0;
    assert(count < 20, 'resource-exhausted', 'Maximal 20 Nachrichten pro Minute');
    const message = ref.collection('messages').doc();
    tx.create(message,{senderUid:uid,type:'text',text:body,createdAt:now});
    tx.update(ref,{lastMessageAt:now,lastMessagePreview:body.slice(0,100),
      messageWindowStart:sameWindow ? conv.messageWindowStart : now,messageWindowCount:count+1});
    return {messageId:message.id};
  });
});

exports.getOfferQuota = secureCall('offers', async (_args,uid) => {
  const quota = await offerQuotaRef(uid).get();
  const used = Math.max(0, Number(quota.data()?.usedCount || 0));
  return {limit:OFFER_DAILY_LIMIT,remaining:Math.max(0,OFFER_DAILY_LIMIT-used),used,date:zurichDate(),timeZone:'Europe/Zurich'};
});

exports.createOffer = secureCall('offers', async ({conversationId,amountEur,validUntil}, uid) => {
  const amount = money(amountEur);
  const expiry = dateFromInput(validUntil);
  const dailyRef = offerQuotaRef(uid);
  return db.runTransaction(async tx => {
    const [ref,conv] = await getConv(tx,conversationId,uid);
    assert(uid === conv.buyerUid, 'permission-denied', 'Nur Käufer können Preisangebote senden');
    const [listing, dailySnap] = await Promise.all([tx.get(listingRef(conv.listingId)),tx.get(dailyRef)]);
    assert(conv.status === 'open' && listing.exists && listing.data().status === 'active', 'failed-precondition', 'Inserat nicht verfügbar');
    await activePair(tx,conv,uid);
    const previousId = conv.offerPointers?.[uid];
    if (previousId) {
      const previous = await tx.get(ref.collection('offers').doc(previousId));
      assert(!previous.exists || previous.data().status !== 'open' || previous.data().validUntil.toMillis() <= Date.now(),
        'already-exists', 'Du hast bereits ein offenes Angebot');
    }
    const used = Math.max(0, Number(dailySnap.data()?.usedCount || 0));
    assert(Number.isSafeInteger(used) && used < OFFER_DAILY_LIMIT,'resource-exhausted',
      'Maximal drei Preisangebote pro Tag. Ab morgen (Europe/Zurich) wieder möglich.');
    const offer = ref.collection('offers').doc();
    const now = NOW();
    tx.create(offer,{listingId:conv.listingId,conversationId:ref.id,creatorUid:uid,
      amountEur:amount,status:'open',validUntil:expiry,createdAt:now,respondedAt:null});
    tx.update(ref,{offerPointers:{...conv.offerPointers,[uid]:offer.id},lastMessageAt:now,
      lastMessagePreview:'Neues Preisangebot'});
    tx.set(dailyRef,{uid,date:zurichDate(),usedCount:used+1,updatedAt:now,
      expiresAt:Timestamp.fromMillis(Date.now()+10*86400000)},{merge:true});
    return {offerId:ref.id+'~'+offer.id,quotaRemaining:OFFER_DAILY_LIMIT-(used+1)};

  });
});

exports.respondToOffer = secureCall('offers', async ({offerId,action}, uid) => {
  assert(['accept','reject'].includes(action), 'invalid-argument', 'Aktion ungültig');
  const [conversationId,oid] = parseOffer(offerId);
  return db.runTransaction(async tx => {
    const [ref,conv] = await getConv(tx,conversationId,uid);
    assert(uid === conv.sellerUid,'permission-denied','Nur der Verkäufer kann ein Preisangebot beantworten');
    const offerRef = ref.collection('offers').doc(oid);
    const listingRefDoc = listingRef(conv.listingId);
    const tRef = txnRef(ref.id);
    const [offerSnap,listingSnap,oldTxn] = await Promise.all([tx.get(offerRef),tx.get(listingRefDoc),tx.get(tRef)]);
    assert(offerSnap.exists, 'not-found', 'Angebot nicht gefunden');
    const offer = offerSnap.data();
    assert(offer.creatorUid !== uid && offer.status === 'open' && offer.validUntil.toMillis() > Date.now(),
      'failed-precondition', 'Angebot nicht annehmbar');
    assert(conv.status === 'open', 'failed-precondition', 'Unterhaltung bereits reserviert');
    await activePair(tx,conv,uid);
    const now = NOW();
    if (action === 'accept') {
      assert(listingSnap.exists && listingSnap.data().status === 'active' && !oldTxn.exists,
        'failed-precondition', 'Inserat nicht mehr verfügbar');
      tx.update(listingRefDoc,{status:'reserved'});
      tx.create(tRef,{listingId:conv.listingId,conversationId:ref.id,
        sellerUid:conv.sellerUid,buyerUid:conv.buyerUid,agreedPriceEur:offer.amountEur,
        status:'reserved',createdAt:now,sellerConfirmedAt:null,buyerConfirmedAt:null,
        completedAt:null,reviewDeadlineAt:null});
      tx.update(ref,{status:'reserved',lastMessageAt:now,lastMessagePreview:'Angebot angenommen'});
    }
    tx.update(offerRef,{status:action === 'accept' ? 'accepted' : 'rejected',respondedAt:now});
    return {status:action === 'accept' ? 'reserved' : 'rejected',transactionId:action === 'accept' ? tRef.id : null};
  });
});

exports.confirmHandover = secureCall('offers', async ({transactionId}, uid) => {
  const ref = txnRef(id(transactionId, 'Transaktion'));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    assert(snap.exists && snap.data().sellerUid === uid && snap.data().status === 'reserved',
      'failed-precondition', 'Übergabe nicht zulässig');
    const now = NOW();
    tx.update(ref,{sellerConfirmedAt:now,status:'handover_confirmed'});
    tx.update(convRef(snap.data().conversationId),{status:'handover_confirmed'});
    return {status:'handover_confirmed'};
  });
});

exports.confirmPurchase = secureCall('offers', async ({transactionId}, uid) => {
  const ref = txnRef(id(transactionId, 'Transaktion'));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    assert(snap.exists && snap.data().buyerUid === uid && snap.data().status === 'handover_confirmed'
      && snap.data().sellerConfirmedAt, 'failed-precondition', 'Kauf nicht bestätigbar');
    const now = NOW();
    const deadline = Timestamp.fromMillis(now.toMillis()+30*86400000);
    const listing = await tx.get(listingRef(snap.data().listingId));
    assert(listing.exists && listing.data().status === 'reserved', 'failed-precondition', 'Inserat nicht reserviert');
    tx.update(ref,{buyerConfirmedAt:now,status:'completed',completedAt:now,reviewDeadlineAt:deadline});
    tx.update(listing.ref,{status:'sold'});
    tx.update(convRef(snap.data().conversationId),{status:'completed'});
    tx.set(profileRef(snap.data().sellerUid),{completedSales:FieldValue.increment(1)},{merge:true});
    tx.set(profileRef(snap.data().buyerUid),{completedPurchases:FieldValue.increment(1)},{merge:true});
    return {status:'completed',reviewDeadlineAt:deadline.toDate().toISOString()};
  });
});

exports.submitReview = secureCall('reviews', async ({transactionId,stars,tags:inputTags,comment}, uid) => {
  const tRef = txnRef(id(transactionId, 'Transaktion'));
  const rRef = reviewRef(tRef.id,uid);
  return db.runTransaction(async tx => {
    const [trans,existing] = await Promise.all([tx.get(tRef),tx.get(rRef)]);
    assert(trans.exists && trans.data().status === 'completed' && trans.data().reviewDeadlineAt?.toMillis() >= Date.now(),
      'failed-precondition', 'Bewertungsfrist abgelaufen oder Kauf nicht abgeschlossen');
    const t=trans.data();
    assert([t.buyerUid,t.sellerUid].includes(uid) && !existing.exists, 'permission-denied', 'Bewertung nicht zulässig');
    const reviewerRole = uid===t.buyerUid?'buyer':'seller';
    const revieweeRole = reviewerRole==='buyer'?'seller':'buyer';
    const revieweeUid = reviewerRole==='buyer'?t.sellerUid:t.buyerUid;
    const p = reviewPayload({stars,tags:inputTags,comment},revieweeRole);
    const prof = profileRef(revieweeUid);
    const snapshot=await tx.get(prof);
    const now=NOW();
    tx.create(rRef,{transactionId:tRef.id,reviewerUid:uid,revieweeUid,
      reviewerRole,revieweeRole,...p,status:'visible',createdAt:now,updatedAt:now});
    updateAggregate(tx,prof,snapshot.data(),revieweeRole,p.stars,1);
    return {reviewId:rRef.id};
  });
});
exports.editReview = secureCall('reviews', async ({reviewId,stars,tags:inputTags,comment}, uid) => {
  const ref=db.collection('reviews').doc(id(reviewId,'Bewertung'));
  return db.runTransaction(async tx => {
    const snap=await tx.get(ref);
    assert(snap.exists && snap.data().reviewerUid===uid && snap.data().status==='visible' &&
      Date.now()-snap.data().createdAt.toMillis()<=1800000,'failed-precondition','Bearbeitungsfrist abgelaufen');
    const previous=snap.data();
    const p=reviewPayload({stars,tags:inputTags,comment},previous.revieweeRole);
    const prof=profileRef(previous.revieweeUid);
    const profile=await tx.get(prof);
    tx.update(ref,{...p,updatedAt:NOW()});
    updateAggregate(tx,prof,profile.data(),previous.revieweeRole,p.stars-previous.stars,0);
    return {reviewId:ref.id};
  });
});
exports.withdrawReview = secureCall('reviews', async ({reviewId}, uid) => {
  const ref=db.collection('reviews').doc(id(reviewId,'Bewertung'));
  return db.runTransaction(async tx => {
    const snap=await tx.get(ref);
    assert(snap.exists && snap.data().reviewerUid===uid && snap.data().status==='visible',
      'failed-precondition','Bewertung nicht zurückziehbar');
    const previous=snap.data();
    const prof=profileRef(previous.revieweeUid);
    const profile=await tx.get(prof);
    tx.update(ref,{status:'withdrawn',updatedAt:NOW()});
    updateAggregate(tx,prof,profile.data(),previous.revieweeRole,-previous.stars,-1);
    return {status:'withdrawn'};
  });
});
exports.blockUser = secureCall('chat', async ({uid:target}, uid) => {
  const blockedUid=id(target,'Nutzer');
  assert(blockedUid!==uid,'invalid-argument','Selbstsperre nicht zulässig');
  await userRef(uid).collection('blocked').doc(blockedUid).set({createdAt:NOW()});
  return {blocked:true};
});
exports.reportContent = secureCall('chat', async ({entityType,entityId,reason,details}, uid) => {
  assert(['listing','user','review','message','conversation'].includes(entityType),
    'invalid-argument','Meldetyp ungültig');
  const target=id(entityId,'Inhalt');
  assert(['fraud','duplicate','inappropriate','harassment','other'].includes(reason),
    'invalid-argument','Meldegrund ungültig');
  assert(details == null || (typeof details==='string' && details.length<=1000),
    'invalid-argument','Details zu lang');
  const ref=db.collection('reports').doc();
  await ref.create({reporterUid:uid,entityType,entityId:target,reason,details:details||'',
    status:'pending',createdAt:NOW()});
  return {reportId:ref.id};
});
exports.registerPushToken = secureCall('push', async ({token,platform,appVersion}, uid) => {
  const clean=str(token,20,4096,'Token');
  assert(['web','android'].includes(platform),'invalid-argument','Plattform ungültig');
  const version=str(appVersion,1,40,'Version');
  const tokenId=crypto.createHash('sha256').update(clean).digest('hex');
  await userRef(uid).collection('deviceTokens').doc(tokenId)
    .set({token:clean,platform,appVersion:version,updatedAt:NOW()});
  return {registered:true};
});
// Admins must be granted the server-side Firebase Auth admin custom claim.
// Never accept an arbitrary client-side UID or profile field as admin proof.
exports.moderateReview = secureCall('reviews', async ({reviewId,action}, uid, request) => {
  assert(request.auth.token.admin===true,'permission-denied','Administrator erforderlich');
  assert(['hide','restore'].includes(action),'invalid-argument','Moderation ungültig');
  const ref=db.collection('reviews').doc(id(reviewId));
  return db.runTransaction(async tx => {
    const snap=await tx.get(ref);
    assert(snap.exists,'not-found','Bewertung nicht gefunden');
    const r=snap.data();
    assert(r.status!=='withdrawn','failed-precondition','Zurückgezogene Bewertung');
    const next=action==='hide'?'hidden':'visible';
    if(r.status===next)return {status:next};
    const prof=profileRef(r.revieweeUid);
    const p=await tx.get(prof);
    updateAggregate(tx,prof,p.data(),r.revieweeRole,next==='hidden'?-r.stars:r.stars,next==='hidden'?-1:1);
    tx.update(ref,{status:next,updatedAt:NOW(),moderatedBy:uid});
    return {status:next};
  });
});
const pushTo = async (uid, title, kind) => {
  const docs=await userRef(uid).collection('deviceTokens').limit(500).get();
  const tokens=docs.docs.map(s=>s.data().token).filter(Boolean);
  if (!tokens.length)return;
  const result=await getMessaging().sendEachForMulticast({
    tokens, notification:{title:'Limba',body:title},data:{type:kind},
    android:{priority:'high',notification:{channelId:'limba_updates',visibility:'private'}},
    webpush:{notification:{title:'Limba',body:title}}
  });
  await Promise.all(result.responses.map(async (response,i)=>{
    if (!response.success && ['messaging/registration-token-not-registered',
      'messaging/invalid-registration-token'].includes(response.error?.code))
      await docs.docs[i].ref.delete();
  }));
};
exports.notifyNewMessage = onDocumentCreated({region,
  document:'conversations/{conversationId}/messages/{messageId}'},async event=>{
  const data=event.data?.data();if(!data)return;
  const conv=await convRef(event.params.conversationId).get();
  if(!conv.exists)return;
  const target=conv.data().sellerUid===data.senderUid?conv.data().buyerUid:conv.data().sellerUid;
  if(target)await pushTo(target,'Neue Nachricht','message');
});
// Notify only after successful server-side offer creation; push never leaks the price.
exports.notifyNewOffer = onDocumentCreated({region,
  document:'conversations/{conversationId}/offers/{offerId}'},async event=>{
  const offer=event.data?.data();if(!offer||offer.status!=='open')return;
  const conv=await convRef(event.params.conversationId).get();
  if(conv.exists&&offer.creatorUid===conv.data().buyerUid)
    await pushTo(conv.data().sellerUid,'Neues Preisangebot','offer');
});
exports.notifyOfferStatus = onDocumentUpdated({region,
  document:'conversations/{conversationId}/offers/{offerId}'},async event=>{
  const before=event.data?.before?.data(),after=event.data?.after?.data();
  if(!before||!after||before.status===after.status)return;
  const conv=await convRef(event.params.conversationId).get();
  if(!conv.exists)return;
  await pushTo(after.creatorUid,'Neuer Angebotsstatus','offer');
});
exports.closeOtherOffers = onDocumentUpdated({region,
  document:'listings/{listingId}'},async event=>{
  const before=event.data?.before?.data(),after=event.data?.after?.data();
  if(before?.status!=='active'||after?.status!=='reserved')return;
  // Eventual close: an offer can never be accepted after reservation because
  // respondToOffer transaction checks the listing's authoritative status.
  let docs;
  do {
    docs=await db.collectionGroup('offers').where('listingId','==',event.params.listingId)
      .where('status','==','open').limit(200).get();
    if(docs.empty)break;
    const batch=db.batch();
    for(const doc of docs.docs)batch.update(doc.ref,{status:'closed',respondedAt:NOW()});
    await batch.commit();
  }while(docs.size===200);
});
