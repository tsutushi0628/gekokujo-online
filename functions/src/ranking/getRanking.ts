/**
 * getRanking — ランキング取得
 *
 * Top 100 のランキングデータを返す。
 * sessionTokenが指定されている場合、そのプレイヤーの順位情報も返す。
 */

import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { RankingEntryResponse, RANKING_TOP_LIMIT } from '../types/gekokujo';

const RANKING_COLLECTION = 'gekokujoRanking';

/**
 * getRankingハンドラーを生成する（DI対応）
 *
 * @param db Firestoreインスタンス
 */
export function createGetRankingHandler(db: Firestore) {
  return async function getRankingHandler(req: Request, res: Response): Promise<void> {
    // Top 100 取得
    const rankingQuery = db
      .collection(RANKING_COLLECTION)
      .orderBy('score', 'desc')
      .limit(RANKING_TOP_LIMIT);

    const snapshot = await rankingQuery.get();

    const top: RankingEntryResponse[] = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        id: doc.id,
        nickname: data.nickname,
        score: data.score,
        character: data.character,
        rank: index + 1,
        timestamp: data.timestamp.toDate().toISOString(),
      };
    });

    // プレイヤーの順位を取得（sessionTokenが指定されている場合）
    let playerRank: RankingEntryResponse | null = null;
    const sessionToken = req.query.sessionToken as string | undefined;

    if (sessionToken) {
      // sessionTokenからスコアドキュメントを検索
      // Note: submitScore時にsessionTokenをスコアドキュメントに保存していないので
      //       ここでは最後に登録されたスコアのdocIdをsessionTokenとして使う
      //       将来的にはsubmitScoreのレスポンスで返したidで問い合わせる形に改善可能
      const playerDoc = await db
        .collection(RANKING_COLLECTION)
        .doc(sessionToken)
        .get();

      if (playerDoc.exists) {
        const playerData = playerDoc.data()!;
        // スコアが自分より高い人数をカウントして順位を算出
        const higherScoreQuery = await db
          .collection(RANKING_COLLECTION)
          .where('score', '>', playerData.score)
          .get();

        playerRank = {
          id: playerDoc.id,
          nickname: playerData.nickname,
          score: playerData.score,
          character: playerData.character,
          rank: higherScoreQuery.size + 1,
          timestamp: playerData.timestamp.toDate().toISOString(),
        };
      }
    }

    res.json({
      success: true,
      data: {
        top,
        playerRank,
        totalPlayers: snapshot.size,
      },
    });
  };
}
