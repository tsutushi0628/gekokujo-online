import { saveScore } from '../scoreboardService';
import type { ScoreSubmission } from '../../types/scoreboard';

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.mock('firebase-kit/backend', () => ({
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  getLogger: () => mockLogger,
}));

const { createDocument: mockCreateDocument, updateDocument: mockUpdateDocument } =
  require('firebase-kit/backend') as {
    createDocument: jest.Mock;
    updateDocument: jest.Mock;
  };

describe('scoreboardService.saveScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validSubmission: ScoreSubmission = {
    sessionId: 'session-abc123',
    score: 5000,
    playDurationSec: 120,
    playLog: { character: 'samurai', kills: 5 },
  };

  it('スコアを保存し、scoreIdを返す', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'score-xyz', data: {} });
    mockUpdateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    const result = await saveScore(validSubmission);

    expect(result.scoreId).toBe('score-xyz');
  });

  it('scoresコレクションにスコアを作成する', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'score-xyz', data: {} });
    mockUpdateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    await saveScore(validSubmission);

    expect(mockCreateDocument).toHaveBeenCalledWith('scores', {
      sessionId: 'session-abc123',
      score: 5000,
      playDurationSec: 120,
    });
  });

  it('sessionsにplayLogを追記する', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'score-xyz', data: {} });
    mockUpdateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    await saveScore(validSubmission);

    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'sessions',
      'session-abc123',
      { playLog: { character: 'samurai', kills: 5 } }
    );
  });

  it('スコア妥当性チェック: score/playDurationSec > 1000 で拒否', async () => {
    const invalidSubmission: ScoreSubmission = {
      sessionId: 'session-abc123',
      score: 100000,
      playDurationSec: 10, // 10000点/秒 > 1000点/秒
      playLog: { character: 'samurai' },
    };

    await expect(saveScore(invalidSubmission)).rejects.toThrow();
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('スコア妥当性チェック: 5秒未満で高スコアは拒否', async () => {
    const invalidSubmission: ScoreSubmission = {
      sessionId: 'session-abc123',
      score: 1000,
      playDurationSec: 3, // 5秒未満で1000点
      playLog: { character: 'samurai' },
    };

    await expect(saveScore(invalidSubmission)).rejects.toThrow();
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('5秒未満でも低スコア（0点）は許可される', async () => {
    const lowScoreSubmission: ScoreSubmission = {
      sessionId: 'session-abc123',
      score: 0,
      playDurationSec: 2,
      playLog: { character: 'samurai' },
    };
    mockCreateDocument.mockResolvedValue({ id: 'score-low', data: {} });
    mockUpdateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    const result = await saveScore(lowScoreSubmission);

    expect(result.scoreId).toBe('score-low');
  });

  it('playLog追記失敗時: スコアは保存済み、エラーログ記録、正常応答', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'score-saved', data: {} });
    mockUpdateDocument.mockRejectedValue(new Error('Firestore update failed'));

    const result = await saveScore(validSubmission);

    expect(result.scoreId).toBe('score-saved');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('スコア保存自体が失敗した場合はエラーをthrowする', async () => {
    mockCreateDocument.mockRejectedValue(new Error('Firestore create failed'));

    await expect(saveScore(validSubmission)).rejects.toThrow('Firestore create failed');
  });
});
