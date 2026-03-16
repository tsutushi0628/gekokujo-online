# Design Document: Scoreboard (gekokujo-online)

## Overview

ゲーム「下剋上オンライン」にスコアボード機能を追加する。
完璧なリアルタイムランキングは諦め、**閾値ベースの近似ランキング**で体験を実現する。
結果画面で「お主は約○位じゃ」と自分の順位だけ表示する仕様。他プレイヤーの情報は一切見えない。

加えて、セッション情報（ブラウザ環境）とプレイログ（キャラ選択・得点・死因等）を収集し、分析基盤を構築する。

バックエンドのみ（Cloud Functions + Firestore）。フロントエンドは対象外。

## Steering Document Alignment

### Technical Standards (tech.md)
- Express app パターン（firebase-kit標準）でAPI構築
- 三階建てアーキテクチャ（Handler → Service → Util）準拠
- maxInstances 必須、err.message クライアント返却禁止

### Project Structure (structure.md)
```
functions/
├── src/
│   ├── index.ts              # Express app エントリポイント
│   ├── handlers/
│   │   └── scoreboardHandlers.ts  # HTTPハンドラー
│   ├── services/
│   │   └── scoreboardService.ts   # ビジネスロジック（近似ランキング計算）
│   └── types/
│       └── scoreboard.ts          # 型定義
├── firebase-kit/              # サブモジュール（既存）
├── project.config.ts
├── package.json
└── tsconfig.json
```

## Code Reuse Analysis

### firebase-kit: そのまま利用できる機能

| 機能 | モジュール | 用途 |
|------|-----------|------|
| **firebaseKit.initialize** | `config.ts` | 初期化（projectId, databaseName, logger, getSecret） |
| **firebaseKit.getDb()** | `config.ts` | Firestoreインスタンス取得 |
| **createDocument** | `CRUDUtil.ts` | セッション・スコアドキュメント作成（自動タイムスタンプ付き） |
| **getCollection** | `CRUDUtil.ts` | ランキングデータ取得 |
| **updateDocument** | `CRUDUtil.ts` | セッションへのplayLog追記 |
| **runTransaction** | `CRUDUtil.ts` | スコア書き込み時のアトミック操作 |
| **runBatch** | `CRUDUtil.ts` | 下位スコアの一括削除（cleanup） |
| **cors()** | `middleware/cors.ts` | CORS設定 |
| **withExpressValidation** | `middleware/withValidation.ts` | Express用入力バリデーション（custom含む） |
| **createUnifiedResponse** | `responseFormatter.ts` | 統一レスポンス形式 |
| **createErrorResponse** | `responseFormatter.ts` | エラーレスポンス |
| **createGetSecretFunction** | `SecretManager.ts` | シークレット管理 |

### firebase-kit: 拡張が必要な機能

なし。既存機能で十分カバーできる。

### firebase-kit: 新規作成が必要な機能（プロト側）

| 機能 | 理由 |
|------|------|
| **scoreboardService** | 近似ランキング計算・セッション管理・スコア保存ロジック（ゲーム固有） |
| **scoreboardHandlers** | Express routeハンドラー |
| **スナップショット生成+cleanupロジック** | 閾値データの集計・キャッシュ・下位スコア削除（ゲーム固有） |

## Architecture

### 全体アーキテクチャ

```
[フロントエンド]
    │
    ├── POST /api/scoreboard/sessions   ← ゲーム起動時にブラウザ情報送信
    │       → sessionId 返却
    │
    ├── GET /api/scoreboard/thresholds  ← ゲーム起動時にプレロード（キャッシュ）
    │       → 閾値データ返却（近似ポイント群）
    │       ※ 近似順位はクライアント側でキャッシュ済み閾値から即時計算する
    │
    └── POST /api/scoreboard/scores     ← ゲーム終了時に送信
            → スコア保存 + sessionsにplayLog追記

[Cloud Functions (Express app)]
    │
    ├── Handler層: scoreboardHandlers.ts
    │     ├── createSession()  — セッション作成
    │     ├── getThresholds()  — 閾値データ取得
    │     └── submitScore()    — スコア送信 + playLogをsessionsに追記 + 近似順位応答
    │
    ├── Service層: scoreboardService.ts
    │     ├── createSession()          — セッションドキュメント作成
    │     ├── getThresholdSnapshot()   — Firestoreからスナップショット取得
    │     ├── saveScore()              — スコア保存 + sessionsにplayLog追記
    │     ├── calculateApproxRank()    — 近似順位計算
    │     └── regenerateSnapshot()     — スナップショット再生成 + 下位スコアcleanup
    │
    └── Util層: firebase-kit (CRUDUtil, responseFormatter等)

[Firestore]
    ├── sessions         — セッション情報（ブラウザ環境 + playLog）※cleanup対象外
    ├── scores           — スコア記録（上限10000件、超過分は定期削除）
    └── rankSnapshots    — ランキング閾値スナップショット
```

### データフロー

**1. セッション作成フロー**
```
POST /api/scoreboard/sessions
  → withExpressValidation（入力検証）
  → scoreboardService.createSession()
    → req.ip からIPアドレス取得（サーバー側）
    → createDocument('sessions', { ...clientData, ip })  ← firebase-kit CRUD
  → res.json({ success, data: { sessionId } })
```

**2. スコア送信フロー**
```
POST /api/scoreboard/scores
  → withExpressValidation（入力検証、playLogは5KB上限をcustomバリデーターで検証）
  → scoreboardService.saveScore()
    → createDocument('scores', { sessionId, score, playDurationSec })  ← firebase-kit CRUD
    → updateDocument('sessions', sessionId, { playLog })               ← playLogをsessionsに追記
  → res.json({ success, data: { scoreId } })
  ※ 近似順位はフロントが保持するキャッシュ済み閾値から即時計算（API往復なし）
```

**3. 閾値取得フロー（プレロード）**
```
GET /api/scoreboard/thresholds
  → scoreboardService.getThresholdSnapshot()
    → getDb().collection('rankSnapshots').doc('latest').get()  ← 直接取得
    ※ firebase-kit の getDocument は where('id', '==', docId) クエリのため
    ※ rankSnapshots/latest（idフィールドなし）を読めないため直接参照
  → res.json({ success, data: { thresholds, generatedAt } })
```

**4. スナップショット生成 + cleanup フロー（定期バッチ）**
```
Scheduled Function (15分間隔)
  → scoreboardService.regenerateSnapshot()
    → getDb().collection('scores')
        .orderBy('score', 'desc')
        .limit(10000)                    ← 最大10000件
    → 閾値ポイント抽出（1刻み + 10刻み + 100刻み + 1000刻み）
    → db.collection('rankSnapshots').doc('latest').set(snapshotData)  ← 直接書き込み（upsert）
    → 10001位以降のドキュメントを一括削除（cleanup）
      ※ scoresのみ削除。sessionsは削除しない（playLogを永続化するため）
```

## Components and Interfaces

### Component 1: scoreboardHandlers.ts (Handler層)

- **Purpose:** HTTPリクエストの受付・レスポンス返却のみ
- **Interfaces:**
  - `createSession(req, res)` — POST /api/scoreboard/sessions
  - `getThresholds(req, res)` — GET /api/scoreboard/thresholds
  - `submitScore(req, res)` — POST /api/scoreboard/scores
- **Dependencies:** scoreboardService, firebase-kit (withExpressValidation, createUnifiedResponse, createErrorResponse)
- **Reuses:** withExpressValidation（入力検証、playLog 5KBチェックはcustomバリデーター）, createUnifiedResponse（レスポンス統一）

### Component 2: scoreboardService.ts (Service層)

- **Purpose:** ランキング・セッション・スコアのビジネスロジック全般
- **Interfaces:**
  - `createSession(data: SessionData, ip: string): Promise<{ sessionId: string }>` — セッション作成
  - `saveScore(data: ScoreSubmission): Promise<SaveScoreResult>` — スコア保存 + sessionsにplayLog追記
  - `calculateApproxRank(score: number): Promise<ApproxRankResult>` — 近似順位計算
  - `getThresholdSnapshot(): Promise<ThresholdSnapshot>` — スナップショット取得
  - `regenerateSnapshot(): Promise<void>` — スナップショット再生成 + 下位スコアcleanup
- **Dependencies:** firebase-kit (getDb, createDocument, updateDocument)
- **Reuses:** CRUDUtil全般

### Component 3: index.ts (エントリポイント)

- **Purpose:** Express app定義、firebase-kit初期化、ルーティング
- **Reuses:** firebaseKit.initialize, cors(), express.json()

### Component 4: generateRankSnapshot (Scheduled Function)

- **Purpose:** 定期的にランキングスナップショットを再生成し、下位スコアを削除する
- **Schedule:** every 15 minutes
- **Dependencies:** scoreboardService.regenerateSnapshot()

## Data Models

### sessions コレクション

ゲーム起動時のブラウザ環境情報 + ゲーム終了時のプレイログ。ユニークセッション単位で1ドキュメント。
**cleanup対象外**（playLogを永続化するため）。

```typescript
interface SessionDocument {
  id: string;                    // 自動生成
  // ブラウザ情報（セッション作成時にクライアントから送信）
  userAgent: string;             // navigator.userAgent
  platform: string;              // navigator.platform
  screenWidth: number;           // screen.width
  screenHeight: number;          // screen.height
  devicePixelRatio: number;      // window.devicePixelRatio
  touchSupport: number;          // navigator.maxTouchPoints
  language: string;              // navigator.language
  languages: string[];           // navigator.languages
  cookieEnabled: boolean;        // navigator.cookieEnabled
  hardwareConcurrency: number;   // navigator.hardwareConcurrency
  deviceMemory: number;          // navigator.deviceMemory（対応ブラウザのみ）
  viewportWidth: number;         // window.innerWidth
  viewportHeight: number;        // window.innerHeight
  colorDepth: number;            // screen.colorDepth
  connectionType: string;        // navigator.connection.effectiveType（対応ブラウザのみ）
  connectionDownlink: number;    // navigator.connection.downlink（対応ブラウザのみ）
  referrer: string;              // document.referrer
  utmSource: string;             // URLパラメータから取得
  timezone: string;              // Intl.DateTimeFormat().resolvedOptions().timeZone
  // サーバー側で付与
  ip: string;                    // req.ip
  // プレイログ（スコア送信時にupdateで追記）
  playLog?: object;              // 選択キャラ、得点内訳、死因、死亡時間等（ゲームオーバー時に追記）
  createdAt: Timestamp;          // firebase-kit自動付与
  updatedAt: Timestamp;          // firebase-kit自動付与
}
```

**設計判断:**
- クリーンアップ当面不要（ユニークセッション単位なので肥大化しにくい。必要になったら検討）
- deviceMemory, connectionType, connectionDownlink はブラウザ非対応時はフィールドなし（Firestoreは柔軟なスキーマ）
- IPアドレスはサーバー側で`req.ip`から取得。クライアントに渡さない
- playLogはスコア送信時にupdateDocumentで追記。セッション作成時には存在しない（optional）
- playLogをsessionsに配置する理由: scoresコレクションは10000位以下をcleanupで削除するが、playLogは分析用データとして永続化したい。sessionsはcleanup対象外なのでplayLogが失われない

### scores コレクション

全スコア記録。上限10000件（超過分はregenerateSnapshot時に削除）。

```typescript
interface ScoreDocument {
  id: string;              // 自動生成
  sessionId: string;       // sessionsドキュメントへの参照
  score: number;           // スコア（0以上の整数）
  playDurationSec: number; // プレイ時間（秒）— 不正検知用
  createdAt: Timestamp;    // firebase-kit自動付与
  updatedAt: Timestamp;    // firebase-kit自動付与
}
```

**Firestoreインデックス:**
- `score DESC` — ランキング集計用（複合インデックス不要、単一フィールド）

**設計判断:**
- 認証なし（匿名ゲーム）、プレイヤー名なし（自分の順位のみ表示する仕様のため不要）
- 1プレイ=1ドキュメント
- sessionIdでセッション情報と紐付け。同一セッションで複数プレイ可能
- playLogはscoresではなくsessionsに格納（cleanup耐性のため）
- playDurationSecはサーバー側での妥当性チェック用（異常に短い=不正の可能性）
- 10000件超のドキュメントは圏外扱いなので保持する意味がない。regenerateSnapshot内で削除する

### rankSnapshots コレクション

ランキング閾値のスナップショット。ドキュメントは基本的に1つ（`latest`）。

```typescript
interface RankSnapshotDocument {
  id: 'latest';
  thresholds: ThresholdEntry[];    // 閾値ポイント群（1位のスコアも含む）
  totalPlayers: number;            // 総プレイヤー数（cleanup前の件数）
  generatedAt: Timestamp;          // スナップショット生成時刻
  updatedAt: Timestamp;            // firebase-kit自動付与
}

interface ThresholdEntry {
  rank: number;        // 閾値の順位（1, 2, ..., 10, 20, 30, ..., 100, 200, ..., 1000, 2000, ..., 10000）
  score: number;       // その順位のスコア
}
```

**閾値の生成ルール:**

| 順位範囲 | 粒度 | 生成されるポイント |
|---------|------|------------------|
| 1〜10位 | 1刻み | 1, 2, 3, ..., 10 |
| 10〜100位 | 10刻み | 10, 20, 30, ..., 100 |
| 100〜1000位 | 100刻み | 100, 200, 300, ..., 1000 |
| 1000〜10000位 | 1000刻み | 1000, 2000, ..., 10000 |
| 10000位超 | — | 圏外として扱う |

**設計判断:**
- ドキュメントは `latest` の1つのみ。履歴管理は不要（スナップショットは使い捨て）
- スナップショットのサイズ: thresholds(10+9+9+9=37) = 最大37エントリ。1KBにも満たない
- Firestoreの1ドキュメント読み取りで全閾値が取得できるため、レイテンシ・コスト共に最小
- 1〜10位も閾値として格納。他プレイヤー名は不要なため、スコアのみで十分

## 近似ランキングアルゴリズム

### calculateApproxRank の詳細

```
入力: score（プレイヤーのスコア）
出力: { rank: number, isApprox: boolean }

1. thresholds（rankの昇順＝scoreの降順でソート済み）を走査
   - score >= thresholds[0].score → rank=1, isApprox=false
   - score >= thresholds[i].score を満たす最後の i を見つける
     → upperBound = thresholds[i]   (例: rank=20, score=15000)
     → lowerBound = thresholds[i+1] (例: rank=30, score=12000)

2. 線形補間 + ランダムジッター
   - ratio = (upperBound.score - score) / (upperBound.score - lowerBound.score)
   - baseRank = upperBound.rank + (lowerBound.rank - upperBound.rank) * ratio
   - jitter = random(-粒度*0.1, +粒度*0.1)  ← 「ある程度ランダムにする」要件
   - approxRank = Math.round(baseRank + jitter)
   - clamp(approxRank, upperBound.rank+1, lowerBound.rank-1)

3. スコアが全閾値以下 → rank > 10000 → 圏外

戻り値: { rank: approxRank, isApprox: true }
```

**設計判断:**
- ジッターの振れ幅は閾値間の粒度の10%。大きすぎると不信感、小さすぎると「いつも同じ」
- clampで上位・下位の閾値を超えないことを保証
- isApproxフラグでフロントエンドが表示方法を変えられる（「約○位」vs「○位」）
- 1〜10位の間は粒度1なので正確な順位が出る（ジッター範囲が0.1未満→丸めで消える）

## API Design

### POST /api/scoreboard/sessions

ゲーム起動時にブラウザ環境情報を送信し、セッションIDを取得する。

**Request:**
```json
{
  "userAgent": "Mozilla/5.0 ...",
  "platform": "MacIntel",
  "screenWidth": 1920,
  "screenHeight": 1080,
  "devicePixelRatio": 2,
  "touchSupport": 0,
  "language": "ja",
  "languages": ["ja", "en-US"],
  "cookieEnabled": true,
  "hardwareConcurrency": 8,
  "deviceMemory": 8,
  "viewportWidth": 1200,
  "viewportHeight": 800,
  "colorDepth": 24,
  "connectionType": "4g",
  "connectionDownlink": 10,
  "referrer": "https://example.com/",
  "utmSource": "twitter",
  "timezone": "Asia/Tokyo"
}
```

**Validation Schema (withExpressValidation):**
```typescript
const createSessionSchema: ValidationSchema = {
  userAgent: { type: 'string', required: true, maxLength: 500 },
  platform: { type: 'string', required: true, maxLength: 100 },
  screenWidth: { type: 'number', required: true, min: 0, max: 10000 },
  screenHeight: { type: 'number', required: true, min: 0, max: 10000 },
  devicePixelRatio: { type: 'number', required: true, min: 0, max: 10 },
  touchSupport: { type: 'number', required: true, min: 0, max: 100 },
  language: { type: 'string', required: true, maxLength: 20 },
  languages: { type: 'array', required: true, maxLength: 20 },
  cookieEnabled: { type: 'boolean', required: true },
  hardwareConcurrency: { type: 'number', required: true, min: 0, max: 256 },
  deviceMemory: { type: 'number', required: false, min: 0, max: 1024 },
  viewportWidth: { type: 'number', required: true, min: 0, max: 10000 },
  viewportHeight: { type: 'number', required: true, min: 0, max: 10000 },
  colorDepth: { type: 'number', required: true, min: 0, max: 48 },
  connectionType: { type: 'string', required: false, maxLength: 20 },
  connectionDownlink: { type: 'number', required: false, min: 0, max: 1000 },
  referrer: { type: 'string', required: false, maxLength: 2000 },
  utmSource: { type: 'string', required: false, maxLength: 200 },
  timezone: { type: 'string', required: true, maxLength: 100 },
};
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123def456"
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

### POST /api/scoreboard/scores

スコア+プレイログ送信 + 近似順位の即時返却。
スコアはscoresコレクションに保存し、playLogはsessionsドキュメントにupdateで追記する。

**Request:**
```json
{
  "sessionId": "abc123def456",
  "score": 11500,
  "playDurationSec": 180,
  "playLog": {
    "character": "samurai",
    "kills": 12,
    "deathCause": "落下",
    "deathTime": 178,
    "combos": [3, 5, 2]
  }
}
```

**Validation Schema (withExpressValidation):**
```typescript
const submitScoreSchema: ValidationSchema = {
  sessionId: { type: 'string', required: true, maxLength: 100 },
  score: { type: 'number', required: true, min: 0, max: 999999999 },
  playDurationSec: { type: 'number', required: true, min: 1, max: 7200 },
  playLog: {
    type: 'object',
    required: true,
    custom: (value: unknown): ValidationResult => {
      const size = JSON.stringify(value).length;
      if (size > 5120) {
        return { valid: false, message: 'playLogは5KB以内にしてください' };
      }
      return { valid: true, message: null };
    },
  },
};
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "scoreId": "abc123",
    "rank": 2134,
    "isApprox": true,
    "totalPlayers": 8523
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "入力値が不正です"
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

### GET /api/scoreboard/thresholds

閾値データ取得（フロントがゲーム開始時にプレロード）。

**Response (200):**
```json
{
  "success": true,
  "data": {
    "thresholds": [
      { "rank": 1, "score": 50000 },
      { "rank": 2, "score": 48000 },
      { "rank": 10, "score": 30000 },
      { "rank": 20, "score": 25000 },
      { "rank": 100, "score": 15000 },
      { "rank": 1000, "score": 5000 },
      { "rank": 10000, "score": 500 }
    ],
    "totalPlayers": 8523,
    "generatedAt": "2026-03-15T09:55:00.000Z"
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

**スナップショット未生成時 (200):**
```json
{
  "success": true,
  "data": {
    "thresholds": [],
    "totalPlayers": 0,
    "generatedAt": null
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

## Scheduled Function: generateRankSnapshot

### 設計

```typescript
export const generateRankSnapshot = functions
  .region('asia-northeast1')
  .runWith({ timeoutSeconds: 120, memory: '256MB', maxInstances: 1 })
  .pubsub.schedule('every 15 minutes')
  .timeZone('Asia/Tokyo')
  .onRun(async () => {
    await scoreboardService.regenerateSnapshot();
  });
```

**スナップショット生成 + cleanup ロジック:**

1. `scores` コレクションの総件数をカウント（集計クエリ）
2. `scores` コレクションを `score DESC` でクエリ（limit: 10000）
3. 結果から閾値ポイントを抽出:
   - 1, 2, 3, ..., 10位のスコア → thresholds
   - 10, 20, 30, ..., 90位のスコア → thresholds
   - 100, 200, ..., 900位のスコア → thresholds
   - 1000, 2000, ..., 10000位のスコア → thresholds
4. `rankSnapshots/latest` を上書き更新
5. **cleanup**: 10001位以降の **scores** ドキュメントをバッチ削除
   - 10000位のスコアを基準に `score < threshold10000` でクエリ
   - Firestoreバッチ（500件ずつ）で削除
   - **sessionsは削除しない**（playLogを永続化するため）

**maxInstances: 1 の理由:**
- スナップショット生成+cleanupは排他的でよい。同時実行する意味がない
- コスト暴走防止（CLAUDE.md 6j 準拠）

**15分間隔の根拠:**
- リアルタイム性は諦める方針なので、15分の遅延は許容範囲
- Firestoreの読み取りコスト: 最大10000 reads/15分 = 1日最大96万reads
- 初期はプレイヤー数が少ないため、読み取り量は実質的に小さい
- cleanupにより scores コレクションは常に10000件以下に維持される

## Security

### スコア不正送信対策

1. **入力バリデーション** (withExpressValidation)
   - score: 0〜999999999の整数
   - playDurationSec: 1〜7200（最大2時間）
   - sessionId: 必須、100文字以内
   - playLog: 必須、object型、JSON.stringify後5KB上限（customバリデーター）

2. **スコア妥当性チェック** (scoreboardService内)
   - `score / playDurationSec` が異常に高い場合は拒否（閾値はゲームバランスに依存、初期値: 1000点/秒）
   - 極端に短いプレイ時間（例: 5秒未満）で高スコアは拒否

3. **セッション存在チェック**
   - スコア送信時にsessionIdの存在をFirestoreで確認
   - 存在しないsessionIdの場合は400エラー
   - セッション存在チェックとplayLog更新を兼ねる（存在しなければupdateDocumentがエラーになる）

4. **レートリミット**
   - 同一IPからの送信を10秒間隔に制限（Express middleware）
   - 実装: メモリ内Map（Cloud Functionsインスタンス単位）で簡易管理
   - 本格的なレートリミットが必要になった段階でRedis等に移行

5. **err.message のクライアント返却禁止** (CLAUDE.md 6f 準拠)
   - catch内ではジェネリックメッセージのみ返却
   - 詳細はfunctions.logger.errorでサーバーログに出力

### CSP更新

`firebase.json` の Content-Security-Policy（実装済み）:

```
script-src 'self' https://www.googletagmanager.com
connect-src 'self' https://www.google-analytics.com https://analytics.google.com
         https://stats.g.doubleclick.net https://firebaseinstallations.googleapis.com
         https://firebase.googleapis.com
```

- `connect-src 'self'` — Hosting経由のAPI呼び出し（`/api/**` → Functions リライト）
- `https://www.googletagmanager.com` — Firebase Analytics (GA4) SDK
- Analytics関連ドメイン — イベント送信先

Firebase Analytics SDKは `/__/firebase/` 予約URLから読み込み（`script-src 'self'` で許可済み）。

## firebase.json 更新案

```json
{
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**",
      "public/archive/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Content-Security-Policy", "value": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'" }
        ]
      }
    ]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

**変更点:**
- `hosting.rewrites` 追加（`/api/**` → `api` Function）
- `connect-src 'none'` → `connect-src 'self'`（Hosting経由なのでselfで十分）
- `functions` セクション追加
- `firestore` セクション追加

## Error Handling

### Error Scenarios

1. **スナップショット未生成でスコア送信**
   - **Handling:** `rankSnapshots/latest` が存在しない場合、近似順位計算をスキップし `rank: null, isApprox: false` で返却
   - **User Impact:** 順位は表示されないが、スコアは保存される。次回スナップショット生成後から順位が有効になる

2. **不正なスコア送信**
   - **Handling:** withExpressValidation で400エラー。妥当性チェック失敗時も400。playLog 5KB超過時もcustomバリデーターで400
   - **User Impact:** 「入力値が不正です」のジェネリックメッセージ

3. **存在しないsessionIdでスコア送信**
   - **Handling:** sessionsドキュメントへのupdateDocument失敗で検出 → 400エラー
   - **User Impact:** 「入力値が不正です」のジェネリックメッセージ

4. **sessionsへのplayLog追記失敗（scores保存は成功）**
   - **Handling:** scores createDocument成功後にsessions updateDocumentが失敗した場合、スコアは保存済みだがplayLogが欠損する。エラーをログに記録し、クライアントには正常応答（スコアと順位は返す）
   - **User Impact:** 影響なし（playLogは分析用データであり、ユーザー体験には影響しない）

5. **Firestore障害**
   - **Handling:** try/catch で捕捉し、functions.logger.error でログ出力。クライアントには500 + ジェネリックメッセージ
   - **User Impact:** 「サーバーエラーが発生しました」

6. **スナップショット生成の失敗**
   - **Handling:** Scheduled Functionが失敗しても次の15分後に再試行される。古いスナップショットが残るだけで、サービスは継続
   - **User Impact:** 影響なし（スナップショットが最大15分古い程度）

7. **cleanup失敗**
   - **Handling:** スナップショット更新後にcleanupが失敗しても、スナップショット自体は正常。次回のregenerateSnapshotで再試行される
   - **User Impact:** 影響なし（scoresコレクションが一時的に10000件超になるだけ）

## Testing Strategy

### Unit Testing
- **scoreboardService.createSession**: セッション作成、IPアドレス付与
- **scoreboardService.saveScore**: スコア保存 + sessionsへのplayLog追記が正しく行われること
- **scoreboardService.calculateApproxRank**: 各順位帯での近似計算が正しいか
  - 1〜10位のスコア → 正確な順位（ジッターが丸めで消える）
  - 閾値間のスコア → 線形補間+ジッターが範囲内
  - 全閾値以下 → 圏外
  - スナップショット未生成時 → null
- **scoreboardService.regenerateSnapshot**: 閾値の抽出ロジック
  - 10件未満のスコアデータ → 存在する分だけthresholdsに格納
  - 10000件 → 全閾値が正しく抽出されること
  - 10000件超 → 超過分のscoresがcleanup対象になること（sessionsは削除されないこと）
- **playLogサイズバリデーション**: 5KB境界テスト（customバリデーター）

### Integration Testing
- POST /api/scoreboard/sessions → Firestoreにセッションドキュメント作成確認
- POST /api/scoreboard/scores → scoresにスコアドキュメント作成 + sessionsにplayLog追記確認
- セッション→スコアの紐付け（sessionIdの参照整合性）
- GET /api/scoreboard/thresholds → スナップショット返却確認
- バリデーション拒否ケース（不正値、playLog 5KB超過、存在しないsessionId等）
- cleanup動作確認（10000件超投入→regenerateSnapshot→scoresが10000以下に、sessionsは残存）

### E2E Testing
- セッション作成 → スコア送信 → 閾値取得 → 順位が妥当な範囲にあること
- セッション作成 → スコア送信 → sessionsドキュメントにplayLogが追記されていること

## Appendix: コスト見積もり

### Firestore
- **セッション書き込み**: 1セッション = 1 write（ゲーム起動時）
- **セッション更新（playLog追記）**: 1プレイ = 1 write（スコア送信時）
- **スコア書き込み**: 1プレイ = 1 write
- **スナップショット更新**: 15分に1回 = 1日96 writes
- **スナップショット読み取り**: プレロード1回 + スコア送信時1回 = 2 reads/プレイヤー
- **セッション存在チェック**: updateDocumentで兼用するため追加readなし
- **スナップショット生成時のread**: 最大10000 reads/15分 = 1日最大96万reads
- **cleanup時のdelete**: 超過分のscoresのみ。sessionsは削除しない

### コスト最適化の効果
- 15分間隔により読み取りは5分間隔の1/3に削減
- cleanupによりscoresコレクションが肥大化しない → クエリコストが一定
- sessionsコレクションはcleanup対象外だが、ユニークセッション単位なので肥大化しにくい
- playLogのsessions配置により、cleanup時のデータロスを回避しつつ分析データを永続化
- プレイヤー数が少ないうちは実質的にさらに少ない（1000人なら1000reads/生成）
