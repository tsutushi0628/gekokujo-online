# 下克上オンライン ゲームルール仕様書

コードベースから読み取った正確な値。最終更新: 2026-03-16

---

## 1. ゲーム概要

60秒制限のアクションゲーム。3キャラクター（足軽/商人/農民）から1体を選択し、民衆を仲間にして行列を作り、城に攻め込んで殿様を倒す「下克上」を目指す。農民のみ「一揆モード」（Z選択）が存在し、制限時間50秒・一揆(Q)使用可能になる。

- 勝利条件: 下克上成功（殿様撃破）
- 敗北条件: HP=0
- 時間切れ: 通常終了（敗北ではない）

---

## 2. キャラクター一覧と特性

### 基本ステータス ([constants.js:15-38](public/js/constants.js#L15-L38) CHAR_DEFS)

| プロパティ | 足軽 | 商人 | 農民(Z無) | 農民(Z有) |
|---|---|---|---|---|
| ゲーム時間 | 60秒 | 60秒 | 60秒 | 50秒 |
| HP / 回復 | 100 / 2/s | 100 / 2/s | 100 / 2/s | 100 / 2/s |
| 移動速度 | 3.0 | 3.6 | 3.2 | 3.2 |
| 初期石高 | 0 | 6500 | 0 | 0 |
| scoreMultiplier | ×1.0 | ×1.2 | ×1.4 | ×1.4 |
| damageTakenMultiplier | ×1.0 | ×1.2 | ×1.4 | ×1.4 |
| 敵最大数 | 12 | 12 | 17 | 17 |
| 敵スポーン間隔 | 3秒 | 3秒 | 2秒 | 2秒 |
| Qスキル | なし（コード定義のみ・未接続） | なし（コード定義のみ・未接続） | なし | 一揆(Q) |

> 参照: HP=100 ([entities.js:159](public/js/entities.js#L159)), 回復2/s ([entities.js:177](public/js/entities.js#L177)), MAX_TIME=60 ([constants.js:9](public/js/constants.js#L9)), 農民Z有=50秒 ([main.js:1542](public/js/main.js#L1542))

### 攻撃パターン ([combat.js:201-241](public/js/combat.js#L201-L241) CombatSystem)

| プロパティ | 足軽 | 商人 | 農民 |
|---|---|---|---|
| 弾数 | **5**（扇状） | **2**（同時・狭角度） | **1**（交互・広角度） |
| 発射方式 | 扇状同時 | ダブルバレル同時 | 左右交互投げ（トグル） |
| 角度 | ±0.5rad | ±0.08rad | ±0.35rad |
| 弾速 | 8 | 5 | 6 |
| 寿命 | 24F | 50F | 56F |
| サイズ | 10 | 4 | 2 |
| 射程イメージ | 短距離・広範囲 | **長距離・集中** | 中距離・中範囲 |
| base attack | 7 | 2 | 3 |
| 攻撃CD | 0.25秒 | 0.25秒 | **0.125秒** |
| 攻撃力計算 | base + floor(parade × 0.008 × base × 10) | base + floor(parade × 0.012 × base × 10) | base + floor(parade × 0.025 × base × 10) |
| 特殊効果 | なし | なし | 30%で民間人追加スポーン |

> 参照: 攻撃CD ([combat.js:231-234](public/js/combat.js#L231-L234)), 攻撃力計算 ([entities.js:260-264](public/js/entities.js#L260-L264)), 農民30%スポーン ([combat.js:238](public/js/combat.js#L238))

### 仲間(ピクミン) ([entities.js:700-878](public/js/entities.js#L700-L878) ParadeController)

| プロパティ | 足軽 | 商人 | 農民 |
|---|---|---|---|
| リクルート範囲 | 55px + パレード人数×5 | 55px + パレード人数×5 | 65px + パレード人数×5 |
| リクルート時間 | 200ms | 0（即時） | 400ms |
| リクルートコスト | なし | 120石/人 | なし |
| フォロワーダメージ | **2** | 3 | 3 |
| フォロワー攻撃範囲 | **50px** | **50px** | **50px** |
| フォロワーCD | 0.7秒 | 0.7秒 | 0.7秒 |
| 忠誠離脱 | **15〜25秒で自動離脱** | なし(koku依存) | なし |
| 被ダメージ | **無敵**（敵攻撃で死亡しない） | **無敵** | **無敵** |
| 速度ペナルティ | 2%/人, 最大30% | 2%/人, 最大30% | 2%/人, 最大30% |

> 参照: recruitRange ([constants.js:18,25,33](public/js/constants.js#L18)) + パレード人数×5 ([entities.js:634](public/js/entities.js#L634)), フォロワーダメージ ([entities.js:777-778](public/js/entities.js#L777-L778)), フォロワーCD=KobuSystem.getAttackCooldown()=0.7 ([combat.js:668](public/js/combat.js#L668)), 忠誠 ([entities.js:713-714](public/js/entities.js#L713-L714)), 速度ペナルティ ([entities.js:201-204](public/js/entities.js#L201-L204)), 被ダメージ無敵 ([entities.js:471](public/js/entities.js#L471))

### 突撃 ([combat.js:107-196](public/js/combat.js#L107-L196) ParadeChargeSystem)

| プロパティ | 足軽 | 商人 | 農民 |
|---|---|---|---|
| 突撃速度 | 5.0 (×1.0) | 2.5 (×0.5) | 4.0 (×0.8) |
| 再編成時間 | 1.95秒 | 2.40秒 | 1.50秒 |
| ダメージ | 5 | 5 | 5 |
| CD | 6秒 | 6秒 | 6秒 |
| 必要人数 | 3人以上 | 3人以上 | 3人以上 |
| 突撃持続 | 1.2秒 | 1.2秒 | 1.2秒 |

> 参照: chargeMultiplier ([constants.js:19,26,34](public/js/constants.js#L19)), 再編成=3*(1-regroupSpeed+0.5) ([combat.js:186](public/js/combat.js#L186)), CD=6 ([combat.js:133](public/js/combat.js#L133)), 必要人数=3 ([combat.js:116](public/js/combat.js#L116)), 突撃持続=1.2 ([combat.js:131](public/js/combat.js#L131))

---

## 3. 敵一覧と報酬

### 敵ステータス ([constants.js:49-54](public/js/constants.js#L49-L54) ENEMY_DEFS)

| 名前 | HP | 攻撃 | 速度 | スコア | サイズ | grit |
|---|---|---|---|---|---|---|
| 野盗 | 20 | 3 | 1.5 | 100 | 21 | 3 |
| 足軽隊 | 35 | 5 | 1.8 | 250 | 24 | 10 |
| 侍 | 55 | 8 | 2.0 | 500 | 27 | 999 |
| 武将 | 80 | 12 | 2.2 | 800 | 33 | 999 |

### スポーン ([entities.js:311-378](public/js/entities.js#L311-L378))

- デフォルト: 最大数12体、間隔3秒ごとチェック。農民のみ最大数17体、間隔2秒
- 6体未満→2体スポーン、6〜9体→1体スポーン ([entities.js:399-400](public/js/entities.js#L399-L400))
- 初期スポーン: 5体 ([main.js:1434](public/js/main.js#L1434))
- 城下町: 中心ほどスポーン拒否（最大70%、400px以遠で0%）([entities.js:359](public/js/entities.js#L359))。城下町産はHP×1.5 ([entities.js:365](public/js/entities.js#L365))
- 敵攻撃間隔: 0.8秒 ([entities.js:459](public/js/entities.js#L459))

### 時間経過によるtier ([entities.js:317-320](public/js/entities.js#L317-L320))

| 経過時間 | 出現敵 |
|---|---|
| 0-15秒 | 野盗のみ |
| 15-30秒 | +足軽隊 |
| 30-60秒 | +侍 |
| 60秒~ | +武将 |

### 降伏 ([combat.js:75-102](public/js/combat.js#L75-L102) IntimidationSystem)

- チェック間隔: 0.5秒 ([combat.js:80](public/js/combat.js#L80))
- 条件: パレード4人以上 & 距離200px以内(distSq < 40000) & paradeLen > enemy.grit ([combat.js:84,94](public/js/combat.js#L84))
- 野盗(grit=3): 4人で降伏、足軽隊(grit=10): 11人以上、侍・武将(grit=999): 降伏しない
- 降伏タイマー: 1.0秒 ([combat.js:97](public/js/combat.js#L97))

### 戦闘報酬ランダムシステム ([combat.js:6-20](public/js/combat.js#L6-L20) KokuReward)

- 敵撃破・辻斬り・橋ボス・下克上・武功ボーナスの石高報酬に±25%のランダム幅を適用 ([combat.js:8](public/js/combat.js#L8) `0.75 + Math.random() * 0.5`)
- 10%の確率でクリティカル発生（報酬×2）([combat.js:10-11](public/js/combat.js#L10-L11))
- **テリトリー収入（商人の城下町/村/草原）は対象外**（固定値のまま、[economy.js:43](public/js/economy.js#L43)で直接加算）

---

## 4. ランクシステム ([constants.js:40-47](public/js/constants.js#L40-L47) RANKS)

| 身分 | 閾値(石高) | bonus |
|---|---|---|
| 農民 | 0 | 1.0 |
| 足軽 | 500 | 1.2 |
| 侍 | 1500 | 1.5 |
| 武将 | 3500 | 2.0 |
| 大名 | 7000 | 2.5 |
| 天下人 | 12000 | 3.0 |

- 速度ボーナス: +rankIndex × 0.3 ([entities.js:198](public/js/entities.js#L198))
- 昇格のみ（降格なし）([main.js:941-951](public/js/main.js#L941-L951) RankSystem.check)
- bonus値は現在HUD表示のみに使用

---

## 5. 殿様戦 ([main.js:379-935](public/js/main.js#L379-L935) GekokujoSystem)

### 出現条件
- **ゲーム開始30秒後に城が黄色に発光**し、プレイヤーが城に接触するとダイアログ表示 ([main.js:409](public/js/main.js#L409) `scheduleTime=30`, [main.js:561](public/js/main.js#L561), [main.js:577-593](public/js/main.js#L577-L593))
- 辞退した場合、5秒後に再挑戦可能 ([main.js:589](public/js/main.js#L589))

### 殿様ステータス ([constants.js:67-87](public/js/constants.js#L67-L87) TONO_BOSS + [main.js:753-778](public/js/main.js#L753-L778))
- **HP: 500**（固定、全キャラ共通）([constants.js:68](public/js/constants.js#L68))
- 攻撃: 8 + rIdx × 4 （rIdx = min(rankIndex+2, 5)）([main.js:758,764](public/js/main.js#L758))
- サイズ: 52 ([main.js:768](public/js/main.js#L768))
- 制限時間: 20秒 ([main.js:756](public/js/main.js#L756))

### AIステートマシン ([main.js:488-557](public/js/main.js#L488-L557))

| ステート | 速度 | 行動 | 遷移 |
|---|---|---|---|
| CHASE | 2.5 | プレイヤー追跡（城エリア内のみ）、接触で1秒間隔ダメージ | 3秒後→60%WINDUP/40%CHASE |
| WINDUP | 0 | 停止、赤いオーラ脈動 | 0.8〜1.8秒後→CHARGE |
| CHARGE | 4.5 | プレイヤー方向にロック突進、接触でHP35%ダメ+ノックバック20 | 接触 or 3秒後→DECEL |
| DECEL | 4.5→1.5 | 線形減速、突進方向維持、終了時に衝撃波 | 0.5秒後→70%RETREAT/30%WINDUP |
| RETREAT | 2.8 | 城前方(standoff=160px)へ撤退、1.5秒間隔で弾丸発射(速度4,ダメージ12) | 城到着→CASTLE_WAIT |
| CASTLE_WAIT | 0 | 停止、**無敵**（弾丸・仲間攻撃無効）、青いバリア表示 | 1〜2秒後→50%WINDUP/30%CHASE/20%RETREAT |

> 参照: TONO_BOSS定数 ([constants.js:67-87](public/js/constants.js#L67-L87)), 状態遷移 ([main.js:525-557](public/js/main.js#L525-L557)), CASTLE_WAIT無敵 ([entities.js:805](public/js/entities.js#L805), [entities.js:1018](public/js/entities.js#L1018))

### 衝撃波 (DECEL終了時)
- 半径: 80px ([constants.js:78](public/js/constants.js#L78))
- ダメージ: 20 ([constants.js:79](public/js/constants.js#L79))
- 仲間にもヒット ([main.js:700-707](public/js/main.js#L700-L707))

### 接触ダメージ (CHARGE時)
- HP35%ダメージ ([constants.js:80](public/js/constants.js#L80) `contactDamageRatio: 0.35`)
- ノックバック力: 20 ([constants.js:85](public/js/constants.js#L85))
- 1回の突進につき1回のみ（contactHitフラグ）([main.js:507,655](public/js/main.js#L507))

### 戦闘中の特殊ルール
- ゲーム時間停止 ([main.js:1535-1537](public/js/main.js#L1535-L1537))
- 敵全消去 ([main.js:757](public/js/main.js#L757))
- 辻斬り無効 ([main.js:1571-1573](public/js/main.js#L1571-L1573))
- 維持費免除 ([economy.js:46](public/js/economy.js#L46))

### 結果
- 成功: スロー2秒(0.05x) → 2000 + rankIndex × 1000 石高 + 身分2段階上昇 → 勝利 ([main.js:782-818](public/js/main.js#L782-L818))
- 足軽のみ武功ボーナス: 15秒以内撃破で+2000石 ([main.js:802-808](public/js/main.js#L802-L808))
- HP=0: ゲームオーバー ([main.js:828-834](public/js/main.js#L828-L834))
- 時間切れ: 殿様退却、5秒後再挑戦可 ([main.js:820-826](public/js/main.js#L820-L826))

### 城の黄色発光
- ゲート有効時（gateActive=true）に城スプライトにshadowColor="rgba(255, 220, 40, alpha)"で黄色パルス ([main.js:838-847](public/js/main.js#L838-L847))
- alpha = 0.4 + sin(now/400) * 0.2 ([main.js:840](public/js/main.js#L840))

---

## 6. 橋中ボス ([main.js:180-374](public/js/main.js#L180-L374) BridgeBossSystem)

- 各橋に1体ずつスポーン ([main.js:276](public/js/main.js#L276))
- HP: 240、攻撃: 10、速度: 1.8、サイズ: 30、スコア: 2000 ([main.js:282-298](public/js/main.js#L282-L298))
- 接触ダメージ: プレイヤーmaxHPの35%（=35）([main.js:253](public/js/main.js#L253))
- 接触後無敵: 1.5秒 ([main.js:265](public/js/main.js#L265))
- ノックバック: 12 ([main.js:263](public/js/main.js#L263))
- **大橋(safe=true)**: Y軸サイン波パトロール（橋高さ×0.8の範囲、速度1.2）([main.js:218-234](public/js/main.js#L218-L234))
- **小橋(safe=false)**: 完全固定、移動なし ([main.js:236](public/js/main.js#L236))
- 紫の発光アウトライン: shadowColor="rgba(160, 60, 255, 0.9)", shadowBlur=12 ([main.js:348-349](public/js/main.js#L348-L349))

---

## 7. 経済システム (economy.js ShoninSystem)

商人専用の経済システム。

| 項目 | 値 | 参照 |
|---|---|---|
| 初期石高 | 6500 | [constants.js:27](public/js/constants.js#L27) |
| テリトリー収入 | 城下町+50/s、村+30/s、草原+10/s | [economy.js:28-40](public/js/economy.js#L28-L40) |
| テリトリー収入にscoreMultiplier適用 | あり（×1.2） | [economy.js:42-43](public/js/economy.js#L42-L43) |
| 自動傭兵 | 300石/人、CD3秒、上限12人 | [economy.js:68-73](public/js/economy.js#L68-L73) |
| 維持費 | 2.0石/秒/人（ボス戦中免除） | [economy.js:47-48](public/js/economy.js#L47-L48) |
| koku=0時 | 3秒ごとに末尾メンバー離脱 | [economy.js:51-65](public/js/economy.js#L51-L65) |
| リクルートコスト | 120石/人（即時リクルート） | [constants.js:27](public/js/constants.js#L27) |

---

## 8. 戦闘システム

### 攻撃（左クリック）([combat.js:201-241](public/js/combat.js#L201-L241))
- キャラごとに異なる弾パターン（上記「攻撃パターン」参照）
- 弾丸は城の五角形ポリゴンに当たると消滅 ([entities.js:957-963](public/js/entities.js#L957-L963))

### 突撃（右クリック）([combat.js:107-196](public/js/combat.js#L107-L196))
- パレード3人以上で発動 ([combat.js:116](public/js/combat.js#L116))
- マウス方向に1.2秒間突進 ([combat.js:131](public/js/combat.js#L131))
- 突撃中の仲間が敵に接触すると5ダメージ ([combat.js:157](public/js/combat.js#L157))
- CD: 6秒 ([combat.js:133](public/js/combat.js#L133))

### 辻斬りQTE（スペースで撃退）([combat.js:247-623](public/js/combat.js#L247-L623) TsujigiriSystem)
- チェック間隔: 1秒 ([combat.js:280](public/js/combat.js#L280))
- 基本確率: 2.5% ([combat.js:399](public/js/combat.js#L399))
- 対象: 野盗 or 侍のみ ([combat.js:398](public/js/combat.js#L398))
- **発生抑制**: 突撃中（ParadeCharge.active/cutinTimer）、一揆中（IkkiSystem.cutinTimer/flashTimer）、殿様戦中は発生しない ([combat.js:392-393](public/js/combat.js#L392-L393), [main.js:1571-1573](public/js/main.js#L1571-L1573))
- 橋上・川上・城エリアでは発生しない ([combat.js:377-380](public/js/combat.js#L377-L380))

#### テリトリー別確率倍率 ([combat.js:368-372](public/js/combat.js#L368-L372))

| 地形 | 足軽 | 商人 | 農民 |
|---|---|---|---|
| 村 | ×0.5 | ×1.5 | ×0.8 |
| 城下町 | ×0.6 | ×2.0 | ×0.8 |
| 草原 | ×0.08 | ×0.05 | ×0.1 |

#### QTE ([combat.js:287-311](public/js/combat.js#L287-L311))
- カットイン: 0.8秒 ([combat.js:411](public/js/combat.js#L411))
- 制限時間: 4.0秒 ([combat.js:311](public/js/combat.js#L311))
- ニードル速度: 足軽0.8、商人1.0、農民1.2 (×0.8~1.2ランダム補正) ([combat.js:295-298](public/js/combat.js#L295-L298))
- ヒットゾーン幅: 0.2 ([combat.js:304](public/js/combat.js#L304))
- 成功: 敵撃破 + 1000石（KokuReward適用）([combat.js:427-429](public/js/combat.js#L427-L429))
- 失敗: 即死 ([combat.js:432-433](public/js/combat.js#L432-L433))

### 一揆（Q、農民Z有のみ）([main.js:97-175](public/js/main.js#L97-L175) IkkiSystem)
- 最低1人の仲間が必要 ([main.js:131](public/js/main.js#L131))
- パレード50%消費（最低1人）([main.js:136](public/js/main.js#L136))
- 画面内の雑魚敵を即死（殿様除く）、石高×2.6倍で獲得 ([main.js:149-160](public/js/main.js#L149-L160))
- 殿様にはパレード人数×8ダメージ ([main.js:137,165](public/js/main.js#L137))
- CD: 10秒 ([main.js:173](public/js/main.js#L173))

### 鼓舞/買収（定義済み・未接続＝デッドコード）([combat.js:628-733](public/js/combat.js#L628-L733))
- **KobuSystem**（足軽用「鼓舞」）: tryActivate()は入力に未接続。getAttackCooldown()=0.7秒がフォロワー攻撃CDとして常時使用されているのみ ([combat.js:667-669](public/js/combat.js#L667-L669))
- **BaishuSystem**（商人用「買収」）: tryActivate()は入力に未接続。完全なデッドコード ([combat.js:675-733](public/js/combat.js#L675-L733))
- 入力接続箇所: main.js:1556-1559 でQキーは農民一揆のみに接続 ([main.js:1556](public/js/main.js#L1556) `if (gameState.ikkiMode)`)

---

## 9. 城の五角形ポリゴン衝突判定 ([entities.js:6-95](public/js/entities.js#L6-L95), [main.js:420-434](public/js/main.js#L420-L434))

城は五角形ポリゴンとして衝突判定される。

```
頂点座標（城中心cx,cyからの相対位置）:
  [cx+0,   cy-180]  ← 頂点（上）
  [cx+140, cy-60]   ← 右上
  [cx+180, cy+180]  ← 右下
  [cx-180, cy+180]  ← 左下
  [cx-140, cy-60]   ← 左上
```

> 参照: [main.js:427-433](public/js/main.js#L427-L433)

- プレイヤー・敵・弾丸すべてに適用 ([entities.js:134-138](public/js/entities.js#L134-L138))
- pointInPolygon()でポリゴン内判定 → resolvePolygonPushOut()で押し出し ([entities.js:6-95](public/js/entities.js#L6-L95))
- 弾丸はポリゴン内に入ると消滅 ([entities.js:957-963](public/js/entities.js#L957-L963))
- 殿様戦のトリガーはexpandPolygon()で城ポリゴンを(プレイヤーサイズ+20px)拡大した領域で判定 ([main.js:581-583](public/js/main.js#L581-L583))

---

## 10. shadowBlurアウトライン

キャラクターの描画時にshadowBlurで発光アウトラインを付与する。

| 対象 | 色 | shadowBlur | 参照 |
|---|---|---|---|
| 味方（パレードメンバー） | 青 rgba(0, 120, 255, 0.8) | 8 | [entities.js:855](public/js/entities.js#L855) |
| 敵（通常） | 赤 rgba(255, 40, 40, 0.8) | 8 | [entities.js:500](public/js/entities.js#L500) |
| 敵（同士討ちフラグ） | 紫 rgba(180, 60, 255, 0.8) | 8 | [entities.js:498](public/js/entities.js#L498) |
| 橋ボス | 紫 rgba(160, 60, 255, 0.9) | 12 | [main.js:348](public/js/main.js#L348) |
| 殿様 | 紫 rgba(160, 60, 255, 0.9) | 12 | [main.js:904](public/js/main.js#L904) |
| 城（ゲート有効時） | 黄 rgba(255, 220, 40, 0.4~0.6) | 20 | [main.js:841](public/js/main.js#L841) |

---

## 11. 操作説明

| 操作 | キー/マウス | 効果 | 参照 |
|---|---|---|---|
| 移動 | WASD | 上下左右移動 | [entities.js:212-215](public/js/entities.js#L212-L215) |
| 攻撃 | 左クリック | キャラ固有の弾発射 | [main.js:1550-1552](public/js/main.js#L1550-L1552), [combat.js:203](public/js/combat.js#L203) |
| 突撃 | 右クリック | マウス方向にパレード突撃（3人以上必要） | [main.js:1553-1555](public/js/main.js#L1553-L1555), [combat.js:115](public/js/combat.js#L115) |
| 辻斬り撃退 | スペース | 辻斬りQTE中にタイミング合わせて撃退 | [combat.js:329](public/js/combat.js#L329) |
| 一揆 | Q | 農民(Z有)のみ。画面内の雑魚敵を即死 | [main.js:1556-1559](public/js/main.js#L1556-L1559) |

---

## 石高(koku)システム

**石高は1つ。通貨もスコアも同一の値。**

※ すべての石高獲得量にキャラクターのscoreMultiplierが乗算される

### 収入

| 手段 | 獲得量 | 備考 | 参照 |
|---|---|---|---|
| 敵撃破 | 敵のscoreValue × KokuReward | 全キャラ共通 | [entities.js:993-995](public/js/entities.js#L993-L995) |
| テリトリー収入（商人） | 城下町+50/s、村+30/s、草原+10/s | ×scoreMultiplier適用 | [economy.js:28-43](public/js/economy.js#L28-L43) |
| 辻斬りQTE成功 | 1000 × KokuReward | | [combat.js:427](public/js/combat.js#L427) |
| 橋ボス撃破 | 2000 × KokuReward | | [main.js:330-331](public/js/main.js#L330-L331) |
| 下克上成功 | (2000 + rankIndex × 1000) × KokuReward | | [main.js:810-813](public/js/main.js#L810-L813) |
| 武功ボーナス（足軽） | 2000 × KokuReward | 殿様を15秒以内に撃破 | [main.js:803-804](public/js/main.js#L803-L804) |
| 一揆（敵撃破） | scoreValue × 2.6 × scoreMultiplier | KokuReward不適用 | [main.js:149-155](public/js/main.js#L149-L155) |

---

## 民衆確定スポーン ([main.js:1437-1455](public/js/main.js#L1437-L1455))

- ゲーム開始時にプレイヤー近傍100〜150pxの範囲に民間人1体を確定スポーン
- 通常の民間人スポーンロジック（間隔4秒、15体未満で追加、最大20体）とは独立
- 民間人スポーン元: 村・城下町の両方から出現 ([entities.js:554-564](public/js/entities.js#L554-L564))

---

## ゲーム全体

- 制限時間: 通常60秒 ([constants.js:9](public/js/constants.js#L9))、農民(Z有)50秒 ([main.js:1542](public/js/main.js#L1542))
- 川: 速度×0.3 ([entities.js:208](public/js/entities.js#L208))
- ノックバック: 0.3秒 ([entities.js:241](public/js/entities.js#L241))
- 民間人最大: 20体 ([entities.js:552](public/js/entities.js#L552))、15体未満で追加スポーン（間隔4秒）([entities.js:599-601](public/js/entities.js#L599-L601))

---

## マップ生成 (terrain.js / main.js)

### 地形配置
- 3×3グリッド（9ブロック、各1280×720px）([constants.js:2-7](public/js/constants.js#L2-L7))
- 城: 左端列 or 右端列のランダム1マス
- 城下町: 城に隣接する1マス
- 草原: プレイヤー近傍のEMPTYマスに60%確率（最大3）
- **村: EMPTYマスから2〜3個をランダム選択（最低2保証）**
- プレイヤー側に村がない場合、1つ強制配置

### 建物レイアウト ([main.js:961-1117](public/js/main.js#L961-L1117) HouseManager)
- **城下町**: 通り配置（3〜4行）([main.js:1025](public/js/main.js#L1025))。各通りに2つ or 4つ横並びのグループを左から詰めて配置 ([main.js:1035-1063](public/js/main.js#L1035-L1063))。行間はキャラ通行可
- **村**: クラスタ配置（2〜3クラスタ × 3〜5棟/クラスタ）([main.js:1079,1088](public/js/main.js#L1079))

---

## カットイン演出

| イベント | テキスト | 色 | 持続時間 |
|---|---|---|---|
| 辻斬り撃退成功 | 撃退成功！ | 緑(#33cc33) | resolve中(0.3秒) |
| 突撃発動 | 突撃！！ | — | カットイン0.8秒 |
| 一揆発動 | — | — | カットイン0.8秒 + フラッシュ0.3秒 |

> 参照: 辻斬り ([combat.js:527-529](public/js/combat.js#L527-L529)), 突撃 ([combat.js:132](public/js/combat.js#L132)), 一揆 ([main.js:171-172](public/js/main.js#L171-L172))

---

## UI

### ミニマップ ([ui.js:6-91](public/js/ui.js#L6-L91) MinimapRenderer)
- サイズ: 160×120px、位置: 左上(10,10) ([constants.js:10-13](public/js/constants.js#L10-L13))
- プレイヤー: 白三角矢印（WASD入力方向に回転）([ui.js:72-85](public/js/ui.js#L72-L85))
- 民間人: 緑ドット ([ui.js:66-69](public/js/ui.js#L66-L69))
- 城: 赤四角 ([ui.js:61-62](public/js/ui.js#L61-L62))
- カメラ範囲: 半透明枠 ([ui.js:88-90](public/js/ui.js#L88-L90))
- 地形ブロック: 漢字ラベル（城/町/村）([ui.js:35-46](public/js/ui.js#L35-L46))
