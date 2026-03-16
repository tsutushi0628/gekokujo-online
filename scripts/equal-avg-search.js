#!/usr/bin/env node
// ============================================================
// 下克上オンライン 平均均等化バランス探索 (Equal Average Search)
//
// 目標:
//   - 全キャラの平均スコアを±10%以内に揃える
//   - レンジ順: 足軽(狭) < 商人 < 農民Q無 < 農民Q有(広)
//   - 天井順: 足軽 < 商人 < 農民Q無 < 農民Q有
//   - 床順: 農民Q有 < 農民Q無 < 商人 < 足軽(最高床)
//   - 殿様撃破率 ~70%, 天下人到達率 ~80%
//
// ALL-KILL一揆: enemiesHit = Math.floor(enemiesOnField) (上限なし)
// ============================================================

const TRIALS = 500;

// ============================================================
// ベースゲーム定数 (score-simulator.js から転記)
// ============================================================
function makeGameConfig(overrides) {
  const g = {
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

  // Apply overrides
  if (overrides.farmerScoreMult !== undefined) {
    g.chars.farmer.scoreMultiplier = overrides.farmerScoreMult;
  }
  if (overrides.merchantScoreMult !== undefined) {
    g.chars.merchant.scoreMultiplier = overrides.merchantScoreMult;
  }
  if (overrides.ashigaruScoreMult !== undefined) {
    g.chars.ashigaru.scoreMultiplier = overrides.ashigaruScoreMult;
  }
  if (overrides.farmerMaxEnemies !== undefined) {
    g.chars.farmer.maxEnemies = overrides.farmerMaxEnemies;
  }
  if (overrides.farmerSpawnInterval !== undefined) {
    g.chars.farmer.spawnInterval = overrides.farmerSpawnInterval;
  }
  if (overrides.farmerDamageTakenMult !== undefined) {
    g.chars.farmer.damageTakenMultiplier = overrides.farmerDamageTakenMult;
  }
  if (overrides.tonoBossHp !== undefined) {
    g.tonoBoss.hp = overrides.tonoBossHp;
  }
  if (overrides.ikkiQMult !== undefined) {
    g.ikkiQMult = overrides.ikkiQMult;
  }
  if (overrides.ikkiConsumeRate !== undefined) {
    g.ikkiConsumeRate = overrides.ikkiConsumeRate;
  }
  if (overrides.ikkiDamagePerMember !== undefined) {
    g.ikkiDamagePerMember = overrides.ikkiDamagePerMember;
  }
  if (overrides.bukoBaseReward !== undefined) {
    g.bukoBaseReward = overrides.bukoBaseReward;
  }
  if (overrides.tenkaThreshold !== undefined) {
    g.ranks[5].threshold = overrides.tenkaThreshold;
  }

  return g;
}

// ============================================================
// KokuReward (±25%, 10%クリティカル×2)
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
// 敵tier
// ============================================================
function getEnemyTier(gameTime, enemies) {
  const e = enemies;
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
// 攻撃力計算
// ============================================================
function getAttackPower(charDef, paradeLen) {
  const base = charDef.attack;
  const followerBonus = Math.floor(paradeLen * charDef.followerBonus * base * 10);
  return base + followerBonus;
}

// ============================================================
// 殿様戦DPS
// ============================================================
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

// ============================================================
// ランク取得
// ============================================================
function getRankIndex(koku, ranks) {
  let idx = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (koku >= ranks[i].threshold) {
      idx = i;
      break;
    }
  }
  return idx;
}

// ============================================================
// シナリオ
// ============================================================
function getScenario(level) {
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
// コアシミュレーション (ALL-KILL一揆版)
// ============================================================
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

  // 農民Q有は50秒フィールド
  let fieldTime = maxTime;
  if (ikkiMode) {
    fieldTime = 50;
  }

  for (let t = 0; t < fieldTime; t += dt) {
    const tier = getEnemyTier(t, GAME.enemies);

    // パレード成長
    if (charKey === "merchant") {
      autoHireTimer -= dt;
      if (autoHireTimer <= 0 && koku >= GAME.autoHireCost && Math.floor(paradeLen) < GAME.autoHireMaxParade) {
        paradeLen += 1;
        koku -= GAME.autoHireCost;
        stat.recruitCost += GAME.autoHireCost;
        autoHireTimer = GAME.autoHireCD;
      }
    } else {
      if (paradeLen < 20) {
        const effectiveRecruit = scenario.recruitRate * scenario.distanceFactor;
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
    stat.enemyKillScore += earnedScore;
    enemiesOnField = Math.max(0, enemiesOnField - killsThisSec * dt);

    // 農民: 攻撃ヒット時30%で民間人スポーン
    if (charKey === "farmer") {
      const attacksPerSec = 1 / cd.attackCD;
      const civilianSpawns = attacksPerSec * 0.3 * scenario.attackShare * dt;
      const bonusRecruit = civilianSpawns * 0.5 * scenario.distanceFactor;
      if (paradeLen < 20) {
        paradeLen += bonusRecruit;
      }
    }

    // 威圧
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

      const maintenance = GAME.maintenanceCost * flooredParade * dt;
      koku -= maintenance;
      stat.maintenanceCost += maintenance;

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

    // 一揆Q (ALL-KILL版: enemiesHit = Math.floor(enemiesOnField), 上限なし)
    if (ikkiMode) {
      ikkiCDTimer -= dt;
      if (ikkiCDTimer <= 0 && flooredParade >= 1 && t > 5) {
        const consumed = Math.max(1, Math.floor(paradeLen * GAME.ikkiConsumeRate));
        const ikkiEfficiency = scenario.distanceFactor * 0.8 + 0.2;
        // ALL-KILL: フィールド上の全敵にヒット (上限なし)
        const enemiesHit = Math.floor(enemiesOnField * ikkiEfficiency);
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

  const effectiveBattleTime = GAME.bossBattleTime * 0.80;

  const rIdx = Math.min(getRankIndex(koku, GAME.ranks) + 2, GAME.ranks.length - 1);
  const bossAttack = 8 + rIdx * 4;

  const shockwaveCount = Math.floor(effectiveBattleTime / 5);
  let paradeLenDuringBoss = paradeLenAtBoss;
  for (let sw = 0; sw < shockwaveCount; sw++) {
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - Math.floor(paradeLenDuringBoss * 0.15));
  }

  const dps = getBossDPS(cd, paradeLenDuringBoss, GAME);

  const retreatTime = effectiveBattleTime * 0.25;
  const retreatHits = Math.floor(retreatTime / 1.5);
  const retreatDmg = retreatHits * 12 * cd.damageTakenMultiplier;

  // 一揆ダメージ (ボス戦)
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
      stat.bukoBonus = bukoReward;
    }

    const rankIdx = getRankIndex(koku, GAME.ranks);
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
// モンテカルロ
// ============================================================
function monteCarlo(charKey, ikkiMode, scenarioLevel, trials, GAME) {
  const results = [];
  let bossWins = 0;
  let tenkaReaches = 0;
  const statSums = {};

  for (let i = 0; i < trials; i++) {
    const r = simulateOnce(charKey, ikkiMode, scenarioLevel, GAME);
    results.push(r.koku);
    if (r.bossDefeated) bossWins++;
    if (r.koku >= GAME.ranks[5].threshold) tenkaReaches++;

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
  const range = max - min;

  const avgStat = {};
  for (const key of Object.keys(statSums)) {
    avgStat[key] = Math.round(statSums[key] / trials);
  }

  return {
    min, max, avg, p10, p50, p90, range,
    bossWinRate: Math.round(bossWins / trials * 100),
    tenkaRate: Math.round(tenkaReaches / trials * 100),
    avgStat,
  };
}

// ============================================================
// 混合スキルモンテカルロ (30%低/50%中/20%高)
// ============================================================
function monteCarloMixed(charKey, ikkiMode, trials, GAME) {
  const results = [];
  let bossWins = 0;
  let tenkaReaches = 0;
  const statSums = {};

  for (let i = 0; i < trials; i++) {
    // Mixed skill distribution: 30% low, 50% mid, 20% high
    let scenario;
    const roll = Math.random();
    if (roll < 0.3) {
      scenario = "low";
    } else if (roll < 0.8) {
      scenario = "mid";
    } else {
      scenario = "high";
    }

    const r = simulateOnce(charKey, ikkiMode, scenario, GAME);
    results.push(r.koku);
    if (r.bossDefeated) bossWins++;
    if (r.koku >= GAME.ranks[5].threshold) tenkaReaches++;

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
  const range = max - min;

  const avgStat = {};
  for (const key of Object.keys(statSums)) {
    avgStat[key] = Math.round(statSums[key] / trials);
  }

  return {
    min, max, avg, p10, p50, p90, range,
    bossWinRate: Math.round(bossWins / trials * 100),
    tenkaRate: Math.round(tenkaReaches / trials * 100),
    avgStat,
  };
}

// ============================================================
// フィットネス評価
// ============================================================
function evaluateConfig(overrides) {
  const GAME = makeGameConfig(overrides);

  const ashigaru = monteCarloMixed("ashigaru", false, TRIALS, GAME);
  const merchant = monteCarloMixed("merchant", false, TRIALS, GAME);
  const farmerNoQ = monteCarloMixed("farmer", false, TRIALS, GAME);
  const farmerQ = monteCarloMixed("farmer", true, TRIALS, GAME);

  const avgs = [ashigaru.avg, merchant.avg, farmerNoQ.avg, farmerQ.avg];
  const globalAvg = avgs.reduce((a, b) => a + b, 0) / 4;

  // === HIGHEST WEIGHT: 平均スコア均等化 (±10%以内) ===
  let avgPenalty = 0;
  for (const a of avgs) {
    const deviation = Math.abs(a - globalAvg) / globalAvg;
    avgPenalty += deviation * 5;
  }

  // === HIGH WEIGHT: Max順序 (足軽 < 商人 < 農民Q無 < 農民Q有) ===
  let maxPenalty = 0;
  if (ashigaru.max >= merchant.max) maxPenalty += 1.0;
  if (merchant.max >= farmerNoQ.max) maxPenalty += 1.0;
  if (farmerNoQ.max >= farmerQ.max) maxPenalty += 1.0;

  // === HIGH WEIGHT: Min順序 (農民Q有 < 農民Q無 < 商人 < 足軽) ===
  let minPenalty = 0;
  if (farmerQ.min >= farmerNoQ.min) minPenalty += 1.0;
  if (farmerNoQ.min >= merchant.min) minPenalty += 1.0;
  if (merchant.min >= ashigaru.min) minPenalty += 1.0;

  // === HIGH WEIGHT: Range順序 (足軽 < 商人 < 農民Q無 < 農民Q有) ===
  let rangePenalty = 0;
  if (ashigaru.range >= merchant.range) rangePenalty += 1.0;
  if (merchant.range >= farmerNoQ.range) rangePenalty += 1.0;
  if (farmerNoQ.range >= farmerQ.range) rangePenalty += 1.0;

  // === MEDIUM WEIGHT: 殿様撃破率 ~70% ===
  const allBossRates = [ashigaru.bossWinRate, merchant.bossWinRate, farmerNoQ.bossWinRate, farmerQ.bossWinRate];
  let bossPenalty = 0;
  for (const rate of allBossRates) {
    bossPenalty += Math.abs(rate - 70) / 100 * 0.5;
  }

  // === MEDIUM WEIGHT: 天下人到達率 ~80% ===
  const allTenkaRates = [ashigaru.tenkaRate, merchant.tenkaRate, farmerNoQ.tenkaRate, farmerQ.tenkaRate];
  let tenkaPenalty = 0;
  for (const rate of allTenkaRates) {
    tenkaPenalty += Math.abs(rate - 80) / 100 * 0.5;
  }

  const totalPenalty = avgPenalty + maxPenalty + minPenalty + rangePenalty + bossPenalty + tenkaPenalty;

  return {
    overrides,
    totalPenalty,
    avgPenalty,
    maxPenalty,
    minPenalty,
    rangePenalty,
    bossPenalty,
    tenkaPenalty,
    globalAvg,
    results: {
      ashigaru,
      merchant,
      farmerNoQ,
      farmerQ,
    },
  };
}

// ============================================================
// パラメータ組み合わせ生成
// ============================================================
function generateCombinations() {
  const combos = [];

  // Round 2: 前回の結果分析
  // - 全キャラBoss100%/天下人100% → スコアが高すぎる(20000+)
  // - 農民Q無が農民Q有より高い場合が多い → 農民のフィールド稼ぎ(maxEnemies=17)が強すぎる
  // - 足軽の武功ボーナスがレンジを広げてしまう
  // - 天下人閾値を大幅に上げるか、敵スコアを下げるか、maxEnemiesを下げる必要あり

  // 方針: 天下人閾値を20000-25000に引き上げ、農民maxEnemiesも探索、ikkiConsumeRateも高め

  // Round 4: 分析結果
  // - tonoBossHp上げるとキャラ間DPS差でBoss勝敗が分かれ、平均差が拡大する
  // - Boss勝率100%は維持し、天下人閾値で到達率80%を調整するのが正解
  // - Round2#4が最良: farmerScoreMult=0.95, maxEnemies=14 → 平均偏差±5.3%
  // - 残課題: レンジ順序(足軽>商人になりがち)を直す
  //   → 足軽bukoRewardを下げ+KokuRewardクリティカルの分散を小さくする方向
  //   → ikkiQMultを上げて農民Q有の天井を上げる
  //   → merchantScoreMultを微増して商人レンジを少し広げる

  // === 最終探索 (Round 6) ===
  // これまでの有望候補:
  //   A) R4#1: farmerSM=0.95, buko=1500, maxEn=14, tenka=20000 → レンジYES, avg±7.2%
  //   B) R5#1: ashiSM=1.1, farmerSM=0.95, buko=1500 → avg±4.7%, レンジNO(足軽レンジ最大)
  //   C) R5#2: ashiSM=1.15, farmerSM=0.85, buko=1000, ikki=2.5, consume=0.6 → avg±4.7%
  //
  // 構造的課題:
  //   足軽bukoクリティカルが天井・レンジを広げてしまい「安定型」と矛盾
  //   → bukoを小さくすると足軽の天井が下がりmax順序が達成しやすいが、
  //     足軽の平均も下がって平均均等化が崩れる
  //   → ashigaruScoreMultを上げると足軽の床・天井・平均が全て上がる
  //
  // 最終方針: Aをベースに ashigaruScoreMult 1.05-1.1 で微調整、
  //   bukoは0-500の低い値で足軽レンジを最小化

  const base = {
    farmerScoreMult: 0.95,
    merchantScoreMult: 1.0,
    ashigaruScoreMult: 1.0,
    ikkiQMult: 2.0,
    ikkiConsumeRate: 0.5,
    tonoBossHp: 700,
    bukoBaseReward: 1500,
    farmerDamageTakenMult: 1.4,
    tenkaThreshold: 20000,
    farmerMaxEnemies: 14,
    farmerSpawnInterval: 2,
  };

  function combo(overrides) {
    const c = {};
    for (const key of Object.keys(base)) {
      c[key] = base[key];
    }
    for (const key of Object.keys(overrides)) {
      c[key] = overrides[key];
    }
    combos.push(c);
  }

  // === 候補A再現 (R4#1ベスト) ===
  combo({});

  // === 候補A + 足軽scoreMult微増 (足軽の床を上げてmin順序改善) ===
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 0 });
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 500 });
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 1000 });
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 1500 });

  combo({ ashigaruScoreMult: 1.1, bukoBaseReward: 0 });
  combo({ ashigaruScoreMult: 1.1, bukoBaseReward: 500 });
  combo({ ashigaruScoreMult: 1.1, bukoBaseReward: 1000 });

  // === 候補A + 農民scoreMult下げ + 足軽上げ(平均均等化) ===
  combo({ ashigaruScoreMult: 1.05, farmerScoreMult: 0.90, bukoBaseReward: 0 });
  combo({ ashigaruScoreMult: 1.05, farmerScoreMult: 0.90, bukoBaseReward: 500 });
  combo({ ashigaruScoreMult: 1.1, farmerScoreMult: 0.90, bukoBaseReward: 0 });
  combo({ ashigaruScoreMult: 1.1, farmerScoreMult: 0.90, bukoBaseReward: 500 });
  combo({ ashigaruScoreMult: 1.1, farmerScoreMult: 0.85, bukoBaseReward: 0 });

  // === ikkiQMult上げで農民Q有の天井上昇 (Q有レンジ広げる) ===
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 0, ikkiQMult: 2.5 });
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 0, ikkiQMult: 2.5, ikkiConsumeRate: 0.6 });
  combo({ ashigaruScoreMult: 1.1, bukoBaseReward: 0, ikkiQMult: 2.5 });
  combo({ ashigaruScoreMult: 1.1, bukoBaseReward: 0, ikkiQMult: 2.5, ikkiConsumeRate: 0.6 });

  // === 商人微増(商人の平均を足軽に近づける) ===
  combo({ ashigaruScoreMult: 1.05, merchantScoreMult: 1.05, bukoBaseReward: 0 });
  combo({ ashigaruScoreMult: 1.1, merchantScoreMult: 1.05, bukoBaseReward: 0 });

  // === 天下人閾値微調整 ===
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 0, tenkaThreshold: 19000 });
  combo({ ashigaruScoreMult: 1.05, bukoBaseReward: 0, tenkaThreshold: 21000 });

  // === 有望な複合 ===
  combo({ ashigaruScoreMult: 1.05, farmerScoreMult: 0.90, bukoBaseReward: 0, ikkiQMult: 2.5, ikkiConsumeRate: 0.6 });
  combo({ ashigaruScoreMult: 1.1, farmerScoreMult: 0.90, merchantScoreMult: 1.05, bukoBaseReward: 0, ikkiQMult: 2.5 });
  combo({ ashigaruScoreMult: 1.05, farmerScoreMult: 0.90, merchantScoreMult: 1.05, bukoBaseReward: 500, ikkiQMult: 2.0, tenkaThreshold: 20000 });

  return combos;
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
function printResult(result, rank) {
  const o = result.overrides;
  const r = result.results;

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║  #" + rank + "  Penalty: " + result.totalPenalty.toFixed(3) + "  (avg:" + result.avgPenalty.toFixed(3) + " max:" + result.maxPenalty.toFixed(1) + " min:" + result.minPenalty.toFixed(1) + " range:" + result.rangePenalty.toFixed(1) + " boss:" + result.bossPenalty.toFixed(3) + " tenka:" + result.tenkaPenalty.toFixed(3) + ")");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  console.log("  [パラメータ]");
  console.log("    farmerScoreMult:      " + o.farmerScoreMult);
  console.log("    merchantScoreMult:    " + o.merchantScoreMult);
  console.log("    ikkiQMult:            " + o.ikkiQMult);
  console.log("    ikkiConsumeRate:      " + o.ikkiConsumeRate);
  console.log("    tonoBossHp:           " + o.tonoBossHp);
  console.log("    bukoBaseReward:       " + o.bukoBaseReward);
  console.log("    farmerDamageTakenMult:" + o.farmerDamageTakenMult);
  console.log("    farmerMaxEnemies:     " + (o.farmerMaxEnemies !== undefined ? o.farmerMaxEnemies : 17));
  console.log("    farmerSpawnInterval:  " + (o.farmerSpawnInterval !== undefined ? o.farmerSpawnInterval : 2));
  console.log("    tenkaThreshold:       " + o.tenkaThreshold);
  console.log("");

  console.log("  [スコアレンジ (mixed 30%低/50%中/20%高, " + TRIALS + " trials)]");
  console.log("  ┌────────────┬────────┬────────┬────────┬────────┬────────┬────────┬──────┬──────┐");
  console.log("  │ キャラ     │  最低  │  P10   │  平均  │  P50   │  P90   │  最高  │Boss勝│天下人│");
  console.log("  ├────────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────┼──────┤");

  const labels = ["足軽", "商人", "農民Q無", "農民Q有"];
  const keys = ["ashigaru", "merchant", "farmerNoQ", "farmerQ"];

  for (let i = 0; i < 4; i++) {
    const data = r[keys[i]];
    console.log(
      "  │ " + padR(labels[i], 10) +
      " │ " + pad(data.min, 6) +
      " │ " + pad(data.p10, 6) +
      " │ " + pad(data.avg, 6) +
      " │ " + pad(data.p50, 6) +
      " │ " + pad(data.p90, 6) +
      " │ " + pad(data.max, 6) +
      " │ " + pad(data.bossWinRate + "%", 4) +
      " │ " + pad(data.tenkaRate + "%", 4) + " │"
    );
  }
  console.log("  └────────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────┴──────┘");

  // 平均の偏差チェック
  const avgs = [r.ashigaru.avg, r.merchant.avg, r.farmerNoQ.avg, r.farmerQ.avg];
  const gAvg = result.globalAvg;
  console.log("  Global Avg: " + Math.round(gAvg));
  for (let i = 0; i < 4; i++) {
    const dev = ((avgs[i] - gAvg) / gAvg * 100).toFixed(1);
    const sign = avgs[i] >= gAvg ? "+" : "";
    console.log("    " + padR(labels[i], 10) + ": " + avgs[i] + " (" + sign + dev + "%)");
  }

  // レンジ確認
  console.log("  [レンジ]");
  console.log("    足軽:   " + r.ashigaru.range + "  商人: " + r.merchant.range + "  農民Q無: " + r.farmerNoQ.range + "  農民Q有: " + r.farmerQ.range);
  const rangeOk = (r.ashigaru.range < r.merchant.range) && (r.merchant.range < r.farmerNoQ.range) && (r.farmerNoQ.range < r.farmerQ.range);
  console.log("    順序OK: " + (rangeOk ? "YES" : "NO"));

  console.log("");
}

// ============================================================
// メイン
// ============================================================
function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║   下克上オンライン 平均均等化バランス探索 (ALL-KILL一揆版)                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log("  一揆ALL-KILL: enemiesHit = Math.floor(enemiesOnField) (上限なし)");
  console.log("  試行回数: " + TRIALS + " trials/test (mixed: 30%低/50%中/20%高)");
  console.log("  目標: 平均±10%, レンジ順序, Max/Min順序, Boss~70%, 天下人~80%\n");

  const combos = generateCombinations();
  console.log("  探索パラメータ組み合わせ: " + combos.length + " 件\n");

  const allResults = [];

  for (let i = 0; i < combos.length; i++) {
    process.stdout.write("  Testing #" + (i + 1) + "/" + combos.length + "...\r");
    const result = evaluateConfig(combos[i]);
    allResults.push(result);
  }

  // ペナルティでソート (低い方が良い)
  allResults.sort((a, b) => a.totalPenalty - b.totalPenalty);

  console.log("\n\n========== TOP 5 RESULTS ==========\n");

  const topCount = Math.min(5, allResults.length);
  for (let i = 0; i < topCount; i++) {
    printResult(allResults[i], i + 1);
  }

  // 現行パラメータとの比較
  console.log("========== 参考: 現行パラメータ (ALL-KILL一揆適用) ==========\n");
  const currentResult = evaluateConfig({
    farmerScoreMult: 1.4,
    merchantScoreMult: 1.2,
    ikkiQMult: 2.6,
    ikkiConsumeRate: 0.5,
    tonoBossHp: 500,
    bukoBaseReward: 2000,
    farmerDamageTakenMult: 1.4,
    tenkaThreshold: 12000,
  });
  printResult(currentResult, "現行");
}

main();
