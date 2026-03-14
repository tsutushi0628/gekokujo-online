/**
 * ランキングAPI ハンドラーのユニットテスト
 *
 * Firestore操作をモックして、ハンドラーのロジックを検証する。
 */

import { createStartSessionHandler } from '../ranking/startSession';
import { createSubmitScoreHandler } from '../ranking/submitScore';
import { createGetRankingHandler } from '../ranking/getRanking';

// ====================================
// モック
// ====================================

function createMockRequest(overrides: Record<string, unknown> = {}): any {
  return {
    body: {},
    query: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

function createMockResponse(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Firestoreモック
function createMockDb() {
  const mockDoc = {
    exists: false,
    data: () => null,
    id: 'mock-id',
  };

  const mockDocRef = {
    get: jest.fn().mockResolvedValue(mockDoc),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockDocRef),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
    add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
  };

  const db = {
    collection: jest.fn().mockReturnValue(mockCollection),
    runTransaction: jest.fn(),
  };

  return { db, mockCollection, mockDocRef, mockDoc };
}

// ====================================
// startSession テスト
// ====================================

describe('startSession', () => {
  it('セッショントークンを発行する', async () => {
    const { db, mockCollection } = createMockDb();
    const handler = createStartSessionHandler(db as any);
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          sessionToken: expect.any(String),
        }),
      })
    );

    // Firestoreにセッション保存されたことを確認
    expect(mockCollection.doc).toHaveBeenCalled();
  });

  it('発行されたトークンがUUID形式である', async () => {
    const { db } = createMockDb();
    const handler = createStartSessionHandler(db as any);
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    const responseData = res.json.mock.calls[0][0];
    const token = responseData.data.sessionToken;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(token).toMatch(uuidRegex);
  });
});

// ====================================
// submitScore テスト
// ====================================

describe('submitScore', () => {
  it('有効なスコアを受け付ける', async () => {
    const { db, mockDocRef } = createMockDb();

    // セッションが存在し、未使用
    const mockTimestamp = { toDate: () => new Date() };
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'valid-token',
        startTime: mockTimestamp,
        used: false,
      }),
    });

    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        score: 500,
        character: 'ashigaru',
        sessionToken: 'valid-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('ニックネームが短すぎると拒否する', async () => {
    const { db } = createMockDb();
    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'ab',
        score: 500,
        character: 'ashigaru',
        sessionToken: 'valid-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('不正なキャラクター名を拒否する', async () => {
    const { db } = createMockDb();
    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト',
        score: 500,
        character: 'ninja',
        sessionToken: 'valid-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('スコアが上限を超えると拒否する', async () => {
    const { db } = createMockDb();
    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        score: 99999999,
        character: 'ashigaru',
        sessionToken: 'valid-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('使用済みセッショントークンを拒否する', async () => {
    const { db, mockDocRef } = createMockDb();

    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'used-token',
        startTime: { toDate: () => new Date() },
        used: true,
      }),
    });

    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        score: 500,
        character: 'ashigaru',
        sessionToken: 'used-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('存在しないセッショントークンを拒否する', async () => {
    const { db, mockDocRef } = createMockDb();

    mockDocRef.get.mockResolvedValue({
      exists: false,
      data: () => null,
    });

    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        score: 500,
        character: 'ashigaru',
        sessionToken: 'nonexistent-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('期限切れセッションを拒否する', async () => {
    const { db, mockDocRef } = createMockDb();

    // 5分前に開始したセッション（SESSION_EXPIRY_SECONDS = 120秒を超過）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'expired-token',
        startTime: { toDate: () => fiveMinutesAgo },
        used: false,
      }),
    });

    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        score: 500,
        character: 'ashigaru',
        sessionToken: 'expired-token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('必須フィールドが欠けている場合に拒否する', async () => {
    const { db } = createMockDb();
    const handler = createSubmitScoreHandler(db as any);
    const req = createMockRequest({
      body: {
        nickname: 'テスト太郎',
        // score missing
        character: 'ashigaru',
        sessionToken: 'token',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ====================================
// getRanking テスト
// ====================================

describe('getRanking', () => {
  it('Top100のランキングを返す', async () => {
    const { db, mockCollection } = createMockDb();

    const mockDocs = Array.from({ length: 3 }, (_, i) => ({
      id: `doc-${i}`,
      data: () => ({
        nickname: `Player${i}`,
        score: 1000 - i * 100,
        character: 'ashigaru',
        timestamp: { toDate: () => new Date() },
      }),
    }));

    mockCollection.get.mockResolvedValue({
      docs: mockDocs,
      size: 3,
    });

    const handler = createGetRankingHandler(db as any);
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          top: expect.any(Array),
          totalPlayers: expect.any(Number),
        }),
      })
    );

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.data.top).toHaveLength(3);
    // ランクが正しく付与されていること
    expect(responseData.data.top[0].rank).toBe(1);
    expect(responseData.data.top[1].rank).toBe(2);
    expect(responseData.data.top[2].rank).toBe(3);
  });

  it('sessionTokenでプレイヤーの順位を取得できる', async () => {
    const { db, mockCollection, mockDocRef } = createMockDb();

    const mockDocs = Array.from({ length: 3 }, (_, i) => ({
      id: `doc-${i}`,
      data: () => ({
        nickname: `Player${i}`,
        score: 1000 - i * 100,
        character: 'ashigaru',
        timestamp: { toDate: () => new Date() },
      }),
    }));

    // Top100クエリ
    mockCollection.get
      .mockResolvedValueOnce({ docs: mockDocs, size: 3 })
      // count用クエリ
      .mockResolvedValueOnce({ size: 3 });

    // セッションに紐づくスコア情報
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        nickname: 'Player1',
        score: 900,
        character: 'ashigaru',
        timestamp: { toDate: () => new Date() },
      }),
    });

    const handler = createGetRankingHandler(db as any);
    const req = createMockRequest({
      query: { sessionToken: 'player-token' },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('空のランキングを正常に返す', async () => {
    const { db, mockCollection } = createMockDb();

    mockCollection.get.mockResolvedValue({ docs: [], size: 0 });

    const handler = createGetRankingHandler(db as any);
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          top: [],
          totalPlayers: 0,
        }),
      })
    );
  });
});
