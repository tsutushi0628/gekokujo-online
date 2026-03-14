/**
 * スコア検証ロジック
 *
 * 90秒間で物理的に到達可能な最大石高を計算し、
 * 不正スコアを検出する。
 *
 * 計算根拠（game-design.md セクション5-5）:
 *   最終石高 = (敵撃破石高 + 威圧降伏石高 + イベントボーナス) x 民衆係数 x 身分ボーナス
 */

import {
  ScoreValidationResult,
  NicknameValidationResult,
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
} from '../types/gekokujo';

// ====================================
// 理論最大値の構成要素
// ====================================

/** 90秒間に倒せる敵の理論最大数（野武士・奇襲連打で最速の場合） */
const MAX_ENEMIES_PER_GAME = 60;

/** 最強敵（武将）1体あたりの石高 */
const MAX_KOKUDAKA_PER_ENEMY = 500;

/** 威圧降伏で得られる最大石高（行列30人で全野盗・足軽を降伏させた場合） */
const MAX_INTIMIDATION_KOKUDAKA = 3000;

/** 下克上成功ボーナス */
const GEKOKUJO_BONUS = 5000;

/** 一揆成功ボーナス（農民限定） */
const IKKI_BONUS = 3000;

/** 民衆係数の理論最大値（野武士の+2% x 30人 = 1.6） */
const MAX_CROWD_MULTIPLIER = 1.6;

/** 身分ボーナスの理論最大値（天下人 = 3.0） */
const MAX_RANK_MULTIPLIER = 3.0;

/** 安全マージン（理論値の1.5倍まで許容） */
const SAFETY_MARGIN = 1.5;

/**
 * 理論上の最大スコアを計算する
 *
 * 90秒間で物理的に到達可能な最大石高に安全マージンを掛けた値を返す。
 * この値を超えるスコアは不正と判定する。
 */
export function calculateMaxPossibleScore(): number {
  const maxEnemyKokudaka = MAX_ENEMIES_PER_GAME * MAX_KOKUDAKA_PER_ENEMY;
  const maxRawScore = maxEnemyKokudaka + MAX_INTIMIDATION_KOKUDAKA + GEKOKUJO_BONUS + IKKI_BONUS;
  const maxFinalScore = maxRawScore * MAX_CROWD_MULTIPLIER * MAX_RANK_MULTIPLIER;

  return Math.floor(maxFinalScore * SAFETY_MARGIN);
}

/**
 * スコアの妥当性を検証する
 *
 * @param score - 検証対象のスコア（石高）
 * @returns 検証結果
 */
export function validateScore(score: number): ScoreValidationResult {
  if (!Number.isFinite(score)) {
    return { isValid: false, reason: 'スコアが数値ではない' };
  }

  if (score < 0) {
    return { isValid: false, reason: 'スコアが負の値' };
  }

  if (!Number.isInteger(score)) {
    return { isValid: false, reason: 'スコアは整数である必要がある' };
  }

  const maxScore = calculateMaxPossibleScore();
  if (score > maxScore) {
    return { isValid: false, reason: `スコアが上限(${maxScore})を超えている` };
  }

  return { isValid: true, reason: '' };
}

/**
 * ニックネームのバリデーションとサニタイズ
 *
 * @param nickname - 検証対象のニックネーム
 * @returns バリデーション結果とサニタイズ済みニックネーム
 */
export function validateNickname(nickname: string): NicknameValidationResult {
  // HTMLタグ除去（セキュリティ: innerHTML禁止ルールに準拠）
  const stripped = nickname.replace(/<[^>]*>/g, '');

  // トリム
  const trimmed = stripped.trim();

  if (trimmed.length < NICKNAME_MIN_LENGTH) {
    return {
      isValid: false,
      sanitized: trimmed,
      reason: `ニックネームは${NICKNAME_MIN_LENGTH}文字以上必要`,
    };
  }

  if (trimmed.length > NICKNAME_MAX_LENGTH) {
    return {
      isValid: false,
      sanitized: trimmed,
      reason: `ニックネームは${NICKNAME_MAX_LENGTH}文字以内`,
    };
  }

  return { isValid: true, sanitized: trimmed, reason: '' };
}
