import { createRateLimiter } from '../rateLimiter';
import type { Request, Response, NextFunction } from 'express';

describe('rateLimiter', () => {
  let middleware: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(() => {
    middleware = createRateLimiter(10); // 10秒間隔
  });

  function createMockReq(ip: string): Request {
    return { ip } as Request;
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

  it('初回リクエストは通過する', () => {
    const req = createMockReq('192.168.1.1');
    const res = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('同一IPからの連続リクエストは拒否される', () => {
    const req = createMockReq('192.168.1.1');
    const res = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);
    middleware(req, createMockRes(), next);

    // nextは1回目のみ呼ばれる
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('拒否時は429を返す', () => {
    const req = createMockReq('10.0.0.1');
    const res1 = createMockRes();
    const res2 = createMockRes();
    const next = jest.fn();

    middleware(req, res1, next);
    middleware(req, res2, next);

    expect(res2._status).toBe(429);
    const body = res2._json as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('異なるIPからのリクエストは個別に管理される', () => {
    const next = jest.fn();

    middleware(createMockReq('10.0.0.1'), createMockRes(), next);
    middleware(createMockReq('10.0.0.2'), createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('間隔経過後は再びリクエストが通過する', () => {
    jest.useFakeTimers();
    const req = createMockReq('10.0.0.1');
    const next = jest.fn();

    middleware(req, createMockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);

    // 10秒経過
    jest.advanceTimersByTime(10001);

    middleware(req, createMockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
