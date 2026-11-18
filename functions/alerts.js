const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');
const { activeVehicle, createOnce, inputObject, stableId, verifiedUid } = require('./model');
const { matchesSearch, normalizeSearch } = require('./search');

const PAGE_SIZE = 100;
const JOBS_PER_RUN = 5;
const MAX_ALERTS = 20;

function searchAlertHandler(db) {
  return async function setSavedSearchAlert(request) {
    const uid = verifiedUid(request);
    const data = inputObject(request.data);
    if (typeof data.enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Invalid alert setting.');
    }
    const search = normalizeSearch(data);
    const alertId = stableId(search);
    const alertRef = db.collection('users').doc(uid).collection('searchAlerts').doc(alertId);
    const limitRef = db.collection('limbaLimits').doc(stableId('alertCount', uid));

    return db.runTransaction(async transaction => {
      const [alert, limit] = await transaction.getAll(alertRef, limitRef);
      const count = limit.get('count') ?? 0;
      if (data.enabled && !alert.exists) {
        if (count >= MAX_ALERTS) {
          throw new HttpsError('resource-exhausted', 'Turn off an existing search alert first.');
        }
        transaction.create(alertRef, { ...search, createdAt: FieldValue.serverTimestamp() });
        transaction.set(limitRef, { count: count + 1 });
      } else if (!data.enabled && alert.exists) {
        transaction.delete(alertRef);
        transaction.set(limitRef, { count: Math.max(0, count - 1) });
      }
      return { alertId, enabled: data.enabled };
    });
  };
}

function trackListingHandler(db) {
  return async function trackListingChanges(event) {
    const { before, after } = event.data ?? {};
    if (!after?.exists) return;
    const listing = after.data();
    if (listing.category !== 'vehicles') return;
    const listingId = after.id;
    if (!before.exists && activeVehicle(listing)) {
      const listedAt = after.createTime;
      const jobId = stableId(listingId, listedAt.seconds, listedAt.nanoseconds);
      await createOnce(db.collection('listingSearchJobs').doc(jobId), { listingId, listedAt });
    } else if (before.exists) {
      const previousPrice = before.get('price');
      const price = listing.price;
      if (Number.isFinite(previousPrice) && Number.isFinite(price) && previousPrice !== price) {
        const eventId = stableId(event.id);
        await createOnce(after.ref.collection('priceHistory').doc(eventId), {
          price,
          previousPrice,
          changedAt: after.updateTime,
        });
      }
    }
  };
}

function beforePublication(alert, listedAt) {
  return alert?.createdAt && alert.createdAt.valueOf() <= listedAt.valueOf();
}

async function notifyMatch(db, refs, owner, job, listing) {
  const notification = owner.collection('notifications').doc(job.id);
  return db.runTransaction(async transaction => {
    if ((await transaction.get(notification)).exists) return;
    const alerts = await transaction.getAll(...refs);
    const match = alerts.map(alert => alert.data()).find(alert =>
      beforePublication(alert, job.get('listedAt')) && matchesSearch(listing, alert));
    if (!match) return;
    transaction.create(notification, {
      listingId: job.get('listingId'),
      listingTitle: listing.title,
      searchName: match.name,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
  });
}

async function advanceJob(db, job, cursor) {
  await db.runTransaction(async transaction => {
    const current = await transaction.get(job.ref);
    if (!current.get('listedAt') || current.get('cursor') !== job.get('cursor')) return;
    if (cursor) {
      transaction.update(job.ref, { cursor });
    } else {
      transaction.set(job.ref, { completedAt: FieldValue.serverTimestamp() });
    }
  });
}

async function processJob(db, job) {
  const { listingId, listedAt, cursor } = job.data();
  const listing = (await db.collection('listings').doc(listingId).get()).data();
  if (!activeVehicle(listing)) {
    await advanceJob(db, job);
    return;
  }

  let query = db.collectionGroup('searchAlerts').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(db.doc(cursor));
  const results = await query.get();
  const byOwner = new Map();
  for (const doc of results.docs) {
    const owner = doc.ref.parent.parent;
    if (!owner || owner.parent.path !== 'users' || owner.id === listing.uid) continue;
    const alert = doc.data();
    if (!beforePublication(alert, listedAt) || !matchesSearch(listing, alert)) continue;
    const existing = byOwner.get(owner.path);
    if (existing) existing.refs.push(doc.ref);
    else byOwner.set(owner.path, { owner, refs: [doc.ref] });
  }
  await Promise.all([...byOwner.values()].map(({ refs, owner }) => notifyMatch(db, refs, owner, job, listing)));
  const next = results.size === PAGE_SIZE ? results.docs.at(-1).ref.path : undefined;
  await advanceJob(db, job, next);
}

function processSearchJobsHandler(db) {
  return async function processListingSearchAlerts() {
    // Completed jobs lack listedAt, so the ordered query sees only queued work.
    const jobs = await db.collection('listingSearchJobs').orderBy('listedAt').limit(JOBS_PER_RUN).get();
    let failed = 0;
    for (const job of jobs.docs) {
      try {
        await processJob(db, job);
      } catch (error) {
        logger.error('Search alert job failed', { jobId: job.id, code: error.code });
        failed++;
      }
    }
    if (failed) throw new Error(`${failed} search alert jobs failed and will be retried.`);
  };
}

module.exports = { processSearchJobsHandler, searchAlertHandler, trackListingHandler };
