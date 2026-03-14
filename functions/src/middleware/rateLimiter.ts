/**
 * レートリミッター ミドルウェア
 *
 * インメモリのスライディングウィンドウ方式。
 * Cloud Functions はインスタンスが複数立つため完全なレート制御ではないが、
 * 単一インスタンスレベルでの乱用防止として機能する。
 *
 * maxInstances: 10 の設定と合わせて、
 * 最悪ケースでも 10 req/min/IP × 10 instances = 100 req/min/IP に抑制される。
 */

import { Request, Response, NextFunction } from 'express';
import { RATE_LIMIT_PER_MINUTE } from '../types/gekokujo';

interface RateLimitEntry {
  timestamps: number[];
}

/**
 * レートリミッターを生成する
 *
 * @param maxRequests 1分あたりの最大リクエスト数（デフォルト: RATE_LIMIT_PER_MINUTE）
 */
export function createRateLimiter(maxRequests: number = RATE_LIMIT_PER_MINUTE) {
  const requestMap = new Map<string, RateLimitEntry>();

  // 古いエントリの定期クリーンアップ（メモリリーク防止）
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分ごと
  let lastCleanup = Date.now();

  function cleanup(): void {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) {
      return;
    }
    lastCleanup = now;

    const oneMinuteAgo = now - 60 * 1000;
    for (const [key, entry] of requestMap.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > oneMinuteAgo);
      if (entry.timestamps.length === 0) {
        requestMap.delete(key);
      }
    }
  }

  return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
    cleanup();

    const clientIp = req.ip ?? 'unknown';
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const entry = requestMap.get(clientIp);

    if (!entry) {
      requestMap.set(clientIp, { timestamps: [now] });
      next();
      return;
    }

    // 1分以内のリクエストのみ残す
    entry.timestamps = entry.timestamps.filter((t) => t > oneMinuteAgo);

    if (entry.timestamps.length >= maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'リクエスト数が上限を超えました。しばらく待ってから再度お試しください',
        },
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}
