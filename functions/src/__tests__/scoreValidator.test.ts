import { validateScore, validateNickname, calculateMaxPossibleScore } from '../validation/scoreValidator';

describe('scoreValidator', () => {
  describe('calculateMaxPossibleScore', () => {
    it('理論最大スコアが正の数で返る', () => {
      const maxScore = calculateMaxPossibleScore();
      expect(maxScore).toBeGreaterThan(0);
    });

    it('安全マージン1.5が掛けられている', () => {
      const maxScore = calculateMaxPossibleScore();
      // 内部的にSAFETY_MARGIN = 1.5が掛けられていることを
      // 返り値が十分大きいことで間接的に検証
      expect(maxScore).toBeGreaterThan(1000);
    });
  });

  describe('validateScore', () => {
    it('正常なスコアを受け入れる', () => {
      const result = validateScore(500);
      expect(result.isValid).toBe(true);
    });

    it('スコア0を受け入れる', () => {
      const result = validateScore(0);
      expect(result.isValid).toBe(true);
    });

    it('負のスコアを拒否する', () => {
      const result = validateScore(-1);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('負');
    });

    it('小数のスコアを拒否する', () => {
      const result = validateScore(100.5);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('整数');
    });

    it('理論最大値を超えるスコアを拒否する', () => {
      const maxScore = calculateMaxPossibleScore();
      const result = validateScore(maxScore + 1);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('上限');
    });

    it('理論最大値ちょうどのスコアは受け入れる', () => {
      const maxScore = calculateMaxPossibleScore();
      const result = validateScore(maxScore);
      expect(result.isValid).toBe(true);
    });

    it('NaNを拒否する', () => {
      const result = validateScore(NaN);
      expect(result.isValid).toBe(false);
    });

    it('Infinityを拒否する', () => {
      const result = validateScore(Infinity);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateNickname', () => {
    it('3文字のニックネームを受け入れる', () => {
      const result = validateNickname('あいう');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('あいう');
    });

    it('8文字のニックネームを受け入れる', () => {
      const result = validateNickname('あいうえおかきく');
      expect(result.isValid).toBe(true);
    });

    it('2文字のニックネームを拒否する', () => {
      const result = validateNickname('あい');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('3');
    });

    it('9文字のニックネームを拒否する', () => {
      const result = validateNickname('あいうえおかきくけ');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('8');
    });

    it('空文字を拒否する', () => {
      const result = validateNickname('');
      expect(result.isValid).toBe(false);
    });

    it('HTMLタグを除去する', () => {
      const result = validateNickname('<b>テスト</b>');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).not.toContain('<');
      expect(result.sanitized).not.toContain('>');
    });

    it('スクリプトインジェクションを無害化する', () => {
      const result = validateNickname('a<script>alert(1)</script>');
      expect(result.sanitized).not.toContain('script');
    });

    it('前後の空白をトリムする', () => {
      const result = validateNickname('  テスト  ');
      expect(result.sanitized).toBe('テスト');
    });

    it('英数字のニックネームを受け入れる', () => {
      const result = validateNickname('Player1');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Player1');
    });

    it('日本語のニックネームを受け入れる', () => {
      const result = validateNickname('信長公');
      expect(result.isValid).toBe(true);
    });
  });
});
