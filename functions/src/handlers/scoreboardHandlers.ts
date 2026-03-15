/**
 * Scoreboard Handlers
 *
 * HTTPリクエストの受付・レスポンス返却のみを担当するHandler層
 * ビジネスロジックはService層に委譲する
 */

import type { Request, Response } from 'express';
import { getLogger } from 'firebase-kit/backend';
import {
  createSession,
  saveScore,
  calculateApproxRank,
  getThresholdSnapshot,
} from '../services/scoreboardService';
import type { SessionData, ScoreSubmission } from '../types/scoreboard';

/**
 * POST /api/scoreboard/sessions
 * セッション作成
 */
export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const sessionData = req.body as SessionData;
    const ip = req.ip as string;

    const result = await createSession(sessionData, ip);

    res.status(201).json({
      success: true,
      data: { sessionId: result.sessionId },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const logger = getLogger();
    logger.error('セッション作成エラー', { error });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サーバーエラーが発生しました',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /api/scoreboard/scores
 * スコア送信 + 近似順位返却
 */
export async function submitScoreHandler(req: Request, res: Response): Promise<void> {
  try {
    const submission = req.body as ScoreSubmission;

    const scoreResult = await saveScore(submission);
    const rankResult = await calculateApproxRank(submission.score);

    res.status(201).json({
      success: true,
      data: {
        scoreId: scoreResult.scoreId,
        rank: rankResult.rank,
        isApprox: rankResult.isApprox,
        totalPlayers: rankResult.totalPlayers,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const logger = getLogger();
    logger.error('スコア送信エラー', { error });

    // スコア妥当性エラーは400
    if (error instanceof Error && error.message === 'スコアが不正です') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: '入力値が不正です',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サーバーエラーが発生しました',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * GET /api/scoreboard/thresholds
 * 閾値データ取得
 */
export async function getThresholdsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await getThresholdSnapshot();

    res.status(200).json({
      success: true,
      data: {
        thresholds: snapshot.thresholds,
        totalPlayers: snapshot.totalPlayers,
        generatedAt: snapshot.generatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const logger = getLogger();
    logger.error('閾値取得エラー', { error });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サーバーエラーが発生しました',
      },
      timestamp: new Date().toISOString(),
    });
  }
}
