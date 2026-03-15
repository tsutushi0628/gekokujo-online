import { createSession } from '../scoreboardService';
import type { SessionData } from '../../types/scoreboard';

// firebase-kit の createDocument をモック
jest.mock('firebase-kit/backend', () => ({
  createDocument: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createDocument: mockCreateDocument } = require('firebase-kit/backend') as {
  createDocument: jest.Mock;
};

describe('scoreboardService.createSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validSessionData: SessionData = {
    userAgent: 'Mozilla/5.0 Test',
    platform: 'MacIntel',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    touchSupport: 0,
    language: 'ja',
    languages: ['ja', 'en-US'],
    cookieEnabled: true,
    hardwareConcurrency: 8,
    viewportWidth: 1200,
    viewportHeight: 800,
    colorDepth: 24,
    timezone: 'Asia/Tokyo',
  };

  it('セッションを作成し、sessionIdを返す', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    const result = await createSession(validSessionData, '192.168.1.1');

    expect(result.sessionId).toBe('session-abc123');
  });

  it('createDocumentに正しいコレクション名とデータを渡す', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'session-abc123', data: {} });

    await createSession(validSessionData, '10.0.0.1');

    expect(mockCreateDocument).toHaveBeenCalledTimes(1);
    expect(mockCreateDocument).toHaveBeenCalledWith('sessions', {
      ...validSessionData,
      ip: '10.0.0.1',
    });
  });

  it('IPアドレスがセッションデータに付与される', async () => {
    mockCreateDocument.mockResolvedValue({ id: 'session-xyz', data: {} });

    await createSession(validSessionData, '203.0.113.5');

    const calledData = mockCreateDocument.mock.calls[0][1] as Record<string, unknown>;
    expect(calledData.ip).toBe('203.0.113.5');
  });

  it('オプショナルフィールド（deviceMemory等）がある場合もそのまま渡す', async () => {
    const dataWithOptional: SessionData = {
      ...validSessionData,
      deviceMemory: 8,
      connectionType: '4g',
      connectionDownlink: 10,
      referrer: 'https://example.com/',
      utmSource: 'twitter',
    };
    mockCreateDocument.mockResolvedValue({ id: 'session-opt', data: {} });

    await createSession(dataWithOptional, '10.0.0.1');

    const calledData = mockCreateDocument.mock.calls[0][1] as Record<string, unknown>;
    expect(calledData.deviceMemory).toBe(8);
    expect(calledData.connectionType).toBe('4g');
    expect(calledData.connectionDownlink).toBe(10);
    expect(calledData.referrer).toBe('https://example.com/');
    expect(calledData.utmSource).toBe('twitter');
  });
});
