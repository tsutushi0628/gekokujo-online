import { createRateLimiter } from '../middleware/rateLimiter';

function createMockReq(ip: string = '127.0.0.1'): any {
  return { ip };
}

function createMockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('rateLimiter', () => {
  it('上限以下のリクエストを通過させる', () => {
    const limiter = createRateLimiter(3);
    const req = createMockReq();
    const res = createMockRes();
    const next = jest.fn();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('上限を超えるリクエストを429で拒否する', () => {
    const limiter = createRateLimiter(2);
    const req = createMockReq();
    const res = createMockRes();
    const next = jest.fn();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next); // 3回目は拒否

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('異なるIPは独立してカウントされる', () => {
    const limiter = createRateLimiter(1);
    const req1 = createMockReq('192.168.1.1');
    const req2 = createMockReq('192.168.1.2');
    const res = createMockRes();
    const next = jest.fn();

    limiter(req1, res, next);
    limiter(req2, res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
