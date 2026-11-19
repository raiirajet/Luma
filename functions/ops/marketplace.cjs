const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const PROJECT = 'limba-auto';
const ID = /^[A-Za-z0-9_-]{1,256}$/;

async function run() {
  const [command, argument, decision] = process.argv.slice(2);
  const db = getFirestore(initializeApp({ projectId: PROJECT, credential: applicationDefault() }));
  const rules = db.doc('marketplaceSecurity/enforcement');
  if (command === 'require-mode') {
    if ((await rules.get()).get('requirePipeline') !== true) {
      throw new Error('Set the marketplace to required mode before locking Storage.');
    }
    return;
  }
  if (command === 'enable-legacy-cleanup') {
    await db.runTransaction(async transaction => {
      if ((await transaction.get(rules)).get('requirePipeline') !== true) {
        throw new Error('Legacy cleanup requires the marketplace cutover.');
      }
      transaction.update(rules, { legacyCleanupEnabled: true });
    });
    return;
  }
  if (command === 'status') {
    console.log((await rules.get()).data() || {});
    return;
  }
  if (command === 'mode' && ['legacy', 'pilot', 'required'].includes(argument)) {
    await rules.set({ pipelineEnabled: argument !== 'legacy', requirePipeline: argument === 'required' }, { merge: true });
    return;
  }
  if (command === 'reports') {
    const reports = await db.collection('reports').orderBy('createdAt', 'desc').limit(50).get();
    console.table(reports.docs.map(report => ({
      id: report.id,
      listingId: report.get('listingId'),
      reason: report.get('reason'),
      state: report.get('moderation.state') || 'open',
      createdAt: report.get('createdAt')?.toDate().toISOString(),
    })));
    return;
  }
  if (command === 'review' && ID.test(argument ?? '') && ['hold', 'dismiss'].includes(decision)) {
    const report = db.collection('reports').doc(argument);
    await db.runTransaction(async transaction => {
      const entry = await transaction.get(report);
      if (!entry.exists) throw new Error('Report not found.');
      if (entry.get('moderation.state')) throw new Error('Report has already been reviewed.');
      if (decision === 'hold') {
        const listingId = entry.get('listingId');
        if (!ID.test(listingId)) throw new Error('Invalid listing ID.');
        const listing = db.collection('listings').doc(listingId);
        const item = await transaction.get(listing);
        if (!item.exists) throw new Error('Listing not found.');
        transaction.set(db.collection('listingModeration').doc(listingId), {
          state: 'hold', reportId: argument, reviewedAt: FieldValue.serverTimestamp(),
        });
        if (item.get('status') === 'active') transaction.update(listing, { status: 'paused' });
      }
      transaction.update(report, { moderation: { state: decision, reviewedAt: FieldValue.serverTimestamp() } });
    });
    return;
  }
  if (command === 'release-hold' && ID.test(argument ?? '')) {
    await db.collection('listingModeration').doc(argument).delete();
    return;
  }
  throw new Error('Usage: marketplace.cjs status | mode legacy|pilot|required | reports | review REPORT_ID hold|dismiss | release-hold LISTING_ID');
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
