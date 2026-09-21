import { getThresholdSnapshot } from '../scoreboardService';

// scoreboardService は firebase-kit の getDocument ではなく
// getDb().collection('rankSnapshots').doc('latest').get() で直接読む。
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

/** doc().get() が返す DocumentSnapshot 相当のモックを作る */
function snapshot(data: Record<string, unknown> | null) {
  return data === null
    ? { exists: false, data: () => undefined }
    : { exists: true, data: () => data };
}

describe('scoreboardService.getThresholdSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({ get: mockDocGet });
    mockCollection.mockReturnValue({ doc: mockDoc });
  });

  it('スナップショットが存在する場合、正しいデータを返す', async () => {
    const thresholds = [
      { rank: 1, score: 50000 },
      { rank: 10, score: 30000 },
    ];
    mockDocGet.mockResolvedValue(
      snapshot({
        thresholds,
        totalPlayers: 1000,
        generatedAt: '2026-03-15T09:55:00.000Z',
      })
    );

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual(thresholds);
    expect(result.totalPlayers).toBe(1000);
    expect(result.generatedAt).toBe('2026-03-15T09:55:00.000Z');
  });

  it('スナップショット未生成時、空のデータを返す', async () => {
    mockDocGet.mockResolvedValue(snapshot(null));

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual([]);
    expect(result.totalPlayers).toBe(0);
    expect(result.generatedAt).toBeNull();
  });

  it('ドキュメントが存在しない場合も空のデータを返す', async () => {
    mockDocGet.mockResolvedValue({ exists: false, data: () => null });

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual([]);
    expect(result.totalPlayers).toBe(0);
    expect(result.generatedAt).toBeNull();
  });

  it('正しいコレクションとドキュメントIDを読む', async () => {
    mockDocGet.mockResolvedValue(snapshot(null));

    await getThresholdSnapshot();

    expect(mockCollection).toHaveBeenCalledWith('rankSnapshots');
    expect(mockDoc).toHaveBeenCalledWith('latest');
  });
});
