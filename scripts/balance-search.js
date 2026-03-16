#!/usr/bin/env node
// ============================================================
// 下克上オンライン バランス探索スクリプト
// Usage: node scripts/balance-search.js
//
// 目標:
//   - 殿様撃破率 ~70%
//   - 天下人到達率 ~80%
//   - Max: 足軽 < 商人 << 農民Q無 <<< 農民Q有
//   - Min: 農民Q有 < 農民Q無 < 商人 < 足軽
//   - Range: 足軽 < 商人 < 農民Q無 < 農民Q有
// ============================================================

const TRIALS = 500;

// ============================================================
// ベースラインGAME定数（score-simulator.jsから転記）
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

// ============================================================
// シミュレーション関数群（score-simulator.jsと同一ロジック + ランダム分散追加）
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

function simulateOnce(charKey, ikkiMode, scenarioLevel, GAME) {
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
        // Recruit variance: movement precision and civilian encounter frequency
        const recruitVariance = 0.6 + Math.random() * 0.8; // 0.6-1.4
        const effectiveRecruit = scenario.recruitRate * scenario.distanceFactor * recruitVariance;
        paradeLen += effectiveRecruit * dt;
      }
    }

    // Ashigaru loyalty departure
    if (charKey === "ashigaru" && paradeLen > 0 && t > 15) {
      const departPerSec = paradeLen / cd.loyaltyAvg;
      paradeLen = Math.max(0, paradeLen - departPerSec * dt);
    }

    // Enemy hit causing parade attrition (random element)
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

    // Ikki Q (field phase)
    if (ikkiMode) {
      ikkiCDTimer -= dt;
      if (ikkiCDTimer <= 0 && flooredParade >= 1 && t > 5) {
        const consumed = Math.max(1, Math.floor(paradeLen * GAME.ikkiConsumeRate));
        const ikkiEfficiency = scenario.distanceFactor * 0.8 + 0.2;
        const enemiesHit = Math.min(Math.floor(enemiesOnField * 0.35 * ikkiEfficiency), 4);
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
  const bossAttack = 8 + rIdx * 4;

  // Player skill variance: shockwave dodge accuracy is random
  // Good player dodges 80%, bad player dodges 20%
  const playerSkillFactor = 0.2 + Math.random() * 0.6; // 0.2-0.8 dodge rate
  const shockwaveCount = Math.floor(effectiveBattleTime / 5);
  let paradeLenDuringBoss = paradeLenAtBoss;
  for (let sw = 0; sw < shockwaveCount; sw++) {
    const shockLoss = Math.floor(paradeLenDuringBoss * 0.15 * (1 - playerSkillFactor));
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - shockLoss);
    // Boss attack parade attrition
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
function monteCarlo(charKey, ikkiMode, GAME, trials) {
  const results = [];
  let bossWins = 0;

  for (let i = 0; i < trials; i++) {
    const r = simulateOnce(charKey, ikkiMode, "mid", GAME);
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

function runAllModes(GAME, trials) {
  return {
    ashigaru:  monteCarlo("ashigaru", false, GAME, trials),
    merchant:  monteCarlo("merchant", false, GAME, trials),
    farmerNoQ: monteCarlo("farmer",   false, GAME, trials),
    farmerQ:   monteCarlo("farmer",   true,  GAME, trials),
  };
}

// ============================================================
// Fitness function
// ============================================================
function evaluateFitness(results) {
  let score = 0;

  const a = results.ashigaru;
  const m = results.merchant;
  const fN = results.farmerNoQ;
  const fQ = results.farmerQ;

  // Boss defeat rate ~70% (HIGH weight)
  const avgBossRate = (a.bossWinRate + m.bossWinRate + fN.bossWinRate + fQ.bossWinRate) / 4;
  const bossDeviation = Math.abs(avgBossRate - 70);
  score -= bossDeviation * 5;

  // Individual chars should be 50-90%
  const bossRates = [a.bossWinRate, m.bossWinRate, fN.bossWinRate, fQ.bossWinRate];
  for (const rate of bossRates) {
    if (rate < 50) score -= (50 - rate) * 3;
    if (rate > 90) score -= (rate - 90) * 3;
  }

  // Tenka rate ~80% (HIGH weight)
  const avgTenkaRate = (a.tenkaRate + m.tenkaRate + fN.tenkaRate + fQ.tenkaRate) / 4;
  const tenkaDeviation = Math.abs(avgTenkaRate - 80);
  score -= tenkaDeviation * 5;

  const tenkaRates = [a.tenkaRate, m.tenkaRate, fN.tenkaRate, fQ.tenkaRate];
  for (const rate of tenkaRates) {
    if (rate < 50) score -= (50 - rate) * 3;
    if (rate > 95) score -= (rate - 95) * 2;
  }

  // Max score ordering: ashigaru < merchant << farmerNoQ <<< farmerQ (HIGH)
  if (a.max < m.max) score += 15;     else score -= 30;
  if (m.max < fN.max) score += 15;    else score -= 30;
  if (fN.max < fQ.max) score += 25;   else score -= 40;
  if (fN.max - m.max > 3000) score += 10;
  if (fQ.max - fN.max > 5000) score += 10;

  // Min score ordering: farmerQ < farmerNoQ < merchant < ashigaru (HIGH)
  if (fQ.min < fN.min) score += 15;   else score -= 30;
  if (fN.min < m.min) score += 15;    else score -= 30;
  if (m.min < a.min) score += 15;     else score -= 30;

  // Avg ordering: ashigaru < merchant < farmerNoQ, farmerQ > farmerNoQ (MEDIUM)
  if (a.avg < m.avg) score += 10;     else score -= 20;
  if (m.avg < fN.avg) score += 10;    else score -= 20;
  if (fQ.avg > fN.avg) score += 15;   else score -= 30;

  // Range ordering: ashigaru < merchant < farmerNoQ < farmerQ (MEDIUM)
  if (a.range < m.range) score += 8;  else score -= 16;
  if (m.range < fN.range) score += 8; else score -= 16;
  if (fN.range < fQ.range) score += 8; else score -= 16;

  return score;
}

// ============================================================
// Parameter diff detection
// ============================================================
function getChanges(candidate, baseline) {
  const changes = [];

  if (candidate.tonoBoss.hp !== baseline.tonoBoss.hp) {
    changes.push("tonoBoss.hp: " + baseline.tonoBoss.hp + " -> " + candidate.tonoBoss.hp);
  }
  if (candidate.bukoBaseReward !== baseline.bukoBaseReward) {
    changes.push("bukoBaseReward: " + baseline.bukoBaseReward + " -> " + candidate.bukoBaseReward);
  }
  if (candidate.ikkiQMult !== baseline.ikkiQMult) {
    changes.push("ikkiQMult: " + baseline.ikkiQMult + " -> " + candidate.ikkiQMult);
  }
  if (candidate.ikkiConsumeRate !== baseline.ikkiConsumeRate) {
    changes.push("ikkiConsumeRate: " + baseline.ikkiConsumeRate + " -> " + candidate.ikkiConsumeRate);
  }
  if (candidate.ikkiDamagePerMember !== baseline.ikkiDamagePerMember) {
    changes.push("ikkiDamagePerMember: " + baseline.ikkiDamagePerMember + " -> " + candidate.ikkiDamagePerMember);
  }
  if (candidate.ikkiCD !== baseline.ikkiCD) {
    changes.push("ikkiCD: " + baseline.ikkiCD + " -> " + candidate.ikkiCD);
  }

  const tenkaBaseline = baseline.ranks[baseline.ranks.length - 1].threshold;
  const tenkaCandidate = candidate.ranks[candidate.ranks.length - 1].threshold;
  if (tenkaCandidate !== tenkaBaseline) {
    changes.push("tenka threshold: " + tenkaBaseline + " -> " + tenkaCandidate);
  }

  const charKeys = ["ashigaru", "merchant", "farmer"];
  for (const ck of charKeys) {
    if (candidate.chars[ck].scoreMultiplier !== baseline.chars[ck].scoreMultiplier) {
      changes.push(ck + ".scoreMultiplier: " + baseline.chars[ck].scoreMultiplier + " -> " + candidate.chars[ck].scoreMultiplier);
    }
    if (candidate.chars[ck].damageTakenMultiplier !== baseline.chars[ck].damageTakenMultiplier) {
      changes.push(ck + ".damageTakenMultiplier: " + baseline.chars[ck].damageTakenMultiplier + " -> " + candidate.chars[ck].damageTakenMultiplier);
    }
    if (candidate.chars[ck].maxEnemies !== baseline.chars[ck].maxEnemies) {
      changes.push(ck + ".maxEnemies: " + baseline.chars[ck].maxEnemies + " -> " + candidate.chars[ck].maxEnemies);
    }
  }

  if (candidate.gekokujoBaseMin !== baseline.gekokujoBaseMin) {
    changes.push("gekokujoBaseMin: " + baseline.gekokujoBaseMin + " -> " + candidate.gekokujoBaseMin);
  }
  if (candidate.gekokujoPerRank !== baseline.gekokujoPerRank) {
    changes.push("gekokujoPerRank: " + baseline.gekokujoPerRank + " -> " + candidate.gekokujoPerRank);
  }
  if (candidate.bossBattleTime !== baseline.bossBattleTime) {
    changes.push("bossBattleTime: " + baseline.bossBattleTime + " -> " + candidate.bossBattleTime);
  }
  if (candidate.maintenanceCost !== baseline.maintenanceCost) {
    changes.push("maintenanceCost: " + baseline.maintenanceCost + " -> " + candidate.maintenanceCost);
  }
  if (candidate.chars.merchant.initialKoku !== baseline.chars.merchant.initialKoku) {
    changes.push("merchant.initialKoku: " + baseline.chars.merchant.initialKoku + " -> " + candidate.chars.merchant.initialKoku);
  }

  return changes;
}

// ============================================================
// Candidate parameter sets
// ============================================================
function generateCandidates() {
  const candidates = [];

  // FINAL round analysis (5 iterations of search):
  // - Boss HP 550: merchant beats boss 85%, others 100% -> boss avg ~96% (too high)
  // - Need boss defeat ~70% OVERALL. That means some chars should fail more.
  // - But merchant min drops when boss fails -> violates min ordering
  // - Solution: accept asymmetric boss rates: merchant ~85%, ashigaru ~60%, farmer ~65%
  //   -> This makes ashigaru need buko bonus to compensate for lower win rate
  //   -> The higher boss HP makes the game harder overall
  // - OR: keep boss easy, use OTHER parameters for the 70% target
  //
  // Actually, re-reading requirements: "~70% overall" and "~80% tenka reach"
  // This means the AVERAGE across all modes should be ~70% boss and ~80% tenka.
  // With current variance model: ashigaru 100%, merchant 60-80%, farmerQ 80-90%, farmerNoQ 100%
  // That gives avg around 85%. Need to push further.
  //
  // New approach: boss HP 650-700 with farmer damageTakenMult increase
  // Also: the fitness function penalizes individual chars below 50%.
  // Merchant at 50-60% is acceptable. ashigaru can stay high since buko requires it.
  //
  // Focus areas for round 3:
  // 1. Boss HP 600-700 (merchant ~60-70%, farmer Q ~70-80%, ashigaru ~100%)
  // 2. Tenka threshold 22-24k (ashigaru ~60%, merchant ~60%, farmer ~90-100%)
  // 3. farmer.damageTakenMultiplier increase (to lower farmer boss rate)
  // 4. ikkiQMult 4-5 + consumeRate 0.25-0.3 (Q-on > Q-off)
  // 5. bukoBaseReward 4-5k (ashigaru min buff via reliable boss kills)

  // Round 5: Focus on making merchant avg > ashigaru avg
  // Base: B680+T22k+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k
  //
  // Remaining issues to solve:
  // 1. merchant avg (20738) < ashigaru avg (22590) -> need merchant > ashigaru
  // 2. merchant min (13838) is lowest -> needs to be above farmerQ min
  // 3. boss avg 90% -> need ~70%
  // 4. tenka avg 74% -> close to target (80%)
  //
  // Strategy for merchant avg > ashigaru:
  // - ashigaru buko bonus boosts ashigaru min but also avg
  // - Need merchant to beat boss MORE often so gekokujo bonus is reliable
  // - Lower boss HP slightly OR give merchant boss advantage
  // - Keep buko for ashigaru min floor but reduce it to lower ashigaru avg
  //
  // Strategy for boss ~70%:
  // - ashigaru DTM increase -> ashigaru loses parade -> some boss failures
  // - Higher boss HP -> merchant fails more (bad)
  // - Accept: ashigaru ~80%, merchant ~70%, farmerNoQ ~90%, farmerQ ~50%
  //   avg = (80+70+90+50)/4 = 72.5% <- close to 70%

  // Key insight: gekokujoBaseMin is currently 2000 + rankIndex*1000
  // At rank 4 (大名) that's 6000 base, with scoreMult and KokuReward = ~5000-9000
  // This massive bonus dominates score differences.
  // Reducing it makes field score (where merchant excels) matter more.
  //
  // Also: bukoBaseReward is ashigaru-only. If buko > gekokujo, ashigaru
  // benefits MORE from boss kill than others. But ashigaru already has
  // highest boss rate. So buko lifts ashigaru avg above merchant.
  // Solution: keep buko moderate, reduce it if needed.

  // Best from round 3: B680+T22k+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k (fitness -201.75)
  // This round: refine around that winner with variations

  // S1: The round 3 winner (re-run for consistency)
  const s1 = createBaseGame();
  s1.tonoBoss.hp = 680;
  s1.ranks[5].threshold = 22000;
  s1.chars.farmer.damageTakenMultiplier = 1.5;
  s1.ikkiQMult = 4.5;
  s1.ikkiConsumeRate = 0.3;
  s1.ikkiDamagePerMember = 10;
  s1.bukoBaseReward = 4000;
  candidates.push({ name: "S1: B680+T22k+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k", game: s1 });

  // S2: Winner + merchant SM 1.3 (merchant field score buff)
  const s2 = createBaseGame();
  s2.tonoBoss.hp = 680;
  s2.ranks[5].threshold = 22000;
  s2.chars.merchant.scoreMultiplier = 1.3;
  s2.chars.farmer.damageTakenMultiplier = 1.5;
  s2.ikkiQMult = 4.5;
  s2.ikkiConsumeRate = 0.3;
  s2.ikkiDamagePerMember = 10;
  s2.bukoBaseReward = 4000;
  candidates.push({ name: "S2: B680+T22k+MSM1.3+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k", game: s2 });

  // S3: Winner + lower buko (reduce ashigaru avg advantage)
  const s3 = createBaseGame();
  s3.tonoBoss.hp = 680;
  s3.ranks[5].threshold = 22000;
  s3.chars.farmer.damageTakenMultiplier = 1.5;
  s3.ikkiQMult = 4.5;
  s3.ikkiConsumeRate = 0.3;
  s3.ikkiDamagePerMember = 10;
  s3.bukoBaseReward = 2000;
  candidates.push({ name: "S3: B680+T22k+FDTM1.5+IQ4.5+IC.3+ID10+Bk2k(default)", game: s3 });

  // S4: Winner + MSM1.25 + buko 3000
  const s4 = createBaseGame();
  s4.tonoBoss.hp = 680;
  s4.ranks[5].threshold = 22000;
  s4.chars.merchant.scoreMultiplier = 1.25;
  s4.chars.farmer.damageTakenMultiplier = 1.5;
  s4.ikkiQMult = 4.5;
  s4.ikkiConsumeRate = 0.3;
  s4.ikkiDamagePerMember = 10;
  s4.bukoBaseReward = 3000;
  candidates.push({ name: "S4: B680+T22k+MSM1.25+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s4 });

  // S5: Winner + MDTM 1.0 (merchant takes less boss damage -> higher boss win)
  const s5 = createBaseGame();
  s5.tonoBoss.hp = 680;
  s5.ranks[5].threshold = 22000;
  s5.chars.merchant.damageTakenMultiplier = 1.0;
  s5.chars.farmer.damageTakenMultiplier = 1.5;
  s5.ikkiQMult = 4.5;
  s5.ikkiConsumeRate = 0.3;
  s5.ikkiDamagePerMember = 10;
  s5.bukoBaseReward = 4000;
  candidates.push({ name: "S5: B680+T22k+MDTM1.0+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k", game: s5 });

  // S6: Winner + MSM1.3 + MDTM1.0 + buko 3k
  const s6 = createBaseGame();
  s6.tonoBoss.hp = 680;
  s6.ranks[5].threshold = 22000;
  s6.chars.merchant.scoreMultiplier = 1.3;
  s6.chars.merchant.damageTakenMultiplier = 1.0;
  s6.chars.farmer.damageTakenMultiplier = 1.5;
  s6.ikkiQMult = 4.5;
  s6.ikkiConsumeRate = 0.3;
  s6.ikkiDamagePerMember = 10;
  s6.bukoBaseReward = 3000;
  candidates.push({ name: "S6: B680+T22k+MSM1.3+MDTM1.0+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s6 });

  // S7: Winner + T20k (lower tenka threshold)
  const s7 = createBaseGame();
  s7.tonoBoss.hp = 680;
  s7.ranks[5].threshold = 20000;
  s7.chars.farmer.damageTakenMultiplier = 1.5;
  s7.ikkiQMult = 4.5;
  s7.ikkiConsumeRate = 0.3;
  s7.ikkiDamagePerMember = 10;
  s7.bukoBaseReward = 4000;
  candidates.push({ name: "S7: B680+T20k+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k", game: s7 });

  // S8: Winner + MSM1.3 + T20k + buko 3k
  const s8 = createBaseGame();
  s8.tonoBoss.hp = 680;
  s8.ranks[5].threshold = 20000;
  s8.chars.merchant.scoreMultiplier = 1.3;
  s8.chars.farmer.damageTakenMultiplier = 1.5;
  s8.ikkiQMult = 4.5;
  s8.ikkiConsumeRate = 0.3;
  s8.ikkiDamagePerMember = 10;
  s8.bukoBaseReward = 3000;
  candidates.push({ name: "S8: B680+T20k+MSM1.3+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s8 });

  // S9: Winner + MSM1.3 + MDTM1.0 + T20k
  const s9 = createBaseGame();
  s9.tonoBoss.hp = 680;
  s9.ranks[5].threshold = 20000;
  s9.chars.merchant.scoreMultiplier = 1.3;
  s9.chars.merchant.damageTakenMultiplier = 1.0;
  s9.chars.farmer.damageTakenMultiplier = 1.5;
  s9.ikkiQMult = 4.5;
  s9.ikkiConsumeRate = 0.3;
  s9.ikkiDamagePerMember = 10;
  s9.bukoBaseReward = 3000;
  candidates.push({ name: "S9: B680+T20k+MSM1.3+MDTM1.0+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s9 });

  // S10: B650 + MSM1.3 + MDTM1.0 + T22k
  const s10 = createBaseGame();
  s10.tonoBoss.hp = 650;
  s10.ranks[5].threshold = 22000;
  s10.chars.merchant.scoreMultiplier = 1.3;
  s10.chars.merchant.damageTakenMultiplier = 1.0;
  s10.chars.farmer.damageTakenMultiplier = 1.5;
  s10.ikkiQMult = 4.5;
  s10.ikkiConsumeRate = 0.3;
  s10.ikkiDamagePerMember = 10;
  s10.bukoBaseReward = 3000;
  candidates.push({ name: "S10: B650+T22k+MSM1.3+MDTM1.0+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s10 });

  // S11: Winner + ICD7 + IQ3.5
  const s11 = createBaseGame();
  s11.tonoBoss.hp = 680;
  s11.ranks[5].threshold = 22000;
  s11.chars.farmer.damageTakenMultiplier = 1.5;
  s11.ikkiQMult = 3.5;
  s11.ikkiCD = 7;
  s11.ikkiConsumeRate = 0.3;
  s11.ikkiDamagePerMember = 10;
  s11.bukoBaseReward = 4000;
  candidates.push({ name: "S11: B680+T22k+FDTM1.5+IQ3.5+ICD7+IC.3+ID10+Bk4k", game: s11 });

  // S12: B600 + MSM1.3 + MDTM1.0 + T22k (lower boss for merchant)
  const s12 = createBaseGame();
  s12.tonoBoss.hp = 600;
  s12.ranks[5].threshold = 22000;
  s12.chars.merchant.scoreMultiplier = 1.3;
  s12.chars.merchant.damageTakenMultiplier = 1.0;
  s12.chars.farmer.damageTakenMultiplier = 1.5;
  s12.ikkiQMult = 4.5;
  s12.ikkiConsumeRate = 0.3;
  s12.ikkiDamagePerMember = 10;
  s12.bukoBaseReward = 3000;
  candidates.push({ name: "S12: B600+T22k+MSM1.3+MDTM1.0+FDTM1.5+IQ4.5+IC.3+ID10+Bk3k", game: s12 });

  // S13: Winner + MI7000 (merchant initial koku buff)
  const s13 = createBaseGame();
  s13.tonoBoss.hp = 680;
  s13.ranks[5].threshold = 22000;
  s13.chars.merchant.initialKoku = 7000;
  s13.chars.farmer.damageTakenMultiplier = 1.5;
  s13.ikkiQMult = 4.5;
  s13.ikkiConsumeRate = 0.3;
  s13.ikkiDamagePerMember = 10;
  s13.bukoBaseReward = 4000;
  candidates.push({ name: "S13: B680+T22k+MI7k+FDTM1.5+IQ4.5+IC.3+ID10+Bk4k", game: s13 });

  // S14: B650 + MSM1.25 + MDTM1.0 + FDTM1.6 + T22k
  const s14 = createBaseGame();
  s14.tonoBoss.hp = 650;
  s14.ranks[5].threshold = 22000;
  s14.chars.merchant.scoreMultiplier = 1.25;
  s14.chars.merchant.damageTakenMultiplier = 1.0;
  s14.chars.farmer.damageTakenMultiplier = 1.6;
  s14.ikkiQMult = 4.5;
  s14.ikkiConsumeRate = 0.3;
  s14.ikkiDamagePerMember = 10;
  s14.bukoBaseReward = 3500;
  candidates.push({ name: "S14: B650+T22k+MSM1.25+MDTM1.0+FDTM1.6+IQ4.5+IC.3+ID10+Bk3.5k", game: s14 });

  // S15: B680 + MSM1.3 + MDTM1.0 + FDTM1.5 + IQ5 + IC.25 + buko 3k
  const s15 = createBaseGame();
  s15.tonoBoss.hp = 680;
  s15.ranks[5].threshold = 22000;
  s15.chars.merchant.scoreMultiplier = 1.3;
  s15.chars.merchant.damageTakenMultiplier = 1.0;
  s15.chars.farmer.damageTakenMultiplier = 1.5;
  s15.ikkiQMult = 5.0;
  s15.ikkiConsumeRate = 0.25;
  s15.ikkiDamagePerMember = 10;
  s15.bukoBaseReward = 3000;
  candidates.push({ name: "S15: B680+T22k+MSM1.3+MDTM1.0+FDTM1.5+IQ5+IC.25+ID10+Bk3k", game: s15 });

  return candidates;
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

// ============================================================
// Main
// ============================================================
function main() {
  console.log("============================================================");
  console.log("  下克上オンライン バランス探索");
  console.log("  試行回数: " + TRIALS + " / 候補セットごと");
  console.log("============================================================\n");

  const baseline = createBaseGame();

  console.log("--- ベースライン (現行パラメータ) ---");
  const baseResults = runAllModes(baseline, TRIALS);
  printResults(baseResults);
  const baseFitness = evaluateFitness(baseResults);
  console.log("  Fitness: " + baseFitness + "\n");

  const candidates = generateCandidates();
  const evaluated = [];

  for (const candidate of candidates) {
    process.stdout.write("Evaluating: " + candidate.name + " ... ");
    const results = runAllModes(candidate.game, TRIALS);
    const fitness = evaluateFitness(results);
    console.log("fitness = " + fitness);
    evaluated.push({
      name: candidate.name,
      game: candidate.game,
      results: results,
      fitness: fitness,
    });
  }

  // Sort by fitness (higher is better)
  evaluated.sort((a, b) => b.fitness - a.fitness);

  console.log("\n============================================================");
  console.log("  TOP 3 パラメータセット");
  console.log("============================================================\n");

  const top3 = evaluated.slice(0, 3);
  for (let rank = 0; rank < top3.length; rank++) {
    const entry = top3[rank];
    console.log("=== #" + (rank + 1) + ": " + entry.name + " (fitness: " + entry.fitness + ") ===\n");

    const changes = getChanges(entry.game, baseline);
    console.log("  [変更パラメータ] (" + changes.length + "個)");
    for (const c of changes) {
      console.log("    " + c);
    }
    console.log("");

    printResults(entry.results);
    printBalanceCheck(entry.results);
    console.log("");
  }

  console.log("============================================================");
  console.log("  ベースラインとTOP1の比較");
  console.log("============================================================\n");
  printComparison(baseResults, top3[0].results);
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

function printComparison(base, top) {
  const labels = [
    { key: "ashigaru",  name: "足軽" },
    { key: "merchant",  name: "商人" },
    { key: "farmerNoQ", name: "農民Q無" },
    { key: "farmerQ",   name: "農民Q有" },
  ];

  for (const l of labels) {
    const b = base[l.key];
    const t = top[l.key];
    console.log("  " + l.name + ":");
    console.log("    avg: " + b.avg + " -> " + t.avg + " (" + (t.avg - b.avg > 0 ? "+" : "") + (t.avg - b.avg) + ")");
    console.log("    min: " + b.min + " -> " + t.min);
    console.log("    max: " + b.max + " -> " + t.max);
    console.log("    boss: " + b.bossWinRate + "% -> " + t.bossWinRate + "%");
    console.log("    tenka: " + b.tenkaRate + "% -> " + t.tenkaRate + "%");
  }
}

main();
