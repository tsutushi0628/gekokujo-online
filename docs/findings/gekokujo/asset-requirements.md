# 下克上オンライン — 素材要件 & AI生成プロンプト案

## 基本方針

**原作再現性 > ゲーム性**。漫画に描かれた「下克上オンライン」の画面を忠実に再現することが最優先。

### 漫画から読み取れるビジュアルスタイル

| 要素 | 漫画の描写 |
|------|-----------|
| 背景色 | 白ベース（ゲーム中）/ 黒（失敗画面のみ） |
| 線画 | シンプルな黒の手書き風線。均一な太さではなく、筆圧に強弱がある |
| 色使い | 最小限。地面はベージュ/薄茶、草は緑の短い線、橋の欄干は紫/ピンク |
| キャラ | 2〜3頭身のデフォルメ。丸っこいシルエット。ちいかわ風だがちいかわキャラではない |
| 文字 | 和風筆文字（タイトル・リザルト）。UI文字は手書き風ゴシック |
| UI | 角丸の吹き出し/ダイアログ。シンプルで装飾少なめ |
| エフェクト | 集中線（リザルト）。吹っ飛び時のモーションライン。シンプルな衝撃波 |

---

## 1. 素材インベントリ（完全版）

### 1-A. タイトル / UI画面素材

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| title | タイトルロゴ「下克上」筆文字 | 512×256px | 1 | 必須 | title.png完全準拠。筆文字「下克上」+ 小さく「GEKOKUJO」+「オンライン」 |
| title | タイトル背景 | 画面全体 | 1 | 必須 | 白背景。タイトルロゴ+3キャラ配置 |
| title | STARTボタン | 128×48px | 2 | 必須 | 通常/ホバー。title.pngのSTART準拠。手書き風囲み |
| title | キャッチコピー「刮目せよ 下克上を...」 | 320×48px | 1 | 必須 | 筆文字風テキスト画像 |
| UI | キャラ選択画面 | 画面全体 | 1 | 必須 | 3キャラの立ち絵+名前+説明。白背景 |
| UI | キャラ選択カーソル | 可変 | 2 | 必須 | 手書き風の囲み線（点滅） |
| UI | ダイアログボックス（汎用） | 320×128px | 1 | 必須 | ikki.pngの角丸ダイアログ準拠 |
| UI | 選択肢ボタン「はい」「いいえ」 | 96×40px | 4 | 必須 | 通常/選択状態 × 2。ikki.png準拠 |
| UI | 「下克上を仕掛ける？」ダイアログ | 320×128px | 1 | 必須 | |
| UI | 「一揆に参加する？」ダイアログ | 320×128px | 1 | 必須 | ikki.png完全準拠 |
| UI | 「挑戦的！」吹き出し | 96×48px | 1 | 必須 | ikki.png準拠 |
| UI | リザルト画面（通常終了） | 画面全体 | 1 | 必須 | 白背景+集中線。「お主は ○○位」。数字は黄色 |
| UI | リザルト画面（下克上成功） | 画面全体 | 1 | 必須 | result_success_gekokujo.png完全準拠。「下克上成功!!」+集中線+黄色数字 |
| UI | リザルト画面（下克上失敗） | 画面全体 | 1 | 必須 | result_failure.png完全準拠。**黒背景**+「下克上失敗.....」+ドクロ |
| UI | 「辻斬りにあってしまった」バナー | 320×64px | 1 | 必須 | tsujigiiri.pngの下部バナー準拠。薄ピンク背景に黒文字 |
| UI | 石高カウンター（HUD） | 192×32px | 1 | 必須 | 画面上部常時表示。「石高: ○○○」 |
| UI | 身分表示（HUD） | 128×32px | 1 | 必須 | 現在の身分を表示。「農民」「足軽」「侍」... |
| UI | 民衆数カウンター（HUD） | 128×32px | 1 | 必須 | 「民衆: ○人」 |
| UI | タイマー（HUD） | 96×32px | 1 | 必須 | 残り秒数表示 |
| UI | HP/体力ゲージ | 128×16px | 1 | 推奨 | |
| UI | クールダウンインジケータ | 32×32px | 1 | 推奨 | 右クリック能力のクールダウン |
| UI | 「！」予告マーク | 32×32px | 2 | 必須 | 辻斬り予告（点滅） |
| UI | ドクロマーク | 64×64px | 1 | 必須 | result_failure.png準拠 |
| UI | ニックネーム入力画面 | 画面全体 | 1 | 推奨 | ランキング登録用 |
| UI | ランキング表示画面 | 画面全体 | 1 | 推奨 | Top 100 + 自分の順位 |

**小計: 約30枚**

---

### 1-B. キャラクター素材

#### プレイヤーキャラ（3種）

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| character | 足軽（待機） | 32×48px | 16枚（8方向×2F揺れ） | 必須 | 笠+槍。title.pngの右のキャラ参考 |
| character | 足軽（攻撃） | 48×48px | 24枚（8方向×3F） | 必須 | 槍を突き出すモーション |
| character | 足軽（被弾/吹っ飛び） | 64×48px | 4枚（横向き4F） | 必須 | 辻斬り被弾時。tsujigiiri.png準拠 |
| character | 野武士（待機） | 32×48px | 16枚（8方向×2F揺れ） | 必須 | 刀+荒い装束。title.pngの左のキャラ参考 |
| character | 野武士（攻撃） | 48×48px | 24枚（8方向×3F） | 必須 | 刀を振るモーション |
| character | 野武士（被弾/吹っ飛び） | 64×48px | 4枚（横向き4F） | 必須 | |
| character | 野武士（奇襲ダッシュ） | 64×48px | 3枚（横向き3F） | 必須 | 突進エフェクト付き |
| character | 農民（待機） | 32×48px | 16枚（8方向×2F揺れ） | 必須 | 笠+鍬。nomin.pngの鍬持ちキャラ準拠 |
| character | 農民（攻撃） | 48×48px | 24枚（8方向×3F） | 必須 | 鍬を振るモーション |
| character | 農民（被弾/吹っ飛び） | 64×48px | 4枚（横向き4F） | 必須 | |

**小計: 約131枚**（左右反転活用で実制作約80枚）

#### 敵NPC

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| character | 野盗（待機+移動） | 32×48px | 8枚（4方向×2F） | 必須 | 粗末な装束。弱そうな見た目 |
| character | 野盗（攻撃） | 48×48px | 8枚（4方向×2F） | 必須 | |
| character | 足軽隊兵士（待機+移動） | 32×48px | 8枚（4方向×2F） | 必須 | 統一された装備。集団で出現 |
| character | 足軽隊兵士（攻撃） | 48×48px | 8枚（4方向×2F） | 必須 | |
| character | 侍（待機+移動） | 32×48px | 8枚（4方向×2F） | 必須 | 刀。威圧感のある佇まい |
| character | 侍（攻撃） | 48×48px | 12枚（4方向×3F） | 必須 | 居合い斬りモーション |
| character | 武将（待機+移動） | 48×64px | 8枚（4方向×2F） | 推奨 | 甲冑。大きめサイズ |
| character | 武将（攻撃） | 64×64px | 12枚（4方向×3F） | 推奨 | |
| character | 辻斬り浪人 | 64×48px | 3枚（横向き突進3F） | 必須 | tsujigiiri.pngの刀持ち侍準拠。高速突進 |
| character | 城主（ボス） | 64×96px | 7枚（待機3F+攻撃4F） | 必須 | 下克上チャレンジ用。威厳のある大名/城主 |

**小計: 約82枚**

#### 民衆NPC

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| character | 民衆（通常・バリエーション3種） | 24×32px | 24枚（3種×4方向×2F） | 必須 | 農民風の素朴な見た目。男女子供 |
| character | 民衆（仲間状態） | 24×32px | 8枚（4方向×2F） | 必須 | 頭上に「！」マーク。嬉しそうな表情 |
| character | 民衆（一揆状態） | 24×32px | 12枚（4方向×3F突撃） | 必須 | 農具を振りかざす。農民の一揆時のみ |
| character | 民衆（離散） | 24×32px | 3枚（3F） | 必須 | 辻斬り被弾時に散り散りになる演出 |

**小計: 約47枚**

---

### 1-C. 背景 / 地形タイル

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| background | 草原タイル | 32×32px | 4バリエーション | 必須 | nomin.pngの草原準拠。白/ベージュ地に緑の短い線で草 |
| background | 田畑タイル | 32×32px | 4バリエーション | 推奨 | 稲穂の描写。農民の民衆が多いエリア |
| background | 山道タイル | 32×32px | 4バリエーション | 必須 | 茶色の地面。岩の散在 |
| background | 城下町タイル（地面） | 32×32px | 4バリエーション | 推奨 | 石畳風 |
| background | 城下町タイル（建物） | 64×64px | 6バリエーション | 推奨 | 和風の町家。障害物として配置 |
| background | 川タイル | 32×32px | 8枚（4種×2F流れ） | 必須 | 水色。通行不可エリア |
| background | 橋タイル | 32×64px | 3バリエーション | 必須 | tsujigiiri.pngの橋準拠。**紫/ピンクの欄干**が特徴 |
| background | 城（外観） | 128×128px | 1 | 必須 | フィールド奥の目標。天守閣風 |
| background | 城門 | 64×64px | 2（開/閉） | 必須 | 下克上チャレンジ入口 |
| background | 城内背景 | 画面全体 | 1 | 必須 | 下克上チャレンジのバトル背景。城内の大広間 |
| background | 村（拠点） | 64×64px | 1 | あると良い | 案2用。茅葺き屋根の集落 |

**小計: 約38枚**

---

### 1-D. エフェクト素材

| カテゴリ | 素材名 | サイズ目安 | フレーム数 | 優先度 | 備考 |
|---------|--------|----------|----------|--------|------|
| effect | 通常攻撃ヒット | 32×32px | 3 | 必須 | 白い衝撃波。シンプルな線画 |
| effect | 斬撃エフェクト | 64×32px | 3 | 必須 | 辻斬り・侍の攻撃用 |
| effect | 突進エフェクト | 48×48px | 3 | 必須 | 野武士の奇襲用。モーションライン |
| effect | 吹っ飛びモーションライン | 64×32px | 1 | 必須 | tsujigiiri.png準拠の飛散線 |
| effect | 回避エフェクト（横っ飛び） | 48×48px | 3 | 推奨 | |
| effect | 一揆発動エフェクト | 128×128px | 4 | 必須 | 農具を持った民衆が立ち上がる演出 |
| effect | 一揆成功エフェクト | 画面全体 | 3 | 推奨 | 勝利演出 |
| effect | 一揆鎮圧エフェクト | 画面全体 | 3 | 推奨 | 民衆が倒れる演出 |
| effect | 下克上突入エフェクト | 画面全体 | 4 | 必須 | 城門をくぐる演出 |
| effect | 集中線（リザルト用） | 画面全体 | 1 | 必須 | result_success_gekokujo.png準拠 |
| effect | 水しぶき（川落下） | 48×48px | 3 | 推奨 | 橋から落下時 |
| effect | 身分上昇演出 | 128×64px | 4 | 必須 | 「農民→足軽」のような文字+エフェクト |
| effect | 民衆加入エフェクト | 32×32px | 2 | 必須 | 「？」→「！」の吹き出し |
| effect | 石高獲得表示 | 64×32px | 1 | 必須 | 「+100石」のようなポップアップ数字 |

**小計: 約38枚**

---

### 1-E. フォント / テキスト画像素材

| カテゴリ | 素材名 | サイズ目安 | 優先度 | 備考 |
|---------|--------|----------|--------|------|
| font | 「下克上」筆文字ロゴ | 512×256px | 必須 | タイトル用メインビジュアル |
| font | 「GEKOKUJO」「オンライン」小文字 | 256×48px | 必須 | タイトルロゴの一部 |
| font | 「刮目せよ 下克上を...」 | 320×48px | 必須 | キャッチコピー |
| font | 「下克上成功!!」テキスト | 320×64px | 必須 | リザルト用 |
| font | 「下克上失敗.....」テキスト | 320×64px | 必須 | リザルト用 |
| font | 「お主は」テキスト | 128×48px | 必須 | リザルト用 |
| font | 「位」テキスト | 48×48px | 必須 | リザルト用 |
| font | 「辻斬りにあってしまった」テキスト | 320×48px | 必須 | バナー用 |
| font | 「一揆に参加する？」テキスト | 256×48px | 必須 | ダイアログ用 |
| font | 「挑戦的！」テキスト | 96×48px | 必須 | 吹き出し用 |
| font | 「下克上を仕掛ける？」テキスト | 256×48px | 必須 | ダイアログ用 |
| font | 「はい」「いいえ」テキスト | 各64×32px | 必須 | 選択肢用 |
| font | 身分名テキスト一式 | 各128×32px | 必須 | 農民/足軽/侍/武将/大名/天下人 |
| font | HUDラベル一式 | 各96×24px | 必須 | 石高:/民衆:/残り: |
| font | 数字0-9（黄色・リザルト用） | 各48×64px | 必須 | result_success_gekokujo.png準拠の黄色数字 |
| font | 数字0-9（白・HUD用） | 各24×32px | 必須 | ゲーム中表示用 |
| font | 「START」テキスト | 128×32px | 必須 | タイトル画面ボタン |

**小計: 約17セット（個別画像40枚程度）**

---

### 素材総数まとめ

| カテゴリ | 枚数 |
|---------|------|
| タイトル / UI画面 | 約30枚 |
| プレイヤーキャラ | 約131枚（実制作約80枚） |
| 敵NPC | 約82枚 |
| 民衆NPC | 約47枚 |
| 背景 / 地形 | 約38枚 |
| エフェクト | 約38枚 |
| フォント / テキスト画像 | 約40枚 |
| **合計** | **約406枚（実制作約355枚）** |

---

## 2. Nanobanana用プロンプト

### 基本スタイル指定（全素材共通プレフィックス）

全てのプロンプトの先頭にこのスタイル指定を付与する:

```
Base style prefix (attach to ALL prompts):

"Simple hand-drawn illustration, thin black ink outlines with slight brush pressure variation, minimal color palette, white background, cute chibi character style (2-3 heads tall, round soft silhouette), Japanese Edo-period / Sengoku-era aesthetic, clean and sparse composition, no gradients, no shading, flat color fills only, storybook illustration quality"
```

---

### 2-A. タイトル / UI系プロンプト

#### タイトルロゴ
- **参照画像**: `sozai/title.png`
```
"Japanese calligraphy brush lettering of the kanji characters '下克上' (gekokujo) in bold dynamic brushstrokes, black ink on white background, powerful and dramatic feel, below it in smaller neat text 'GEKOKUJO' in alphabet and 'オンライン' in katakana, hand-drawn style, reference: manga title page calligraphy"
```

#### タイトル画面全体
- **参照画像**: `sozai/title.png`
```
"Game title screen, white background, large brush calligraphy '下克上' at top center, below it smaller text 'GEKOKUJO オンライン', above the title '刮目せよ 下克上を...' in handwritten style, three small chibi characters standing in a row at bottom (left: ronin with katana, center: peasant with straw hat and hoe, right: foot soldier with spear and conical hat), a simple hand-drawn 'START' button at the very bottom with a rectangular border, clean and minimal layout, manga game screen style"
```

#### リザルト画面（下克上成功）
- **参照画像**: `sozai/result_success_gekokujo.png`
```
"Manga-style result screen with bold text '下克上成功!!' (Gekokujo Success) in black brush calligraphy, below it 'お主は' in smaller text, then a large yellow number '1021' with '位' (rank) suffix, dramatic speed lines (concentrated lines) radiating from center, white background, black ink lines, only accent color is yellow for the rank number, clean and impactful composition"
```

#### リザルト画面（下克上失敗）
- **参照画像**: `sozai/result_failure.png`
```
"Dark game over screen, solid BLACK background, white text '下克上失敗.....' (Gekokujo Failure) in the upper portion, below it a simple white skull icon (cute/simple style, not realistic), minimal composition, high contrast white-on-black only, somber and dramatic mood"
```

#### ダイアログボックス（一揆）
- **参照画像**: `sozai/ikki.png`
```
"A cute manga-style dialog box with rounded corners, white fill with thin black outline, text inside reads '一揆に参加する？' (Join the uprising?), below the text are two small rounded button options labeled 'はい' (Yes) and 'いいえ' (No), nearby a small speech bubble saying '挑戦的！' (Challenging!), hand-drawn style, simple and clean, white background"
```

#### 辻斬りバナー
- **参照画像**: `sozai/tsujigiiri.png`
```
"A simple rectangular notification banner with slightly rounded corners, very light pink/salmon background fill, black hand-drawn text '辻斬りにあってしまった' (You were attacked by a tsujigiri) centered inside, thin black outline border, manga-style UI element, clean and readable"
```

#### ドクロマーク
- **参照画像**: `sozai/result_failure.png`
```
"A simple cute skull and crossbones icon, chibi/cartoon style (not realistic or scary), white skull on transparent/black background, round skull shape with large eye sockets, simple crossed bones below, thin black outlines, matching the cute art style of the game, small icon size"
```

#### 集中線（リザルト用オーバーレイ）
- **参照画像**: `sozai/result_success_gekokujo.png`
```
"Manga-style concentrated speed lines (集中線) radiating outward from center, thin black straight lines getting thinner toward the edges, white space in the center for text overlay, dramatic emphasis effect, clean sharp lines, white background, full-screen overlay asset"
```

---

### 2-B. キャラクター系プロンプト

#### 足軽（プレイヤー）
- **参照画像**: `sozai/title.png`（右側のキャラ）
```
"A tiny chibi ashigaru foot soldier seen from slightly above (top-down RPG perspective), wearing a simple conical straw hat (jingasa) and basic armor, holding a long spear (yari), round body proportions, 2-head-tall cute figure, thin black ink outlines, minimal flat colors (grey armor, straw-colored hat), white background, game sprite style, pixel-art-friendly proportions"
```

#### 野武士（プレイヤー）
- **参照画像**: `sozai/title.png`（左側のキャラ）
```
"A tiny chibi ronin warrior seen from slightly above (top-down RPG perspective), wearing a ragged kimono and carrying a katana sword, wild messy hair, fierce but cute expression, round body proportions, 2-head-tall figure, thin black ink outlines, minimal flat colors (dark blue kimono, silver blade), white background, game sprite style"
```

#### 農民（プレイヤー）
- **参照画像**: `sozai/nomin.png`
```
"A tiny chibi Japanese peasant farmer seen from slightly above (top-down RPG perspective), wearing a large straw hat (sugegasa) covering most of the face, simple white work clothes, holding a farming hoe (kuwa), round soft body proportions, 2-head-tall cute figure, thin black ink outlines, minimal flat colors (straw yellow hat, white clothes, brown hoe), white background, game sprite style, reference: simple manga illustration"
```

#### 敵 — 野盗
- **参照画像**: なし（オリジナル）
```
"A tiny chibi bandit/thief character seen from above, wearing tattered clothes and a cloth mask over the face, carrying a crude wooden club, scruffy and weak-looking, round body, 2-head-tall, thin black ink outlines, minimal colors (brown/grey rags), white background, game sprite"
```

#### 敵 — 足軽隊兵士
- **参照画像**: なし（足軽プレイヤーの色替え）
```
"A tiny chibi ashigaru foot soldier NPC seen from above, wearing matching simple armor in darker tones than the player character, holding a short spear, uniform appearance suggesting they are part of a squad, 2-head-tall, thin black ink outlines, minimal flat colors (dark grey armor), white background, game sprite, enemy unit"
```

#### 敵 — 侍
- **参照画像**: なし（オリジナル）
```
"A tiny chibi samurai warrior seen from above, wearing formal hakama and carrying a katana in a proper stance, stern expression, topknot hairstyle, dignified posture despite cute proportions, 2-head-tall, thin black ink outlines, minimal flat colors (dark blue hakama, white top), white background, game sprite"
```

#### 敵 — 武将
- **参照画像**: なし（オリジナル）
```
"A tiny chibi Japanese feudal warlord (busho) seen from above, wearing elaborate samurai armor with kabuto helmet featuring decorative horns/crest, larger than other characters, imposing but cute, 2.5-head-tall, thin black ink outlines, minimal flat colors (red/gold armor), white background, game sprite"
```

#### 敵 — 城主（ボス）
- **参照画像**: なし（オリジナル）
```
"A chibi Japanese castle lord (daimyo) sitting in a formal position, wearing luxurious kimono with family crest, stern authoritative expression, larger character (3-head-tall), ornate headpiece, thin black ink outlines, minimal flat colors (purple/gold kimono), white background, boss character for a game, front-facing view"
```

#### 敵 — 辻斬り浪人
- **参照画像**: `sozai/tsujigiiri.png`（刀を持った侍キャラ）
```
"A chibi ronin in mid-slash attack pose, lunging sideways with katana extended, motion lines behind showing high speed, wearing dark kimono, menacing cute expression, side view (profile), thin black ink outlines, minimal flat colors (dark navy kimono, silver blade), white background, action pose game sprite, reference: manga action scene"
```

#### 民衆NPC（3バリエーション）
- **参照画像**: `sozai/nomin.png`（背景の小さいキャラたち参考）
```
"A set of 3 tiny chibi Japanese commoner villagers seen from above: (1) male farmer with simple clothes and headband, (2) female villager with tied-back hair and apron, (3) small child villager, all with round soft bodies, 1.5-head-tall (smaller than player characters), simple happy expressions, thin black ink outlines, minimal flat colors (earth tones: brown, beige, faded green), white background, game sprite set"
```

#### 民衆（一揆状態）
- **参照画像**: `sozai/ikki.png`
```
"Tiny chibi Japanese peasants in uprising mode, holding farming tools (hoes, sickles, rakes) raised above their heads, angry determined cute expressions, running forward in a charge, motion lines behind them, 1.5-head-tall, thin black ink outlines, minimal flat colors, white background, game sprite animation frames"
```

---

### 2-C. 背景 / 地形系プロンプト

#### 草原タイル
- **参照画像**: `sozai/nomin.png`（背景の草原部分）
```
"Top-down view game tile of a Japanese grassland field, white/cream background with simple short green line strokes representing grass scattered across the surface, minimal and sparse, hand-drawn style with thin ink lines, flat colors only (light beige ground, green grass marks), 32x32 pixel tile seamless, very simple and clean, reference: manga panel background"
```

#### 橋タイル
- **参照画像**: `sozai/tsujigiiri.png`（紫/ピンクの欄干が見える橋）
```
"Top-down view game tile of a traditional Japanese wooden bridge crossing a river, distinctive purple/pink painted railings (rankan) on both sides, wooden plank floor in light brown, thin black ink outlines, hand-drawn simple style, flat colors only, the bridge is narrow (one character width), game tile, reference: Edo-period arched bridge"
```

#### 川タイル
- **参照画像**: なし
```
"Top-down view game tile of a flowing river/stream, simple light blue water with minimal white curved lines suggesting current, hand-drawn style, thin ink outlines, flat color fill, seamless tile, clean and minimal, white border areas for riverbank transition"
```

#### 城（外観）
- **参照画像**: なし（漫画にも城の描写あり、ただし明確なスクショなし）
```
"Top-down slightly angled view of a Japanese feudal castle (shiro), white castle walls, multi-tiered tenshu (castle tower) with curved dark roofs, stone foundation walls, simple hand-drawn style with thin black ink outlines, minimal flat colors (white walls, dark grey/blue roofs, grey stone base), clean composition, game map landmark sprite, approximately 128x128 pixels"
```

#### 城下町タイル
- **参照画像**: なし
```
"Top-down view game tile of a Japanese Edo-period town street, stone-paved road with simple traditional wooden machiya townhouses on the sides, tiled roofs, thin black ink outlines, minimal flat colors (grey stone road, brown wooden buildings, dark roof tiles), hand-drawn simple style, seamless tile"
```

#### 山道タイル
- **参照画像**: なし
```
"Top-down view game tile of a narrow mountain path, brown dirt trail winding through rocky terrain, small scattered rocks and pebbles, sparse dead grass, thin black ink outlines, minimal flat colors (brown earth, grey rocks), hand-drawn simple style, seamless tile"
```

#### 田畑タイル
- **参照画像**: なし
```
"Top-down view game tile of Japanese rice paddy fields, neat rectangular plots with short green rice plant lines in rows, thin water channels between plots, simple hand-drawn style, thin black ink outlines, minimal flat colors (light green plants, light blue water, beige earth borders), seamless tile"
```

#### 城内背景（下克上チャレンジ用）
- **参照画像**: なし
```
"Interior of a Japanese feudal castle great hall (ohiroma), seen from front, tatami floor with gold-painted sliding doors (fusuma) in the background, simple clean composition, thin black ink outlines, minimal flat colors (beige tatami, gold/brown fusuma, dark wooden pillars), dramatic but cute atmosphere, game battle background, wide format"
```

---

### 2-D. エフェクト系プロンプト

#### 斬撃エフェクト
- **参照画像**: `sozai/tsujigiiri.png`（斬撃の描写）
```
"Simple manga-style sword slash effect, a single curved white arc with thin black outline and small scattered particles, motion lines following the arc direction, minimal and clean, transparent background, game VFX sprite, 3-frame animation sequence showing the arc appearing and fading"
```

#### 吹っ飛びモーションライン
- **参照画像**: `sozai/tsujigiiri.png`（キャラが吹っ飛ぶ描写）
```
"Manga-style impact/knockback motion lines, several parallel curved lines showing a character being blown away to the right, small impact stars at the origin point, thin black ink lines, simple and expressive, transparent background, game VFX sprite"
```

#### 水しぶき
- **参照画像**: なし
```
"Simple cartoon water splash effect, white and light blue water droplets spraying upward, thin black outlines on each droplet, cute and simple style, 3-frame animation (splash up, peak, settle), transparent background, game VFX sprite"
```

#### 一揆発動エフェクト
- **参照画像**: `sozai/ikki.png`
```
"Dramatic uprising effect, multiple farming tools (hoes, sickles) rising up from below with motion lines, dust clouds at the bottom, energetic and chaotic but cute style, thin black ink outlines, white background, game VFX sprite, 4-frame animation"
```

#### 身分上昇演出
- **参照画像**: なし
```
"Level-up style promotion effect, upward arrow with sparkles, Japanese text placeholder area in center, radiating light lines from behind, celebratory but simple, thin black ink outlines, white and gold accents, transparent background, game VFX sprite"
```

---

## 3. 原作再現性チェックリスト（5案比較）

### 評価基準

漫画のスクショ（sozai/）に描かれている具体的な要素を基準に、各案の再現度を評価する。

- **忠実に再現** = 漫画の描写をそのままゲームに落とし込める（○）
- **拡大解釈** = 漫画にはないが矛盾しない形で拡張（△）
- **再現不可** = 漫画の描写と矛盾する、または表現できない（✕）

### 案1: トップダウン・アリーナアクション

| 漫画の要素 | 再現度 | 備考 |
|-----------|:------:|------|
| 下克上チャレンジ（城への攻め込み） | ○ | フィールド奥の城に突入する形式でそのまま再現 |
| 辻斬り（橋の上で斬りかかられる） | ○ | 橋タイルの上で辻斬り浪人が突進。tsujigiiri.png完全再現 |
| 一揆（はい/いいえの選択） | ○ | ダイアログそのまま。民衆が一斉突撃する演出 |
| 民衆集め | ○ | ピクミン的にぞろぞろついてくる。直感的 |
| ランキング（お主は○○位） | ○ | 石高ベースのランキング。リザルト画面完全準拠 |
| キャラ選択（○○使い） | ○ | 3キャラから選択。タイトル画面の3体 |
| 城の存在 | ○ | フィールド奥に常設。いつでも近づける |
| マウスガチャガチャ操作 | ○ | WASD+マウス照準で両手フル稼働 |
| 1画面アクション | ○ | 見下ろしフィールドで完結 |
| **拡大解釈した要素** | | |
| 民衆の具体的な集め方 | △ | 近づくだけで仲間になる（漫画では詳細不明） |
| 身分上昇の演出 | △ | 自動で身分が上がる（漫画では明示なし） |
| **総合再現度** | **S** | 全要素を忠実に再現。拡大解釈は最小限 |

### 案2: ウェーブディフェンス型

| 漫画の要素 | 再現度 | 備考 |
|-----------|:------:|------|
| 下克上チャレンジ | ○ | 敵の城に攻め込む形式で再現 |
| 辻斬り | ○ | 村と城の間の橋で発生 |
| 一揆 | ○ | 民衆防衛ユニットが攻撃ユニットに転化 |
| 民衆集め | ○ | 防衛ユニットとして配置する形で再現 |
| ランキング | ○ | 石高ベース |
| キャラ選択 | ○ | 3キャラ |
| 城の存在 | ○ | 敵の城として存在 |
| マウスガチャガチャ操作 | △ | **防衛時は待ちの時間が発生**。漫画の「忙しく操作」描写と若干乖離 |
| 1画面アクション | △ | 村と城の間を移動する構造。1画面に収まらない可能性 |
| **拡大解釈した要素** | | |
| 「村」の拠点概念 | △ | 漫画に村の防衛要素はない。オリジナル追加 |
| ウェーブで敵が攻めてくる | △ | 漫画では敵の攻め方は不明 |
| **総合再現度** | **A** | コア要素は再現。「防衛」概念は漫画にない拡張 |

### 案3: ローグライク進撃型

| 漫画の要素 | 再現度 | 備考 |
|-----------|:------:|------|
| 下克上チャレンジ | ○ | 道の最奥の城に到達して挑む |
| 辻斬り | ○ | 橋の上で横から斬りかかってくる |
| 一揆 | ○ | 民衆が前方に突撃して道を切り開く |
| 民衆集め | ○ | 道中で仲間にする |
| ランキング | ○ | 石高ベース |
| キャラ選択 | ○ | 3キャラ |
| 城の存在 | ○ | 道の最奥にある |
| マウスガチャガチャ操作 | ○ | 常に前進+攻撃で忙しい |
| 1画面アクション | △ | **横スクロール**。漫画の「1画面をガチャガチャ」とは異なる印象 |
| **拡大解釈した要素** | | |
| 分岐ルートの概念 | △ | 漫画に分岐の描写はない |
| 「進んだ距離」がスコアに影響 | △ | 漫画では距離の概念は不明 |
| **総合再現度** | **A** | 高い再現度。横スクロールが原作の見下ろし視点と異なる点のみ気になる |

### 案4: 見下ろしシューター型

| 漫画の要素 | 再現度 | 備考 |
|-----------|:------:|------|
| 下克上チャレンジ | ○ | フィールド奥の城で弾幕ボス戦 |
| 辻斬り | △ | **橋の上でのノックバックは再現するが、弾で表現**。漫画の「浪人が刀で斬りかかる」とは違う |
| 一揆 | ○ | 民衆シールドを全て弾として発射。爽快 |
| 民衆集め | ○ | シールドとして機能。物理的な意味がある |
| ランキング | ○ | 石高ベース |
| キャラ選択 | ○ | 3キャラ |
| 城の存在 | ○ | フィールド奥に存在 |
| マウスガチャガチャ操作 | ○ | シューティングなので非常に忙しい |
| 1画面アクション | ○ | 見下ろしフィールド |
| **拡大解釈した要素** | | |
| 弾幕システム | △ | 漫画に弾幕の描写はない。シューティングの文法を持ち込んでいる |
| 辻斬り浪人が弾に置換 | ✕ | **漫画では明確に「浪人が刀で斬りかかる」描写**。弾に変えると再現性が損なわれる |
| 民衆がシールドとして消費される | △ | 漫画の「民衆を仲間にする」とは少しニュアンスが違う（使い捨て感） |
| **総合再現度** | **B** | シューティングとしては面白いが、辻斬りの再現性が低い |

### 案5: 大名行列パレード型

| 漫画の要素 | 再現度 | 備考 |
|-----------|:------:|------|
| 下克上チャレンジ | ○ | 行列ごと城に突入 |
| 辻斬り | ○ | 橋の上で行列を横から断ち切る。視覚的にインパクト大 |
| 一揆 | ○ | 行列の民衆が全方向に散開。最も一揆らしい演出 |
| 民衆集め | ○ | 行列が長くなる快感。塊魂的 |
| ランキング | ○ | 石高ベース |
| キャラ選択 | ○ | 3キャラ |
| 城の存在 | ○ | マップ上に存在 |
| マウスガチャガチャ操作 | △ | **パレードは穏やかな操作感**。漫画の「忙しい操作」とは異なる |
| 1画面アクション | △ | マップを練り歩く構造。やや広い |
| **拡大解釈した要素** | | |
| 行列（大名行列）の概念 | △ | 漫画に行列の描写はない。独自要素 |
| 威圧による自動獲得 | △ | 戦闘なしでスコアが入る仕組みは漫画にない |
| **総合再現度** | **A** | 一揆と辻斬りの再現性は全案中最も高いが、操作感が異なる |

### 再現度スコアまとめ

| 案 | 忠実再現（○） | 拡大解釈（△） | 再現不可（✕） | 総合 |
|----|:----------:|:----------:|:----------:|:----:|
| **案1: アリーナ** | **11** | **2** | **0** | **S** |
| 案2: ウェーブ防衛 | 8 | 4 | 0 | A |
| 案3: ローグ進撃 | 9 | 3 | 0 | A |
| 案4: 弾幕シューター | 8 | 3 | 1 | B |
| 案5: パレード | 8 | 4 | 0 | A |

**結論**: 原作再現性では**案1（トップダウン・アリーナ）が圧倒的に優位**。漫画の全描写を100%再現でき、拡大解釈が最小限。案4のみ辻斬り浪人の再現で構造的な問題がある。

---

## 4. フォント戦略

### 解決済み: chikaフォント（手書き風TTF）を採用

手書き風フリーフォント **chika-Regular.ttf** を入手し、フォント問題は解決済み。

| 項目 | 内容 |
|------|------|
| フォント名 | chika-Regular.ttf |
| スタイル | 手書き風（カジュアルで温かみのある書体） |
| ファイルサイズ | 87KB |
| ファイル場所 | `docs/findings/sozai/chika-Regular.ttf` |
| ライセンス | 商用・非商用問わず利用可能（著作権は作者に帰属） |
| 適用方法 | @font-faceで読み込み、全テキストに適用 |

### 適用方針

- CSSで `@font-face` を定義し、`font-family: 'Chika'` として全テキストに適用
- Canvas内の `ctx.font` 指定もすべて `'Chika', serif` に統一
- タイトル、HUD、リザルト画面、ダイアログ等すべてのテキストに適用
- **テキスト画像生成（Nanobanana等）は不要** — TTFフォントで直接描画する

### 旧方針（廃止）

以下の方針A/B/Cの比較検討は不要になった。TTFフォント直接利用に一本化。

- ~~方針A: 固定テキスト画像方式~~ → テキスト画像生成自体が不要に
- ~~方針B: フリーフォント活用~~ → chikaフォントに一本化
- ~~方針C: カスタムフォント生成~~ → 既存フォントで十分

---

## 補足: 素材制作の優先順位

原作再現性最優先の方針に基づく制作順:

1. **P0（必須・初日）**: タイトル画面一式、リザルト画面3種、ダイアログ2種 — 漫画のスクショそのものの再現
2. **P1（コア）**: プレイヤー3キャラ、民衆、草原タイル、橋タイル — ゲームプレイの最低限
3. **P2（敵）**: 野盗、足軽隊、侍、辻斬り浪人 — 戦闘要素
4. **P3（地形）**: 川、山道、城下町、城 — フィールドの完成
5. **P4（演出）**: エフェクト全般、武将、城主 — 仕上げ
