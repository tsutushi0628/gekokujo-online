import type { Request, Response } from 'express';
import {
  createSessionHandler,
  submitScoreHandler,
  getThresholdsHandler,
} from '../scoreboardHandlers';

// Service層をモック
jest.mock('../../services/scoreboardService');
const mockService = require('../../services/scoreboardService') as {
  createSession: jest.Mock;
  saveScore: jest.Mock;
  calculateApproxRank: jest.Mock;
  getThresholdSnapshot: jest.Mock;
};

// firebase-kit をモック
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
jest.mock('firebase-kit/backend', () => ({
  getLogger: () => mockLogger,
}));

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    ip: '127.0.0.1',
    ...overrides,
  } as Request;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 200,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  } as unknown as Response & { _status: number; _json: unknown };
  return res;
}

describe('scoreboardHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSessionHandler', () => {
    it('POST /sessions → 201 + sessionId', async () => {
      mockService.createSession.mockResolvedValue({ sessionId: 'session-abc' });
      const req = createMockReq({
        body: { userAgent: 'test', platform: 'test' },
        ip: '192.168.1.1',
      });
      const res = createMockRes();

      await createSessionHandler(req, res);

      expect(res._status).toBe(201);
      const body = res._json as { success: boolean; data: { sessionId: string } };
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBe('session-abc');
    });

    it('Service層にIPアドレスを渡す', async () => {
      mockService.createSession.mockResolvedValue({ sessionId: 'session-abc' });
      const req = createMockReq({ body: {}, ip: '10.0.0.1' });
      const res = createMockRes();

      await createSessionHandler(req, res);

      expect(mockService.createSession).toHaveBeenCalledWith(
        expect.anything(),
        '10.0.0.1'
      );
    });

    it('サーバーエラー → 500 + ジェネリックメッセージ', async () => {
      mockService.createSession.mockRejectedValue(new Error('DB connection failed'));
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await createSessionHandler(req, res);

      expect(res._status).toBe(500);
      const body = res._json as { success: boolean; error: { code: string; message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).not.toContain('DB connection failed');
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('エラー時にlogger.errorが呼ばれる', async () => {
      mockService.createSession.mockRejectedValue(new Error('some error'));
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await createSessionHandler(req, res);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('submitScoreHandler', () => {
    it('POST /scores → 201 + rank', async () => {
      mockService.saveScore.mockResolvedValue({ scoreId: 'score-xyz' });
      mockService.calculateApproxRank.mockResolvedValue({
        rank: 42,
        isApprox: true,
        totalPlayers: 1000,
      });
      const req = createMockReq({
        body: {
          sessionId: 'session-abc',
          score: 5000,
          playDurationSec: 120,
          playLog: {},
        },
      });
      const res = createMockRes();

      await submitScoreHandler(req, res);

      expect(res._status).toBe(201);
      const body = res._json as { success: boolean; data: { scoreId: string; rank: number; isApprox: boolean; totalPlayers: number } };
      expect(body.success).toBe(true);
      expect(body.data.scoreId).toBe('score-xyz');
      expect(body.data.rank).toBe(42);
      expect(body.data.isApprox).toBe(true);
      expect(body.data.totalPlayers).toBe(1000);
    });

    it('スコア妥当性エラー → 400', async () => {
      mockService.saveScore.mockRejectedValue(new Error('スコアが不正です'));
      const req = createMockReq({
        body: { sessionId: 'x', score: 999999, playDurationSec: 1, playLog: {} },
      });
      const res = createMockRes();

      await submitScoreHandler(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_INPUT');
    });

    it('サーバーエラー → 500 + ジェネリックメッセージ（err.message返却禁止）', async () => {
      mockService.saveScore.mockRejectedValue(new Error('Firestore error details'));
      const req = createMockReq({
        body: { sessionId: 'x', score: 100, playDurationSec: 60, playLog: {} },
      });
      const res = createMockRes();

      await submitScoreHandler(req, res);

      expect(res._status).toBe(500);
      const body = res._json as { success: boolean; error: { message: string } };
      expect(body.error.message).not.toContain('Firestore error details');
    });
  });

  describe('getThresholdsHandler', () => {
    it('GET /thresholds → 200 + thresholds', async () => {
      mockService.getThresholdSnapshot.mockResolvedValue({
        thresholds: [{ rank: 1, score: 50000 }],
        totalPlayers: 1000,
        generatedAt: '2026-03-15T09:55:00.000Z',
      });
      const req = createMockReq();
      const res = createMockRes();

      await getThresholdsHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; data: { thresholds: unknown[]; totalPlayers: number } };
      expect(body.success).toBe(true);
      expect(body.data.thresholds).toEqual([{ rank: 1, score: 50000 }]);
      expect(body.data.totalPlayers).toBe(1000);
    });

    it('スナップショット未生成時 → 200 + 空データ', async () => {
      mockService.getThresholdSnapshot.mockResolvedValue({
        thresholds: [],
        totalPlayers: 0,
        generatedAt: null,
      });
      const req = createMockReq();
      const res = createMockRes();

      await getThresholdsHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; data: { thresholds: unknown[]; totalPlayers: number } };
      expect(body.data.thresholds).toEqual([]);
      expect(body.data.totalPlayers).toBe(0);
    });

    it('サーバーエラー → 500 + ジェネリックメッセージ', async () => {
      mockService.getThresholdSnapshot.mockRejectedValue(new Error('Internal error'));
      const req = createMockReq();
      const res = createMockRes();

      await getThresholdsHandler(req, res);

      expect(res._status).toBe(500);
      const body = res._json as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
