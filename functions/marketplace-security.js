const { randomUUID } = require('node:crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const sharp = require('sharp');

const HOUR = 60 * 60 * 1000;
const GRANT_DURATION = HOUR;
const CLEANUP_DELAY = 2 * HOUR;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const LEGACY_OBJECT = /^listings\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]{1,128})\/[0-5]\.(jpg|png|webp)$/;
const LISTING_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MIME_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const PHOTO_SIGNATURES = {
  'image/jpeg': bytes => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
  'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};
const REPORT_REASONS = new Set(['fraud', 'duplicate', 'inappropriate', 'other']);

function verifiedUid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verify your email first.');
  }
  return request.auth.uid;
}

function quota(db, uid, action) {
  return db.collection('marketplaceQuotas').doc(uid).collection('marketplaceQuotaWindows').doc(action);
}

function consumeQuota(transaction, snapshot, now, action, hourly, daily) {
  const previous = snapshot.data() || {};
  function nextWindow(window, duration, limit) {
    if (!window || now - window.start >= duration) return { start: now, count: 1 };
    if (window.count >= limit) {
      throw new HttpsError('resource-exhausted', 'Please try again later.');
    }
    return { start: window.start, count: window.count + 1 };
  }
  const hour = nextWindow(previous.hour, HOUR, hourly);
  const day = nextWindow(previous.day, 24 * HOUR, daily);
  transaction.set(snapshot.ref, { hour, day, expiresAt: Timestamp.fromMillis(now + 2 * 24 * HOUR) });
  return hour.count === hourly || day.count === daily ? action : null;
}

async function sanitizePhoto(bytes, mimeType) {
  if (!bytes.length || bytes.length >= MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'Invalid photo size.');
  }
  if (!PHOTO_SIGNATURES[mimeType]?.(bytes)) {
    throw new HttpsError('invalid-argument', 'The photo does not match its declared format.');
  }
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await image.metadata();
    if (MIME_TYPES[metadata.format] !== mimeType || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) !== 1) {
      throw new Error('Unsupported image');
    }
    return await image.rotate().resize({
      width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true,
    }).flatten({ background: '#fff' }).jpeg({ quality: 83 }).toBuffer();
  } catch {
    throw new HttpsError('invalid-argument', 'A photo is damaged or uses an unsupported image format.');
  }
}

function marketHandlers(db, bucket) {
  const grants = db.collection('listingUploads');
  const listings = db.collection('listings');

  async function reserveListingUpload(request) {
    const uid = verifiedUid(request);
    const count = request.data?.count;
    if (!Number.isInteger(count) || count < 1 || count > 6) {
      throw new HttpsError('invalid-argument', 'Select one to six photos.');
    }
    const grant = grants.doc();
    const now = Date.now();
    const signal = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(quota(db, uid, 'listingUpload'));
      const result = consumeQuota(transaction, snapshot, now, 'listingUpload', 6, 20);
      transaction.create(grant, {
        uid, count, used: false,
        expiresAt: Timestamp.fromMillis(now + GRANT_DURATION),
        cleanupAt: Timestamp.fromMillis(now + GRANT_DURATION + CLEANUP_DELAY),
      });
      return result;
    });
    if (signal) logger.warn('Marketplace rate threshold reached', { action: signal });
    return { listingId: grant.id };
  }

  async function storePhoto(uid, listingId, slot, clean) {
    const path = `listings/${uid}/${listingId}/clean-${slot}.jpg`;
    const target = bucket.file(path);
    const token = randomUUID();
    try {
      await target.save(clean, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public,max-age=3600',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
      const [metadata] = await target.getMetadata();
      return photoUrl(path, metadata.metadata.firebaseStorageDownloadTokens);
    }
    return photoUrl(path, token);
  }

  function photoUrl(path, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }

  function checkGrant(snapshot, uid) {
    const grant = snapshot.data();
    if (grant?.uid !== uid || grant.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'The photo upload session has expired.');
    }
    return grant;
  }

  async function uploadListingPhoto(request) {
    const uid = verifiedUid(request);
    const { listingId, slot, mimeType, base64 } = request.data ?? {};
    if (typeof listingId !== 'string' || !LISTING_ID.test(listingId) ||
        !Number.isInteger(slot) || slot < 0 || slot > 5 ||
        !Object.values(MIME_TYPES).includes(mimeType) ||
        typeof base64 !== 'string' || base64.length > 4 * Math.ceil(MAX_BYTES / 3)) {
      throw new HttpsError('invalid-argument', 'Invalid photo.');
    }
    const ref = grants.doc(listingId);
    const now = Date.now();
    const reservation = await db.runTransaction(async transaction => {
      const [snapshot, limit] = await transaction.getAll(ref, quota(db, uid, 'photo'));
      const grant = checkGrant(snapshot, uid);
      if (slot >= grant.count) throw new HttpsError('invalid-argument', 'Invalid photo position.');
      if (grant.photos?.[slot]) return { done: true, images: grant.images ?? null };
      if (grant.used) throw new HttpsError('failed-precondition', 'Upload already completed.');
      return { signal: consumeQuota(transaction, limit, now, 'photo', 48, 140) };
    });
    if (reservation.done) return { images: reservation.images };
    if (reservation.signal) logger.warn('Marketplace rate threshold reached', { action: reservation.signal });

    const clean = await sanitizePhoto(Buffer.from(base64, 'base64'), mimeType);
    const url = await storePhoto(uid, listingId, slot, clean);
    return db.runTransaction(async transaction => {
      const grant = checkGrant(await transaction.get(ref), uid);
      if (grant.photos?.[slot]) return { images: grant.images ?? null };
      const photos = { ...grant.photos, [slot]: url };
      const images = Object.keys(photos).length === grant.count
        ? Array.from({ length: grant.count }, (_, index) => photos[index])
        : null;
      transaction.update(ref, images ? { photos, images } : { photos });
      return { images };
    });
  }

  async function submitListingReport(request) {
    const uid = verifiedUid(request);
    const { listingId, reason } = request.data ?? {};
    if (typeof listingId !== 'string' || !LISTING_ID.test(listingId) || !REPORT_REASONS.has(reason)) {
      throw new HttpsError('invalid-argument', 'Invalid listing report.');
    }
    const report = db.collection('reports').doc(`${uid}_${listingId}`);
    const now = Date.now();
    const signal = await db.runTransaction(async transaction => {
      const [existing, listing, limit] = await transaction.getAll(report, listings.doc(listingId), quota(db, uid, 'report'));
      if (existing.exists) return null;
      if (listing.get('status') !== 'active') throw new HttpsError('not-found', 'Listing unavailable.');
      const result = consumeQuota(transaction, limit, now, 'report', 8, 25);
      transaction.create(report, { listingId, reporterUid: uid, reason, createdAt: FieldValue.serverTimestamp() });
      return result;
    });
    if (signal) logger.warn('Marketplace rate threshold reached', { action: signal });
    return { reported: true };
  }

  async function deleteGeneration(file) {
    if (!file.metadata.generation) throw new Error('Storage object generation unavailable.');
    try {
      await file.delete({ ifGenerationMatch: file.metadata.generation, ignoreNotFound: true });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
    }
  }

  async function deleteObjects(prefix, cutoff = Infinity) {
    const [files] = await bucket.getFiles({ prefix });
    await Promise.all(files.filter(file => Date.parse(file.metadata.timeCreated) <= cutoff).map(deleteGeneration));
  }

  async function sweepLegacyPhotos() {
    const config = await db.doc('marketplaceSecurity/enforcement').get();
    if (config.get('requirePipeline') !== true || config.get('legacyCleanupEnabled') !== true) return;
    const state = db.doc('marketplaceMaintenance/legacyPhotoSweep');
    const snapshot = await state.get();
    if (snapshot.get('completed') === true) return;
    const [files, next] = await bucket.getFiles({
      prefix: 'listings/', autoPaginate: false, maxResults: 100, pageToken: snapshot.get('pageToken'),
    });
    const cutoff = Date.now() - 7 * 24 * HOUR;
    const candidates = files.flatMap(file => {
      const id = LEGACY_OBJECT.exec(file.name)?.[1];
      return id && Date.parse(file.metadata.updated) < cutoff ? [{ file, id }] : [];
    });
    const ids = [...new Set(candidates.map(({ id }) => id))];
    if (ids.length) {
      const snapshots = await db.getAll(...ids.map(id => listings.doc(id)));
      const missing = new Set(snapshots.filter(item => !item.exists).map(item => item.id));
      await Promise.all(candidates.filter(({ id }) => missing.has(id)).map(({ file }) => deleteGeneration(file)));
    }
    await state.set(next?.pageToken ? { pageToken: next.pageToken } : { completed: true });
  }

  async function cleanupUploads() {
    const expired = await grants.where('cleanupAt', '<=', Timestamp.now()).orderBy('cleanupAt').limit(100).get();
    for (const snapshot of expired.docs) {
      try {
        const { uid } = snapshot.data();
        const listing = await listings.doc(snapshot.id).get();
        if (!listing.exists || listing.get('uid') !== uid) {
          await deleteObjects(`listings/${uid}/${snapshot.id}/`);
        }
        if (snapshot.get('used')) {
          // Keep the consumed ID reserved across deletion and mixed client versions.
          await snapshot.ref.update({ cleanupAt: FieldValue.delete(), images: FieldValue.delete(), photos: FieldValue.delete() });
        } else {
          await snapshot.ref.delete();
        }
      } catch {
        logger.error('Marketplace upload cleanup failed', { listingId: snapshot.id });
        await snapshot.ref.update({ cleanupAt: Timestamp.fromMillis(Date.now() + CLEANUP_DELAY) }).catch(() => {});
      }
    }
    await sweepLegacyPhotos();
  }

  async function cleanupDeletedListing(event) {
    const uid = event.data?.get('uid');
    const id = event.params.listingId;
    if (typeof uid !== 'string' || !LISTING_ID.test(id)) return;
    if ((await listings.doc(id).get()).exists) return;
    await deleteObjects(`listings/${uid}/${id}/`, Date.parse(event.time));
  }

  return { reserveListingUpload, uploadListingPhoto, submitListingReport, cleanupUploads, cleanupDeletedListing };
}

module.exports = { marketHandlers, sanitizePhoto };
