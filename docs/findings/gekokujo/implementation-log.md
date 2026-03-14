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
