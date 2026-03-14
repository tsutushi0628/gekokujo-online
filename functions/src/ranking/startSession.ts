/**
 * startSession — ゲーム開始時のセッショントークン発行
 *
 * ゲーム開始時にクライアントがこのエンドポイントを呼び、
 * 返されたトークンをスコア送信時に添付する。
 * これにより、ゲームを実際にプレイせずにスコアを直接送信する不正を防ぐ。
 */

import { Request, Response } from 'express';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_NAME = 'gekokujoSessions';

/**
 * startSessionハンドラーを生成する（DI対応）
 *
 * @param db Firestoreインスタンス
 */
export function createStartSessionHandler(db: Firestore) {
  return async function startSessionHandler(_req: Request, res: Response): Promise<void> {
    const token = uuidv4();

    const sessionData = {
      token,
      startTime: Timestamp.now(),
      used: false,
    };

    await db.collection(COLLECTION_NAME).doc(token).set(sessionData);

    res.json({
      success: true,
      data: {
        sessionToken: token,
      },
    });
  };
}
