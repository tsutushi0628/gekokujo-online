#!/usr/bin/env node
// ============================================================
// 下克上オンライン ヘッドレスシミュレーション ランナー
// Usage: node scripts/headless-sim/runner.js [options]
//   --trials=N       試行回数/config (default: 100)
//   --skill=LEVEL    スキルレベル限定 (low/mid/high/mixed)
//   --char=KEY       キャラ限定 (ashigaru/merchant/farmer)
//   --verbose        全ゲームのログ表示
//   --log-game=N     指定ゲーム番号の詳細ログ表示
//   --params=FILE    パラメータオーバーライドJSONファイル
// ============================================================

const fs = require("fs");
const path = require("path");
const { GameEngine } = require("./engine");
const { AIPlayer, SKILL_PARAMS } = require("./ai-player");

// ============================================================
// CLI引数パース
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    trials: 100,
    skill: null,
    char: null,
    verbose: false,
    logGame: null,
    paramsFile: null,
  };

  for (const arg of args) {
    if (arg === "--verbose") {
      parsed.verbose = true;
    } else if (arg.startsWith("--trials=")) {
      parsed.trials = parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(parsed.trials) || parsed.trials < 1) {
        throw new Error("--trials には正の整数を指定してください");
      }
    } else if (arg.startsWith("--skill=")) {
      const skill = arg.split("=")[1];
      const validSkills = ["low", "mid", "high", "mixed"];
      if (!validSkills.includes(skill)) {
        throw new Error("--skill には low/mid/high/mixed のいずれかを指定してください");
      }
      parsed.skill = skill;
    } else if (arg.startsWith("--char=")) {
      const charKey = arg.split("=")[1];
      const validChars = ["ashigaru", "merchant", "farmer"];
      if (!validChars.includes(charKey)) {
        throw new Error("--char には ashigaru/merchant/farmer のいずれかを指定してください");
      }
      parsed.char = charKey;
    } else if (arg.startsWith("--log-game=")) {
      parsed.logGame = parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(parsed.logGame) || parsed.logGame < 1) {
        throw new Error("--log-game には正の整数を指定してください");
      }
    } else if (arg.startsWith("--params=")) {
      parsed.paramsFile = arg.split("=")[1];
    }
  }

  return parsed;
}

// ============================================================
// パラメータオーバーライド読み込み
// ============================================================
function loadParamOverrides(filePath) {
  if (!filePath) {
    return null;
  }
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw);
}

// ============================================================
// 設定（キャラ × スキルの組み合わせ）
// ============================================================
function buildConfigs(args) {
  const charConfigs = [];

  if (args.char === "ashigaru" || !args.char) {
    charConfigs.push({ charKey: "ashigaru", ikkiMode: false, label: "足軽" });
  }
  if (args.char === "merchant" || !args.char) {
    charConfigs.push({ charKey: "merchant", ikkiMode: false, label: "商人" });
  }
  if (args.char === "farmer" || !args.char) {
    charConfigs.push({ charKey: "farmer", ikkiMode: false, label: "農民Q無" });
    charConfigs.push({ charKey: "farmer", ikkiMode: true, label: "農民Q有" });
  }

  const skillLevels = [];
  if (args.skill === "mixed") {
    skillLevels.push("mixed");
  } else if (args.skill) {
    skillLevels.push(args.skill);
  } else {
    skillLevels.push("low", "mid", "high");
  }

  const configs = [];
  for (const cc of charConfigs) {
    for (const skill of skillLevels) {
      configs.push({
        charKey: cc.charKey,
        ikkiMode: cc.ikkiMode,
        label: cc.label,
        skill: skill,
      });
    }
  }

  return configs;
}

// ============================================================
// mixed スキルの割り当て（30%低/50%中/20%高）
// ============================================================
function pickMixedSkill() {
  const r = Math.random();
  if (r < 0.3) return "low";
  if (r < 0.8) return "mid";
  return "high";
}

// ============================================================
// 1ゲーム実行（ログ収集付き）
// ============================================================
function runSingleGame(charKey, ikkiMode, skillLevel, paramOverrides, collectLog) {
  // Merge skill-based tsujigiri success rate into param overrides
  const mergedOverrides = Object.assign({}, paramOverrides);
  if (mergedOverrides.tsujigiriSuccessRate == null) {
    mergedOverrides.tsujigiriSuccessRate = SKILL_PARAMS[skillLevel].tsujigiriSuccessRate;
  }
  const engine = new GameEngine(charKey, ikkiMode, { paramOverrides: mergedOverrides });
  const ai = new AIPlayer(skillLevel, charKey, ikkiMode);

  const eventLog = [];
  let peakParade = 0;
  let enemyKills = 0;
  let tsujigiriSuccess = 0;
  let tsujigiriFail = 0;
  let bossTriggeredTime = null;
  let lastBossKey = null;
  let realTime = 0;
  let gateLoggedOnce = false;

  while (!engine.isGameOver()) {
    const state = engine.getState();
    realTime += 0.1;

    // ピークパレード追跡
    if (state.player.paradeLen > peakParade) {
      peakParade = state.player.paradeLen;
    }

    const prevEnemyKills = engine.stats.enemyKills;
    const prevKoku = state.player.koku;
    const prevParade = state.player.paradeLen;
    const prevPhase = state.game.phase;

    const action = ai.decide(state);
    engine.tick(0.1, action);

    const nextState = engine.getState();
    const nextEnemyKills = engine.stats.enemyKills;

    // イベント検出（ログ収集時のみ）
    if (collectLog) {
      const t = realTime.toFixed(1);

      // リクルート
      if (nextState.player.paradeLen > prevParade && prevPhase !== "boss") {
        const diff = nextState.player.paradeLen - prevParade;
        if (diff >= 1) {
          eventLog.push({
            time: parseFloat(t),
            type: "RECRUIT",
            message: "民間人リクルート成功 パレード" + Math.floor(nextState.player.paradeLen) + "人",
          });
        }
      }

      // 敵撃破
      if (nextEnemyKills > prevEnemyKills) {
        const killDiff = nextEnemyKills - prevEnemyKills;
        const kokuDiff = nextState.player.koku - prevKoku;
        enemyKills += killDiff;
        let msg = "敵撃破 +" + Math.floor(kokuDiff) + "石";
        msg += " 合計: " + Math.floor(nextState.player.koku) + "石";
        eventLog.push({ time: parseFloat(t), type: "FIGHT", message: msg });
      }

      // フェーズ遷移
      const nextPhase = nextState.game.phase;

      // 城門が開いた（gateActive切り替わり検知）
      if (nextState.game.gateActive && !gateLoggedOnce) {
        gateLoggedOnce = true;
        bossTriggeredTime = parseFloat(t);
        eventLog.push({
          time: parseFloat(t),
          type: "EVENT",
          message: "城門が開いた!",
        });
      }

      if (nextPhase !== prevPhase) {
        if (nextPhase === "boss") {
          const bossHpStr = nextState.boss ? nextState.boss.hp : "?";
          eventLog.push({
            time: parseFloat(t),
            type: "BOSS",
            message: "殿様戦開始! HP" + bossHpStr + " パレード" + Math.floor(nextState.player.paradeLen) + "人",
          });
        }
      }

      // ボス行動（状態変化時のみ）
      if (nextState.boss && nextState.boss.active) {
        const bossKey = nextState.boss.state + "_" + nextState.boss.hp;
        if (bossKey !== lastBossKey) {
          lastBossKey = bossKey;
          let bossMsg = nextState.boss.state + " HP=" + nextState.boss.hp;
          eventLog.push({
            time: parseFloat(t),
            type: "BOSS",
            message: bossMsg,
          });
        }
      }

      // プレイヤー死亡
      if (nextState.player.hp <= 0 && prevPhase !== "gameover") {
        eventLog.push({
          time: parseFloat(t),
          type: "DEATH",
          message: "HP0! 討ち死に...",
        });
      }

      // ボス撃破
      if (nextState.boss && nextState.boss.defeated && engine.bossDefeated) {
        eventLog.push({
          time: parseFloat(t),
          type: "BOSS",
          message: "殿様撃破!",
        });
      }
    } else {
      // ログ収集なしの場合も基本統計は追跡
      if (nextEnemyKills > prevEnemyKills) {
        enemyKills += nextEnemyKills - prevEnemyKills;
      }
      if (nextState.game.gateActive && bossTriggeredTime === null) {
        bossTriggeredTime = realTime;
      }
    }
  }

  const result = engine.getResult();

  return {
    score: result.koku,
    bossDefeated: result.bossDefeated,
    rank: result.rankName,
    peakParade: peakParade,
    enemyKills: enemyKills,
    bossTriggeredTime: bossTriggeredTime,
    died: engine.player.hp <= 0,
    tsujigiriSuccess: result.stats.tsujigiriSuccess,
    tsujigiriFail: result.stats.tsujigiriFail,
    chargeCount: result.stats.chargeUses,
    ikkiUseCount: result.stats.ikkiUses,
    eventLog: eventLog,
    gameTime: result.gameTime,
  };
}

// ============================================================
// 統計計算
// ============================================================
function computeStats(results) {
  const scores = results.map(function(r) { return r.score; });
  scores.sort(function(a, b) { return a - b; });

  const count = scores.length;
  const sum = scores.reduce(function(acc, v) { return acc + v; }, 0);

  let bossDefeatedCount = 0;
  let diedCount = 0;
  let totalPeakParade = 0;
  let totalEnemyKills = 0;
  let totalBossTime = 0;
  let bossTimeCount = 0;
  let totalTsujigiriSuccess = 0;
  let totalTsujigiriFail = 0;
  let totalChargeCount = 0;
  let totalIkkiUseCount = 0;
  let tenkaCount = 0;

  for (const r of results) {
    if (r.bossDefeated) bossDefeatedCount++;
    if (r.died) diedCount++;
    totalPeakParade += r.peakParade;
    totalEnemyKills += r.enemyKills;
    if (r.bossTriggeredTime !== null) {
      totalBossTime += r.bossTriggeredTime;
      bossTimeCount++;
    }
    totalTsujigiriSuccess += r.tsujigiriSuccess;
    totalTsujigiriFail += r.tsujigiriFail;
    totalChargeCount += r.chargeCount;
    totalIkkiUseCount += r.ikkiUseCount;
    if (r.rank === "天下人") tenkaCount++;
  }

  return {
    min: scores[0],
    p10: scores[Math.floor(count * 0.1)],
    avg: Math.round(sum / count),
    median: scores[Math.floor(count * 0.5)],
    p90: scores[Math.floor(count * 0.9)],
    max: scores[count - 1],
    range: scores[count - 1] - scores[0],
    bossDefeatRate: Math.round(bossDefeatedCount / count * 100),
    tenkaRate: Math.round(tenkaCount / count * 100),
    avgPeakParade: Math.round(totalPeakParade / count * 10) / 10,
    avgEnemyKills: Math.round(totalEnemyKills / count * 10) / 10,
    avgBossTime: bossTimeCount > 0 ? Math.round(totalBossTime / bossTimeCount * 10) / 10 : null,
    deathRate: Math.round(diedCount / count * 100),
    tsujigiriSuccess: totalTsujigiriSuccess,
    tsujigiriFail: totalTsujigiriFail,
    avgChargeCount: Math.round(totalChargeCount / count * 10) / 10,
    avgIkkiUseCount: Math.round(totalIkkiUseCount / count * 10) / 10,
    count: count,
  };
}

// ============================================================
// ユーティリティ
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

function formatPercent(rate) {
  return pad(rate + "%", 5);
}

// ============================================================
// 詳細ゲームログ出力
// ============================================================
function printGameLog(gameNum, label, skill, result) {
  console.log("");
  console.log("=== Game #" + gameNum + ": " + label + " (" + skill + " skill) ===");

  if (result.eventLog.length === 0) {
    console.log("  (イベントログなし)");
    console.log("  Result: " + result.score.toLocaleString() + "石 " + result.rank + " 殿様撃破: " + (result.bossDefeated ? "YES" : "NO"));
    return;
  }

  // 連続する同タイプのイベントを間引きつつ、重要イベントはすべて表示
  const importantTypes = new Set(["BOSS", "EVENT", "IKKI", "TSUJIGIRI", "DEATH", "LOYALTY"]);
  let lastPrintedType = null;
  let suppressedCount = 0;

  for (let i = 0; i < result.eventLog.length; i++) {
    const ev = result.eventLog[i];

    // 重要イベントは常に表示
    if (importantTypes.has(ev.type)) {
      if (suppressedCount > 0) {
        console.log("  " + pad("", 6) + " [...+" + suppressedCount + " 戦闘...]");
        suppressedCount = 0;
      }
      console.log("  " + pad(ev.time.toFixed(1) + "s", 7) + " [" + padR(ev.type, 9) + "] " + ev.message);
      lastPrintedType = ev.type;
      continue;
    }

    // FIGHT/RECRUIT は間引き（5件ごとに1件表示、または最初と最後）
    if (ev.type === "FIGHT" || ev.type === "RECRUIT") {
      const isFirst = i === 0;
      const isLast = i === result.eventLog.length - 1;
      const nextIsDifferentType = i + 1 < result.eventLog.length && result.eventLog[i + 1].type !== ev.type;
      const everyFifth = suppressedCount >= 4;

      if (isFirst || isLast || nextIsDifferentType || everyFifth) {
        if (suppressedCount > 0 && !isFirst) {
          // 間引いた分をまとめて表示しない（直接表示）
        }
        console.log("  " + pad(ev.time.toFixed(1) + "s", 7) + " [" + padR(ev.type, 9) + "] " + ev.message);
        suppressedCount = 0;
        lastPrintedType = ev.type;
      } else {
        suppressedCount++;
      }
      continue;
    }

    console.log("  " + pad(ev.time.toFixed(1) + "s", 7) + " [" + padR(ev.type, 9) + "] " + ev.message);
    lastPrintedType = ev.type;
    suppressedCount = 0;
  }

  if (suppressedCount > 0) {
    console.log("  " + pad("", 6) + " [...+" + suppressedCount + " 戦闘...]");
  }

  console.log("  Result: " + result.score.toLocaleString() + "石 " + result.rank + " 殿様撃破: " + (result.bossDefeated ? "YES" : "NO"));
}

// ============================================================
// スコアレンジ表の出力
// ============================================================
function printScoreTable(statsMap) {
  console.log("  [スコアレンジ]");
  console.log("  ┌──────────┬────────┬────────┬────────┬────────┬────────┬────────┬──────┬──────┐");
  console.log("  │ キャラ   │  最低  │  P10   │  平均  │  P50   │  P90   │  最高  │Boss勝│天下人│");
  console.log("  ├──────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────┼──────┤");

  const labels = ["足軽", "商人", "農民Q無", "農民Q有"];
  for (const label of labels) {
    const s = statsMap[label];
    if (!s) continue;
    console.log(
      "  │ " + padR(label, 8) +
      " │ " + pad(s.min, 6) +
      " │ " + pad(s.p10, 6) +
      " │ " + pad(s.avg, 6) +
      " │ " + pad(s.median, 6) +
      " │ " + pad(s.p90, 6) +
      " │ " + pad(s.max, 6) +
      " │" + formatPercent(s.bossDefeatRate) +
      " │" + formatPercent(s.tenkaRate) + " │"
    );
  }

  console.log("  └──────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────┴──────┘");
}

// ============================================================
// 戦闘統計表の出力
// ============================================================
function printCombatTable(statsMap) {
  console.log("");
  console.log("  [戦闘統計]");
  console.log("  ┌──────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐");
  console.log("  │ キャラ   │敵撃破数│最大行列│突撃回数│Q使用回数│辻斬成功│辻斬失敗│死亡率  │");
  console.log("  ├──────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤");

  const labels = ["足軽", "商人", "農民Q無", "農民Q有"];
  for (const label of labels) {
    const s = statsMap[label];
    if (!s) continue;
    console.log(
      "  │ " + padR(label, 8) +
      " │ " + pad(s.avgEnemyKills, 6) +
      " │ " + pad(s.avgPeakParade, 6) +
      " │ " + pad(s.avgChargeCount, 6) +
      " │ " + pad(s.avgIkkiUseCount, 7) +
      " │ " + pad(s.tsujigiriSuccess, 6) +
      " │ " + pad(s.tsujigiriFail, 6) +
      " │ " + pad(s.deathRate + "%", 6) + "  │"
    );
  }

  console.log("  └──────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘");
}

// ============================================================
// バランスチェックの出力
// ============================================================
function printBalanceCheck(statsMap) {
  const labels = ["足軽", "商人", "農民Q無", "農民Q有"];
  const available = labels.filter(function(l) { return !!statsMap[l]; });

  // 4キャラ揃っていない場合はスキップ
  if (available.length < 4) return;

  const a = statsMap["足軽"];
  const m = statsMap["商人"];
  const fN = statsMap["農民Q無"];
  const fQ = statsMap["農民Q有"];

  console.log("");
  console.log("  [バランスチェック]");

  // 平均偏差
  const allAvg = [a.avg, m.avg, fN.avg, fQ.avg];
  const grandAvg = allAvg.reduce(function(s, v) { return s + v; }, 0) / 4;
  let deviationSum = 0;
  for (const v of allAvg) {
    deviationSum += Math.abs(v - grandAvg);
  }
  const avgDeviation = (deviationSum / 4 / grandAvg * 100).toFixed(1);
  console.log("    平均偏差: ±" + avgDeviation + "%");

  // Max順序
  const maxOk = a.max < m.max && m.max < fN.max && fN.max < fQ.max;
  console.log("    Max順序 (足軽<商人<Q無<Q有): " + (maxOk ? "OK" : "NG") +
    " (" + a.max + " < " + m.max + " < " + fN.max + " < " + fQ.max + ")");

  // Min順序
  const minOk = fQ.min < fN.min && fN.min < m.min && m.min < a.min;
  console.log("    Min順序 (Q有<Q無<商人<足軽): " + (minOk ? "OK" : "NG") +
    " (" + fQ.min + " < " + fN.min + " < " + m.min + " < " + a.min + ")");

  // Range順序
  const rangeOk = a.range < m.range && m.range < fN.range && fN.range < fQ.range;
  console.log("    Range順序 (足軽<商人<Q無<Q有): " + (rangeOk ? "OK" : "NG") +
    " (" + a.range + " < " + m.range + " < " + fN.range + " < " + fQ.range + ")");

  // 殿様撃破率平均
  const avgBoss = Math.round((a.bossDefeatRate + m.bossDefeatRate + fN.bossDefeatRate + fQ.bossDefeatRate) / 4);
  console.log("    殿様撃破率平均: " + avgBoss + "%");

  // 天下人到達率平均
  const avgTenka = Math.round((a.tenkaRate + m.tenkaRate + fN.tenkaRate + fQ.tenkaRate) / 4);
  console.log("    天下人到達率平均: " + avgTenka + "%");
}

// ============================================================
// スキル別内訳表の出力
// ============================================================
function printSkillBreakdown(allStats) {
  // allStats: { configKey: { label, skill, stats } }
  // skill別にグルーピング
  const charLabels = ["足軽", "商人", "農民Q無", "農民Q有"];
  const skills = ["low", "mid", "high"];
  const skillLabels = { low: "低スキル", mid: "中スキル", high: "高スキル" };

  // 各キャラ×スキルのデータがあるか確認
  let hasMultipleSkills = false;
  const matrix = {};
  for (const label of charLabels) {
    matrix[label] = {};
    for (const sk of skills) {
      const key = label + "_" + sk;
      if (allStats[key]) {
        matrix[label][sk] = allStats[key];
        hasMultipleSkills = true;
      }
    }
  }

  if (!hasMultipleSkills) return;

  console.log("");
  console.log("  [スキル別内訳]");
  console.log("  ┌──────────┬──────────┬──────────┬──────────┐");
  console.log("  │ キャラ   │ " + padR(skillLabels.low, 8) + " │ " + padR(skillLabels.mid, 8) + " │ " + padR(skillLabels.high, 8) + " │");
  console.log("  ├──────────┼──────────┼──────────┼──────────┤");

  for (const label of charLabels) {
    let row = "  │ " + padR(label, 8) + " │";
    for (const sk of skills) {
      if (matrix[label][sk]) {
        row += " avg " + pad(matrix[label][sk].avg, 5) + "│";
      } else {
        row += "    -     │";
      }
    }
    // 行にデータがあるときだけ出力
    const hasData = skills.some(function(sk) { return !!matrix[label][sk]; });
    if (hasData) {
      console.log(row);
    }
  }

  console.log("  └──────────┴──────────┴──────────┴──────────┘");
}

// ============================================================
// メイン実行
// ============================================================
function main() {
  const args = parseArgs();
  const paramOverrides = loadParamOverrides(args.paramsFile);
  const configs = buildConfigs(args);

  const totalConfigs = configs.length;

  // ヘッダー
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  下克上オンライン ヘッドレスシミュレーション                  ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("  試行回数: " + args.trials + "/config");

  if (args.skill === "mixed") {
    console.log("  スキル分布: mixed (30%低/50%中/20%高)");
  } else if (args.skill) {
    console.log("  スキルレベル: " + args.skill);
  } else {
    console.log("  スキルレベル: low, mid, high (全パターン)");
  }

  if (args.char) {
    console.log("  対象キャラ: " + args.char);
  }
  if (paramOverrides) {
    console.log("  パラメータオーバーライド: " + args.paramsFile);
  }
  console.log("");

  // 全結果を格納
  // configKey -> stats のマップ（スコアレンジ表用）
  // configKey = label + "_" + skill
  const allStats = {};
  // キャラ別の全結果をまとめる（スキル横断集計用）
  const charResults = {};
  // 全 per-config results
  const allResults = {};

  const startTime = Date.now();

  for (let ci = 0; ci < configs.length; ci++) {
    const config = configs[ci];
    const configLabel = config.label + " (" + config.skill + ")";
    process.stdout.write("  Testing " + (ci + 1) + "/" + totalConfigs + ": " + configLabel + " ...");

    const results = [];

    for (let trial = 1; trial <= args.trials; trial++) {
      const effectiveSkill = config.skill === "mixed" ? pickMixedSkill() : config.skill;
      const shouldLog = args.verbose || (args.logGame === trial);

      try {
        const result = runSingleGame(
          config.charKey,
          config.ikkiMode,
          effectiveSkill,
          paramOverrides,
          shouldLog
        );
        results.push(result);

        // 詳細ログ出力
        if (shouldLog) {
          printGameLog(trial, config.label, effectiveSkill, result);
        }
      } catch (err) {
        console.error("\n  [ERROR] Game #" + trial + " (" + configLabel + ") がクラッシュ: " + err.message);
        // エラーが起きたゲームはスキップして続行
      }
    }

    if (results.length === 0) {
      console.log(" 全試行失敗");
      continue;
    }

    const stats = computeStats(results);
    const configKey = config.label + "_" + config.skill;
    allStats[configKey] = stats;
    allResults[configKey] = results;

    // キャラ別集計にもマージ
    if (!charResults[config.label]) {
      charResults[config.label] = [];
    }
    for (const r of results) {
      charResults[config.label].push(r);
    }

    console.log(" done (" + results.length + " games, avg=" + stats.avg + ")");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log("  完了: " + elapsed + "秒");
  console.log("");

  // キャラ別の統合統計（スキル横断）
  const charStats = {};
  for (const label of Object.keys(charResults)) {
    charStats[label] = computeStats(charResults[label]);
  }

  // === スコアレンジ表 ===
  printScoreTable(charStats);

  // === 戦闘統計表 ===
  printCombatTable(charStats);

  // === バランスチェック ===
  printBalanceCheck(charStats);

  // === スキル別内訳 ===
  printSkillBreakdown(allStats);

  console.log("");
}

main();
