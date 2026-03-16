#!/usr/bin/env node
// ============================================================
// 下克上オンライン バランスシミュレータ (モンテカルロ版)
// Usage: node scripts/score-simulator.js [--trials=1000] [--verbose]
//
// 最新のゲーム定数 (constants.js / combat.js / economy.js) に準拠
// ============================================================

// ============================================================
// ゲーム定数（ソースコードから転記）
// ============================================================
const GAME = {
  maxTime: 60,          // フィールド戦闘時間
  bossBattleTime: 20,   // 殿様戦制限時間

  chars: {
    ashigaru: {
      name: "足軽",
      attack: 7,
      projectileCount: 5,
      projectileSpeed: 8,
      projectileLifetime: 24,
      followerBonus: 0.008,
      followerDamage: 2,     // entities.js: paradeDamage = 2 for ashigaru
      followerCD: 0.7,       // KobuSystem.getAttackCooldown()
      chargeMultiplier: 1.0,
      scoreMultiplier: 1.0,
      damageTakenMultiplier: 1.0,
      recruitTime: 0.2,      // 200ms
      maxEnemies: 12,        // デフォルト
      spawnInterval: 3,      // デフォルト
      initialKoku: 0,
      recruitCost: 0,
      loyaltyAvg: 20,        // 15-25秒タイマーの平均
      attackCD: 0.25,
    },
    merchant: {
      name: "商人",
      attack: 2,
      projectileCount: 2,    // combat.js: 2発同時
      projectileSpeed: 5,
      projectileLifetime: 50,
      followerBonus: 0.012,
      followerDamage: 3,     // entities.js: paradeDamage = 3 (default)
      followerCD: 0.7,
      chargeMultiplier: 0.5,
      scoreMultiplier: 1.2,
      damageTakenMultiplier: 1.2,
      recruitTime: 0,        // 即リクルート
      maxEnemies: 12,
      spawnInterval: 3,
      initialKoku: 6500,     // constants.js
      recruitCost: 300,      // economy.js: gameState.koku -= 300
      attackCD: 0.25,
    },
    farmer: {
      name: "農民",
      attack: 3,
      projectileCount: 1,    // combat.js: 1発ずつ交互
      projectileSpeed: 6,
      projectileLifetime: 56,
      followerBonus: 0.025,
      followerDamage: 3,
      followerCD: 0.7,
      chargeMultiplier: 0.8,
      scoreMultiplier: 1.4,
      damageTakenMultiplier: 1.4,
      recruitTime: 0.4,      // 400ms
      maxEnemies: 17,        // constants.js
      spawnInterval: 2,      // constants.js
      initialKoku: 0,
      recruitCost: 0,
      attackCD: 0.125,       // combat.js: farmer only
    },
  },

  intimidation: {
    checkInterval: 0.5,
    minParade: 4,
    range: 200,
    surrenderTime: 1.0,
  },

  enemies: [
    { name: "野盗",   hp: 20,  score: 100,  grit: 3 },
    { name: "足軽隊", hp: 35,  score: 250,  grit: 10 },
    { name: "侍",     hp: 55,  score: 500,  grit: 999 },
    { name: "武将",   hp: 80,  score: 800,  grit: 999 },
  ],

  ranks: [
    { name: "農民",   threshold: 0 },
    { name: "足軽",   threshold: 500 },
    { name: "侍",     threshold: 1500 },
    { name: "武将",   threshold: 3500 },
    { name: "大名",   threshold: 7000 },
    { name: "天下人", threshold: 12000 },
  ],

  tonoBoss: {
    hp: 500,             // constants.js: TONO_BOSS.hp
  },

  bridgeBoss: {
    hp: 240,             // main.js: BridgeBossSystem._spawn
    score: 2000,         // main.js: boss.scoreValue
  },

  tsujigiriBaseReward: 1000,   // combat.js: KokuReward.apply(1000)
  bukoBaseReward: 2000,        // main.js: KokuReward.apply(2000)
  bukoTimeLimit: 15,           // main.js: battleElapsed <= 15

  // 下克上ボーナス: base = 2000 + rankIndex * 1000
  gekokujoBaseMin: 2000,
  gekokujoPerRank: 1000,

  // 商人経済 (economy.js)
  terrainIncome: { castleTown: 50, village: 30, grassland: 10 },
  maintenanceCost: 2.0,        // economy.js: ParadeController.getLength() * 2.0 * dt
  autoHireCost: 300,           // economy.js: gameState.koku -= 300
  autoHireCD: 3,
  autoHireMaxParade: 12,
  kokuZeroDepartureCD: 3,      // economy.js: this.removeCooldown = 3

  // 一揆 (main.js: IkkiSystem)
  ikkiConsumeRate: 0.5,        // Math.floor(paradeLen * 0.5)
  ikkiDamagePerMember: 8,      // paradeLen * 8
  ikkiQMult: 2.6,            // main.js: ultMult = 2.6
  ikkiCD: 10,

  // 突撃
  chargeDamage: 5,             // combat.js: en.hp -= 5
  chargeCD: 6,                 // combat.js: PlayerController.chargeCooldown = 6
};

// ============================================================
// KokuReward再現 (±25%, クリティカル10%×2)
// ============================================================
function applyKokuReward(baseValue) {
  const rand = 0.75 + Math.random() * 0.5;
  let value = Math.floor(baseValue * rand);
  if (Math.random() < 0.1) {
    value = value * 2;
  }
  return value;
}

// ============================================================
// 敵tier（時間経過で強い敵が混ざる）
// ============================================================
function getEnemyTier(gameTime) {
  const e = GAME.enemies;
  if (gameTime < 15) {
    return { avgScore: e[0].score, avgHp: e[0].hp, avgGrit: 3 };
  }
  if (gameTime < 30) {
    return {
      avgScore: (e[0].score + e[1].score) / 2,
      avgHp: (e[0].hp + e[1].hp) / 2,
      avgGrit: 6.5,
    };
  }
  if (gameTime < 45) {
    return {
      avgScore: e[0].score * 0.3 + e[1].score * 0.3 + e[2].score * 0.4,
      avgHp: e[0].hp * 0.3 + e[1].hp * 0.3 + e[2].hp * 0.4,
      avgGrit: e[0].grit * 0.3 + e[1].grit * 0.3 + e[2].grit * 0.4,
    };
  }
  return {
    avgScore: e[0].score * 0.2 + e[1].score * 0.25 + e[2].score * 0.3 + e[3].score * 0.25,
    avgHp: e[0].hp * 0.2 + e[1].hp * 0.25 + e[2].hp * 0.3 + e[3].hp * 0.25,
    avgGrit: e[0].grit * 0.2 + e[1].grit * 0.2 + e[2].grit * 0.3 + e[3].grit * 0.3,
  };
}

// ============================================================
// 攻撃力計算（entities.js: PlayerController.getAttackPower）
// ============================================================
function getAttackPower(charDef, paradeLen) {
  const base = charDef.attack;
  const followerBonus = Math.floor(paradeLen * charDef.followerBonus * base * 10);
  return base + followerBonus;
}

// ============================================================
// 殿様戦DPS計算
// ============================================================
function getBossDPS(charDef, paradeLen) {
  const dmg = getAttackPower(charDef, paradeLen);
  const shotsPerSec = 1 / charDef.attackCD;

  // ボスは大型: 足軽の扇5発→平均3.5命中、商人2発→1.5命中、農民1発→0.8命中
  let hitCount;
  if (charDef.projectileCount >= 5) {
    hitCount = 3.5;
  } else if (charDef.projectileCount >= 2) {
    hitCount = 1.5;
  } else {
    hitCount = 0.8;
  }
  const projDPS = dmg * hitCount * shotsPerSec;

  // フォロワーDPS（65%がボスの攻撃圏内）
  const activeFollowers = Math.floor(paradeLen * 0.65);
  const followerDPS = activeFollowers * charDef.followerDamage / charDef.followerCD;

  // 突撃（6秒CDで1-2ヒット）
  const chargeDPS = GAME.chargeDamage * 1.5 * charDef.chargeMultiplier / GAME.chargeCD;

  return projDPS + followerDPS + chargeDPS;
}

// ============================================================
// ランク取得
// ============================================================
function getRankIndex(koku) {
  let idx = 0;
  for (let i = GAME.ranks.length - 1; i >= 0; i--) {
    if (koku >= GAME.ranks[i].threshold) {
      idx = i;
      break;
    }
  }
  return idx;
}

// ============================================================
// シナリオパラメータ
// ============================================================
function getScenario(level) {
  // level: "low" / "mid" / "high"
  if (level === "high") {
    return {
      attackShare: 0.65,
      recruitRate: 0.45,
      tsujigiriCount: 1,
      tsujigiriSuccessRate: 0.8,
      bridgeBossKill: true,
      terrainType: "castleTown",
      distanceFactor: 0.85,
    };
  }
  if (level === "mid") {
    return {
      attackShare: 0.45,
      recruitRate: 0.35,
      tsujigiriCount: 1,
      tsujigiriSuccessRate: 0.5,
      bridgeBossKill: true,
      terrainType: "village",
      distanceFactor: 0.60,
    };
  }
  return {
    attackShare: 0.30,
    recruitRate: 0.20,
    tsujigiriCount: 0,
    tsujigiriSuccessRate: 0,
    bridgeBossKill: false,
    terrainType: "grassland",
    distanceFactor: 0.40,
  };
}

// ============================================================
// コアシミュレーション（1回分、KokuRewardのランダム性含む）
// ============================================================
function simulateOnce(charKey, ikkiMode, scenarioLevel) {
  const cd = GAME.chars[charKey];
  const maxTime = GAME.maxTime;
  const scoreMult = cd.scoreMultiplier;
  const dt = 1;
  const scenario = getScenario(scenarioLevel);

  // 状態変数
  let koku = cd.initialKoku;
  let paradeLen = 0;
  let enemiesOnField = 5;
  let spawnTimer = cd.spawnInterval;
  let autoHireTimer = GAME.autoHireCD;
  let ikkiCDTimer = 0;
  let kokuZeroTimer = GAME.kokuZeroDepartureCD;

  // 集計
  const stat = {
    enemyKillScore: 0,
    terrainIncome: 0,
    recruitCost: 0,
    maintenanceCost: 0,
    tsujigiri: 0,
    bridgeBoss: 0,
    gekokujoBonus: 0,
    bukoBonus: 0,
    ikkiQScore: 0,
    ikkiQKills: 0,
  };

  // メインループ（フィールド戦闘）
  let fieldTime = maxTime;
  if (ikkiMode) {
    fieldTime = 50;
  }
  for (let t = 0; t < fieldTime; t += dt) {
    const tier = getEnemyTier(t);

    // パレード成長
    if (charKey === "merchant") {
      // 商人: 自動傭兵雇用 (economy.js)
      autoHireTimer -= dt;
      if (autoHireTimer <= 0 && koku >= GAME.autoHireCost && Math.floor(paradeLen) < GAME.autoHireMaxParade) {
        paradeLen += 1;
        koku -= GAME.autoHireCost;
        stat.recruitCost += GAME.autoHireCost;
        autoHireTimer = GAME.autoHireCD;
      }
    } else {
      // 非商人: 民間人からリクルート（距離係数適用）
      if (paradeLen < 20) {
        var effectiveRecruit = scenario.recruitRate * scenario.distanceFactor;
        paradeLen += effectiveRecruit * dt;
      }
    }

    // 足軽の忠誠離脱
    if (charKey === "ashigaru" && paradeLen > 0 && t > 15) {
      const departPerSec = paradeLen / cd.loyaltyAvg;
      paradeLen = Math.max(0, paradeLen - departPerSec * dt);
    }

    if (paradeLen > 20) paradeLen = 20;
    if (paradeLen < 0) paradeLen = 0;

    // 敵スポーン
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = cd.spawnInterval;
      if (enemiesOnField < 6) {
        enemiesOnField += 2;
      } else if (enemiesOnField < 10) {
        enemiesOnField += 1;
      }
      if (enemiesOnField > cd.maxEnemies) {
        enemiesOnField = cd.maxEnemies;
      }
    }

    // 敵撃破
    const flooredParade = Math.floor(paradeLen);
    const atkPower = getAttackPower(cd, flooredParade);

    let projHitRate;
    if (cd.projectileCount >= 5) {
      projHitRate = 2.0;
    } else if (cd.projectileCount >= 2) {
      projHitRate = 1.2;
    } else {
      projHitRate = 0.7;
    }
    var effectiveAttackShare = scenario.attackShare;
    if (charKey !== "merchant") {
      effectiveAttackShare = scenario.attackShare - (1 - scenario.distanceFactor) * 0.3;
      if (effectiveAttackShare < 0.1) effectiveAttackShare = 0.1;
    }
    const projDmgPerSec = atkPower * projHitRate * (1 / cd.attackCD) * effectiveAttackShare;

    const followerActive = Math.min(flooredParade, enemiesOnField) * 0.4;
    const followerDmgPerSec = followerActive * cd.followerDamage / cd.followerCD;

    const totalFieldDPS = projDmgPerSec + followerDmgPerSec;
    let killsThisSec = totalFieldDPS / tier.avgHp;
    killsThisSec = Math.min(killsThisSec, enemiesOnField * 0.5);

    // KokuReward適用（各キルにランダム報酬）
    const killCount = Math.floor(killsThisSec * dt * 10) / 10;
    let earnedScore = 0;
    if (killCount >= 1) {
      for (let k = 0; k < Math.floor(killCount); k++) {
        earnedScore += applyKokuReward(tier.avgScore) * scoreMult;
      }
      const fractional = killCount - Math.floor(killCount);
      if (fractional > 0) {
        earnedScore += applyKokuReward(tier.avgScore) * scoreMult * fractional;
      }
    } else {
      earnedScore = applyKokuReward(tier.avgScore) * scoreMult * killCount;
    }
    earnedScore = Math.floor(earnedScore);
    koku += earnedScore;
    stat.enemyKillScore += earnedScore;
    enemiesOnField = Math.max(0, enemiesOnField - killsThisSec * dt);

    // 農民: 攻撃ヒット時30%で民間人スポーン → リクルート促進
    if (charKey === "farmer") {
      const attacksPerSec = 1 / cd.attackCD;
      const civilianSpawns = attacksPerSec * 0.3 * scenario.attackShare * dt;
      // These civilians can be recruited, effectively boosting recruit rate
      const bonusRecruit = civilianSpawns * 0.5 * scenario.distanceFactor; // 50% chance to actually recruit
      if (paradeLen < 20) {
        paradeLen += bonusRecruit;
      }
    }

    // 威圧（降伏）
    if (flooredParade >= 4) {
      let surrenderKills = 0;
      if (tier.avgGrit < flooredParade) {
        // Proportion of enemies that can be intimidated (grit < paradeLen)
        let intimidateRatio = 0;
        if (flooredParade > 3) intimidateRatio += 0.3;   // 野盗 (grit=3)
        if (flooredParade > 10) intimidateRatio += 0.2;   // 足軽隊 (grit=10)
        // 侍・武将 (grit=999) never surrender
        surrenderKills = enemiesOnField * intimidateRatio * 0.5 * dt; // 0.5s check interval
        surrenderKills = Math.min(surrenderKills, enemiesOnField * 0.3);
      }
      if (surrenderKills > 0) {
        let surrenderScore = 0;
        for (let sk = 0; sk < Math.floor(surrenderKills); sk++) {
          surrenderScore += Math.floor(applyKokuReward(tier.avgScore) * scoreMult);
        }
        if (surrenderKills - Math.floor(surrenderKills) > 0) {
          surrenderScore += Math.floor(applyKokuReward(tier.avgScore) * scoreMult * (surrenderKills - Math.floor(surrenderKills)));
        }
        koku += surrenderScore;
        stat.enemyKillScore += surrenderScore;
        enemiesOnField = Math.max(0, enemiesOnField - surrenderKills);
      }
    }

    // 商人テリトリー収入
    if (charKey === "merchant") {
      const terrainRate = GAME.terrainIncome[scenario.terrainType];
      const income = Math.floor(terrainRate * scoreMult * dt);
      koku += income;
      stat.terrainIncome += income;

      // 維持費
      const maintenance = GAME.maintenanceCost * flooredParade * dt;
      koku -= maintenance;
      stat.maintenanceCost += maintenance;

      // koku=0時の離脱
      if (koku <= 0) {
        koku = 0;
        kokuZeroTimer -= dt;
        if (kokuZeroTimer <= 0 && paradeLen > 0) {
          paradeLen -= 1;
          kokuZeroTimer = GAME.kokuZeroDepartureCD;
        }
      } else {
        kokuZeroTimer = GAME.kokuZeroDepartureCD;
      }
    }

    // 一揆Q（フィールド戦闘中）
    if (ikkiMode) {
      ikkiCDTimer -= dt;
      if (ikkiCDTimer <= 0 && flooredParade >= 1 && t > 5) {
        const consumed = Math.max(1, Math.floor(paradeLen * GAME.ikkiConsumeRate));
        var ikkiEfficiency = scenario.distanceFactor * 0.8 + 0.2;
        const enemiesHit = Math.min(Math.floor(enemiesOnField * 0.35 * ikkiEfficiency), 4);
        if (enemiesHit > 0) {
          let qScore = 0;
          for (let u = 0; u < enemiesHit; u++) {
            qScore += Math.floor(applyKokuReward(tier.avgScore) * GAME.ikkiQMult * scoreMult);
          }
          koku += qScore;
          stat.ikkiQScore += qScore;
          stat.ikkiQKills += enemiesHit;
          enemiesOnField = Math.max(0, enemiesOnField - enemiesHit);
        }
        paradeLen -= consumed;
        ikkiCDTimer = GAME.ikkiCD;
      }
    }
  }

  // 辻斬り
  for (let ts = 0; ts < scenario.tsujigiriCount; ts++) {
    if (Math.random() < scenario.tsujigiriSuccessRate) {
      const tsujReward = Math.floor(applyKokuReward(GAME.tsujigiriBaseReward) * scoreMult);
      koku += tsujReward;
      stat.tsujigiri += tsujReward;
    }
  }

  // 橋ボス
  if (scenario.bridgeBossKill) {
    const bbReward = Math.floor(applyKokuReward(GAME.bridgeBoss.score) * scoreMult);
    koku += bbReward;
    stat.bridgeBoss = bbReward;
  }

  // 殿様戦
  let bossDefeated = false;
  const paradeLenAtBoss = Math.floor(paradeLen);

  // CASTLE_WAIT無敵時間: ボスは約20%の時間無敵
  const effectiveBattleTime = GAME.bossBattleTime * 0.80;

  // 殿様ランク連動強化
  const rIdx = Math.min(getRankIndex(koku) + 2, GAME.ranks.length - 1);
  const bossAttack = 8 + rIdx * 4;

  // 衝撃波によるパレード除去（ボス戦中2-3回発生）
  const shockwaveCount = Math.floor(effectiveBattleTime / 5); // roughly every 5s
  let paradeLenDuringBoss = paradeLenAtBoss;
  for (let sw = 0; sw < shockwaveCount; sw++) {
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - Math.floor(paradeLenDuringBoss * 0.15));
  }

  const dps = getBossDPS(cd, paradeLenDuringBoss);

  // RETREAT弾ダメージ (12ダメ/1.5秒間隔)
  const retreatTime = effectiveBattleTime * 0.25; // ~25% in RETREAT state
  const retreatHits = Math.floor(retreatTime / 1.5);
  const retreatDmg = retreatHits * 12 * cd.damageTakenMultiplier;

  // 一揆ダメージ（ボス戦中に最大2回）
  let ikkiBossDmg = 0;
  if (ikkiMode && paradeLenDuringBoss >= 1) {
    const ikkiUsesInBoss = Math.min(2, Math.floor(effectiveBattleTime / GAME.ikkiCD));
    let tempParade = paradeLenDuringBoss;
    for (let u = 0; u < ikkiUsesInBoss; u++) {
      ikkiBossDmg += tempParade * GAME.ikkiDamagePerMember;
      tempParade -= Math.max(1, Math.floor(tempParade * GAME.ikkiConsumeRate));
    }
  }

  const remainingBossHp = Math.max(0, GAME.tonoBoss.hp - ikkiBossDmg);
  let timeToKill = Infinity;
  if (dps > 0) {
    timeToKill = remainingBossHp / dps;
  }

  if (timeToKill <= effectiveBattleTime) {
    bossDefeated = true;

    // 武功ボーナス（足軽のみ、15秒以内撃破）
    if (charKey === "ashigaru" && timeToKill <= GAME.bukoTimeLimit) {
      const bukoReward = applyKokuReward(GAME.bukoBaseReward);
      koku += bukoReward;
      stat.bukoBonus = bukoReward;
    }

    // 下克上ボーナス
    const rankIdx = getRankIndex(koku);
    const gekBase = GAME.gekokujoBaseMin + rankIdx * GAME.gekokujoPerRank;
    const gekReward = Math.floor(applyKokuReward(gekBase) * scoreMult);
    koku += gekReward;
    stat.gekokujoBonus = gekReward;
  }

  return {
    koku: Math.floor(koku),
    bossDefeated,
    paradeLenAtBoss,
    dps,
    timeToKill,
    stat,
  };
}

// ============================================================
// モンテカルロシミュレーション
// ============================================================
function monteCarlo(charKey, ikkiMode, scenarioLevel, trials) {
  const results = [];
  let bossWins = 0;
  const statSums = {};

  for (let i = 0; i < trials; i++) {
    const r = simulateOnce(charKey, ikkiMode, scenarioLevel);
    results.push(r.koku);
    if (r.bossDefeated) bossWins++;

    // 最初の結果でキーを初期化
    if (i === 0) {
      for (const key of Object.keys(r.stat)) {
        statSums[key] = 0;
      }
    }
    for (const key of Object.keys(r.stat)) {
      statSums[key] += r.stat[key];
    }
  }

  results.sort((a, b) => a - b);
  const min = results[0];
  const max = results[results.length - 1];
  const avg = Math.round(results.reduce((a, b) => a + b, 0) / trials);
  const p10 = results[Math.floor(trials * 0.1)];
  const p50 = results[Math.floor(trials * 0.5)];
  const p90 = results[Math.floor(trials * 0.9)];

  const avgStat = {};
  for (const key of Object.keys(statSums)) {
    avgStat[key] = Math.round(statSums[key] / trials);
  }

  // 最終パレード長・DPS（最後の試行を参考値として使用）
  const lastR = simulateOnce(charKey, ikkiMode, scenarioLevel);

  return {
    min, max, avg, p10, p50, p90,
    bossWinRate: Math.round(bossWins / trials * 100),
    avgStat,
    paradeLenAtBoss: lastR.paradeLenAtBoss,
    dps: lastR.dps,
  };
}

// ============================================================
// CLI引数
// ============================================================
let TRIALS = 1000;
let verbose = false;
const args = process.argv.slice(2);
for (const arg of args) {
  if (arg === "--verbose" || arg === "-v") {
    verbose = true;
  } else if (arg.startsWith("--trials=")) {
    TRIALS = parseInt(arg.split("=")[1], 10);
  }
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

// ============================================================
// メイン
// ============================================================
function run() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   下克上オンライン バランスシミュレータ (Monte Carlo)      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("[パラメータ]");
  console.log("  殿様HP: " + GAME.tonoBoss.hp);
  console.log("  橋ボスHP: " + GAME.bridgeBoss.hp + " (スコア: " + GAME.bridgeBoss.score + ")");
  console.log("  フィールド時間: " + GAME.maxTime + "秒");
  console.log("  殿様戦制限: " + GAME.bossBattleTime + "秒");
  console.log("  武功制限: " + GAME.bukoTimeLimit + "秒以内");
  console.log("  試行回数: " + TRIALS + "回\n");

  // ランク表示
  console.log("[ランク閾値]");
  for (const rank of GAME.ranks) {
    console.log("  " + padR(rank.name, 6) + ": " + pad(rank.threshold, 6) + "石");
  }
  console.log("");

  // シミュレーション対象
  const modes = [
    { key: "ashigaru", ikki: false, label: "足軽" },
    { key: "merchant", ikki: false, label: "商人" },
    { key: "farmer",   ikki: false, label: "農民(Q無)" },
    { key: "farmer",   ikki: true,  label: "農民(Q有)" },
  ];

  const scenarios = ["low", "mid", "high"];
  const scenarioLabels = { low: "消極", mid: "標準", high: "積極" };

  // 全結果を収集
  const allResults = {};
  for (const mode of modes) {
    allResults[mode.label] = {};
    for (const sc of scenarios) {
      allResults[mode.label][sc] = monteCarlo(mode.key, mode.ikki, sc, TRIALS);
    }
  }

  // ============================================================
  // スコアレンジ表
  // ============================================================
  console.log("[スコアレンジ (モンテカルロ " + TRIALS + "回)]");
  console.log("┌────────────┬────────┬────────┬────────┬────────┬────────┬────────┬──────────┐");
  console.log("│ キャラ     │ シナリオ│  最低  │  P10   │  平均  │  P90   │  最高  │殿様撃破率│");
  console.log("├────────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤");

  for (const mode of modes) {
    for (const sc of scenarios) {
      const r = allResults[mode.label][sc];
      console.log(
        "│ " + padR(mode.label, 10) +
        " │ " + padR(scenarioLabels[sc], 6) +
        " │ " + pad(r.min, 6) +
        " │ " + pad(r.p10, 6) +
        " │ " + pad(r.avg, 6) +
        " │ " + pad(r.p90, 6) +
        " │ " + pad(r.max, 6) +
        " │ " + pad(r.bossWinRate + "%", 8) + " │"
      );
    }
    if (mode !== modes[modes.length - 1]) {
      console.log("├────────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤");
    }
  }
  console.log("└────────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────────┘\n");

  // ============================================================
  // ランク到達予測
  // ============================================================
  console.log("[ランク到達予測 (標準シナリオ)]");
  console.log("┌────────────┬────────┬────────┬────────┬────────┬────────┬────────┐");
  console.log("│ キャラ     │ 農民   │ 足軽   │ 侍     │ 武将   │ 大名   │ 天下人 │");
  console.log("├────────────┼────────┼────────┼────────┼────────┼────────┼────────┤");
  for (const mode of modes) {
    const r = allResults[mode.label]["mid"];
    let row = "│ " + padR(mode.label, 10) + " │";
    for (const rank of GAME.ranks) {
      const reached = r.avg >= rank.threshold;
      const symbol = reached ? "  ★   " : "  -   ";
      row += " " + symbol + "│";
    }
    console.log(row);
  }
  console.log("└────────────┴────────┴────────┴────────┴────────┴────────┴────────┘");
  console.log("  ★ = 平均スコアで到達可能\n");

  // ============================================================
  // 収入内訳（標準シナリオ）
  // ============================================================
  console.log("[収入内訳 (標準シナリオ・平均)]");
  console.log("┌────────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐");
  console.log("│ キャラ     │敵撃破  │テリトリ│辻斬り  │橋ボス  │武功    │下克上  │Q       │");
  console.log("├────────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤");
  for (const mode of modes) {
    const s = allResults[mode.label]["mid"].avgStat;
    console.log(
      "│ " + padR(mode.label, 10) +
      " │ " + pad(s.enemyKillScore, 6) +
      " │ " + pad(s.terrainIncome, 6) +
      " │ " + pad(s.tsujigiri, 6) +
      " │ " + pad(s.bridgeBoss, 6) +
      " │ " + pad(s.bukoBonus, 6) +
      " │ " + pad(s.gekokujoBonus, 6) +
      " │ " + pad(s.ikkiQScore, 6) + " │"
    );
  }
  console.log("└────────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘");

  // 支出内訳（商人のみ）
  const merchantMid = allResults["商人"]["mid"].avgStat;
  if (merchantMid.recruitCost > 0 || merchantMid.maintenanceCost > 0) {
    console.log("\n[商人 支出内訳 (標準シナリオ・平均)]");
    console.log("  傭兵雇用費: -" + merchantMid.recruitCost);
    console.log("  維持費:     -" + Math.round(merchantMid.maintenanceCost));
  }
  console.log("");

  // ============================================================
  // DPSテーブル（殿様戦）
  // ============================================================
  const requiredDPS = (GAME.tonoBoss.hp / GAME.bossBattleTime).toFixed(1);
  console.log("[殿様戦DPS] (HP=" + GAME.tonoBoss.hp + ", 制限" + GAME.bossBattleTime + "秒, 必要DPS=" + requiredDPS + ")");

  const dpsChars = [
    { key: "ashigaru", label: "足軽" },
    { key: "merchant", label: "商人" },
    { key: "farmer",   label: "農民" },
  ];
  const sizes = [2, 4, 6, 8, 10, 12, 15];

  let header = "  人数";
  for (const dc of dpsChars) {
    header += " │ " + padR(dc.label, 16);
  }
  console.log(header);
  console.log("  " + "─".repeat(4) + "─┼─" + "─".repeat(16) + "─┼─" + "─".repeat(16) + "─┼─" + "─".repeat(16));

  for (const sz of sizes) {
    let row = "  " + pad(sz, 2) + "人";
    for (const dc of dpsChars) {
      const cDef = GAME.chars[dc.key];
      const dpsVal = getBossDPS(cDef, sz);
      const ttk = GAME.tonoBoss.hp / dpsVal;
      let cell;
      if (ttk <= GAME.bossBattleTime) {
        cell = dpsVal.toFixed(1) + "/s " + ttk.toFixed(0) + "秒 ✓";
      } else {
        cell = dpsVal.toFixed(1) + "/s " + ttk.toFixed(0) + "秒 ✗";
      }
      row += " │ " + padR(cell, 16);
    }
    console.log(row);
  }
  console.log("");

  // ============================================================
  // バランス指摘
  // ============================================================
  console.log("[バランス分析]");

  const midResults = {};
  for (const mode of modes) {
    midResults[mode.label] = allResults[mode.label]["mid"];
  }

  // 最高/最低平均スコアのキャラ
  let bestChar = null;
  let worstChar = null;
  let bestAvg = -Infinity;
  let worstAvg = Infinity;
  for (const label of Object.keys(midResults)) {
    const avg = midResults[label].avg;
    if (avg > bestAvg) { bestAvg = avg; bestChar = label; }
    if (avg < worstAvg) { worstAvg = avg; worstChar = label; }
  }

  const ratio = bestAvg / worstAvg;
  if (ratio > 2.0) {
    console.log("  ⚠ 大きなバランス差: " + bestChar + "(" + bestAvg + ") vs " + worstChar + "(" + worstAvg + ") = " + ratio.toFixed(2) + "倍");
  } else if (ratio > 1.5) {
    console.log("  △ やや差がある: " + bestChar + "(" + bestAvg + ") vs " + worstChar + "(" + worstAvg + ") = " + ratio.toFixed(2) + "倍");
  } else {
    console.log("  ○ スコア差は許容範囲: " + bestChar + "(" + bestAvg + ") vs " + worstChar + "(" + worstAvg + ") = " + ratio.toFixed(2) + "倍");
  }

  // scoreMultiplierの補正効果
  console.log("\n  [scoreMultiplier補正の効果]");
  for (const mode of modes) {
    const scoreMult = GAME.chars[mode.key].scoreMultiplier;
    const avg = midResults[mode.label].avg;
    console.log("    " + padR(mode.label, 12) + ": ×" + scoreMult.toFixed(1) + " → 平均" + avg + "石");
  }

  // 殿様戦の勝率チェック
  console.log("\n  [殿様戦 勝率バランス]");
  for (const mode of modes) {
    const r = midResults[mode.label];
    const winRate = r.bossWinRate;
    let assessment;
    if (winRate >= 90) assessment = "安定 ○";
    else if (winRate >= 60) assessment = "適正 △";
    else if (winRate >= 30) assessment = "やや困難 ▽";
    else assessment = "極めて困難 ✗";
    console.log("    " + padR(mode.label, 12) + ": " + winRate + "% " + assessment);
  }

  // 商人経済の収支バランス
  const merchantHighStat = allResults["商人"]["high"].avgStat;
  const merchantLowStat = allResults["商人"]["low"].avgStat;
  console.log("\n  [商人経済バランス]");
  console.log("    積極時: 収入=" + merchantHighStat.terrainIncome + " 雇用費=" + merchantHighStat.recruitCost + " 維持費=" + Math.round(merchantHighStat.maintenanceCost));
  console.log("    消極時: 収入=" + merchantLowStat.terrainIncome + " 雇用費=" + merchantLowStat.recruitCost + " 維持費=" + Math.round(merchantLowStat.maintenanceCost));

  // 一揆Qの影響度
  const farmerNoQ = midResults["農民(Q無)"].avg;
  const farmerQ = midResults["農民(Q有)"].avg;
  const qBoost = farmerQ - farmerNoQ;
  const qPercent = Math.round(qBoost / farmerNoQ * 100);
  console.log("\n  [一揆Qの影響]");
  console.log("    Q無: " + farmerNoQ + "石 → Q有: " + farmerQ + "石 (+" + qBoost + "石, +" + qPercent + "%)");
  if (qPercent > 50) {
    console.log("    ⚠ Q依存度が高い。Q無しの農民が弱すぎる可能性");
  } else if (qPercent < 10) {
    console.log("    ⚠ Qの影響が小さい。一揆スキルの存在意義が薄い");
  } else {
    console.log("    ○ Qは有意な上乗せだがゲーム全体のバランスを崩すほどではない");
  }

  console.log("");

  // ============================================================
  // 詳細 (--verbose)
  // ============================================================
  if (verbose) {
    console.log("[詳細内訳]");
    for (const mode of modes) {
      for (const sc of scenarios) {
        const r = allResults[mode.label][sc];
        console.log("\n--- " + mode.label + " / " + scenarioLabels[sc] + " ---");
        console.log("  スコア: min=" + r.min + " p10=" + r.p10 + " avg=" + r.avg + " p90=" + r.p90 + " max=" + r.max);
        console.log("  殿様撃破率: " + r.bossWinRate + "%");
        console.log("  パレード(参考): " + r.paradeLenAtBoss + "人, DPS: " + r.dps.toFixed(1));
        const s = r.avgStat;
        console.log("  [平均内訳]");
        console.log("    敵撃破:     " + s.enemyKillScore);
        if (s.terrainIncome > 0) console.log("    テリトリー: " + s.terrainIncome);
        if (s.tsujigiri > 0) console.log("    辻斬り:     " + s.tsujigiri);
        if (s.bridgeBoss > 0) console.log("    橋ボス:     " + s.bridgeBoss);
        if (s.bukoBonus > 0) console.log("    武功:       " + s.bukoBonus);
        if (s.gekokujoBonus > 0) console.log("    下克上:     " + s.gekokujoBonus);
        if (s.ikkiQScore > 0) console.log("    一揆Q:     " + s.ikkiQScore + " (" + s.ikkiQKills + "体)");
        if (s.recruitCost > 0) console.log("    傭兵費:     -" + s.recruitCost);
        if (s.maintenanceCost > 0) console.log("    維持費:     -" + Math.round(s.maintenanceCost));
      }
    }
  }
}

run();
