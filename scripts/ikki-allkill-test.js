#!/usr/bin/env node
// ============================================================
// 一揆 ALL-KILL テスト: 画面内のみ vs 全敵ヒット 比較
// Usage: node scripts/ikki-allkill-test.js
//
// 現行: enemiesHit = Math.min(Math.floor(enemiesOnField * 0.35 * ikkiEfficiency), 4)
// 提案: enemiesHit = Math.floor(enemiesOnField) (全敵、キャップなし)
// ============================================================

const TRIALS = 500;

// ============================================================
// ベースラインGAME定数（score-simulator.js / balance-search.jsから転記）
// ============================================================
function createBaseGame() {
  return {
    maxTime: 60,
    bossBattleTime: 20,

    chars: {
      ashigaru: {
        name: "足軽",
        attack: 7,
        projectileCount: 5,
        projectileSpeed: 8,
        projectileLifetime: 24,
        followerBonus: 0.008,
        followerDamage: 2,
        followerCD: 0.7,
        chargeMultiplier: 1.0,
        scoreMultiplier: 1.0,
        damageTakenMultiplier: 1.0,
        recruitTime: 0.2,
        maxEnemies: 12,
        spawnInterval: 3,
        initialKoku: 0,
        recruitCost: 0,
        loyaltyAvg: 20,
        attackCD: 0.25,
      },
      merchant: {
        name: "商人",
        attack: 2,
        projectileCount: 2,
        projectileSpeed: 5,
        projectileLifetime: 50,
        followerBonus: 0.012,
        followerDamage: 3,
        followerCD: 0.7,
        chargeMultiplier: 0.5,
        scoreMultiplier: 1.2,
        damageTakenMultiplier: 1.2,
        recruitTime: 0,
        maxEnemies: 12,
        spawnInterval: 3,
        initialKoku: 6500,
        recruitCost: 300,
        attackCD: 0.25,
      },
      farmer: {
        name: "農民",
        attack: 3,
        projectileCount: 1,
        projectileSpeed: 6,
        projectileLifetime: 56,
        followerBonus: 0.025,
        followerDamage: 3,
        followerCD: 0.7,
        chargeMultiplier: 0.8,
        scoreMultiplier: 1.4,
        damageTakenMultiplier: 1.4,
        recruitTime: 0.4,
        maxEnemies: 17,
        spawnInterval: 2,
        initialKoku: 0,
        recruitCost: 0,
        attackCD: 0.125,
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

    tonoBoss: { hp: 500 },
    bridgeBoss: { hp: 240, score: 2000 },

    tsujigiriBaseReward: 1000,
    bukoBaseReward: 2000,
    bukoTimeLimit: 15,

    gekokujoBaseMin: 2000,
    gekokujoPerRank: 1000,

    terrainIncome: { castleTown: 50, village: 30, grassland: 10 },
    maintenanceCost: 2.0,
    autoHireCost: 300,
    autoHireCD: 3,
    autoHireMaxParade: 12,
    kokuZeroDepartureCD: 3,

    ikkiConsumeRate: 0.5,
    ikkiDamagePerMember: 8,
    ikkiQMult: 2.6,
    ikkiCD: 10,

    chargeDamage: 5,
    chargeCD: 6,
  };
}

// S9パラメータセット
function createS9Game() {
  const g = createBaseGame();
  g.tonoBoss.hp = 680;
  g.bukoBaseReward = 3000;
  g.ikkiQMult = 4.5;
  g.ikkiConsumeRate = 0.3;
  g.ikkiDamagePerMember = 10;
  g.ranks[5].threshold = 20000;
  g.chars.merchant.scoreMultiplier = 1.3;
  g.chars.merchant.damageTakenMultiplier = 1.0;
  g.chars.farmer.damageTakenMultiplier = 1.5;
  return g;
}

// ============================================================
// 共通ユーティリティ関数
// ============================================================

function applyKokuReward(baseValue) {
  const rand = 0.75 + Math.random() * 0.5;
  let value = Math.floor(baseValue * rand);
  if (Math.random() < 0.1) {
    value = value * 2;
  }
  return value;
}

function getEnemyTier(gameTime, GAME) {
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

function getAttackPower(charDef, paradeLen) {
  const base = charDef.attack;
  const followerBonus = Math.floor(paradeLen * charDef.followerBonus * base * 10);
  return base + followerBonus;
}

function getBossDPS(charDef, paradeLen, GAME) {
  const dmg = getAttackPower(charDef, paradeLen);
  const shotsPerSec = 1 / charDef.attackCD;

  let hitCount;
  if (charDef.projectileCount >= 5) {
    hitCount = 3.5;
  } else if (charDef.projectileCount >= 2) {
    hitCount = 1.5;
  } else {
    hitCount = 0.8;
  }
  const projDPS = dmg * hitCount * shotsPerSec;

  const activeFollowers = Math.floor(paradeLen * 0.65);
  const followerDPS = activeFollowers * charDef.followerDamage / charDef.followerCD;

  const chargeDPS = GAME.chargeDamage * 1.5 * charDef.chargeMultiplier / GAME.chargeCD;

  return projDPS + followerDPS + chargeDPS;
}

function getRankIndex(koku, GAME) {
  let idx = 0;
  for (let i = GAME.ranks.length - 1; i >= 0; i--) {
    if (koku >= GAME.ranks[i].threshold) {
      idx = i;
      break;
    }
  }
  return idx;
}

function getScenario(level) {
  if (level === "high") {
    return {
      attackShare: 0.65, recruitRate: 0.45, tsujigiriCount: 1,
      tsujigiriSuccessRate: 0.8, bridgeBossKill: true,
      terrainType: "castleTown", distanceFactor: 0.85,
    };
  }
  if (level === "mid") {
    return {
      attackShare: 0.45, recruitRate: 0.35, tsujigiriCount: 1,
      tsujigiriSuccessRate: 0.5, bridgeBossKill: true,
      terrainType: "village", distanceFactor: 0.60,
    };
  }
  return {
    attackShare: 0.30, recruitRate: 0.20, tsujigiriCount: 0,
    tsujigiriSuccessRate: 0, bridgeBossKill: false,
    terrainType: "grassland", distanceFactor: 0.40,
  };
}

// ============================================================
// コアシミュレーション（ikkiAllKillフラグで一揆の挙動を切り替え）
// ============================================================
function simulateOnce(charKey, ikkiMode, scenarioLevel, GAME, ikkiAllKill) {
  const cd = GAME.chars[charKey];
  const maxTime = GAME.maxTime;
  const scoreMult = cd.scoreMultiplier;
  const dt = 1;
  const scenario = getScenario(scenarioLevel);

  let koku = cd.initialKoku;
  let paradeLen = 0;
  let enemiesOnField = 5;
  let spawnTimer = cd.spawnInterval;
  let autoHireTimer = GAME.autoHireCD;
  let ikkiCDTimer = 0;
  let kokuZeroTimer = GAME.kokuZeroDepartureCD;

  let fieldTime = maxTime;
  if (ikkiMode) {
    fieldTime = 50;
  }

  for (let t = 0; t < fieldTime; t += dt) {
    const tier = getEnemyTier(t, GAME);

    // Parade growth with player skill variance
    if (charKey === "merchant") {
      autoHireTimer -= dt;
      if (autoHireTimer <= 0 && koku >= GAME.autoHireCost && Math.floor(paradeLen) < GAME.autoHireMaxParade) {
        paradeLen += 1;
        koku -= GAME.autoHireCost;
        autoHireTimer = GAME.autoHireCD;
      }
    } else {
      if (paradeLen < 20) {
        const recruitVariance = 0.6 + Math.random() * 0.8;
        const effectiveRecruit = scenario.recruitRate * scenario.distanceFactor * recruitVariance;
        paradeLen += effectiveRecruit * dt;
      }
    }

    // Ashigaru loyalty departure
    if (charKey === "ashigaru" && paradeLen > 0 && t > 15) {
      const departPerSec = paradeLen / cd.loyaltyAvg;
      paradeLen = Math.max(0, paradeLen - departPerSec * dt);
    }

    // Enemy hit causing parade attrition
    if (paradeLen > 0 && enemiesOnField > 2) {
      const hitChance = 0.03 * cd.damageTakenMultiplier * (enemiesOnField / cd.maxEnemies);
      if (Math.random() < hitChance) {
        paradeLen = Math.max(0, paradeLen - 1);
      }
    }

    if (paradeLen > 20) paradeLen = 20;
    if (paradeLen < 0) paradeLen = 0;

    // Enemy spawn
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

    // Enemy kills
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
    let effectiveAttackShare = scenario.attackShare;
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
    enemiesOnField = Math.max(0, enemiesOnField - killsThisSec * dt);

    // Farmer: civilian spawn on attack hit
    if (charKey === "farmer") {
      const attacksPerSec = 1 / cd.attackCD;
      const civilianSpawns = attacksPerSec * 0.3 * scenario.attackShare * dt;
      const bonusRecruit = civilianSpawns * 0.5 * scenario.distanceFactor;
      if (paradeLen < 20) {
        paradeLen += bonusRecruit;
      }
    }

    // Intimidation (surrender)
    if (flooredParade >= 4) {
      let surrenderKills = 0;
      if (tier.avgGrit < flooredParade) {
        let intimidateRatio = 0;
        if (flooredParade > 3) intimidateRatio += 0.3;
        if (flooredParade > 10) intimidateRatio += 0.2;
        surrenderKills = enemiesOnField * intimidateRatio * 0.5 * dt;
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
        enemiesOnField = Math.max(0, enemiesOnField - surrenderKills);
      }
    }

    // Merchant territory income
    if (charKey === "merchant") {
      const terrainRate = GAME.terrainIncome[scenario.terrainType];
      const income = Math.floor(terrainRate * scoreMult * dt);
      koku += income;

      const maintenance = GAME.maintenanceCost * flooredParade * dt;
      koku -= maintenance;

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

    // Ikki Q (field phase) - ikkiAllKill flag controls behavior
    if (ikkiMode) {
      ikkiCDTimer -= dt;
      if (ikkiCDTimer <= 0 && flooredParade >= 1 && t > 5) {
        const consumed = Math.max(1, Math.floor(paradeLen * GAME.ikkiConsumeRate));

        let enemiesHit;
        if (ikkiAllKill) {
          // Proposed: hit ALL enemies on field, no cap
          enemiesHit = Math.floor(enemiesOnField);
        } else {
          // Current: 35% of on-screen enemies, capped at 4
          const ikkiEfficiency = scenario.distanceFactor * 0.8 + 0.2;
          enemiesHit = Math.min(Math.floor(enemiesOnField * 0.35 * ikkiEfficiency), 4);
        }

        if (enemiesHit > 0) {
          let qScore = 0;
          for (let u = 0; u < enemiesHit; u++) {
            qScore += Math.floor(applyKokuReward(tier.avgScore) * GAME.ikkiQMult * scoreMult);
          }
          koku += qScore;
          enemiesOnField = Math.max(0, enemiesOnField - enemiesHit);
        }
        paradeLen -= consumed;
        ikkiCDTimer = GAME.ikkiCD;
      }
    }
  }

  // Tsujigiri
  for (let ts = 0; ts < scenario.tsujigiriCount; ts++) {
    if (Math.random() < scenario.tsujigiriSuccessRate) {
      const tsujReward = Math.floor(applyKokuReward(GAME.tsujigiriBaseReward) * scoreMult);
      koku += tsujReward;
    }
  }

  // Bridge boss
  if (scenario.bridgeBossKill) {
    const bbReward = Math.floor(applyKokuReward(GAME.bridgeBoss.score) * scoreMult);
    koku += bbReward;
  }

  // ============ Boss fight with player skill variance ============
  let bossDefeated = false;
  const paradeLenAtBoss = Math.floor(paradeLen);

  const effectiveBattleTime = GAME.bossBattleTime * 0.80;

  const rIdx = Math.min(getRankIndex(koku, GAME) + 2, GAME.ranks.length - 1);

  const playerSkillFactor = 0.2 + Math.random() * 0.6;
  const shockwaveCount = Math.floor(effectiveBattleTime / 5);
  let paradeLenDuringBoss = paradeLenAtBoss;
  for (let sw = 0; sw < shockwaveCount; sw++) {
    const shockLoss = Math.floor(paradeLenDuringBoss * 0.15 * (1 - playerSkillFactor));
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - shockLoss);
    const bossAttack = 8 + rIdx * 4;
    const bossKills = Math.floor(bossAttack * 0.1 * (1 - playerSkillFactor));
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - bossKills);
  }

  const dps = getBossDPS(cd, paradeLenDuringBoss, GAME);

  // Ikki damage during boss fight
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

    if (charKey === "ashigaru" && timeToKill <= GAME.bukoTimeLimit) {
      const bukoReward = applyKokuReward(GAME.bukoBaseReward);
      koku += bukoReward;
    }

    const rankIdx = getRankIndex(koku, GAME);
    const gekBase = GAME.gekokujoBaseMin + rankIdx * GAME.gekokujoPerRank;
    const gekReward = Math.floor(applyKokuReward(gekBase) * scoreMult);
    koku += gekReward;
  }

  return {
    koku: Math.floor(koku),
    bossDefeated,
  };
}

// ============================================================
// Monte Carlo (mid scenario only)
// ============================================================
function monteCarlo(charKey, ikkiMode, GAME, trials, ikkiAllKill) {
  const results = [];
  let bossWins = 0;

  for (let i = 0; i < trials; i++) {
    const r = simulateOnce(charKey, ikkiMode, "mid", GAME, ikkiAllKill);
    results.push(r.koku);
    if (r.bossDefeated) bossWins++;
  }

  results.sort((a, b) => a - b);
  const min = results[0];
  const max = results[results.length - 1];
  const avg = Math.round(results.reduce((a, b) => a + b, 0) / trials);

  const tenkaThreshold = GAME.ranks[GAME.ranks.length - 1].threshold;
  let tenkaCount = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i] >= tenkaThreshold) {
      tenkaCount++;
    }
  }

  return {
    min,
    max,
    avg,
    range: max - min,
    bossWinRate: Math.round(bossWins / trials * 100),
    tenkaRate: Math.round(tenkaCount / trials * 100),
  };
}

function runAllModes(GAME, trials, ikkiAllKill) {
  return {
    ashigaru:  monteCarlo("ashigaru", false, GAME, trials, ikkiAllKill),
    merchant:  monteCarlo("merchant", false, GAME, trials, ikkiAllKill),
    farmerNoQ: monteCarlo("farmer",   false, GAME, trials, ikkiAllKill),
    farmerQ:   monteCarlo("farmer",   true,  GAME, trials, ikkiAllKill),
  };
}

// ============================================================
// Output utilities
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

function printResults(r) {
  console.log("  ┌──────────┬────────┬────────┬────────┬────────┬────────┬────────┐");
  console.log("  │ キャラ   │  平均  │  最低  │  最高  │ レンジ │殿様撃破│天下人  │");
  console.log("  ├──────────┼────────┼────────┼────────┼────────┼────────┼────────┤");

  const labels = [
    { key: "ashigaru",  name: "足軽    " },
    { key: "merchant",  name: "商人    " },
    { key: "farmerNoQ", name: "農民Q無 " },
    { key: "farmerQ",   name: "農民Q有 " },
  ];

  for (const l of labels) {
    const d = r[l.key];
    console.log(
      "  │ " + l.name +
      " │ " + pad(d.avg, 6) +
      " │ " + pad(d.min, 6) +
      " │ " + pad(d.max, 6) +
      " │ " + pad(d.range, 6) +
      " │ " + pad(d.bossWinRate + "%", 6) +
      " │ " + pad(d.tenkaRate + "%", 6) + " │"
    );
  }
  console.log("  └──────────┴────────┴────────┴────────┴────────┴────────┴────────┘");
}

function printBalanceCheck(r) {
  const a = r.ashigaru;
  const m = r.merchant;
  const fN = r.farmerNoQ;
  const fQ = r.farmerQ;

  console.log("  [バランスチェック]");

  const maxOk = (a.max < m.max) && (m.max < fN.max) && (fN.max < fQ.max);
  console.log("    Max順序 (足軽<商人<農民Q無<農民Q有): " + (maxOk ? "OK" : "NG") +
    " (" + a.max + " < " + m.max + " < " + fN.max + " < " + fQ.max + ")");

  const minOk = (fQ.min < fN.min) && (fN.min < m.min) && (m.min < a.min);
  console.log("    Min順序 (農民Q有<農民Q無<商人<足軽): " + (minOk ? "OK" : "NG") +
    " (" + fQ.min + " < " + fN.min + " < " + m.min + " < " + a.min + ")");

  const rangeOk = (a.range < m.range) && (m.range < fN.range) && (fN.range < fQ.range);
  console.log("    Range順序 (足軽<商人<農民Q無<農民Q有): " + (rangeOk ? "OK" : "NG") +
    " (" + a.range + " < " + m.range + " < " + fN.range + " < " + fQ.range + ")");

  const avgOk = (a.avg < m.avg) && (m.avg < fN.avg) && (fQ.avg > fN.avg);
  console.log("    Avg順序 (足軽<商人<農民Q無, Q有>Q無): " + (avgOk ? "OK" : "NG") +
    " (" + a.avg + " < " + m.avg + " < " + fN.avg + ", " + fQ.avg + " > " + fN.avg + ")");

  const avgBoss = Math.round((a.bossWinRate + m.bossWinRate + fN.bossWinRate + fQ.bossWinRate) / 4);
  console.log("    殿様撃破率平均: " + avgBoss + "% (目標: ~70%)");

  const avgTenka = Math.round((a.tenkaRate + m.tenkaRate + fN.tenkaRate + fQ.tenkaRate) / 4);
  console.log("    天下人到達率平均: " + avgTenka + "% (目標: ~80%)");
}

// ============================================================
// Main
// ============================================================
function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   一揆 ALL-KILL テスト: 画面内のみ vs 全敵ヒット 比較     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("現行: enemiesHit = Math.min(Math.floor(enemiesOnField * 0.35 * eff), 4)");
  console.log("提案: enemiesHit = Math.floor(enemiesOnField) (全敵, キャップなし)\n");
  console.log("試行回数: " + TRIALS + " / 標準(mid)シナリオ\n");

  // ============================================================
  // Test 1: Current ikki + current params (baseline)
  // ============================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  [1] 現行一揆 + 現行パラメータ (ベースライン)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  const baseGame = createBaseGame();
  const test1 = runAllModes(baseGame, TRIALS, false);
  printResults(test1);
  printBalanceCheck(test1);
  console.log("");

  // ============================================================
  // Test 2: All-kill ikki + current params
  // ============================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  [2] ALL-KILL一揆 + 現行パラメータ");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  const test2 = runAllModes(baseGame, TRIALS, true);
  printResults(test2);
  printBalanceCheck(test2);
  console.log("");

  // ============================================================
  // Test 3: All-kill ikki + S9 params
  // ============================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  [3] ALL-KILL一揆 + S9パラメータ");
  console.log("  (BossHP=680, buko=3000, ikkiQMult=4.5, ikkiConsumeRate=0.3,");
  console.log("   ikkiDmgPerMember=10, tenka=20000, merchant.SM=1.3,");
  console.log("   merchant.DTM=1.0, farmer.DTM=1.5)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  const s9Game = createS9Game();
  const test3 = runAllModes(s9Game, TRIALS, true);
  printResults(test3);
  printBalanceCheck(test3);
  console.log("");

  // ============================================================
  // Test 4a-c: All-kill ikki + S9 params + lower ikkiQMult
  // ============================================================
  const lowerQMults = [2.6, 3.0, 3.5];
  const test4Results = [];

  for (let qi = 0; qi < lowerQMults.length; qi++) {
    const qm = lowerQMults[qi];
    const label = "4" + String.fromCharCode(97 + qi); // 4a, 4b, 4c
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  [" + label + "] ALL-KILL一揆 + S9パラメータ + ikkiQMult=" + qm);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    const g = createS9Game();
    g.ikkiQMult = qm;
    const result = runAllModes(g, TRIALS, true);
    printResults(result);
    printBalanceCheck(result);
    console.log("");
    test4Results.push({ qMult: qm, label: label, results: result });
  }

  // ============================================================
  // Summary comparison
  // ============================================================
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   全テスト比較サマリー                                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const allTests = [
    { name: "[1] 現行一揆+現行パラメータ", r: test1 },
    { name: "[2] ALL-KILL+現行パラメータ", r: test2 },
    { name: "[3] ALL-KILL+S9(QMult=4.5)", r: test3 },
  ];
  for (const t4 of test4Results) {
    allTests.push({ name: "[" + t4.label + "] ALL-KILL+S9(QMult=" + t4.qMult + ")", r: t4.results });
  }

  // 農民Q有の比較（一揆の影響が最も顕著）
  console.log("--- 農民Q有 スコア比較 ---");
  console.log("┌──────────────────────────────────┬────────┬────────┬────────┬────────┐");
  console.log("│ テスト                           │  平均  │  最低  │  最高  │ レンジ │");
  console.log("├──────────────────────────────────┼────────┼────────┼────────┼────────┤");
  for (const t of allTests) {
    const fQ = t.r.farmerQ;
    console.log(
      "│ " + padR(t.name, 32) +
      " │ " + pad(fQ.avg, 6) +
      " │ " + pad(fQ.min, 6) +
      " │ " + pad(fQ.max, 6) +
      " │ " + pad(fQ.range, 6) + " │"
    );
  }
  console.log("└──────────────────────────────────┴────────┴────────┴────────┴────────┘\n");

  // 全キャラ要件チェック
  console.log("--- 要件適合チェック ---");
  console.log("┌──────────────────────────────────┬──────┬──────┬──────┬──────┬──────┐");
  console.log("│ テスト                           │ Max  │ Min  │Range │Boss% │天下人│");
  console.log("├──────────────────────────────────┼──────┼──────┼──────┼──────┼──────┤");
  for (const t of allTests) {
    const a = t.r.ashigaru;
    const m = t.r.merchant;
    const fN = t.r.farmerNoQ;
    const fQ = t.r.farmerQ;

    const maxOk = (a.max < m.max) && (m.max < fN.max) && (fN.max < fQ.max);
    const minOk = (fQ.min < fN.min) && (fN.min < m.min) && (m.min < a.min);
    const rangeOk = (a.range < m.range) && (m.range < fN.range) && (fN.range < fQ.range);

    const avgBoss = Math.round((a.bossWinRate + m.bossWinRate + fN.bossWinRate + fQ.bossWinRate) / 4);
    const avgTenka = Math.round((a.tenkaRate + m.tenkaRate + fN.tenkaRate + fQ.tenkaRate) / 4);

    const bossOk = avgBoss >= 60 && avgBoss <= 80;
    const tenkaOk = avgTenka >= 70 && avgTenka <= 90;

    console.log(
      "│ " + padR(t.name, 32) +
      " │ " + padR(maxOk ? " OK" : " NG", 4) +
      " │ " + padR(minOk ? " OK" : " NG", 4) +
      " │ " + padR(rangeOk ? " OK" : " NG", 4) +
      " │ " + pad(avgBoss + "%", 4) +
      " │ " + pad(avgTenka + "%", 4) + " │"
    );
  }
  console.log("└──────────────────────────────────┴──────┴──────┴──────┴──────┴──────┘\n");

  // Q有 vs Q無 の差分比較
  console.log("--- 一揆Qの影響度 (農民Q有 avg - 農民Q無 avg) ---");
  for (const t of allTests) {
    const boost = t.r.farmerQ.avg - t.r.farmerNoQ.avg;
    const pct = Math.round(boost / t.r.farmerNoQ.avg * 100);
    console.log("  " + padR(t.name, 34) + ": +" + boost + "石 (+" + pct + "%)");
  }
  console.log("");
}

main();
