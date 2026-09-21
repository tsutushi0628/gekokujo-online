import { calculateApproxRank } from '../scoreboardService';

// scoreboardService は getDb().collection('rankSnapshots').doc('latest').get() で
// スナップショットを直接読む。
const mockDocGet = jest.fn();
const mockDoc = jest.fn().mockReturnValue({ get: mockDocGet });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });
const mockDb = { collection: mockCollection };

jest.mock('firebase-kit/backend', () => ({
  getDb: () => mockDb,
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('scoreboardService.calculateApproxRank', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({ get: mockDocGet });
    mockCollection.mockReturnValue({ doc: mockDoc });
  });

  const sampleThresholds = [
    { rank: 1, score: 50000 },
    { rank: 2, score: 48000 },
    { rank: 3, score: 45000 },
    { rank: 4, score: 43000 },
    { rank: 5, score: 40000 },
    { rank: 6, score: 38000 },
    { rank: 7, score: 35000 },
    { rank: 8, score: 33000 },
    { rank: 9, score: 31000 },
    { rank: 10, score: 30000 },
    { rank: 20, score: 25000 },
    { rank: 30, score: 22000 },
    { rank: 100, score: 15000 },
    { rank: 200, score: 12000 },
    { rank: 1000, score: 5000 },
    { rank: 2000, score: 3000 },
    { rank: 10000, score: 500 },
  ];

  const snapshotDoc = {
    exists: true,
    data: () => ({
      thresholds: sampleThresholds,
      totalPlayers: 8523,
      generatedAt: '2026-03-15T09:55:00.000Z',
    }),
  };

  const emptyDoc = { exists: false, data: () => undefined };

  it('1位のスコア以上 → rank=1, isApprox=false', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    const result = await calculateApproxRank(55000);

    expect(result.rank).toBe(1);
    expect(result.isApprox).toBe(false);
  });

  it('1位と同じスコア → rank=1, isApprox=false', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    const result = await calculateApproxRank(50000);

    expect(result.rank).toBe(1);
    expect(result.isApprox).toBe(false);
  });

  it('1〜10位間のスコア → 正確な順位（ジッターが丸めで消える）', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    // 2位のスコア(48000)以上、1位のスコア(50000)未満
    const result = await calculateApproxRank(48000);

    expect(result.rank).toBe(2);
    expect(result.isApprox).toBe(false);
  });

  it('閾値間のスコア → 線形補間+ジッターが範囲内', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    // 20位(25000)と30位(22000)の間
    const result = await calculateApproxRank(23000);

    expect(result.rank).not.toBeNull();
    // 20〜30の範囲内に収まるべき
    expect(result.rank).toBeGreaterThanOrEqual(21);
    expect(result.rank).toBeLessThanOrEqual(29);
    expect(result.isApprox).toBe(true);
  });

  it('全閾値以下 → 圏外(rank=null)', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    // 10000位(500)未満のスコア
    const result = await calculateApproxRank(100);

    expect(result.rank).toBeNull();
    expect(result.isApprox).toBe(false);
  });

  it('スナップショット未生成時 → rank=null, isApprox=false', async () => {
    mockDocGet.mockResolvedValue(emptyDoc);

    const result = await calculateApproxRank(5000);

    expect(result.rank).toBeNull();
    expect(result.isApprox).toBe(false);
    expect(result.totalPlayers).toBe(0);
  });

  it('閾値が最後のエントリと同じスコア → その順位', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    // 10000位のスコア(500)と同じ
    const result = await calculateApproxRank(500);

    expect(result.rank).toBe(10000);
  });

  it('totalPlayersがスナップショットから取得される', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    const result = await calculateApproxRank(5000);

    expect(result.totalPlayers).toBe(8523);
  });

  it('正しいコレクションとドキュメントIDを読む', async () => {
    mockDocGet.mockResolvedValue(snapshotDoc);

    await calculateApproxRank(5000);

    expect(mockCollection).toHaveBeenCalledWith('rankSnapshots');
    expect(mockDoc).toHaveBeenCalledWith('latest');
  });
});
