/**
 * 下克上オンライン — 型定義
 */

import { Timestamp } from 'firebase-admin/firestore';

/** プレイヤーキャラクター種別 */
export type CharacterType = 'farmer' | 'ashigaru' | 'nobushi';

/** ランキングエントリ（Firestore保存用） */
export interface RankingEntry {
  nickname: string;
  score: number;
  character: CharacterType;
  timestamp: Timestamp;
}

/** ランキングエントリ（レスポンス用） */
export interface RankingEntryResponse {
  id: string;
  nickname: string;
  score: number;
  character: CharacterType;
  rank: number;
  timestamp: string;
}

/** セッションデータ（Firestore保存用） */
export interface SessionData {
  token: string;
  startTime: Timestamp;
  used: boolean;
}

/** スコア送信リクエスト */
export interface SubmitScoreRequest {
  nickname: string;
  score: number;
  character: CharacterType;
  sessionToken: string;
}

/** ランキング取得レスポンス */
export interface GetRankingResponse {
  top: RankingEntryResponse[];
  playerRank: RankingEntryResponse | null;
  totalPlayers: number;
}

/** スコア検証結果 */
export interface ScoreValidationResult {
  isValid: boolean;
  reason: string;
}

/** ニックネームバリデーション結果 */
export interface NicknameValidationResult {
  isValid: boolean;
  sanitized: string;
  reason: string;
}

/** 有効なキャラクター一覧 */
export const VALID_CHARACTERS: CharacterType[] = ['farmer', 'ashigaru', 'nobushi'];

/** ニックネーム制約 */
export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 8;

/** ゲーム時間（秒） */
export const GAME_DURATION_SECONDS = 90;

/** ランキング表示件数 */
export const RANKING_TOP_LIMIT = 100;

/** レートリミット（1分あたりのリクエスト上限） */
export const RATE_LIMIT_PER_MINUTE = 10;

/** セッション有効時間（秒）: ゲーム90秒 + バッファ30秒 */
export const SESSION_EXPIRY_SECONDS = 120;
