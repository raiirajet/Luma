const { FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { activeVehicle, inputId, inputObject, inputText, stableId, verifiedUid } = require('./model');

async function applyRateLimit(db, transaction, uid, action, maxPerMinute) {
  const ref = db.collection('limbaLimits').doc(stableId(action, uid));
  const limit = await transaction.get(ref);
  const minute = Math.floor(Date.now() / 60_000);
  const count = limit.get('minute') === minute ? limit.get('count') : 0;
  if (count >= maxPerMinute) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again in a moment.');
  }
  transaction.set(ref, { minute, count: count + 1 });
}

function requireParticipant(snapshot, uid) {
  const thread = snapshot.data();
  if (!thread?.participants?.includes(uid) || (thread.buyerUid !== uid && thread.sellerUid !== uid)) {
    throw new HttpsError('permission-denied', 'This conversation is private.');
  }
  return thread;
}

function chatHandlers(db) {
  const threads = db.collection('chatThreads');

  async function startListingChat(request) {
    const buyerUid = verifiedUid(request);
    const listingId = inputId(inputObject(request.data).listingId, 'listing');
    const listingRef = db.collection('listings').doc(listingId);

    return db.runTransaction(async transaction => {
      const listing = (await transaction.get(listingRef)).data();
      if (!activeVehicle(listing) || typeof listing.uid !== 'string') {
        throw new HttpsError('not-found', 'This listing is unavailable.');
      }
      const sellerUid = listing.uid;
      if (buyerUid === sellerUid) {
        throw new HttpsError('failed-precondition', 'This is your listing.');
      }

      const threadId = stableId(listingId, buyerUid, sellerUid);
      const ref = threads.doc(threadId);
      if ((await transaction.get(ref)).exists) return { threadId };

      await applyRateLimit(db, transaction, buyerUid, 'startChat', 8);
      const now = FieldValue.serverTimestamp();
      transaction.create(ref, {
        listingId,
        listingTitle: listing.title,
        buyerUid,
        sellerUid,
        participants: [buyerUid, sellerUid],
        blockedBy: [],
        lastMessage: '',
        createdAt: now,
        updatedAt: now,
      });
      return { threadId };
    });
  }

  async function sendListingMessage(request) {
    const uid = verifiedUid(request);
    const data = inputObject(request.data);
    const threadId = inputId(data.threadId, 'conversation');
    const retryId = inputId(data.messageId, 'message ID');
    const body = inputText(data.text, 2000, 'message');
    const ref = threads.doc(threadId);
    const messageId = stableId(uid, retryId);
    const messageRef = ref.collection('messages').doc(messageId);

    return db.runTransaction(async transaction => {
      const thread = requireParticipant(await transaction.get(ref), uid);
      const previous = await transaction.get(messageRef);
      if (previous.exists) {
        if (previous.get('text') !== body) {
          throw new HttpsError('already-exists', 'This message ID was already used.');
        }
        return { messageId };
      }
      if (thread.blockedBy.length > 0) {
        throw new HttpsError('failed-precondition', 'This conversation is blocked.');
      }
      const listing = (await transaction.get(db.collection('listings').doc(thread.listingId))).data();
      if (!activeVehicle(listing) || listing.uid !== thread.sellerUid) {
        throw new HttpsError('failed-precondition', 'This listing is unavailable.');
      }

      await applyRateLimit(db, transaction, uid, 'sendMessage', 30);
      const now = FieldValue.serverTimestamp();
      transaction.create(messageRef, { text: body, senderUid: uid, createdAt: now });
      transaction.update(ref, { lastMessage: body, updatedAt: now });
      return { messageId };
    });
  }

  async function setListingChatBlocked(request) {
    const uid = verifiedUid(request);
    const data = inputObject(request.data);
    const threadId = inputId(data.threadId, 'conversation');
    if (typeof data.blocked !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Invalid block setting.');
    }
    const ref = threads.doc(threadId);

    return db.runTransaction(async transaction => {
      requireParticipant(await transaction.get(ref), uid);
      transaction.update(ref, {
        blockedBy: data.blocked ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
      });
      return { blocked: data.blocked };
    });
  }

  async function reportListingChat(request) {
    const uid = verifiedUid(request);
    const data = inputObject(request.data);
    const threadId = inputId(data.threadId, 'conversation');
    const reason = inputText(data.reason, 500, 'reason');
    const ref = threads.doc(threadId);
    const reportRef = db.collection('chatReports').doc(stableId(threadId, uid));

    return db.runTransaction(async transaction => {
      const thread = requireParticipant(await transaction.get(ref), uid);
      if ((await transaction.get(reportRef)).exists) return { reported: true };

      await applyRateLimit(db, transaction, uid, 'reportChat', 6);
      transaction.create(reportRef, {
        threadId,
        listingId: thread.listingId,
        reporterUid: uid,
        reason,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { reported: true };
    });
  }

  return { startListingChat, sendListingMessage, setListingChatBlocked, reportListingChat };
}

module.exports = { chatHandlers };
