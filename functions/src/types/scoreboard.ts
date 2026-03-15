/**
 * Scoreboard - 型定義
 *
 * design.md の Data Models および API Design に基づく
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type {
  ValidationSchema,
  ValidationResult,
} from 'firebase-kit/backend';

// ============================================================
// Firestore ドキュメント型
// ============================================================

/**
 * sessions コレクション
 * ゲーム起動時のブラウザ環境情報 + ゲーム終了時のプレイログ
 * cleanup対象外（playLogを永続化するため）
 */
export interface SessionDocument {
  id: string;
  // ブラウザ情報（セッション作成時にクライアントから送信）
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  touchSupport: number;
  language: string;
  languages: string[];
  cookieEnabled: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  connectionType?: string;
  connectionDownlink?: number;
  referrer?: string;
  utmSource?: string;
  timezone: string;
  // サーバー側で付与
  ip: string;
  // プレイログ（スコア送信時にupdateで追記）
  playLog?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * scores コレクション
 * 全スコア記録。上限10000件（超過分はregenerateSnapshot時に削除）
 */
export interface ScoreDocument {
  id: string;
  sessionId: string;
  score: number;
  playDurationSec: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * rankSnapshots コレクション
 * ランキング閾値のスナップショット。ドキュメントは基本的に1つ（latest）
 */
export interface RankSnapshotDocument {
  id: 'latest';
  thresholds: ThresholdEntry[];
  totalPlayers: number;
  generatedAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * 閾値エントリ
 */
export interface ThresholdEntry {
  rank: number;
  score: number;
}

// ============================================================
// API リクエスト型
// ============================================================

/**
 * POST /api/scoreboard/sessions リクエストボディ
 */
export interface SessionData {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  touchSupport: number;
  language: string;
  languages: string[];
  cookieEnabled: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  connectionType?: string;
  connectionDownlink?: number;
  referrer?: string;
  utmSource?: string;
  timezone: string;
}

/**
 * POST /api/scoreboard/scores リクエストボディ
 */
export interface ScoreSubmission {
  sessionId: string;
  score: number;
  playDurationSec: number;
  playLog: Record<string, unknown>;
}

// ============================================================
// API レスポンス型
// ============================================================

/**
 * セッション作成レスポンス
 */
export interface CreateSessionResult {
  sessionId: string;
}

/**
 * スコア保存結果（内部用）
 */
export interface SaveScoreResult {
  scoreId: string;
}

/**
 * 近似順位計算結果
 */
export interface ApproxRankResult {
  rank: number | null;
  isApprox: boolean;
  totalPlayers: number;
}

/**
 * 閾値スナップショット取得結果
 */
export interface ThresholdSnapshot {
  thresholds: ThresholdEntry[];
  totalPlayers: number;
  generatedAt: string | null;
}

// ============================================================
// バリデーションスキーマ
// ============================================================

/**
 * playLog の 5KB カスタムバリデーター
 */
function validatePlayLogSize(value: unknown): ValidationResult {
  const size = JSON.stringify(value).length;
  if (size > 5120) {
    return { valid: false, message: 'playLogは5KB以内にしてください' };
  }
  return { valid: true, message: null };
}

/**
 * POST /api/scoreboard/sessions バリデーションスキーマ
 */
export const createSessionSchema: ValidationSchema = {
  userAgent: { type: 'string', required: true, maxLength: 500 },
  platform: { type: 'string', required: true, maxLength: 100 },
  screenWidth: { type: 'number', required: true, min: 0, max: 10000 },
  screenHeight: { type: 'number', required: true, min: 0, max: 10000 },
  devicePixelRatio: { type: 'number', required: true, min: 0, max: 10 },
  touchSupport: { type: 'number', required: true, min: 0, max: 100 },
  language: { type: 'string', required: true, maxLength: 20 },
  languages: { type: 'array', required: true, maxLength: 20 },
  cookieEnabled: { type: 'boolean', required: true },
  hardwareConcurrency: { type: 'number', required: true, min: 0, max: 256 },
  deviceMemory: { type: 'number', required: false, min: 0, max: 1024 },
  viewportWidth: { type: 'number', required: true, min: 0, max: 10000 },
  viewportHeight: { type: 'number', required: true, min: 0, max: 10000 },
  colorDepth: { type: 'number', required: true, min: 0, max: 48 },
  connectionType: { type: 'string', required: false, maxLength: 20 },
  connectionDownlink: { type: 'number', required: false, min: 0, max: 1000 },
  referrer: { type: 'string', required: false, maxLength: 2000 },
  utmSource: { type: 'string', required: false, maxLength: 200 },
  timezone: { type: 'string', required: true, maxLength: 100 },
};

/**
 * POST /api/scoreboard/scores バリデーションスキーマ
 */
export const submitScoreSchema: ValidationSchema = {
  sessionId: { type: 'string', required: true, maxLength: 100 },
  score: { type: 'number', required: true, min: 0, max: 999999999 },
  playDurationSec: { type: 'number', required: true, min: 1, max: 7200 },
  playLog: {
    type: 'object',
    required: true,
    custom: validatePlayLogSize,
  },
};

// ============================================================
// 定数
// ============================================================

/** スコア妥当性チェック: 1秒あたりの最大スコア */
export const MAX_SCORE_PER_SECOND = 1000;

/** スコア妥当性チェック: 高スコアとみなす最低プレイ時間（秒） */
export const MIN_PLAY_DURATION_FOR_HIGH_SCORE = 5;

/** スコアコレクション上限 */
export const MAX_SCORES_COUNT = 10000;

/** Firestoreバッチ削除の上限 */
export const FIRESTORE_BATCH_LIMIT = 500;
