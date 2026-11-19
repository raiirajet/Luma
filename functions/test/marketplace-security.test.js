const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const sharp = require('sharp');
const { marketHandlers, sanitizePhoto } = require('../marketplace-security');

const input = sharp({
  create: { width: 1800, height: 900, channels: 3, background: '#44aa77' },
}).withMetadata({ orientation: 1 }).png().toBuffer();

test('photo sanitizer verifies format, strips metadata and resizes', async () => {
  const original = await input;
  assert.ok((await sharp(original).metadata()).exif);
  const result = await sanitizePhoto(original, 'image/png');
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(sanitizePhoto(original, 'image/jpeg'), { code: 'invalid-argument' });
  await assert.rejects(sanitizePhoto(Buffer.from('plain text'), 'image/png'), { code: 'invalid-argument' });
});

const projectId = 'demo-limba-marketplace-security';
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = hasEmulator ? initializeApp({ projectId }, projectId) : null;
after(async () => { if (app) await deleteApp(app); });

test('server reservations, photos and report quotas are scoped and retry-safe', { skip: !hasEmulator }, async () => {
  const db = getFirestore(app);
  const files = new Map();
  const bucket = {
    name: 'limba-auto.firebasestorage.app',
    async getFiles({ prefix }) {
      return [[...files.keys()].filter(name => name.startsWith(prefix)).map(name => this.file(name))];
    },
    file(name) {
      return {
        name,
        get metadata() { return files.get(name); },
        async save(bytes, options) {
          if (files.has(name)) throw Object.assign(new Error('Already exists'), { code: 412 });
          files.set(name, {
            bytes, ...options.metadata, generation: '1', timeCreated: new Date().toISOString(),
          });
        },
        async delete({ ifGenerationMatch }) {
          assert.equal(ifGenerationMatch, this.metadata.generation);
          files.delete(name);
        },
        async getMetadata() { return [files.get(name)]; },
      };
    },
  };
  const market = marketHandlers(db, bucket);
  const request = (uid, data, verified = true) => ({ auth: { uid, token: { email_verified: verified } }, data });
  await assert.rejects(market.reserveListingUpload(request('seller', { count: 2 }, false)), { code: 'permission-denied' });

  const { listingId } = await market.reserveListingUpload(request('seller', { count: 2 }));
  const data = { listingId, slot: 0, mimeType: 'image/png', base64: (await input).toString('base64') };
  await assert.rejects(market.uploadListingPhoto(request('other', data)), { code: 'failed-precondition' });
  assert.deepEqual(await market.uploadListingPhoto(request('seller', data)), { images: null });
  assert.deepEqual(await market.uploadListingPhoto(request('seller', data)), { images: null });
  await assert.rejects(market.uploadListingPhoto(request('seller', { ...data, slot: 2 })), { code: 'invalid-argument' });
  const { images } = await market.uploadListingPhoto(request('seller', { ...data, slot: 1 }));
  assert.equal(images.length, 2);
  assert.match(images[1], /clean-1\.jpg\?alt=media/);
  assert.equal(files.size, 2);
  assert.equal((await db.doc('marketplaceQuotas/seller/marketplaceQuotaWindows/photo').get()).get('day.count'), 2);
  for (let i = 0; i < 5; i++) await market.reserveListingUpload(request('seller', { count: 1 }));
  await assert.rejects(market.reserveListingUpload(request('seller', { count: 1 })), { code: 'resource-exhausted' });

  for (let i = 0; i < 9; i++) await db.collection('listings').doc(`test-${i}`).set({ status: 'active' });
  for (let i = 0; i < 8; i++) {
    const report = request('reporter', { listingId: `test-${i}`, reason: 'fraud' });
    await market.submitListingReport(report);
    await market.submitListingReport(report);
  }
  await assert.rejects(market.submitListingReport(request('reporter', {
    listingId: 'test-8', reason: 'other',
  })), { code: 'resource-exhausted' });
  assert.equal((await db.collection('reports').get()).size, 8);

  const used = db.collection('listingUploads').doc(listingId);
  const orphan = db.collection('listingUploads').doc('expired-draft');
  await db.collection('listings').doc(listingId).set({ uid: 'seller' });
  await used.update({ used: true, cleanupAt: Timestamp.fromMillis(0) });
  await orphan.set({ uid: 'seller', used: false, cleanupAt: Timestamp.fromMillis(0) });
  const orphanPath = 'listings/seller/expired-draft/clean-0.jpg';
  const oldOrphan = 'listings/seller/previous-upload/0.jpg';
  const oldAttached = 'listings/seller/test-0/0.jpg';
  await bucket.file(orphanPath).save(await input, {});
  for (const name of [oldOrphan, oldAttached]) {
    files.set(name, { generation: '1', updated: new Date(0).toISOString() });
  }
  await db.doc('marketplaceSecurity/enforcement').set({
    pipelineEnabled: true, requirePipeline: true, legacyCleanupEnabled: true,
  });
  await market.cleanupUploads();
  assert.equal((await used.get()).get('used'), true);
  assert.equal((await used.get()).get('cleanupAt'), undefined);
  assert.equal((await orphan.get()).exists, false);
  assert.equal(files.has(orphanPath), false);
  assert.equal(files.has(oldOrphan), false);
  assert.equal(files.has(oldAttached), true);
  assert.equal(files.size, 3);
});
