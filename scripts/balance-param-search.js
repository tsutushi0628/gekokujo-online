#!/usr/bin/env node
// ============================================================
// 下克上オンライン バランスパラメータ探索 (実エンジン版)
//
// 目標バランス:
//   高スキル順序: 農民Q > 農民 > 商人 > 足軽
//   低スキル順序: 足軽 > 商人 >> 農民 > 農民Q
//   レンジ(max-min): 農民Q >>> 農民 > 商人 > 足軽
//   全スキル平均:   全キャラ同じ (±10%以内)
//   殿様撃破率:     ~70%
//   天下人到達率:   ~80%
//   Min=0は仕様(即死あり)。ただし実際には低頻度。
//
// Usage: node scripts/balance-param-search.js [--trials=N] [--top=N]
// ============================================================

"use strict";

const path = require("path");
const { GameEngine } = require("./headless-sim/engine");
const { AIPlayer } = require("./headless-sim/ai-player");

// ============================================================
// CLI引数
// ============================================================
const args = process.argv.slice(2);
let TRIALS = 150;
let TOP_N = 5;

for (const arg of args) {
  if (arg.startsWith("--trials=")) {
    TRIALS = parseInt(arg.split("=")[1], 10);
  }
  if (arg.startsWith("--top=")) {
    TOP_N = parseInt(arg.split("=")[1], 10);
  }
}

// ============================================================
// 1ゲーム実行 (runner.js の runSingleGame を簡略化)
// ============================================================
function runSingleGame(charKey, ikkiMode, skillLevel, paramOverrides) {
  const tsujigiriRates = { high: 0.9, mid: 0.65, low: 0.35 };
  const merged = Object.assign({}, paramOverrides);
  if (merged.tsujigiriSuccessRate == null) {
    merged.tsujigiriSuccessRate = tsujigiriRates[skillLevel];
  }

  const engine = new GameEngine(charKey, ikkiMode, { paramOverrides: merged });
  const ai = new AIPlayer(skillLevel, charKey, ikkiMode);

  while (!engine.isGameOver()) {
    const state = engine.getState();
    const action = ai.decide(state);
    engine.tick(0.1, action);
  }

  const result = engine.getResult();
  return {
    score: result.koku,
    bossDefeated: result.bossDefeated,
    rank: result.rankName,
    died: engine.player.hp <= 0,
  };
}

// ============================================================
// mixedスキル割り当て (30%低/50%中/20%高)
// ============================================================
function pickMixedSkill() {
  const r = Math.random();
  if (r < 0.3) return "low";
  if (r < 0.8) return "mid";
  return "high";
}

// ============================================================
// モンテカルロ実行
// ============================================================
function runMonteCarlo(charKey, ikkiMode, skillLevel, trials, paramOverrides) {
  const scores = [];
  let bossWins = 0;
  let tenkaCount = 0;
  let deaths = 0;

  for (let i = 0; i < trials; i++) {
    const effectiveSkill = skillLevel === "mixed" ? pickMixedSkill() : skillLevel;
    const r = runSingleGame(charKey, ikkiMode, effectiveSkill, paramOverrides);
    scores.push(r.score);
    if (r.bossDefeated) bossWins++;
    if (r.rank === "天下人") tenkaCount++;
    if (r.died) deaths++;
  }

  scores.sort(function(a, b) { return a - b; });
  const count = scores.length;
  const sum = scores.reduce(function(acc, v) { return acc + v; }, 0);

  return {
    min: scores[0],
    max: scores[count - 1],
    avg: Math.round(sum / count),
    p10: scores[Math.floor(count * 0.1)],
    p50: scores[Math.floor(count * 0.5)],
    p90: scores[Math.floor(count * 0.9)],
    range: scores[count - 1] - scores[0],
    bossRate: Math.round(bossWins / count * 100),
    tenkaRate: Math.round(tenkaCount / count * 100),
    deathRate: Math.round(deaths / count * 100),
  };
}

// ============================================================
// キャラ別オーバーライドでフルテスト
// ============================================================
function runFullTestV2(perCharOverrides, trials) {
  const charConfigs = [
    { key: "ashigaru", ikki: false, label: "足軽" },
    { key: "merchant", ikki: false, label: "商人" },
    { key: "farmer", ikki: false, label: "農民Q無" },
    { key: "farmer", ikki: true, label: "農民Q有" },
  ];
  const skills = ["low", "mid", "high"];

  const bySkill = {};
  const mixed = {};

  for (const cc of charConfigs) {
    const overrides = perCharOverrides[cc.label] ? perCharOverrides[cc.label] : {};
    for (const sk of skills) {
      const result = runMonteCarlo(cc.key, cc.ikki, sk, trials, overrides);
      bySkill[cc.label + "_" + sk] = result;
    }
    const mixedResult = runMonteCarlo(cc.key, cc.ikki, "mixed", trials, overrides);
    mixed[cc.label] = mixedResult;
  }

  return { bySkill, mixed };
}

// ============================================================
// フィットネス評価
// ============================================================
function evaluateFitness(testResult) {
  const bs = testResult.bySkill;
  const mx = testResult.mixed;

  let penalty = 0;

  // ── 1. 高スキル順序: 農民Q > 農民 > 商人 > 足軽 (重み: HIGH) ──
  const highAvgs = {
    ashi: bs["足軽_high"].avg,
    merch: bs["商人_high"].avg,
    farmer: bs["農民Q無_high"].avg,
    farmerQ: bs["農民Q有_high"].avg,
  };
  if (highAvgs.farmerQ <= highAvgs.farmer) penalty += 4;
  if (highAvgs.farmer <= highAvgs.merch) penalty += 4;
  if (highAvgs.merch <= highAvgs.ashi) penalty += 4;
  // ボーナス: 差が十分ある
  if (highAvgs.farmerQ > highAvgs.farmer * 1.1) penalty -= 0.5;
  if (highAvgs.farmer > highAvgs.merch * 1.05) penalty -= 0.3;

  // ── 2. 低スキル順序: 足軽 > 商人 >> 農民 > 農民Q (重み: HIGH) ──
  const lowAvgs = {
    ashi: bs["足軽_low"].avg,
    merch: bs["商人_low"].avg,
    farmer: bs["農民Q無_low"].avg,
    farmerQ: bs["農民Q有_low"].avg,
  };
  if (lowAvgs.ashi <= lowAvgs.merch) penalty += 4;
  if (lowAvgs.merch <= lowAvgs.farmer) penalty += 4;
  if (lowAvgs.farmer <= lowAvgs.farmerQ) penalty += 4;
  // >> = clear gap between 商人 and 農民
  const merchantFarmerGap = lowAvgs.merch > 0 ? (lowAvgs.merch - lowAvgs.farmer) / lowAvgs.merch : 0;
  if (merchantFarmerGap > 0.3) penalty -= 0.5;

  // ── 3. レンジ(max-min): 農民Q >>> 農民 > 商人 > 足軽 (重み: MEDIUM) ──
  const ranges = {
    ashi: mx["足軽"].range,
    merch: mx["商人"].range,
    farmer: mx["農民Q無"].range,
    farmerQ: mx["農民Q有"].range,
  };
  if (ranges.farmerQ <= ranges.farmer) penalty += 2;
  if (ranges.farmer <= ranges.merch) penalty += 2;
  if (ranges.merch <= ranges.ashi) penalty += 2;
  if (ranges.farmerQ > ranges.farmer * 1.5) penalty -= 0.5;

  // ── 4. 全スキル平均: 全キャラ同じ (±10%以内) (重み: HIGHEST) ──
  const allAvgs = [mx["足軽"].avg, mx["商人"].avg, mx["農民Q無"].avg, mx["農民Q有"].avg];
  const globalAvg = allAvgs.reduce(function(a, b) { return a + b; }, 0) / 4;
  let maxDeviation = 0;
  for (const a of allAvgs) {
    const dev = Math.abs(a - globalAvg) / globalAvg;
    if (dev > maxDeviation) maxDeviation = dev;
    // 10%以内なら軽いペナルティ、超えたら重い
    if (dev <= 0.1) {
      penalty += dev * 5;
    } else {
      penalty += 0.5 + (dev - 0.1) * 15;
    }
  }

  // ── 5. 殿様撃破率 ~70% (重み: HIGH) ──
  const bossRates = [mx["足軽"].bossRate, mx["商人"].bossRate, mx["農民Q無"].bossRate, mx["農民Q有"].bossRate];
  const avgBoss = bossRates.reduce(function(a, b) { return a + b; }, 0) / 4;
  penalty += Math.abs(avgBoss - 70) / 100 * 5;
  for (const rate of bossRates) {
    if (rate < 30) penalty += (30 - rate) / 100 * 3;
    if (rate > 95) penalty += (rate - 95) / 100 * 1;
  }

  // ── 6. 天下人到達率 ~80% (重み: HIGH) ──
  const tenkaRates = [mx["足軽"].tenkaRate, mx["商人"].tenkaRate, mx["農民Q無"].tenkaRate, mx["農民Q有"].tenkaRate];
  const avgTenka = tenkaRates.reduce(function(a, b) { return a + b; }, 0) / 4;
  penalty += Math.abs(avgTenka - 80) / 100 * 5;

  // ── 7. 死亡率ペナルティ: 50%以下が望ましい ──
  const deathRates = [mx["足軽"].deathRate, mx["商人"].deathRate, mx["農民Q無"].deathRate, mx["農民Q有"].deathRate];
  const avgDeath = deathRates.reduce(function(a, b) { return a + b; }, 0) / 4;
  if (avgDeath > 50) {
    penalty += (avgDeath - 50) / 100 * 2;
  }

  return {
    penalty,
    globalAvg,
    maxDeviation,
    avgBoss,
    avgTenka,
    avgDeath,
    highAvgs,
    lowAvgs,
    ranges,
  };
}

// ============================================================
// パラメータ候補生成 (キャラ別オーバーライド対応)
//
// === 分析結果 ===
// 死亡率の主因は辻斬り失敗=即死(engine.js:1597)。DTMでは制御不可。
// tsujigiriBaseChance(現行0.025)を下げると死亡率が劇的に改善:
//   0.025 → 死亡率67-88%
//   0.010 → 死亡率57-84%
//   0.005 → 死亡率25-62%
//
// 商人の辻斬り地形倍率が高い(村1.5/城下町2.0)ため商人死亡率が高い。
//
// === 調整レバー ===
// 1. tsujigiriBaseChance: 死亡率全体制御 (0.005-0.015)
// 2. tsujigiriTerrainChances: キャラ別辻斬り遭遇頻度
// 3. bossHp: 殿様撃破率
// 4. scoreMultiplier: スコア順序
// 5. damageTakenMultiplier: 敵ダメ死亡率微調整
// ============================================================
function generateCandidatesV2() {
  var candidates = [];

  function makeCandidate(name, opts) {
    var base = {};
    if (opts.bossHp !== undefined) base.bossHp = opts.bossHp;
    if (opts.tsujigiriBaseChance !== undefined) base.tsujigiriBaseChance = opts.tsujigiriBaseChance;

    var ashiOver = Object.assign({}, base);
    var merchOver = Object.assign({}, base);
    var farmerOver = Object.assign({}, base);
    var farmerQOver = Object.assign({}, base);

    if (opts.ashiCharDef) ashiOver.charDef = Object.assign({}, opts.ashiCharDef);
    if (opts.merchCharDef) merchOver.charDef = Object.assign({}, opts.merchCharDef);
    if (opts.farmerCharDef) farmerOver.charDef = Object.assign({}, opts.farmerCharDef);
    if (opts.farmerQCharDef) {
      farmerQOver.charDef = Object.assign({}, opts.farmerQCharDef);
    } else if (opts.farmerCharDef) {
      farmerQOver.charDef = Object.assign({}, opts.farmerCharDef);
    }

    if (opts.merchTsujTerrainChances) {
      merchOver.tsujigiriTerrainChances = opts.merchTsujTerrainChances;
    }

    candidates.push({
      name,
      perCharOverrides: {
        "足軽": ashiOver,
        "商人": merchOver,
        "農民Q無": farmerOver,
        "農民Q有": farmerQOver,
      },
    });
  }

  // ============================================================
  // Round 3: 構造的制約を踏まえた最適化
  //
  // 判明した構造的制約:
  //   - 農民Q有lowは一揆(2.6x, minParade=1)で常に高スコア → SM調整では抑制不可
  //   - 低スキル順序 足軽>商人は、商人initialKoku=6500の保証により困難
  //   - Boss/天下人率は50%前後が限界(死亡率40-50%で到達前に死ぬ)
  //
  // 戦略:
  //   - 達成可能な目標に集中: 高スキル順序, レンジ順序, 平均±偏差
  //   - 低スキル順序は「足軽≈商人 >> 農民≈農民Q」を妥協案として探索
  //   - 農民Q有のSMを農民Q無より大きくし、高スキルでの差を確保
  //   - T0.003-0.005でboss到達確率を上げ、B50-100で撃破率UP
  // ============================================================

  // ── ベースライン ──
  makeCandidate("ベースライン", {});

  // ── A群: バランス重視 (平均偏差を最小化) ──
  // 農民SM1.2-1.4で平均を揃えつつ、高スキル順序を確保
  makeCandidate("T0.003+B100+SM(A1.0/M0.9/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.003, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.003+B100+SM(A1.0/M0.8/F1.4/FQ1.5)", {
    tsujigiriBaseChance: 0.003, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.8 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.5 },
  });
  makeCandidate("T0.005+B100+SM(A1.0/M0.8/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.005, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.8 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.005+B100+SM(A1.0/M0.9/F1.4/FQ1.5)", {
    tsujigiriBaseChance: 0.005, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.5 },
  });

  // ── B群: B50でboss確殺 + 控えめSM ──
  makeCandidate("T0.003+B50+SM(A1.0/M0.9/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.003, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.003+B50+SM(A1.0/M0.8/F1.3/FQ1.5)", {
    tsujigiriBaseChance: 0.003, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.8 },
    farmerCharDef: { scoreMultiplier: 1.3 },
    farmerQCharDef: { scoreMultiplier: 1.5 },
  });
  makeCandidate("T0.005+B50+SM(A1.0/M0.9/F1.4/FQ1.5)", {
    tsujigiriBaseChance: 0.005, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.5 },
  });

  // ── C群: DTM足軽で低スキル生存率UP ──
  makeCandidate("T0.003+B100+SM(A1.0/M0.9/F1.4/FQ1.6)+DTM(A0.5)", {
    tsujigiriBaseChance: 0.003, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.003+B50+SM(A1.0/M0.9/F1.4/FQ1.6)+DTM(A0.5)", {
    tsujigiriBaseChance: 0.003, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.005+B100+SM(A1.0/M0.9/F1.4/FQ1.5)+DTM(A0.5)", {
    tsujigiriBaseChance: 0.005, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.5 },
  });

  // ── D群: 商人terrain下げ + DTM ──
  makeCandidate("T0.003+B100+SM(A1.0/M0.9/F1.4/FQ1.6)+DTM(A0.5)+MT", {
    tsujigiriBaseChance: 0.003, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
    merchTsujTerrainChances: { village: 1.0, castleTown: 1.2 },
  });
  makeCandidate("T0.003+B50+SM(A1.0/M0.9/F1.4/FQ1.6)+DTM(A0.5)+MT", {
    tsujigiriBaseChance: 0.003, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
    merchTsujTerrainChances: { village: 1.0, castleTown: 1.2 },
  });

  // ── E群: 商人SM=1.0 (初期石6500の効果を保ちつつ高スキルで追い上げ) ──
  makeCandidate("T0.003+B100+SM(A1.0/M1.0/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.003, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 1.0 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.003+B50+SM(A1.0/M1.0/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.003, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 1.0 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });

  // ── F群: T0.002 (辻斬り最小化) ──
  makeCandidate("T0.002+B100+SM(A1.0/M0.9/F1.4/FQ1.6)", {
    tsujigiriBaseChance: 0.002, bossHp: 100,
    ashiCharDef: { scoreMultiplier: 1.0 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });
  makeCandidate("T0.002+B50+SM(A1.0/M0.9/F1.4/FQ1.6)+DTM(A0.5)", {
    tsujigiriBaseChance: 0.002, bossHp: 50,
    ashiCharDef: { scoreMultiplier: 1.0, damageTakenMultiplier: 0.5 },
    merchCharDef: { scoreMultiplier: 0.9 },
    farmerCharDef: { scoreMultiplier: 1.4 },
    farmerQCharDef: { scoreMultiplier: 1.6 },
  });

  return candidates;
}


// ============================================================
// 表示ユーティリティ
// ============================================================
function pad(val, len) {
  let s = String(val);
  while (s.length < len) s = " " + s;
  return s;
}

function padR(val, len) {
  let s = String(val);
  while (s.length < len) s = s + " ";
  return s;
}

// ============================================================
// 結果表示
// ============================================================
function printResult(name, testResult, fitness, rank) {
  const mx = testResult.mixed;
  const bs = testResult.bySkill;

  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  #" + rank + "  " + padR(name, 55) + "Penalty: " + fitness.penalty.toFixed(3));
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");

  // Mixed scores table
  console.log("  [全スキル混合 (mixed)]");
  console.log("  ┌──────────┬────────┬────────┬────────┬────────┬──────┬──────┬──────┐");
  console.log("  │ キャラ   │  最低  │  平均  │  最高  │ レンジ │Boss率│天下人│死亡率│");
  console.log("  ├──────────┼────────┼────────┼────────┼────────┼──────┼──────┼──────┤");

  const labels = ["足軽", "商人", "農民Q無", "農民Q有"];
  for (const label of labels) {
    const d = mx[label];
    console.log(
      "  │ " + padR(label, 8) +
      " │ " + pad(d.min, 6) +
      " │ " + pad(d.avg, 6) +
      " │ " + pad(d.max, 6) +
      " │ " + pad(d.range, 6) +
      " │" + pad(d.bossRate + "%", 5) +
      " │" + pad(d.tenkaRate + "%", 5) +
      " │" + pad(d.deathRate + "%", 5) + " │"
    );
  }
  console.log("  └──────────┴────────┴────────┴────────┴────────┴──────┴──────┴──────┘");

  // Skill breakdown
  console.log("  [スキル別平均]");
  console.log("  ┌──────────┬──────────┬──────────┬──────────┐");
  console.log("  │ キャラ   │ 低スキル │ 中スキル │ 高スキル │");
  console.log("  ├──────────┼──────────┼──────────┼──────────┤");
  for (const label of labels) {
    const lo = bs[label + "_low"];
    const mi = bs[label + "_mid"];
    const hi = bs[label + "_high"];
    console.log(
      "  │ " + padR(label, 8) +
      " │ avg " + pad(lo.avg, 5) +
      "│ avg " + pad(mi.avg, 5) +
      "│ avg " + pad(hi.avg, 5) + "│"
    );
  }
  console.log("  └──────────┴──────────┴──────────┴──────────┘");

  // Balance check
  console.log("  [バランスチェック]");
  console.log("    平均偏差: ±" + (fitness.maxDeviation * 100).toFixed(1) + "% (目標: ±10%以内)");
  console.log("    殿様撃破率: " + fitness.avgBoss.toFixed(0) + "% (目標: ~70%)");
  console.log("    天下人到達率: " + fitness.avgTenka.toFixed(0) + "% (目標: ~80%)");
  console.log("    平均死亡率: " + fitness.avgDeath.toFixed(0) + "%");

  const hiOk = fitness.highAvgs.farmerQ > fitness.highAvgs.farmer
    && fitness.highAvgs.farmer > fitness.highAvgs.merch
    && fitness.highAvgs.merch > fitness.highAvgs.ashi;
  console.log("    高スキル順序 (Q有>Q無>商>足): " + (hiOk ? "OK" : "NG") +
    " (" + fitness.highAvgs.farmerQ + " > " + fitness.highAvgs.farmer + " > " + fitness.highAvgs.merch + " > " + fitness.highAvgs.ashi + ")");

  const loOk = fitness.lowAvgs.ashi > fitness.lowAvgs.merch
    && fitness.lowAvgs.merch > fitness.lowAvgs.farmer
    && fitness.lowAvgs.farmer > fitness.lowAvgs.farmerQ;
  console.log("    低スキル順序 (足>商>>農>Q有): " + (loOk ? "OK" : "NG") +
    " (" + fitness.lowAvgs.ashi + " > " + fitness.lowAvgs.merch + " > " + fitness.lowAvgs.farmer + " > " + fitness.lowAvgs.farmerQ + ")");

  const rgOk = fitness.ranges.farmerQ > fitness.ranges.farmer
    && fitness.ranges.farmer > fitness.ranges.merch
    && fitness.ranges.merch > fitness.ranges.ashi;
  console.log("    レンジ順序 (Q有>Q無>商>足): " + (rgOk ? "OK" : "NG") +
    " (" + fitness.ranges.farmerQ + " > " + fitness.ranges.farmer + " > " + fitness.ranges.merch + " > " + fitness.ranges.ashi + ")");

  console.log("");
}

// ============================================================
// メイン
// ============================================================
function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║   下克上オンライン バランスパラメータ探索 (実エンジン版)                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");
  console.log("  試行回数: " + TRIALS + " trials/char/skill");
  console.log("  目標: 高スキル(Q有>Q無>商>足), 低スキル(足>商>>農>Q有), レンジ(Q有>>>Q無>商>足), 平均±10%");
  console.log("");

  const candidates = generateCandidatesV2();
  console.log("  探索候補: " + candidates.length + " 件\n");

  const evaluated = [];
  const startTime = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    process.stdout.write("  [" + (i + 1) + "/" + candidates.length + "] " + c.name + " ...");

    const testResult = runFullTestV2(c.perCharOverrides, TRIALS);
    const fitness = evaluateFitness(testResult);

    evaluated.push({
      name: c.name,
      overrides: c.perCharOverrides,
      testResult,
      fitness,
    });

    console.log(" penalty=" + fitness.penalty.toFixed(3) +
      " boss=" + fitness.avgBoss.toFixed(0) + "%" +
      " tenka=" + fitness.avgTenka.toFixed(0) + "%" +
      " death=" + fitness.avgDeath.toFixed(0) + "%");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n  完了: " + elapsed + "秒\n");

  // ペナルティ昇順でソート (低い方が良い)
  evaluated.sort(function(a, b) { return a.fitness.penalty - b.fitness.penalty; });

  console.log("========== TOP " + TOP_N + " RESULTS ==========\n");

  const topCount = Math.min(TOP_N, evaluated.length);
  for (let i = 0; i < topCount; i++) {
    const e = evaluated[i];
    printResult(e.name, e.testResult, e.fitness, i + 1);
  }

  // paramOverrides形式で出力
  console.log("========== TOP 1 paramOverrides (JSON) ==========\n");
  const best = evaluated[0];
  console.log("// キャラ別paramOverrides:");
  console.log("// 足軽:");
  console.log(JSON.stringify(best.overrides["足軽"], null, 2));
  console.log("// 商人:");
  console.log(JSON.stringify(best.overrides["商人"], null, 2));
  console.log("// 農民Q無:");
  console.log(JSON.stringify(best.overrides["農民Q無"], null, 2));
  console.log("// 農民Q有:");
  console.log(JSON.stringify(best.overrides["農民Q有"], null, 2));
}

main();
