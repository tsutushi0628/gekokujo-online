/**
 * seed-scores.js - Firestoreにテストスコアデータを投入するseedスクリプト
 *
 * 使い方:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json node scripts/seed-scores.js
 */

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'gekokujo-online' });

const db = admin.firestore();

const COLLECTION = 'scores';
const TOTAL_COUNT = 1000;
const BATCH_SIZE = 500;

function padNumber(num, length) {
  return String(num).padStart(length, '0');
}

function randomScore() {
  return Math.floor(Math.random() * (30000 - 2000 + 1)) + 2000;
}

async function seed() {
  const now = admin.firestore.Timestamp.now();

  // バッチ1: 1〜500
  const batch1 = db.batch();
  for (let i = 1; i <= BATCH_SIZE; i++) {
    const docId = `test-score-${padNumber(i, 4)}`;
    const ref = db.collection(COLLECTION).doc(docId);
    batch1.set(ref, {
      id: docId,
      sessionId: 'test-session',
      score: randomScore(),
      playDurationSec: 60,
      createdAt: now,
      updatedAt: now,
    });
  }

  // バッチ2: 501〜1000
  const batch2 = db.batch();
  for (let i = BATCH_SIZE + 1; i <= TOTAL_COUNT; i++) {
    const docId = `test-score-${padNumber(i, 4)}`;
    const ref = db.collection(COLLECTION).doc(docId);
    batch2.set(ref, {
      id: docId,
      sessionId: 'test-session',
      score: randomScore(),
      playDurationSec: 60,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log('バッチ1（1〜500）を書き込み中...');
  await batch1.commit();
  console.log('バッチ1 完了');

  console.log('バッチ2（501〜1000）を書き込み中...');
  await batch2.commit();
  console.log('バッチ2 完了');

  console.log(`scores コレクションに ${TOTAL_COUNT} 件のテストデータを投入完了`);
}

seed().catch((err) => {
  console.error('seed失敗:', err);
  process.exit(1);
});
