/**
 * gekokujo-online - Firebase Functions エントリポイント
 *
 * firebase-kit標準: Express appパターン
 */

import * as admin from 'firebase-admin';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import firebaseKit, { cors } from 'firebase-kit/backend';
import { withExpressValidation } from 'firebase-kit/backend';
import { projectConfig } from './config/projectConfig';
import {
  createSessionHandler,
  submitScoreHandler,
  getThresholdsHandler,
} from './handlers/scoreboardHandlers';
import { createRateLimiter } from './middleware/rateLimiter';
import {
  createSessionSchema,
  submitScoreSchema,
} from './types/scoreboard';
import { regenerateSnapshot } from './services/scoreboardService';

// Firebase Admin初期化
admin.initializeApp();

// firebase-kit初期化
firebaseKit.initialize({
  projectId: projectConfig.projectId,
  databaseName: projectConfig.databaseName,
  logger,
});

// ========================================
// Express アプリケーション
// ========================================
const app = express();
app.use(cors({ allowedOrigins: ['https://gekokujo-online.web.app'] }));
app.use(express.json({ limit: '16kb' }));

// レートリミッター（スコア送信用: 10秒間隔）
const scoreRateLimiter = createRateLimiter(10);

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    project: projectConfig.projectId,
    timestamp: new Date().toISOString(),
  });
});

// ========================================
// Scoreboard API エンドポイント
// ========================================

// セッション作成
app.post(
  '/api/scoreboard/sessions',
  withExpressValidation(createSessionSchema) as unknown as express.RequestHandler,
  createSessionHandler as unknown as express.RequestHandler
);

// スコア送信
app.post(
  '/api/scoreboard/scores',
  scoreRateLimiter as unknown as express.RequestHandler,
  withExpressValidation(submitScoreSchema) as unknown as express.RequestHandler,
  submitScoreHandler as unknown as express.RequestHandler
);

// 閾値取得
app.get(
  '/api/scoreboard/thresholds',
  getThresholdsHandler as unknown as express.RequestHandler
);

// ========================================
// API エクスポート（maxInstances必須 — CLAUDE.md 6j）
// ========================================
export const api = onRequest(
  {
    region: projectConfig.region,
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 10,
  },
  app
);

// ========================================
// Scheduled Function: スナップショット生成 + cleanup
// ========================================
export const generateRankSnapshot = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Tokyo',
    region: projectConfig.region,
    timeoutSeconds: 120,
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    await regenerateSnapshot();
  }
);
