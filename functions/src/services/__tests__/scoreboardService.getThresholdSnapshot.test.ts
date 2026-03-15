import { getThresholdSnapshot } from '../scoreboardService';

jest.mock('firebase-kit/backend', () => ({
  getDocument: jest.fn(),
}));

const { getDocument: mockGetDocument } =
  require('firebase-kit/backend') as {
    getDocument: jest.Mock;
  };

describe('scoreboardService.getThresholdSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('スナップショットが存在する場合、正しいデータを返す', async () => {
    const thresholds = [
      { rank: 1, score: 50000 },
      { rank: 10, score: 30000 },
    ];
    mockGetDocument.mockResolvedValue({
      exists: true,
      data: {
        thresholds,
        totalPlayers: 1000,
        generatedAt: '2026-03-15T09:55:00.000Z',
      },
    });

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual(thresholds);
    expect(result.totalPlayers).toBe(1000);
    expect(result.generatedAt).toBe('2026-03-15T09:55:00.000Z');
  });

  it('スナップショット未生成時、空のデータを返す', async () => {
    mockGetDocument.mockResolvedValue(null);

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual([]);
    expect(result.totalPlayers).toBe(0);
    expect(result.generatedAt).toBeNull();
  });

  it('ドキュメントが存在しない場合も空のデータを返す', async () => {
    mockGetDocument.mockResolvedValue({ exists: false, data: null });

    const result = await getThresholdSnapshot();

    expect(result.thresholds).toEqual([]);
    expect(result.totalPlayers).toBe(0);
    expect(result.generatedAt).toBeNull();
  });

  it('getDocumentに正しいコレクションとドキュメントIDを渡す', async () => {
    mockGetDocument.mockResolvedValue(null);

    await getThresholdSnapshot();

    expect(mockGetDocument).toHaveBeenCalledWith('rankSnapshots', 'latest');
  });
});
