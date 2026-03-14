/**
 * 下克上オンライン — Firebase Functions エントリポイント
 *
 * firebase-kit標準: Express appパターン
 * HTTPエンドポイント設計ガイド準拠
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import { cors } from 'firebase-kit/backend';
import { createStartSessionHandler } from './ranking/startSession';
import { createSubmitScoreHandler } from './ranking/submitScore';
import { createGetRankingHandler } from './ranking/getRanking';
import { createRateLimiter } from './middleware/rateLimiter';

// Firebase Admin初期化
admin.initializeApp();

// Firestore取得
const db = admin.firestore();

// ========================================
// Express アプリケーション
// ========================================
const app = express();
app.use(cors());
app.use(express.json());

// レートリミッター
const rateLimiter = createRateLimiter();

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'gekokujo-online',
    timestamp: new Date().toISOString(),
  });
});

// ========================================
// ランキングAPI
// ========================================

// セッション発行: POST /api/sessions
app.post('/api/sessions', rateLimiter, createStartSessionHandler(db));

// スコア送信: POST /api/scores
app.post('/api/scores', rateLimiter, createSubmitScoreHandler(db));

// ランキング取得: GET /api/ranking
app.get('/api/ranking', createGetRankingHandler(db));

// ========================================
// API エクスポート
// ========================================
export const api = onRequest(
  {
    region: 'asia-northeast1',
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 10,
  },
  app
);
