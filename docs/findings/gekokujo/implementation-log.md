# concept-final.html 実装ログ

## 概要
下克上オンラインのメインゲームファイル。全機能はこの1ファイルに集約されている。

## Phase 1: 初回作成（12:11）
- Write操作でファイル全体を作成
- 案1(Arena) + 案5(Parade)の合体版
- 色付き矩形による描画（スプライト未実装）

## Phase 2: フォント/テーマ変更（12:25~13:55）
- Google Fonts → ローカルYamaFont(@font-face)
- font-family: 'Chika', 'YamaFont', sans-serif
- mikiyu-newpenji-pフォントへの差替

## Phase 3: タイトル・UI変更（13:37~13:55）
- タイトル画面: h1テキスト → title-image-wrapperで画像表示
- タイトル画像: sprites/ディレクトリの画像を使用
- キャラ選択画面: 絵文字 → char-imgでスプライト画像
- CSSテーマ: 茶色系 → 白黒モダン（ボタン角丸、白背景）
- リザルト画面: ランク表示を金色大文字化

## Phase 4: ゲームプレイ改善（14:18~14:57）
- 攻撃差別化（キャラ別の攻撃パターン）
- 一揆システム（農民専用→Qキー手動発動）
- 辻斬りQTEシステム（キャラ別倍率: 足軽1.3、農民0.8）
- カウントダウン演出
- 城ダイアログ修正
- 辻斬り頻度調整
- 川渡り不可 + 橋設置
- 回避(Dodge)削除、SPACE→QTE専用

## Phase 5: タイルマップ描画システム（15:21~16:22）

### 主要コンポーネント
- **TileMapper**: タイルシートからの切り出し定義
  - grass, grassVariants, grassDecor
  - water, waterEdge (top/bottom/left/right)
  - stoneWall, castleTower
  - 座標はKenney Roguelike RPG Pack基準
- **TILE_SIZE**: ソース上のタイルサイズ（16px）
- **RENDER_TILE_SIZE**: 描画時のタイルサイズ（32px）
- **tilesheetImg**: タイルシート画像読み込み（new Image()）
- **TerrainTileCache**: ブロック別のオフスクリーンキャンバスでプリレンダリング
- **川描画のタイルベース化**: buildRiverCanvas

### タイルシート画像パス
docs/findings/sozai/ ディレクトリ内のKenneyアセットを使用

## Phase 6: キャラスプライト画像（17:11~17:45）

### 主要コンポーネント
- **spriteImages**: キャラ画像の辞書（key→Image）
- **SPRITE_DEFS**: キャラ種別ごとのスプライト定義（ファイルパス、サイズ）
- **描画変更**: ctx.fillText(emoji) → ctx.drawImage(spriteImg)
  - プレイヤー、敵、仲間NPC、民間人すべて
- **facingLeft**: キャラの左右反転（ctx.scale(-1,1)）
- **キャラ選択画面**: char-cardにimg要素追加（sprites/xxx_play.png）

### スプライト画像パス
public/sprites/ ディレクトリ:
- farmer_play.png（農民）
- ashigaru_play.png（足軽）
- merchant_play.png（商人）
- 敵スプライト各種

## Phase 7: バランス調整（18:11~19:44）
- CHAR_DEFS: recruitTime逆転、followerBonus調整
- 商人リワーク: 傭兵削除→石高リクルート
- ShoninSystem追加
- 行列攻撃(paradeAttack)全キャラ解放
- キャラサイズ1.8倍

## Phase 8: バランス大改修 + UX改善（2026-03-15）

### 主要変更

#### ピクミン式パレード転換
- ParadeController: スネーク式追従 → 軌道周回（orbitAngle/orbitRadius per member, lerp 0.1）
- 仲間がプレイヤー周囲40-80pxを旋回し、近接敵を自動攻撃
- ボスレイド中はボスも攻撃対象

#### Q能力再設計
- 農民: 一揆（変更なし）
- 足軽: 十文字 → 鼓舞（KobuSystem）: 5秒間攻撃CD 1.0→0.3、CD15秒、コストなし
- 商人: 同士討ち → 買収（BaishuSystem）: 5秒間150px半径、敵を味方化、50石コスト、CD15秒

#### 商人経済ナーフ
- 城下町収入 10→5 石/秒、村収入 4→3 石/秒
- 維持費 0.15→0.3 石/人/秒
- 自動雇用コスト 10→15 石、CD 2→3秒
- 初期石高 1000→500
- 農民recruitTime 600→400ms

#### 投射物絵文字
- 農民🪓、足軽🌙、商人🧮（32px、6rad/s回転）

#### 辻斬り調整
- 城・ボスレイド中は発生しない
- 発生率 5% → 2.5%（半減）
- 失敗時 HP50%ダメージ → 即死

#### FloatingScoreSystem
- +N（苔色）/ -N（朱色）のフローティング数値UI
- 地形収入は3秒バッファ、最大5個同時表示

#### オンボーディングスケルトン
- OnboardingSystem: ローカルストレージ制御、和紙パネル表示、「次回から表示しない」チェックボックス

#### ボス撃破ロックマン演出
- 2秒スローモー（0.05x） + 0.8秒白フラッシュ
- ボス点滅（0.08秒トグル） + 0.25秒間隔🔥爆発
- 最終6連爆発 → ボス消滅 → リザルト画面遷移
- endGamePending パターンで演出完了まで画面遷移を遅延

#### ボスHP調整
- 初期: max(30, 60+rIdx*40-reduction)
- 2倍化: max(60, 120+rIdx*80-reduction)
- 25%減: max(45, 90+rIdx*60-reduction) ← 最終値

#### 民衆スポーン距離ベース化
- ブロック重み → 村・城下町中心からの距離減衰（Math.random()*Math.random()、maxRadius=600）

#### 城下町付近の敵スポーン低下
- 中心で70%リジェクト、400px以遠で0%（線形減衰）

#### 2倍速モード
- キャラ選択時Qキー押下で2倍速プレイ（gameState.speedMultiplier=2）

#### その他修正
- 家の川沈みバグ修正（中心点のみ→左右エッジもチェック）
- 城の衝突判定追加（家が城テレインと重ならない）

### コミット履歴
- bd27f15: ピクミン式転換・Q能力再設計・経済リバランス・UI追加
- 12d27c7: ボス攻撃対応+城衝突判定
- 6c7bed8: 回転絵文字投射物
- 1979b78: 絵文字拡大+ボス演出+川沈みバグ修正
- c300ea2: ボス演出遅延+民衆距離ベース化
- 8e8e7c2: 城下町付近敵スポーン低下
- fcd17c7: 2倍速モード
- 5203214: ボス撃破演出強化
- 11980aa: ボスHP2倍
- (未コミット): ボスHP25%減、辻斬り即死+発生率半減、ロックマン式ボス演出

## 技術構成
- 単一HTML + inline CSS + inline JS
- Canvas APIによる描画
- タイルシートベースの地形描画
- スプライトベースのキャラクター描画
- 絵文字フォールバックなし（スプライト必須）

## アセット依存
- fonts/: Chika, YamaFont, mikiyu-newpenji-p
- public/sprites/: キャラスプライト画像群
- docs/findings/sozai/kenney_roguelike-rpg-pack/: タイルシート
- docs/findings/sozai/: タイトル画像、フォントファイル

## 復元作業ログ（2026-03-14 インシデント後）

### インシデント概要
`git checkout -- public/concept-final.html` の誤実行により、未コミットの全変更が消失。
セッションログのサブエージェント記録から変更内容を抽出し復元した。

### 復元Phase一覧

#### Phase 3: タイトル画像・UI変更
- **適用**: 23件（自動13件 + 手動10件）、**スキップ**: 7件
- Google Fonts (M PLUS Rounded 1c) リンク追加
- body背景色 `#e8e0d0` → `#fafafa`
- フォントファミリーを `YamaFont` → `M PLUS Rounded 1c` に統一
- カラーパレットを和風テーマ（茶系）→モダンモノクロ（`#1a1a1a`ベース）に変更
- title-image-wrapper CSSとタイトル画像（title3.jpg）追加
- .btn, .char-card, .dialog-box等のCSS全面更新
- Canvas描画の色を全てモノクロ系に統一
- ソースログ: `agent-a8b4942bb`, `agent-a4db10d21`

#### Phase 4: ゲームプレイ改善
- **適用**: 16件（自動10件 + 手動6件）、**スキップ**: 2件
- IkkiSystem: tryActivate方式 → Qキー直接発動＋flashTimer方式に全面改修
- TsujigiriSystem: スケジュール制 → QTE（cutin→input→resolve）方式に全面改修
- 辻斬り頻度: テレイン依存の確率調整（山2倍、村0.5倍、城下町0.3倍）
- パレードメンバーが農民の場合、近接敵を自動攻撃
- 敵がパレードメンバーを攻撃する機能追加（HP=1即死）
- 一揆HUD表示改善（flashエフェクト＋クールダウン/必要人数表示）
- GameDirectorにカウントダウン機能追加（3→2→1→始め!）
- ソースログ: `agent-a398581fa`, `agent-afe184b76`, `agent-a685849ef`

#### Phase 5: タイルマップ描画システム
- **適用**: 15件（自動15件 + 手動数件）、**スキップ**: 3件
- TERRAIN_TYPES拡張
- TerrainManager: 水平川→垂直川に変更（riverY/riverH → riverX/riverW）
- 川生成ロジック: 垂直川、河幅ランダム（60-150px）
- 橋サイズ: 川幅に連動（riverWidth + 20）
- isInRiver判定: Y軸→X軸に変更
- ミニマップ: 川表示を垂直に修正
- ソースログ: `agent-aee73f287886a11b1`, `agent-a5d942e993bba1cf7`, `agent-aeefd4cf531cccab3`, `agent-a0e1186c5bee71f53`

#### Phase 6: キャラスプライト画像
- **適用**: 14件（自動5件 + 手動9件）、**スキップ**: 3件
- spriteImages/SPRITE_DEFS/CHAR_SPRITE_MAP定義
- loadAllSprites関数、drawSpriteCentered関数
- GameDirector.init: tilesheet + sprite並列ロード対応
- PlayerController.draw: emoji → スプライト描画（facingLeft対応）
- EnemyManager.draw: emoji → スプライト描画（nobushi/tsujigiri/tonosama使い分け）
- ParadeController.draw: emoji → nomin_npcスプライト描画
- 城ブロック/城下町/村ブロック: スプライト描画＋HouseManager
- キャラ選択: 商人にスプライト画像追加
- CHAR_SPRITE_MAPにmerchant→shonin_playマッピング追加
- ソースログ: `agent-a077ad88113ec2501`, `agent-a5cdfebe3a37de9c6`

### ファイルサイズ変化
- 復元前: 2715行
- 復元後: 3510行（+795行）

### 復元に使用したセッションログ
ベースパス: `~/.claude/projects/-Users-s-tsukamoto-projects-bengo4-labo/1c303987-5a08-41a4-8817-899016385d7a/subagents/`

### 教訓
- 大規模変更は必ず途中コミットする
- `git checkout -- <file>` は未コミット変更を不可逆に消す破壊的コマンド
- セッションログにEdit操作の完全な記録が残るため、復元は可能だが非常に時間がかかる
