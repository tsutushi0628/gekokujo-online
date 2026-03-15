/**
 * Scoreboard Service
 *
 * ランキング・セッション・スコアのビジネスロジック全般
 * Handler → Service → Util(firebase-kit) の三層アーキテクチャ Service層
 */

import { createDocument, updateDocument, getDocument, getDb, getLogger } from 'firebase-kit/backend';
import type {
  SessionData,
  ScoreSubmission,
  CreateSessionResult,
  SaveScoreResult,
  ApproxRankResult,
  ThresholdSnapshot,
  ThresholdEntry,
  RankSnapshotDocument,
} from '../types/scoreboard';
import {
  MAX_SCORE_PER_SECOND,
  MIN_PLAY_DURATION_FOR_HIGH_SCORE,
  MAX_SCORES_COUNT,
  FIRESTORE_BATCH_LIMIT,
} from '../types/scoreboard';

/**
 * セッションを作成する
 *
 * クライアントから送信されたブラウザ環境情報にサーバー側でIPアドレスを付与し、
 * Firestoreのsessionsコレクションにドキュメントを作成する。
 *
 * @param data - クライアントからのセッションデータ
 * @param ip - サーバー側で取得したIPアドレス（req.ip）
 * @returns sessionId を含む結果
 */
export async function createSession(
  data: SessionData,
  ip: string
): Promise<CreateSessionResult> {
  const result = await createDocument('sessions', {
    ...data,
    ip,
  });

  return { sessionId: result.id };
}

/**
 * スコアの妥当性を検証する
 *
 * @param score - スコア
 * @param playDurationSec - プレイ時間（秒）
 * @throws スコアが不正な場合
 */
function validateScorePlausibility(score: number, playDurationSec: number): void {
  // 1秒あたりのスコアが上限を超える場合は不正
  if (playDurationSec > 0 && score / playDurationSec > MAX_SCORE_PER_SECOND) {
    throw new Error('スコアが不正です');
  }

  // 極端に短いプレイ時間で高スコアは不正
  if (playDurationSec < MIN_PLAY_DURATION_FOR_HIGH_SCORE && score > 0) {
    throw new Error('スコアが不正です');
  }
}

/**
 * スコアを保存し、sessionsにplayLogを追記する
 *
 * @param data - スコア送信データ
 * @returns scoreId を含む結果
 */
export async function saveScore(data: ScoreSubmission): Promise<SaveScoreResult> {
  // スコア妥当性チェック
  validateScorePlausibility(data.score, data.playDurationSec);

  // scoresコレクションにスコアを保存
  const result = await createDocument('scores', {
    sessionId: data.sessionId,
    score: data.score,
    playDurationSec: data.playDurationSec,
  });

  // sessionsにplayLogを追記（失敗してもスコアは保存済みなので正常応答）
  try {
    await updateDocument('sessions', data.sessionId, {
      playLog: data.playLog,
    });
  } catch (error) {
    const logger = getLogger();
    logger.error('sessionsへのplayLog追記に失敗', {
      sessionId: data.sessionId,
      scoreId: result.id,
      error,
    });
  }

  return { scoreId: result.id };
}

/**
 * 近似順位を計算する
 *
 * rankSnapshots/latestから閾値データを取得し、線形補間+ランダムジッターで近似順位を算出。
 * 1〜10位は粒度1のため正確な順位が出る。
 *
 * @param score - プレイヤーのスコア
 * @returns 近似順位結果
 */
export async function calculateApproxRank(score: number): Promise<ApproxRankResult> {
  const result = await getDocument('rankSnapshots', 'latest');

  // スナップショット未生成
  if (!result || !result.exists || !result.data) {
    return { rank: null, isApprox: false, totalPlayers: 0 };
  }

  const snapshot = result.data as unknown as RankSnapshotDocument;
  const thresholds = snapshot.thresholds;
  const totalPlayers = snapshot.totalPlayers;

  // 閾値が空の場合
  if (thresholds.length === 0) {
    return { rank: null, isApprox: false, totalPlayers };
  }

  // 1位のスコア以上 → rank=1
  if (score >= thresholds[0].score) {
    return { rank: 1, isApprox: false, totalPlayers };
  }

  // 全閾値以下 → 圏外
  const lastThreshold = thresholds[thresholds.length - 1];
  if (score < lastThreshold.score) {
    return { rank: null, isApprox: false, totalPlayers };
  }

  // 閾値の最後と同じスコア → その順位
  if (score === lastThreshold.score) {
    return { rank: lastThreshold.rank, isApprox: lastThreshold.rank > 10, totalPlayers };
  }

  // 閾値間を走査して補間
  return interpolateRank(score, thresholds, totalPlayers);
}

/**
 * 閾値間で線形補間+ジッターによる近似順位を計算する
 *
 * thresholdsはrankの昇順（scoreの降順）でソート済み。
 * score が thresholds[i].score 以上かつ thresholds[i-1].score 未満のiを見つけ、
 * upperBound = thresholds[i-1]（スコアが高い側）
 * lowerBound = thresholds[i]（スコアが低い側）
 * で線形補間する。
 */
function interpolateRank(
  score: number,
  thresholds: ThresholdEntry[],
  totalPlayers: number
): ApproxRankResult {
  // scoreがちょうど閾値と一致するケースを先にチェック
  for (let i = 0; i < thresholds.length; i++) {
    if (score === thresholds[i].score) {
      const rank = thresholds[i].rank;
      const isApprox = rank > 10;
      return { rank, isApprox, totalPlayers };
    }
  }

  // score >= thresholds[i].score を満たす最初のiを見つける
  // このiが lower bound（スコアが低い側の閾値）
  // i-1 が upper bound（スコアが高い側の閾値）
  let lowerIndex = -1;
  for (let i = 0; i < thresholds.length; i++) {
    if (score >= thresholds[i].score) {
      lowerIndex = i;
      break;
    }
  }

  // 見つからない場合（全閾値より低い → 上位で処理済みなのでここには来ない）
  if (lowerIndex <= 0) {
    return { rank: thresholds[0].rank, isApprox: false, totalPlayers };
  }

  const upperBound = thresholds[lowerIndex - 1]; // スコアが高い側（rank小さい）
  const lowerBound = thresholds[lowerIndex];      // スコアが低い側（rank大きい）

  // 線形補間
  const scoreDiff = upperBound.score - lowerBound.score;
  let ratio = 0;
  if (scoreDiff > 0) {
    ratio = (upperBound.score - score) / scoreDiff;
  }
  const baseRank = upperBound.rank + (lowerBound.rank - upperBound.rank) * ratio;

  // ジッター（粒度の10%）
  const granularity = lowerBound.rank - upperBound.rank;
  const jitterRange = granularity * 0.1;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  // 丸め + clamp
  let approxRank = Math.round(baseRank + jitter);
  const minRank = upperBound.rank + 1;
  const maxRank = lowerBound.rank - 1;

  if (approxRank < minRank) {
    approxRank = minRank;
  }
  if (approxRank > maxRank) {
    approxRank = maxRank;
  }

  // 1〜10位間は粒度1なのでジッターが丸めで消え、正確な順位が出る
  const isApprox = granularity > 1;

  return { rank: approxRank, isApprox, totalPlayers };
}

/**
 * 閾値スナップショットを取得する
 *
 * @returns 閾値スナップショットデータ
 */
export async function getThresholdSnapshot(): Promise<ThresholdSnapshot> {
  const result = await getDocument('rankSnapshots', 'latest');

  if (!result || !result.exists || !result.data) {
    return { thresholds: [], totalPlayers: 0, generatedAt: null };
  }

  const snapshot = result.data as unknown as RankSnapshotDocument;
  return {
    thresholds: snapshot.thresholds,
    totalPlayers: snapshot.totalPlayers,
    generatedAt: snapshot.generatedAt as unknown as string,
  };
}

/**
 * スナップショットを再生成し、下位スコアをcleanupする
 *
 * 1. scoresコレクションの総件数をカウント
 * 2. score DESCで上位10000件を取得
 * 3. 閾値ポイントを抽出
 * 4. rankSnapshots/latestを更新
 * 5. 10001位以降のscoresをバッチ削除（sessionsは削除しない）
 */
export async function regenerateSnapshot(): Promise<void> {
  const db = getDb();
  const scoresRef = db.collection('scores');

  // 1. 総件数カウント
  const countResult = await scoresRef.count().get();
  const totalPlayers = countResult.data().count;

  // 2. score DESCで上位10000件取得
  const scoresQuery = await scoresRef
    .orderBy('score', 'desc')
    .limit(MAX_SCORES_COUNT)
    .get();

  // 3. 閾値ポイント抽出
  const thresholds = extractThresholds(scoresQuery.docs);

  // 4. rankSnapshots/latest を更新
  await updateDocument('rankSnapshots', 'latest', {
    thresholds,
    totalPlayers,
    generatedAt: new Date().toISOString(),
  });

  // 5. cleanup: 10001位以降のscoresを削除
  if (totalPlayers > MAX_SCORES_COUNT && scoresQuery.size === MAX_SCORES_COUNT) {
    const lastDoc = scoresQuery.docs[scoresQuery.docs.length - 1];
    const lastScore = lastDoc.data().score as number;
    await cleanupExcessScores(db, scoresRef, lastScore);
  }
}

/**
 * スコアデータから閾値ポイントを抽出する
 *
 * 閾値の粒度:
 * - 1〜10位: 1刻み
 * - 10〜100位: 10刻み
 * - 100〜1000位: 100刻み
 * - 1000〜10000位: 1000刻み
 */
function extractThresholds(
  docs: Array<{ data: () => Record<string, unknown> }>
): ThresholdEntry[] {
  if (docs.length === 0) {
    return [];
  }

  const thresholds: ThresholdEntry[] = [];
  const targetRanks = generateTargetRanks();

  for (const targetRank of targetRanks) {
    const index = targetRank - 1; // 0-indexed
    if (index < docs.length) {
      const score = docs[index].data().score as number;
      thresholds.push({ rank: targetRank, score });
    }
  }

  return thresholds;
}

/**
 * 閾値の対象順位リストを生成する
 */
function generateTargetRanks(): number[] {
  const ranks: number[] = [];

  // 1〜10位: 1刻み
  for (let i = 1; i <= 10; i++) {
    ranks.push(i);
  }

  // 20〜100位: 10刻み（10は既に含まれている）
  for (let i = 20; i <= 100; i += 10) {
    ranks.push(i);
  }

  // 200〜1000位: 100刻み（100は既に含まれている）
  for (let i = 200; i <= 1000; i += 100) {
    ranks.push(i);
  }

  // 2000〜10000位: 1000刻み（1000は既に含まれている）
  for (let i = 2000; i <= MAX_SCORES_COUNT; i += 1000) {
    ranks.push(i);
  }

  return ranks;
}

/**
 * 超過分のscoresをバッチ削除する
 * sessionsは削除しない
 */
async function cleanupExcessScores(
  db: FirebaseFirestore.Firestore,
  scoresRef: FirebaseFirestore.CollectionReference,
  thresholdScore: number
): Promise<void> {
  const logger = getLogger();

  // thresholdScore未満のスコアをクエリ
  const excessDocs = await scoresRef
    .where('score', '<', thresholdScore)
    .get();

  if (excessDocs.docs.length === 0) {
    return;
  }

  // Firestoreバッチは500件ずつ
  for (let i = 0; i < excessDocs.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = excessDocs.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  logger.info('スコアcleanup完了', {
    deletedCount: excessDocs.docs.length,
    thresholdScore,
  });
}
