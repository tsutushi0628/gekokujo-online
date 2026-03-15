import { regenerateSnapshot } from '../scoreboardService';

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

// Firestoreクエリチェーンのモック
const mockDeleteFn = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = {
  delete: mockDeleteFn,
  commit: mockBatchCommit,
};
const mockDocs: Array<{ data: () => Record<string, unknown>; ref: object }> = [];
const mockQuerySnapshot = {
  docs: mockDocs,
  size: 0,
};
const mockLimitFn = jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });
const mockOrderByFn = jest.fn().mockReturnValue({ limit: mockLimitFn });
const mockWhereGet = jest.fn().mockResolvedValue({ docs: [] });
const mockWhereFn = jest.fn().mockReturnValue({ get: mockWhereGet });
const mockCountGet = jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) });
const mockCountFn = jest.fn().mockReturnValue({ get: mockCountGet });
const mockCollection = jest.fn().mockReturnValue({
  orderBy: mockOrderByFn,
  where: mockWhereFn,
  count: mockCountFn,
});
const mockDb = {
  collection: mockCollection,
  batch: jest.fn().mockReturnValue(mockBatch),
};

jest.mock('firebase-kit/backend', () => ({
  getDb: () => mockDb,
  updateDocument: jest.fn(),
  getLogger: () => mockLogger,
}));

const { updateDocument: mockUpdateDocument } =
  require('firebase-kit/backend') as {
    updateDocument: jest.Mock;
  };

describe('scoreboardService.regenerateSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs.length = 0;
    mockQuerySnapshot.size = 0;
    mockBatchCommit.mockResolvedValue(undefined);
    mockLimitFn.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });
    mockOrderByFn.mockReturnValue({ limit: mockLimitFn });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });
    mockWhereGet.mockResolvedValue({ docs: [] });
  });

  function createScoreDoc(score: number): { data: () => { score: number }; ref: object } {
    return {
      data: () => ({ score }),
      ref: { id: `score-${score}` },
    };
  }

  it('スコア0件 → 空のスナップショットを生成する', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });

    await regenerateSnapshot();

    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'rankSnapshots',
      'latest',
      expect.objectContaining({
        thresholds: [],
        totalPlayers: 0,
      })
    );
  });

  it('10件未満のスコア → 存在する分だけ閾値生成', async () => {
    const docs = [500, 400, 300].map(createScoreDoc);
    mockDocs.push(...docs);
    mockQuerySnapshot.size = 3;
    mockLimitFn.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });
    mockOrderByFn.mockReturnValue({ limit: mockLimitFn });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 3 }) });

    await regenerateSnapshot();

    const updateCall = mockUpdateDocument.mock.calls[0];
    const snapshotData = updateCall[2] as { thresholds: Array<{ rank: number; score: number }>; totalPlayers: number };
    expect(snapshotData.thresholds).toEqual([
      { rank: 1, score: 500 },
      { rank: 2, score: 400 },
      { rank: 3, score: 300 },
    ]);
    expect(snapshotData.totalPlayers).toBe(3);
  });

  it('10000件 → 全閾値が正しく抽出される', async () => {
    // 10000件のスコアデータを生成（10000点〜1点）
    const docs = Array.from({ length: 10000 }, (_, i) => createScoreDoc(10000 - i));
    mockDocs.push(...docs);
    mockQuerySnapshot.size = 10000;
    mockLimitFn.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });
    mockOrderByFn.mockReturnValue({ limit: mockLimitFn });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 10000 }) });

    await regenerateSnapshot();

    const updateCall = mockUpdateDocument.mock.calls[0];
    const snapshotData = updateCall[2] as { thresholds: Array<{ rank: number; score: number }>; totalPlayers: number };

    // 1〜10位は1刻み
    expect(snapshotData.thresholds[0]).toEqual({ rank: 1, score: 10000 });
    expect(snapshotData.thresholds[9]).toEqual({ rank: 10, score: 9991 });

    // 10000位も存在する
    const last = snapshotData.thresholds[snapshotData.thresholds.length - 1];
    expect(last.rank).toBe(10000);
  });

  it('10000件超 → cleanupでscoresの超過分を削除（sessionsは削除しない）', async () => {
    const docs = Array.from({ length: 10000 }, (_, i) => createScoreDoc(10000 - i));
    mockDocs.push(...docs);
    mockQuerySnapshot.size = 10000;
    mockLimitFn.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });
    mockOrderByFn.mockReturnValue({ limit: mockLimitFn });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 12000 }) });

    // cleanup対象のドキュメント
    const cleanupDocs = [
      { ref: { id: 'cleanup-1' } },
      { ref: { id: 'cleanup-2' } },
    ];
    mockWhereGet.mockResolvedValue({ docs: cleanupDocs });

    await regenerateSnapshot();

    // scoresコレクションに対してwhereクエリが呼ばれる（cleanup）
    expect(mockCollection).toHaveBeenCalledWith('scores');
    // バッチ削除が実行される
    expect(mockDeleteFn).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('updateDocumentにgeneratedAtフィールドが含まれる', async () => {
    await regenerateSnapshot();

    const updateCall = mockUpdateDocument.mock.calls[0];
    const snapshotData = updateCall[2] as Record<string, unknown>;
    expect(snapshotData).toHaveProperty('generatedAt');
  });
});
