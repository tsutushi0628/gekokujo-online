# concept-final.html リファクタリング戦略

## 背景

`public/concept-final.html` は単一ファイル約3,245行のCanvas製ゲーム。
CSS・HTML・JSが全て1ファイルに詰め込まれており、保守・デプロイに支障がある。
Firebase Hosting で `gekokujo-online.web.app` にデプロイするためにも整理が必要。

## 方針

### 1. CSS分離（1ファイル）

`public/css/style.css`

- 現状97行。分割不要な規模
- CSS変数で重複プロパティを統一（`color: #1a1a1a` 7箇所、`position: absolute; 800x600` 3箇所）
- 未使用セレクタ削除（`.success-banner`, `.concentration-lines`の不要スタイル）
- 整理後: 70〜80行見込み

### 2. JS分割（11ファイル）

`public/js/` 配下。IIFE除去し、script load orderで依存管理（ES Modules不使用）。

| ファイル | 責務 |
|---------|------|
| `constants.js` | ゲーム定数・キャラクター定義・マップ設定 |
| `utils.js` | 汎用ユーティリティ関数 |
| `input.js` | キーボード・マウス入力管理 |
| `camera.js` | カメラ・ビューポート制御 |
| `terrain.js` | 地形生成・描画 |
| `sprites.js` | スプライト管理・描画 |
| `entities.js` | エンティティ（プレイヤー・敵・NPC）管理 |
| `combat.js` | 戦闘・辻斬り・一揆システム |
| `economy.js` | 商人経済・石高・売買システム |
| `ui.js` | HUD・ダイアログ・画面遷移 |
| `main.js` | ゲームループ・初期化・状態管理 |

### 3. HTML（index.html）

- `concept-final.html` → `public/index.html` にリネーム
- CSS/JSを外部参照に変更
- インラインスクリプト・スタイル全除去

### 4. Firebase Hosting設定

```json
// firebase.json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

```json
// .firebaserc
{
  "projects": {
    "default": "gekokujo-online"
  }
}
```

### 5. 旧ファイル退避

`public/archive/` に移動:
- `concept-final.html`（分割元）
- その他不要な旧ファイル

## 実行順序

1. CSS分離・整理 → `public/css/style.css`
2. JS分割 → `public/js/*.js`（11ファイル）
3. `public/index.html` 作成（外部参照のみ）
4. `firebase.json` + `.firebaserc` 作成
5. 旧ファイル `public/archive/` に退避
6. ブラウザ動作確認
7. コミット → デプロイ（しんたろうさん許可後）

## 注意事項

- IIFE内のvar宣言はグローバルスコープに展開される
- script読み込み順が依存関係を決定するため、index.htmlでの順序が重要
- スプライト画像パスは変更なし（`public/assets/` のまま）
