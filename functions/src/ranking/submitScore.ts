/**
 * submitScore — スコア送信
 *
 * セッショントークンを検証し、スコアの妥当性をチェックした上で
 * ランキングに登録する。
 *
 * 不正防止:
 * 1. セッショントークンの存在・未使用・有効期限を検証
 * 2. スコアの理論最大値チェック（scoreValidator）
 * 3. ニックネームのサニタイズ
 */

import { Request, Response } from 'express';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { validateScore, validateNickname } from '../validation/scoreValidator';
import {
  VALID_CHARACTERS,
  SESSION_EXPIRY_SECONDS,
  CharacterType,
} from '../types/gekokujo';

const RANKING_COLLECTION = 'gekokujoRanking';
const SESSIONS_COLLECTION = 'gekokujoSessions';

/**
 * submitScoreハンドラーを生成する（DI対応）
 *
 * @param db Firestoreインスタンス
 */
export function createSubmitScoreHandler(db: Firestore) {
  return async function submitScoreHandler(req: Request, res: Response): Promise<void> {
    const { nickname, score, character, sessionToken } = req.body;

    // --- 入力バリデーション ---

    if (nickname === undefined || score === undefined || character === undefined || sessionToken === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '必須項目が不足しています' },
      });
      return;
    }

    // ニックネーム検証
    const nicknameResult = validateNickname(String(nickname));
    if (!nicknameResult.isValid) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_NICKNAME', message: 'ニックネームが不正です' },
      });
      return;
    }

    // キャラクター検証
    if (!VALID_CHARACTERS.includes(character as CharacterType)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_CHARACTER', message: 'キャラクターが不正です' },
      });
      return;
    }

    // スコア検証
    const scoreNum = Number(score);
    const scoreResult = validateScore(scoreNum);
    if (!scoreResult.isValid) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SCORE', message: 'スコアが不正です' },
      });
      return;
    }

    // --- セッショントークン検証 ---

    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(String(sessionToken));
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      res.status(403).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'セッションが無効です' },
      });
      return;
    }

    const sessionData = sessionDoc.data()!;

    // 使用済みチェック
    if (sessionData.used) {
      res.status(403).json({
        success: false,
        error: { code: 'SESSION_USED', message: 'セッションが無効です' },
      });
      return;
    }

    // 有効期限チェック
    const startTime = sessionData.startTime.toDate();
    const elapsed = (Date.now() - startTime.getTime()) / 1000;
    if (elapsed > SESSION_EXPIRY_SECONDS) {
      res.status(403).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'セッションが無効です' },
      });
      return;
    }

    // --- ランキング登録 ---

    // セッションを使用済みにする
    await sessionRef.update({ used: true });

    // ランキングエントリ作成
    const rankingEntry = {
      nickname: nicknameResult.sanitized,
      score: scoreNum,
      character: character as CharacterType,
      timestamp: Timestamp.now(),
    };

    const docRef = await db.collection(RANKING_COLLECTION).add(rankingEntry);

    res.json({
      success: true,
      data: {
        id: docRef.id,
        nickname: nicknameResult.sanitized,
        score: scoreNum,
        character,
      },
    });
  };
}
