# Requirements Document: フロントエンド JS → TypeScript 移行

## Introduction

gekokujo-online のフロントエンドコード（Canvas 2D ゲーム、バニラ ES5 JavaScript、約5,500行）を TypeScript に移行し、型安全性の確保・ビルドパイプライン導入・本番コードの難読化を実現する。

バックエンド（`functions/`）は既に TypeScript で実装済みであり、フロントエンドのみが対象。

## Alignment with Product Vision

- **品質向上**: 型チェックにより実行時バグを減らし、ゲーム体験の安定性を高める
- **開発速度向上**: エディタ補完・型推論による開発効率の改善
- **ソースコード保護**: 本番デプロイ時の minify + 難読化で、ゲームロジックの露出を防ぐ
- **保守性**: モジュールシステム導入により、5,500行超のグローバル変数依存コードを構造化する

---

## 1. 移行の目的

| 目的 | 詳細 |
|------|------|
| 型安全性によるバグ防止 | グローバルオブジェクト間の暗黙の依存を型で明示化。Canvas API の引数ミス、gameState のプロパティ参照ミスをコンパイル時に検出 |
| ビルドパイプライン導入 | TS compile → bundle → minify/難読化の自動化。現在はビルドステップなしで JS を直接デプロイしている |
| エディタ支援 | VS Code の補完・型チェック・リファクタリング支援を活用可能にする |
| 本番コードの難読化 | Terser による minify + 難読化で、ゲームバランス定数やスコア計算ロジックの解析を困難にする |

---

## 2. 現状分析

### 2.1 JSファイル一覧・行数・役割

| ファイル | 行数 | 役割 |
|----------|------|------|
| `constants.js` | 106 | ゲーム定数（マップサイズ、キャラ定義、敵定義、ランク、地形、フォント） |
| `api.js` | 109 | スコアボードAPI通信（セッション作成、スコア送信、閾値取得） |
| `sprites.js` | 26 | スプライト定義（画像キー・サイズ・キャラマッピング） |
| `utils.js` | 66 | ユーティリティ（スプライト描画ヘルパー、スプライト一括読み込み） |
| `input.js` | 72 | キーボード・マウス入力管理（InputManager） |
| `camera.js` | 47 | カメラ制御（CameraController: 追従・座標変換・可視判定） |
| `terrain.js` | 328 | マップ生成（MapGenerator）・地形管理（TerrainManager）・木配置（TreeManager） |
| `entities.js` | 1,003 | プレイヤー・敵・民間人・弾丸・行列管理（PlayerController, EnemyManager, CivilianManager, ParadeController, ProjectileManager） |
| `combat.js` | 733 | 戦闘システム（KokuReward, ParadePhysics, ParadeSplitter, IntimidationSystem, ParadeChargeSystem, CombatSystem, TsujigiriSystem, KobuSystem, BaishuSystem） |
| `economy.js` | 76 | 商人経済システム（ShoninSystem: 石高収入・支出・傭兵雇用） |
| `ui.js` | 955 | UI描画（MinimapRenderer, RankingManager, EffectRenderer, AnnouncementSystem, ResultRenderer, ConcentrationLines, BuildingRenderer, FloatingScoreSystem, DamageVignette, OnboardingSystem） |
| `main.js` | 1,945 | ゲーム状態管理・ゲームディレクター・ランクシステム・一揆/下克上システム・橋ボス・家屋管理・テレイン描画・シーン制御・HUD描画 |
| **合計** | **5,466** | |

### 2.2 scriptタグ読み込み順序（index.html）

```
1. constants.js    ← 定数定義（他の全ファイルが依存）
2. api.js          ← ScoreboardApi オブジェクト
3. sprites.js      ← SPRITE_DEFS, spriteImages, CHAR_SPRITE_MAP
4. utils.js        ← drawSpriteCentered, loadAllSprites（sprites.js に依存）
5. input.js        ← InputManager（canvas, CameraController に依存）
6. camera.js       ← CameraController（constants.js に依存）
7. terrain.js      ← MapGenerator, TerrainManager, TreeManager
8. entities.js     ← PlayerController, EnemyManager, CivilianManager, ParadeController, ProjectileManager
9. combat.js       ← CombatSystem, TsujigiriSystem, KobuSystem, BaishuSystem 等
10. economy.js     ← ShoninSystem
11. ui.js          ← MinimapRenderer, EffectRenderer, AnnouncementSystem 等
12. main.js        ← gameState, GameDirector, GekokujoSystem 等（全システムの統合）
```

### 2.3 ファイル間依存関係図

```
constants.js ──────────────────────────────────────────────────────┐
  CANVAS_W/H, MAP_W/H, CHAR_DEFS, RANKS, ENEMY_DEFS,            │
  TERRAIN_TYPES, TONO_BOSS, FONT, FONT_FAMILY                    │
  │                                                                │
  ├─→ すべてのファイルが参照                                       │
  │                                                                │
sprites.js ────────────────────────────────────────────────────────┤
  SPRITE_DEFS, spriteImages, spritesLoaded, CHAR_SPRITE_MAP       │
  │                                                                │
  ├─→ utils.js (drawSpriteCentered, loadAllSprites)               │
  ├─→ entities.js (PlayerController.draw, EnemyManager.draw)      │
  ├─→ combat.js (TsujigiriSystem.draw)                            │
  ├─→ ui.js (BuildingRenderer)                                    │
  └─→ main.js (TerrainRenderer, GekokujoSystem.draw)              │
                                                                   │
api.js ────────────────────────────────────────────────────────────┤
  ScoreboardApi                                                    │
  │                                                                │
  └─→ main.js (GameDirector._initSystems)                         │
  └─→ ui.js (ResultRenderer._submitScoreAndShowRank)              │
                                                                   │
input.js ──────────────────────────────────────────────────────────┤
  InputManager                                                     │
  │  依存: canvas (DOM), CameraController                         │
  │                                                                │
  ├─→ combat.js (CombatSystem, ParadeChargeSystem)                │
  ├─→ entities.js (PlayerController)                              │
  └─→ main.js (GameDirector.update)                               │
                                                                   │
camera.js ─────────────────────────────────────────────────────────┤
  CameraController                                                 │
  │  依存: CANVAS_W/H, MAP_W/H                                   │
  │                                                                │
  ├─→ input.js (InputManager.init)                                │
  ├─→ entities.js (全 draw メソッド)                              │
  ├─→ combat.js (TsujigiriSystem)                                 │
  ├─→ ui.js (MinimapRenderer, EffectRenderer)                     │
  └─→ main.js (IkkiSystem, GameDirector)                          │
                                                                   │
terrain.js ────────────────────────────────────────────────────────┤
  MapGenerator, TerrainManager, TreeManager                        │
  │  依存: constants.js                                           │
  │                                                                │
  ├─→ entities.js (全エンティティの移動・衝突判定)                │
  ├─→ combat.js (ParadePhysics, TsujigiriSystem)                  │
  ├─→ economy.js (ShoninSystem.update)                            │
  ├─→ ui.js (MinimapRenderer)                                     │
  └─→ main.js (BridgeBossSystem, GekokujoSystem, TerrainRenderer) │
                                                                   │
entities.js ───────────────────────────────────────────────────────┤
  PlayerController, EnemyManager, CivilianManager,                 │
  ParadeController, ProjectileManager                              │
  resolveHouseCollision(), resolveCastleCollision()                │
  │  依存: constants, sprites, utils, input, camera, terrain,     │
  │        main.js の gameState, BridgeBossSystem, GekokujoSystem │
  │                                                                │
  ├─→ combat.js (CombatSystem, IntimidationSystem 等)             │
  ├─→ economy.js (ShoninSystem)                                   │
  ├─→ ui.js (ResultRenderer, MinimapRenderer)                     │
  └─→ main.js (GameDirector, IkkiSystem, BridgeBossSystem)       │
                                                                   │
combat.js ─────────────────────────────────────────────────────────┤
  KokuReward, ParadePhysics, ParadeSplitter, IntimidationSystem,  │
  ParadeChargeSystem, CombatSystem, TsujigiriSystem,              │
  KobuSystem, BaishuSystem                                        │
  │  依存: entities, terrain, input, camera, constants,           │
  │        main.js の gameState, BridgeBossSystem, GekokujoSystem │
  │                                                                │
  └─→ main.js (GameDirector.update)                               │
                                                                   │
economy.js ────────────────────────────────────────────────────────┤
  ShoninSystem                                                     │
  │  依存: entities, terrain, constants,                          │
  │        main.js の gameState, GekokujoSystem                   │
  │                                                                │
  └─→ main.js (GameDirector.update)                               │
                                                                   │
ui.js ─────────────────────────────────────────────────────────────┤
  MinimapRenderer, RankingManager, EffectRenderer,                 │
  AnnouncementSystem, ResultRenderer, ConcentrationLines,          │
  BuildingRenderer, FloatingScoreSystem, DamageVignette,          │
  OnboardingSystem                                                 │
  │  依存: entities, terrain, camera, constants, sprites,         │
  │        main.js の gameState, linesCanvas 等の DOM             │
  │                                                                │
  └─→ main.js (GameDirector)                                      │
                                                                   │
main.js ───────────────────────────────────────────────────────────┘
  DOM参照, BgmController, gameState, IkkiSystem,
  BridgeBossSystem, GekokujoSystem, RankSystem,
  HouseManager, TerrainRenderer, GameDirector
  │  依存: 上記すべてのファイル
  │  全システムの init/update/render を統括
```

### 2.4 グローバルオブジェクト一覧

**定数・設定（constants.js + sprites.js）**
- `CANVAS_W`, `CANVAS_H`, `MAP_W`, `MAP_H`, `BLOCK_W`, `BLOCK_H`, `HISTORY_SPACING`, `MAX_TIME`, `MINIMAP_W`, `MINIMAP_H`, `MINIMAP_X`, `MINIMAP_Y`
- `CHAR_DEFS`, `RANKS`, `ENEMY_DEFS`, `TERRAIN_TYPES`, `TONO_BOSS`, `FONT_FAMILY`, `FONT`
- `SPRITE_DEFS`, `spriteImages`, `spritesLoaded`, `CHAR_SPRITE_MAP`

**ユーティリティ（utils.js）**
- `_spriteScaleCache`, `_getCachedSprite()`, `drawSpriteCentered()`, `loadAllSprites()`

**コアシステム（entities.js, combat.js, economy.js）**
- `resolveHouseCollision()`, `resolveCastleCollision()`
- `PlayerController`, `EnemyManager`, `CivilianManager`, `ParadeController`, `ProjectileManager`
- `KokuReward`, `ParadePhysics`, `ParadeSplitter`, `IntimidationSystem`, `ParadeChargeSystem`, `CombatSystem`, `TsujigiriSystem`, `KobuSystem`, `BaishuSystem`
- `ShoninSystem`

**UI（ui.js）**
- `MinimapRenderer`, `RankingManager`, `EffectRenderer`, `AnnouncementSystem`, `ResultRenderer`, `ConcentrationLines`, `BuildingRenderer`, `FloatingScoreSystem`, `DamageVignette`, `OnboardingSystem`

**メイン（main.js）**
- DOM参照: `canvas`, `ctx`, `titleScreen`, `charSelect`, `resultScreen`, `skullScreen`, `dialogOverlay`, `dialogTextEl`, `dialogYesBtn`, `dialogNoBtn`, `linesCanvas`, `ikkiOverlay`, `bgm`, `muteBtn`, `howtoLink`, `creditsLink`, `howtoOverlay`, `creditsOverlay`, `onboardingScreen`
- `BgmController`, `gameState`, `dialogCallback`
- `IkkiSystem`, `BridgeBossSystem`, `GekokujoSystem`, `RankSystem`
- `HouseManager`, `TerrainRenderer`, `GameDirector`
- `ScoreboardApi`（api.js）

---

## 3. 移行方針

### 3.1 段階的移行を採用

**理由**: 5,500行・40以上のグローバルオブジェクトが相互依存する状態を一括移行するとリスクが高い。段階的に移行し、各フェーズで動作確認を挟む。

### 3.2 ビルドツール: Vite を採用

| 候補 | 判定 | 理由 |
|------|------|------|
| **Vite** | **採用** | TypeScript ネイティブサポート、HMR が高速、バックエンドの functions/ と同じ Node.js エコシステム、設定が最小限、Terser プラグインが組み込み |
| webpack | 不採用 | 設定が複雑、このプロジェクト規模にはオーバースペック |
| esbuild | 不採用 | HMR サポートなし、型チェック非対応 |
| Parcel | 不採用 | Canvas ゲームとの相性が未知数、コミュニティが縮小傾向 |

**Vite を選ぶ理由**:
1. `vite dev` で HMR 付き開発サーバーが即起動（Canvas 再描画のデバッグが高速化）
2. `vite build` で Rollup ベースのバンドル + Terser minify が一発
3. `tsconfig.json` との統合がゼロコンフィグ
4. Firebase Hosting へのデプロイは `dist/` を `public` に設定するだけ
5. CLAUDE.local.md の実装方針にも「Vite」が明記されている

### 3.3 tsconfig.json の設定方針

```jsonc
{
  "compilerOptions": {
    // Phase 2: まず緩い設定で通す
    "target": "ES2020",          // 出力は Vite が最終的にバンドルするため、モダンな出力で OK
    "module": "ESNext",          // Vite は ESM を前提とする
    "moduleResolution": "bundler",
    "strict": false,             // Phase 2 では false → Phase 3 で true に切り替え
    "noImplicitAny": false,      // Phase 2 では false → Phase 3 で true
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": [],
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

### 3.4 ES5 縛りを外す（Phase 4 で段階的に）

**方針**: Phase 4 で解禁する。Phase 2-3 では既存の ES5 スタイルのままで型注釈のみ追加。

解禁する構文:
- `const` / `let`（`var` を置換）
- アロー関数（コールバック関数に適用）
- テンプレートリテラル（文字列結合を置換）
- `class` 構文（オブジェクトリテラルの大きなシステムに適用を検討）
- 分割代入、スプレッド構文

**三項演算子は引き続き禁止**（CLAUDE.md 6c に準拠）

### 3.5 モジュールシステム: ES Modules 化（Phase 5）

現在の script タグ読み込み順序が暗黙のモジュール依存を形成している。Phase 5 で `import` / `export` に移行し、依存関係を明示化する。

---

## 4. ビルドパイプライン設計

### 4.1 ディレクトリ構成（移行後）

```
gekokujo-online/
  public/
    index.html          ← Vite が生成する dist/ の内容をここに出力
    assets/             ← 画像・音声（変更なし）
    css/                ← スタイル（変更なし）
  src/                  ← TypeScript ソース（新規作成）
    constants.ts
    api.ts
    sprites.ts
    utils.ts
    input.ts
    camera.ts
    terrain.ts
    entities.ts
    combat.ts
    economy.ts
    ui.ts
    main.ts
  dist/                 ← ビルド出力（.gitignore に追加）
  vite.config.ts
  tsconfig.json
  package.json
```

### 4.2 ビルドフロー

```
[開発時]
  vite dev → HMR 付きローカルサーバー（TS をオンザフライでトランスパイル）

[本番ビルド]
  tsc --noEmit        → 型チェックのみ（エラーがあればここで止まる）
  vite build          → TS → JS → バンドル → Terser minify/難読化
  出力先: dist/

[デプロイ]
  scripts/deploy.sh 内で:
    1. cd frontend && npm run build   ← tsc --noEmit && vite build
    2. cp -r dist/* ../public/        ← Firebase Hosting 用にコピー
    3. firebase deploy --only hosting
```

### 4.3 vite.config.ts（想定）

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,   // 本番では console を除去
      },
      mangle: {
        toplevel: true,       // トップレベル変数名も難読化
      },
    },
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "js/[name]-[hash].js",
        chunkFileNames: "js/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5173,               // dev-restart.sh のポートと競合しない番号
    proxy: {
      "/api": "http://localhost:5001/gekokujo-online/asia-northeast1/api",
    },
  },
});
```

### 4.4 scripts/deploy.sh との統合

既存の deploy.sh に以下を追加:

```bash
# --- フロントエンド TypeScript ビルド ---
echo "[preflight] frontend TypeScript ビルド..."
cd "$ROOT_DIR"
npm run build
echo "[preflight] フロントエンドビルド OK"
```

---

## 5. 移行手順（段階的）

### Phase 1: ビルドツール導入 + 既存 JS をそのまま通す

**目標**: Vite を導入し、既存の .js ファイルをそのまま通して、ビルド・デプロイが壊れないことを確認する。

**作業内容**:
1. `package.json` 作成（Vite, TypeScript を devDependencies に追加）
2. `vite.config.ts` 作成（上記設計に基づく）
3. `tsconfig.json` 作成（`allowJs: true`, `strict: false`）
4. 既存の `public/js/*.js` を `src/*.js` にコピー
5. `index.html` を Vite のエントリポイント形式に変更（`<script type="module" src="/src/main.js">`）
6. `vite dev` で動作確認
7. `vite build` でビルドして Firebase Hosting にデプロイ確認

**完了基準**:
- `vite dev` でゲームが正常に動作する
- `vite build` で minified バンドルが生成される
- Firebase Hosting デプロイ後にゲームが正常に動作する

**注意**: この段階では script タグの読み込み順序依存がまだあるため、`src/main.js` が全ファイルを順序通りにインポートするエントリポイントとして機能する必要がある。具体的には、各 JS ファイルの先頭で `// @ts-nocheck` を付与し、main.js から `import './constants.js'` の形で順序インポートする。

### Phase 2: .js → .ts リネーム + 最小限の型注釈

**目標**: ファイル拡張子を `.ts` に変更し、コンパイルが通る最小限の型注釈を追加する。

**作業内容**:
1. `*.js` → `*.ts` にリネーム
2. `// @ts-nocheck` を除去
3. 暗黙の `any` に対して最小限の型注釈を追加
4. グローバルオブジェクトの型定義ファイル（`types.d.ts` or `globals.d.ts`）を作成
5. `gameState` の型を定義（最重要、全ファイルが参照）
6. Canvas 2D 関連の型（`CanvasRenderingContext2D` 等）を明示

**推奨リネーム順序**（依存の少ないファイルから）:
1. `constants.ts`
2. `sprites.ts`
3. `camera.ts`
4. `utils.ts`
5. `api.ts`
6. `input.ts`
7. `terrain.ts`
8. `economy.ts`
9. `entities.ts`
10. `combat.ts`
11. `ui.ts`
12. `main.ts`

**完了基準**:
- `tsc --noEmit` がエラーなしで通る（`strict: false` の状態）
- ゲームが正常に動作する

### Phase 3: strict mode 有効化 + 本格的な型定義

**目標**: TypeScript の strict mode を有効にし、型安全性を最大化する。

**作業内容**:
1. `tsconfig.json` で `strict: true` を有効化
2. `noImplicitAny: true` により、すべての暗黙の `any` を解消
3. 各システムの interface / type を定義:
   - `GameState`
   - `CharacterDef`, `EnemyDef`, `RankDef`
   - `Enemy`, `Civilian`, `ParadeMember`, `Projectile`
   - `TerrainBlock`, `Bridge`, `House`, `Tree`
   - `Boss`, `BridgeBoss`
   - `Effect`, `Announcement`, `FloatingScoreItem`
4. `null` / `undefined` チェックの厳密化
5. DOM 要素の取得に `document.getElementById` の戻り値の null チェックを追加

**完了基準**:
- `tsc --noEmit --strict` がエラーなしで通る
- ゲームが正常に動作する

### Phase 4: ES5 縛り解除（const/let/arrow 解禁）

**目標**: モダン JavaScript 構文に書き換え、可読性を向上する。

**作業内容**:
1. `var` → `const` / `let` に置換（意味的に正しい方を選択）
2. `function` コールバック → アロー関数に置換
3. 文字列結合 → テンプレートリテラルに置換
4. `for` ループ → `for...of` に置換（適切な箇所のみ。パフォーマンスクリティカルなゲームループ内は `for` のまま維持）
5. `||` 代入パターンの確認と修正（CLAUDE.md 6c 準拠）

**完了基準**:
- 全ファイルがモダン構文に書き換わっている
- ゲームが正常に動作する

### Phase 5: ES Modules 化（import/export）

**目標**: グローバル変数依存を排除し、明示的な import/export でモジュール化する。

**作業内容**:
1. 各ファイルの公開オブジェクトに `export` を付与
2. 依存するオブジェクトを `import` で明示的に取得
3. `gameState` を専用モジュール（`state.ts`）に分離し、全ファイルからインポート
4. DOM 参照を専用モジュール（`dom.ts`）に分離
5. 循環依存の解消（entities.js ↔ main.js 間の相互参照が最大の課題）
6. barrel export（`index.ts`）の導入を検討

**循環依存の解消方針**:
- `entities.js` が `main.js` の `gameState`, `BridgeBossSystem`, `GekokujoSystem`, `skullScreen` 等を参照している
- `main.js` が `entities.js` の全エンティティを参照している
- **解決策**: `gameState` を独立モジュールに抽出し、イベントバス or コールバック注入で循環を断ち切る

**完了基準**:
- `import` / `export` で全依存が明示されている
- グローバル変数が存在しない（`window` への代入がない）
- `vite build` で Tree Shaking が効く状態
- ゲームが正常に動作する

---

## 6. リスクと注意点

### 6.1 Canvas 描画パフォーマンスへの影響

| リスク | 対策 |
|--------|------|
| バンドル後のコードサイズ増加による初期ロード時間の増加 | Terser の minify で ES5 時代より小さくなる見込み。gzip 圧縮も有効 |
| ゲームループ（60fps）のパフォーマンス劣化 | TypeScript のコンパイル出力は ES5/ES2020 の素の JS であり、ランタイムオーバーヘッドはゼロ。Vite build の出力を Chrome DevTools で計測して確認 |
| HMR 時の Canvas 状態リセット | `vite dev` 時にゲーム状態が HMR で壊れる可能性あり。HMR 非対応の場合はフルリロードにフォールバック |

### 6.2 グローバル変数のモジュール化における注意

| リスク | 対策 |
|--------|------|
| 循環依存（entities ↔ main が最大の問題） | gameState を独立モジュールに抽出。イベントバス or DI パターンで解消 |
| DOM 参照の初期化タイミング | DOM 参照を遅延初期化（関数呼び出し時に取得）に変更するか、DOMContentLoaded 後に初期化 |
| `_spriteScaleCache` 等の内部状態 | モジュールスコープの変数として自然に隠蔽される（export しなければ外部からアクセス不可） |

### 6.3 既存の CSP 設定との整合性

**現在の CSP**（firebase.json より）:
```
script-src 'self'
```

**影響**:
- Vite build の出力は `.js` ファイルとして `self` から配信されるため、本番環境では問題なし
- `vite dev` 時は開発サーバー（localhost:5173）から配信されるため、Firebase Hosting の CSP は適用されない（ローカル開発では問題なし）
- inline script は使用していないため、`script-src 'self'` のままで OK
- ただし、Vite が `index.html` に注入する `<script type="module">` タグがハッシュ付き inline になる場合、CSP の調整が必要になる可能性あり → **Phase 1 で要検証**

### 6.4 その他のリスク

| リスク | 対策 |
|--------|------|
| ビルド出力と既存の `public/js/` の競合 | Phase 1 完了後、`public/js/` は削除し `dist/` からデプロイに切り替え |
| Firebase Hosting の `rewrites` 設定との整合 | API リライト（`/api/**`）は変更不要。static ファイルのパスが変わる場合は `firebase.json` を更新 |
| Google Analytics の動作 | GA は `index.html` 内のスクリプトで動作しており、Vite 移行の影響は受けない |

---

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: 各ファイルは単一のシステム/コンポーネントを管理する。main.ts の 1,945 行は Phase 5 で分割対象
- **Modular Design**: ES Modules により、各システムが独立してテスト・再利用可能な状態にする
- **Dependency Management**: 循環依存を排除し、依存グラフが DAG（有向非巡回グラフ）になること
- **Clear Interfaces**: 全システム間のインターフェースを TypeScript の `interface` / `type` で明示化

### Performance
- ビルド後のバンドルサイズが gzip 圧縮後 100KB 以下であること（現在の非圧縮合計は約 180KB）
- ゲームループが 60fps を維持すること（移行前後で Chrome DevTools の Performance タブで計測・比較）
- 初期ロード時間が移行前と同等以下であること

### Security
- 本番ビルドで Terser による minify + 難読化が適用されること
- `console.log` が本番ビルドから除去されること
- CSP ヘッダー（`script-src 'self'`）が引き続き有効であること

### Reliability
- 全 Phase で、移行前と同一のゲームプレイが再現されること
- TypeScript の strict mode で型エラーがゼロであること
- ビルドエラーが CI/CD で検出可能であること（将来的な GitHub Actions 統合を見据える）

### Usability
- 開発者が `npm run dev` で HMR 付き開発サーバーを起動できること
- `npm run build` で本番ビルドが一発で完了すること
- エディタ（VS Code）で補完・型チェックが機能すること
