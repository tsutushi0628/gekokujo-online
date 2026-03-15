/**
 * レートリミットミドルウェア
 *
 * 同一IPからのリクエストを指定間隔で制限する。
 * メモリ内Mapで簡易管理（Cloud Functionsインスタンス単位）。
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * レートリミッターを生成する
 *
 * @param intervalSec - リクエスト間隔（秒）
 * @returns Express ミドルウェア
 */
export function createRateLimiter(
  intervalSec: number
): (req: Request, res: Response, next: NextFunction) => void {
  const lastRequestMap = new Map<string, number>();
  const intervalMs = intervalSec * 1000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip as string;
    const now = Date.now();
    const lastRequest = lastRequestMap.get(ip);

    if (lastRequest !== undefined && now - lastRequest < intervalMs) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'リクエストが多すぎます。しばらく待ってから再試行してください',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    lastRequestMap.set(ip, now);
    next();
  };
}
