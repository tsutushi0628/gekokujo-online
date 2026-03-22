# Tasks: Scoreboard Backend

design.md に基づく TDD（Red → Green → Refactor）順序のタスク分解。
firebase-kit の既存機能を最大限活用する前提。

---

## Phase 1: 型定義

- [ ] 1. 型定義を作成する
  - File: `functions/src/types/scoreboard.ts`
  - SessionDocument, ScoreDocument, RankSnapshotDocument, ThresholdEntry の型定義
  - API リクエスト/レスポンスの型定義（SessionData, ScoreSubmission, ApproxRankResult, SaveScoreResult, ThresholdSnapshot）
  - ValidationSchema 用の定数定義（createSessionSchema, submitScoreSchema）
  - Purpose: 全実装の型安全性基盤
  - _Leverage: firebase-kit/backend (ValidationSchema, FieldRule, CustomValidator, ValidationResult)_
  - _Requirements: design.md Data Models, API Design_
  - _Prompt: Role: TypeScript Developer specializing in type systems | Task: design.md の Data Models および API Design セクションに基づき、Scoreboard 機能の全型定義を作成する。firebase-kit の ValidationSchema/FieldRule/CustomValidator/ValidationResult 型を import して利用すること。playLog の 5KB カスタムバリデーターも定義すること | Restrictions: any 禁止、フォールバック代入禁止、三項演算子禁止、||代入禁止 | Success: npx tsc でエラーなし、design.md の全データ構造をカバー_

---

## Phase 2: Service層（TDD）

### 2-1. createSession

- [ ] 2. createSession のテストを書く（Red）
  - File: `functions/src/services/__tests__/scoreboardService.createSession.test.ts`
  - テストケース: セッション作成成功（sessionId が返る）、IP アドレスが付与される、createdAt/updatedAt が自動付与される
  - firebase-kit の createDocument をモックし、呼び出し引数を検証
  - Purpose: createSession の期待動作を先に定義
  - _Leverage: firebase-kit/backend (createDocument)_
  - _Requirements: design.md Component 2 createSession_

- [ ] 3. createSession を実装する（Green）
  - File: `functions/src/services/scoreboardService.ts`
  - firebase-kit の createDocument('sessions', { ...clientData, ip }) を呼び出し、sessionId を返す
  - Purpose: テストをパスする最小実装
  - _Leverage: firebase-kit/backend (createDocument)_
  - _Requirements: design.md Data Flow 1_

### 2-2. saveScore

- [ ] 4. saveScore のテストを書く（Red）
  - File: `functions/src/services/__tests__/scoreboardService.saveScore.test.ts`
  - テストケース: スコア保存成功（scoreId 返却）、sessionsにplayLog追記、スコア妥当性チェック（score/playDurationSec > 1000 で拒否）、極端に短いプレイ時間（5秒未満で高スコア）で拒否、存在しないsessionIdでエラー
  - firebase-kit の createDocument, updateDocument をモック
  - Purpose: saveScore の全パターンを先に定義
  - _Leverage: firebase-kit/backend (createDocument, updateDocument)_
  - _Requirements: design.md Component 2 saveScore, Security_

- [ ] 5. saveScore を実装する（Green）
  - File: `functions/src/services/scoreboardService.ts`
  - スコア妥当性チェック → createDocument('scores') → updateDocument('sessions', sessionId, { playLog })
  - sessionsへのplayLog追記失敗時: スコアは保存済み、エラーログ記録、正常応答（design.md Error Scenario 4）
  - Purpose: テストをパスする最小実装
  - _Leverage: firebase-kit/backend (createDocument, updateDocument)_
  - _Requirements: design.md Data Flow 2, Error Handling_

### 2-3. calculateApproxRank

- [ ] 6. calculateApproxRank のテストを書く（Red）
  - File: `functions/src/services/__tests__/scoreboardService.calculateApproxRank.test.ts`
  - テストケース: 1位のスコア以上 → rank=1, isApprox=false / 1〜10位間 → 正確な順位 / 閾値間のスコア → 線形補間+ジッターが範囲内 / 全閾値以下 → 圏外(rank=null) / スナップショット未生成時 → rank=null, isApprox=false
  - firebase-kit の getDocument をモック
  - Purpose: 近似ランキングアルゴリズムの正確性を保証
  - _Leverage: firebase-kit/backend (getDocument)_
  - _Requirements: design.md 近似ランキングアルゴリズム_

- [ ] 7. calculateApproxRank を実装する（Green）
  - File: `functions/src/services/scoreboardService.ts`
  - getDocument('rankSnapshots', 'latest') → 閾値走査 → 線形補間 + ランダムジッター → clamp
  - Purpose: テストをパスする最小実装
  - _Leverage: firebase-kit/backend (getDocument)_
  - _Requirements: design.md 近似ランキングアルゴリズム_

### 2-4. getThresholdSnapshot

- [ ] 8. getThresholdSnapshot のテストを書く（Red）
  - File: `functions/src/services/__tests__/scoreboardService.getThresholdSnapshot.test.ts`
  - テストケース: スナップショット取得成功 / スナップショット未生成時 → thresholds: [], totalPlayers: 0, generatedAt: null
  - _Leverage: firebase-kit/backend (getDocument)_
  - _Requirements: design.md Component 2 getThresholdSnapshot, Error Scenario 1_

- [ ] 9. getThresholdSnapshot を実装する（Green）
  - File: `functions/src/services/scoreboardService.ts`
  - getDocument('rankSnapshots', 'latest') → 存在チェック → 返却
  - _Leverage: firebase-kit/backend (getDocument)_
  - _Requirements: design.md Data Flow 3_

### 2-5. regenerateSnapshot

- [ ] 10. regenerateSnapshot のテストを書く（Red）
  - File: `functions/src/services/__tests__/scoreboardService.regenerateSnapshot.test.ts`
  - テストケース: 10件未満のスコア → 存在する分だけ閾値生成 / 10000件 → 全閾値正しく抽出 / 10000件超 → 超過分のscoresがcleanup対象（sessionsは削除されない） / スコア0件 → 空のスナップショット生成
  - firebase-kit の getDb, updateDocument, runBatch をモック
  - Purpose: スナップショット生成+cleanup の正確性を保証
  - _Leverage: firebase-kit/backend (getDb, updateDocument, runBatch)_
  - _Requirements: design.md Scheduled Function, Component 2 regenerateSnapshot_

- [ ] 11. regenerateSnapshot を実装する（Green）
  - File: `functions/src/services/scoreboardService.ts`
  - scores集計クエリ → 閾値抽出 → updateDocument('rankSnapshots', 'latest') → 10001位以降のscoresバッチ削除
  - _Leverage: firebase-kit/backend (getDb, updateDocument, runBatch)_
  - _Requirements: design.md Scheduled Function_

### 2-6. Service層リファクタリング

- [ ] 12. Service層のリファクタリング（Refactor）
  - File: `functions/src/services/scoreboardService.ts`
  - 共通パターンの抽出、関数分割、可読性向上
  - 全テストがグリーンのまま維持されること
  - Purpose: コード品質の向上
  - _Requirements: CLAUDE.local.md コーディングスタイル_

---

## Phase 3: Handler層（TDD）

- [ ] 13. Handler層のテストを書く（Red）
  - File: `functions/src/handlers/__tests__/scoreboardHandlers.test.ts`
  - テストケース: POST /sessions → 201 + sessionId / POST /scores → 201 + rank / GET /thresholds → 200 + thresholds / バリデーションエラー → 400 / サーバーエラー → 500 + ジェネリックメッセージ（err.message返却禁止）
  - scoreboardService をモック、withExpressValidation の動作確認
  - Purpose: Handler層の責務（リクエスト受付・レスポンス返却のみ）を保証
  - _Leverage: firebase-kit/backend (withExpressValidation, createUnifiedResponse, createErrorResponse)_
  - _Requirements: design.md Component 1, Error Handling, Security_

- [ ] 14. Handler層を実装する（Green）
  - File: `functions/src/handlers/scoreboardHandlers.ts`
  - createSession: withExpressValidation(createSessionSchema) → service.createSession → createUnifiedResponse(201)
  - submitScore: withExpressValidation(submitScoreSchema) → service.saveScore → service.calculateApproxRank → createUnifiedResponse(201)
  - getThresholds: service.getThresholdSnapshot → createUnifiedResponse(200)
  - エラーハンドリング: catch → functions.logger.error → createErrorResponse(500, ジェネリックメッセージ)
  - Purpose: テストをパスする最小実装
  - _Leverage: firebase-kit/backend (withExpressValidation, createUnifiedResponse, createErrorResponse)_
  - _Requirements: design.md Component 1, API Design_

---

## Phase 4: エントリポイント + Scheduled Function

- [ ] 15. Express app エントリポイントを作成する
  - File: `functions/src/index.ts`
  - firebase-kit 初期化（project.config.ts から設定読み込み）
  - Express app 定義、cors(), express.json()
  - ルーティング: POST /api/scoreboard/sessions, POST /api/scoreboard/scores, GET /api/scoreboard/thresholds
  - api エクスポート（maxInstances 設定必須 — CLAUDE.md 6j）
  - Purpose: HTTPリクエストのルーティング
  - _Leverage: firebase-kit/backend (firebaseKit.initialize, cors)_
  - _Requirements: design.md Component 3_
  - _Prompt: Role: Backend Developer | Task: Express app エントリポイントを作成。design.md の Component 3 に従い、firebase-kit の initialize, cors を使用。maxInstances 必須（CLAUDE.md 6j）。レートリミットミドルウェアもここで適用 | Restrictions: ログ出力は firebase-kit のロガー経由のみ、三項演算子禁止、||代入禁止 | Success: npx tsc 通過、ルーティングが正しく設定_

- [ ] 16. レートリミットミドルウェアを作成する
  - File: `functions/src/middleware/rateLimiter.ts`
  - 同一IPから10秒間隔の制限（メモリ内Map管理）
  - テストを先に書く（Red → Green）
  - テストファイル: `functions/src/middleware/__tests__/rateLimiter.test.ts`
  - Purpose: スコア不正送信の防止
  - _Requirements: design.md Security 4_

- [ ] 17. Scheduled Function を作成する
  - File: `functions/src/index.ts`（generateRankSnapshot を追加エクスポート）
  - 15分間隔、asia-northeast1、maxInstances: 1、memory: 256MB、timeoutSeconds: 120
  - scoreboardService.regenerateSnapshot() を呼び出すのみ
  - Purpose: 定期的なスナップショット再生成 + cleanup
  - _Leverage: firebase-kit/backend (scoreboardService)_
  - _Requirements: design.md Component 4, Scheduled Function_

---

## Phase 5: 設定・セキュリティ

- [ ] 18. firebase.json を更新する
  - File: `firebase.json`
  - hosting.rewrites 追加（/api/** → api Function）
  - CSP の connect-src を 'self' に変更
  - functions セクション追加
  - firestore セクション追加
  - Purpose: API ルーティングとセキュリティヘッダー設定
  - _Requirements: design.md firebase.json 更新案, CSP更新_

- [ ] 19. Firestore セキュリティルール・インデックスを設定する
  - File: `firestore.rules`, `firestore.indexes.json`
  - クライアント直アクセス禁止（Admin SDK経由のみ）
  - scores の score DESC インデックス（単一フィールド、自動作成だが明示宣言推奨）
  - Purpose: データアクセスの保護
  - _Requirements: design.md Security, Data Models_

---

## Phase 6: 統合テスト + 型チェック

- [ ] 20. 統合テストを書く
  - File: `functions/src/__tests__/integration/scoreboard.integration.test.ts`
  - セッション作成 → スコア送信 → sessionsにplayLog追記確認
  - バリデーション拒否ケース（不正値、playLog 5KB超、存在しないsessionId）
  - 閾値取得（スナップショット存在時/未生成時）
  - Purpose: コンポーネント間の結合確認
  - _Requirements: design.md Integration Testing_

- [ ] 21. 最終ビルド確認
  - npx tsc でコンパイルエラーなし
  - 全テスト通過
  - CLAUDE.md 禁止事項の最終チェック（三項演算子、||代入、ログ出力、err.message返却、maxInstances未設定）
  - Purpose: 本番デプロイ品質の保証
  - _Requirements: CLAUDE.md, CLAUDE.local.md_
