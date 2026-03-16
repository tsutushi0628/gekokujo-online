// 忠誠離脱あり/なし比較テスト
// #1パラメータ + ALL-KILL一揆で、loyaltyAvg=20 vs loyaltyAvg=Infinity

const GAME_BASE = {
  maxTime: 60,
  bossBattleTime: 20,
  chars: {
    ashigaru: {
      name: "足軽", attack: 7, projectileCount: 5, followerBonus: 0.008,
      followerDamage: 2, followerCD: 0.7, chargeMultiplier: 1.0,
      scoreMultiplier: 0.95, damageTakenMultiplier: 1.0, maxEnemies: 12,
      spawnInterval: 3, initialKoku: 0, attackCD: 0.25, loyaltyAvg: 20,
    },
    merchant: {
      name: "商人", attack: 2, projectileCount: 2, followerBonus: 0.012,
      followerDamage: 3, followerCD: 0.7, chargeMultiplier: 0.5,
      scoreMultiplier: 1.0, damageTakenMultiplier: 1.2, maxEnemies: 12,
      spawnInterval: 3, initialKoku: 6500, attackCD: 0.25, loyaltyAvg: 0,
      recruitCost: 300,
    },
    farmer: {
      name: "農民", attack: 3, projectileCount: 1, followerBonus: 0.025,
      followerDamage: 3, followerCD: 0.7, chargeMultiplier: 0.8,
      scoreMultiplier: 0.95, damageTakenMultiplier: 1.4, maxEnemies: 14,
      spawnInterval: 2, initialKoku: 0, attackCD: 0.125, loyaltyAvg: 0,
    },
  },
  enemies: [
    { name: "野盗", hp: 20, score: 100, grit: 3 },
    { name: "足軽隊", hp: 35, score: 250, grit: 10 },
    { name: "侍", hp: 55, score: 500, grit: 999 },
    { name: "武将", hp: 80, score: 800, grit: 999 },
  ],
  ranks: [
    { name: "農民", threshold: 0 }, { name: "足軽", threshold: 500 },
    { name: "侍", threshold: 1500 }, { name: "武将", threshold: 3500 },
    { name: "大名", threshold: 7000 }, { name: "天下人", threshold: 20000 },
  ],
  tonoBoss: { hp: 700 },
  bridgeBoss: { hp: 240, score: 2000 },
  tsujigiriBaseReward: 1000,
  bukoBaseReward: 0,
  bukoTimeLimit: 15,
  gekokujoBaseMin: 2000, gekokujoPerRank: 1000,
  terrainIncome: { castleTown: 50, village: 30, grassland: 10 },
  maintenanceCost: 2.0, autoHireCost: 300, autoHireCD: 3,
  autoHireMaxParade: 12, kokuZeroDepartureCD: 3,
  ikkiConsumeRate: 0.6, ikkiDamagePerMember: 8,
  ikkiQMult: 2.5, ikkiCD: 10,
  chargeDamage: 5, chargeCD: 6,
};

function applyKokuReward(baseValue) {
  const rand = 0.75 + Math.random() * 0.5;
  let value = Math.floor(baseValue * rand);
  if (Math.random() < 0.1) { value = value * 2; }
  return value;
}

function getEnemyTier(gameTime) {
  const e = GAME_BASE.enemies;
  if (gameTime < 15) return { avgScore: e[0].score, avgHp: e[0].hp, avgGrit: 3 };
  if (gameTime < 30) return { avgScore: (e[0].score+e[1].score)/2, avgHp: (e[0].hp+e[1].hp)/2, avgGrit: 6.5 };
  if (gameTime < 45) return { avgScore: e[0].score*0.3+e[1].score*0.3+e[2].score*0.4, avgHp: e[0].hp*0.3+e[1].hp*0.3+e[2].hp*0.4, avgGrit: 300 };
  return { avgScore: e[0].score*0.2+e[1].score*0.25+e[2].score*0.3+e[3].score*0.25, avgHp: e[0].hp*0.2+e[1].hp*0.25+e[2].hp*0.3+e[3].hp*0.25, avgGrit: 500 };
}

function getAttackPower(cd, paradeLen) {
  return cd.attack + Math.floor(paradeLen * cd.followerBonus * cd.attack * 10);
}

function getRankIndex(koku) {
  let idx = 0;
  for (let i = GAME_BASE.ranks.length - 1; i >= 0; i--) {
    if (koku >= GAME_BASE.ranks[i].threshold) { idx = i; break; }
  }
  return idx;
}

function getBossDPS(cd, paradeLen) {
  const dmg = getAttackPower(cd, paradeLen);
  let hitCount;
  if (cd.projectileCount >= 5) { hitCount = 3.5; }
  else if (cd.projectileCount >= 2) { hitCount = 1.5; }
  else { hitCount = 0.8; }
  const projDPS = dmg * hitCount * (1/cd.attackCD);
  const activeFollowers = Math.floor(paradeLen * 0.65);
  const followerDPS = activeFollowers * cd.followerDamage / cd.followerCD;
  const chargeDPS = GAME_BASE.chargeDamage * 1.5 * cd.chargeMultiplier / GAME_BASE.chargeCD;
  return projDPS + followerDPS + chargeDPS;
}

function getScenario(level) {
  if (level === "high") return { attackShare: 0.65, recruitRate: 0.45, tsujigiriCount: 1, tsujigiriSuccessRate: 0.8, bridgeBossKill: true, terrainType: "castleTown", distanceFactor: 0.85 };
  if (level === "mid") return { attackShare: 0.45, recruitRate: 0.35, tsujigiriCount: 1, tsujigiriSuccessRate: 0.5, bridgeBossKill: true, terrainType: "village", distanceFactor: 0.60 };
  return { attackShare: 0.30, recruitRate: 0.20, tsujigiriCount: 0, tsujigiriSuccessRate: 0, bridgeBossKill: false, terrainType: "grassland", distanceFactor: 0.40 };
}

function simulateOnce(charKey, ikkiMode, scenarioLevel, disableLoyalty) {
  const cd = GAME_BASE.chars[charKey];
  const maxTime = GAME_BASE.maxTime;
  const scoreMult = cd.scoreMultiplier;
  const dt = 1;
  const scenario = getScenario(scenarioLevel);
  let koku = cd.initialKoku;
  let paradeLen = 0;
  let enemiesOnField = 5;
  let spawnTimer = cd.spawnInterval;
  let autoHireTimer = GAME_BASE.autoHireCD;
  let ikkiCDTimer = 0;
  let kokuZeroTimer = GAME_BASE.kokuZeroDepartureCD;

  const fieldTime = ikkiMode ? 50 : maxTime;

  for (let t = 0; t < fieldTime; t += dt) {
    const tier = getEnemyTier(t);

    if (charKey === "merchant") {
      autoHireTimer -= dt;
      if (autoHireTimer <= 0 && koku >= GAME_BASE.autoHireCost && Math.floor(paradeLen) < GAME_BASE.autoHireMaxParade) {
        paradeLen += 1; koku -= GAME_BASE.autoHireCost; autoHireTimer = GAME_BASE.autoHireCD;
      }
    } else {
      const effectiveRecruit = scenario.recruitRate * scenario.distanceFactor;
      if (paradeLen < 20) { paradeLen += effectiveRecruit * dt; }
    }

    // 農民攻撃ヒット30%民間人スポーン
    if (charKey === "farmer") {
      let effectiveAttackShare = scenario.attackShare - (1 - scenario.distanceFactor) * 0.3;
      if (effectiveAttackShare < 0.1) effectiveAttackShare = 0.1;
      const bonusRecruit = (1/cd.attackCD) * 0.3 * effectiveAttackShare * dt * 0.5 * scenario.distanceFactor;
      if (paradeLen < 20) { paradeLen += bonusRecruit; }
    }

    // 足軽忠誠離脱
    if (!disableLoyalty && charKey === "ashigaru" && paradeLen > 0 && t > 15 && cd.loyaltyAvg > 0) {
      const departPerSec = paradeLen / cd.loyaltyAvg;
      paradeLen = Math.max(0, paradeLen - departPerSec * dt);
    }

    if (paradeLen > 20) paradeLen = 20;
    if (paradeLen < 0) paradeLen = 0;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = cd.spawnInterval;
      if (enemiesOnField < 6) { enemiesOnField += 2; }
      else if (enemiesOnField < 10) { enemiesOnField += 1; }
      if (enemiesOnField > cd.maxEnemies) { enemiesOnField = cd.maxEnemies; }
    }

    const flooredParade = Math.floor(paradeLen);
    const atkPower = getAttackPower(cd, flooredParade);
    let effectiveAttackShare = scenario.attackShare;
    if (charKey !== "merchant") {
      effectiveAttackShare = scenario.attackShare - (1 - scenario.distanceFactor) * 0.3;
      if (effectiveAttackShare < 0.1) effectiveAttackShare = 0.1;
    }
    let projHitRate;
    if (cd.projectileCount >= 5) { projHitRate = 2.0; }
    else if (cd.projectileCount >= 2) { projHitRate = 1.2; }
    else { projHitRate = 0.7; }
    const projDmgPerSec = atkPower * projHitRate * (1/cd.attackCD) * effectiveAttackShare;
    const followerActive = Math.min(flooredParade, enemiesOnField) * 0.4;
    const followerDmgPerSec = followerActive * cd.followerDamage / cd.followerCD;
    const totalFieldDPS = projDmgPerSec + followerDmgPerSec;
    let killsThisSec = totalFieldDPS / tier.avgHp;
    killsThisSec = Math.min(killsThisSec, enemiesOnField * 0.5);

    const killCount = Math.floor(killsThisSec * dt * 10) / 10;
    let earnedScore = 0;
    if (killCount >= 1) {
      for (let k = 0; k < Math.floor(killCount); k++) { earnedScore += applyKokuReward(tier.avgScore) * scoreMult; }
      const frac = killCount - Math.floor(killCount);
      if (frac > 0) { earnedScore += applyKokuReward(tier.avgScore) * scoreMult * frac; }
    } else { earnedScore = applyKokuReward(tier.avgScore) * scoreMult * killCount; }
    earnedScore = Math.floor(earnedScore);
    koku += earnedScore;
    enemiesOnField = Math.max(0, enemiesOnField - killsThisSec * dt);

    // 威圧
    if (flooredParade >= 4 && tier.avgGrit < flooredParade) {
      let intimidateRatio = 0;
      if (flooredParade > 3) intimidateRatio += 0.3;
      if (flooredParade > 10) intimidateRatio += 0.2;
      let surrenderKills = enemiesOnField * intimidateRatio * 0.5 * dt;
      surrenderKills = Math.min(surrenderKills, enemiesOnField * 0.3);
      if (surrenderKills > 0) {
        let sScore = Math.floor(applyKokuReward(tier.avgScore) * scoreMult * surrenderKills);
        koku += sScore;
        enemiesOnField = Math.max(0, enemiesOnField - surrenderKills);
      }
    }

    // 商人経済
    if (charKey === "merchant") {
      const terrainRate = GAME_BASE.terrainIncome[scenario.terrainType];
      koku += Math.floor(terrainRate * scoreMult * dt);
      koku -= GAME_BASE.maintenanceCost * flooredParade * dt;
      if (koku <= 0) {
        koku = 0; kokuZeroTimer -= dt;
        if (kokuZeroTimer <= 0 && paradeLen > 0) { paradeLen -= 1; kokuZeroTimer = GAME_BASE.kokuZeroDepartureCD; }
      } else { kokuZeroTimer = GAME_BASE.kokuZeroDepartureCD; }
    }

    // 一揆 ALL-KILL
    if (ikkiMode) {
      ikkiCDTimer -= dt;
      if (ikkiCDTimer <= 0 && flooredParade >= 1 && t > 5) {
        const consumed = Math.max(1, Math.floor(paradeLen * GAME_BASE.ikkiConsumeRate));
        const enemiesHit = Math.floor(enemiesOnField); // ALL-KILL
        if (enemiesHit > 0) {
          let ultScore = 0;
          for (let u = 0; u < enemiesHit; u++) {
            ultScore += Math.floor(applyKokuReward(tier.avgScore) * GAME_BASE.ikkiQMult * scoreMult);
          }
          koku += ultScore;
          enemiesOnField = Math.max(0, enemiesOnField - enemiesHit);
        }
        paradeLen -= consumed;
        ikkiCDTimer = GAME_BASE.ikkiCD;
      }
    }
  }

  // 辻斬り・橋ボス
  for (let ts = 0; ts < scenario.tsujigiriCount; ts++) {
    if (Math.random() < scenario.tsujigiriSuccessRate) {
      koku += Math.floor(applyKokuReward(GAME_BASE.tsujigiriBaseReward) * scoreMult);
    }
  }
  if (scenario.bridgeBossKill) {
    koku += Math.floor(applyKokuReward(GAME_BASE.bridgeBoss.score) * scoreMult);
  }

  // 殿様戦
  let bossDefeated = false;
  let paradeLenAtBoss = Math.floor(paradeLen);
  // 衝撃波
  const effectiveBattleTime = GAME_BASE.bossBattleTime * 0.80;
  const shockwaveCount = Math.floor(effectiveBattleTime / 5);
  let paradeLenDuringBoss = paradeLenAtBoss;
  for (let sw = 0; sw < shockwaveCount; sw++) {
    paradeLenDuringBoss = Math.max(0, paradeLenDuringBoss - Math.floor(paradeLenDuringBoss * 0.15));
  }

  let ikkiBossDmg = 0;
  if (ikkiMode && paradeLenDuringBoss >= 1) {
    const ikkiUsesInBoss = Math.min(2, Math.floor(effectiveBattleTime / GAME_BASE.ikkiCD));
    let tempParade = paradeLenDuringBoss;
    for (let u = 0; u < ikkiUsesInBoss; u++) {
      ikkiBossDmg += tempParade * GAME_BASE.ikkiDamagePerMember;
      tempParade -= Math.max(1, Math.floor(tempParade * GAME_BASE.ikkiConsumeRate));
    }
  }

  const dps = getBossDPS(GAME_BASE.chars[charKey], paradeLenDuringBoss);
  const remainingBossHp = Math.max(0, GAME_BASE.tonoBoss.hp - ikkiBossDmg);
  const timeToKill = (dps > 0) ? (remainingBossHp / dps) : Infinity;

  if (timeToKill <= effectiveBattleTime) {
    bossDefeated = true;
    const rankIdx = getRankIndex(koku);
    const gekBase = GAME_BASE.gekokujoBaseMin + rankIdx * GAME_BASE.gekokujoPerRank;
    koku += Math.floor(applyKokuReward(gekBase) * scoreMult);
  }

  return { koku: Math.floor(koku), bossDefeated };
}

function runMixed(charKey, ikkiMode, trials, disableLoyalty) {
  const results = [];
  let bossWins = 0;
  for (let i = 0; i < trials; i++) {
    const roll = Math.random();
    let sc;
    if (roll < 0.3) { sc = "low"; }
    else if (roll < 0.8) { sc = "mid"; }
    else { sc = "high"; }
    const r = simulateOnce(charKey, ikkiMode, sc, disableLoyalty);
    results.push(r.koku);
    if (r.bossDefeated) bossWins++;
  }
  results.sort((a, b) => a - b);
  return {
    min: results[0], max: results[results.length-1],
    avg: Math.round(results.reduce((a,b)=>a+b,0)/trials),
    p10: results[Math.floor(trials*0.1)], p90: results[Math.floor(trials*0.9)],
    range: results[results.length-1] - results[0],
    bossRate: Math.round(bossWins/trials*100),
    tenkaRate: Math.round(results.filter(r => r >= 20000).length/trials*100),
  };
}

const TRIALS = 500;
const chars = [
  { key: "ashigaru", ikki: false, label: "足軽" },
  { key: "merchant", ikki: false, label: "商人" },
  { key: "farmer", ikki: false, label: "農民Q無" },
  { key: "farmer", ikki: true, label: "農民Q有" },
];

function printTable(title, disableLoyalty) {
  console.log("\n" + title);
  console.log("┌──────────┬────────┬────────┬────────┬────────┬──────┬──────┐");
  console.log("│ キャラ   │  平均  │  最低  │  最高  │ レンジ │Boss勝│天下人│");
  console.log("├──────────┼────────┼────────┼────────┼────────┼──────┼──────┤");
  const avgs = [];
  const results = [];
  for (const c of chars) {
    const r = runMixed(c.key, c.ikki, TRIALS, disableLoyalty);
    results.push(r);
    avgs.push(r.avg);
    const label = (c.label + "        ").slice(0, 8);
    console.log("│ " + label + " │ " +
      String(r.avg).padStart(6) + " │ " +
      String(r.min).padStart(6) + " │ " +
      String(r.max).padStart(6) + " │ " +
      String(r.range).padStart(6) + " │ " +
      String(r.bossRate + "%").padStart(4) + " │ " +
      String(r.tenkaRate + "%").padStart(4) + " │");
  }
  console.log("└──────────┴────────┴────────┴────────┴────────┴──────┴──────┘");
  const globalAvg = Math.round(avgs.reduce((a,b)=>a+b,0)/4);
  console.log("  Global Avg: " + globalAvg);
  for (let i = 0; i < chars.length; i++) {
    const pct = ((avgs[i] - globalAvg) / globalAvg * 100).toFixed(1);
    console.log("    " + chars[i].label + ": " + avgs[i] + " (" + (pct >= 0 ? "+" : "") + pct + "%)");
  }
  console.log("  Min順序 (Q有<Q無<商人<足軽): " +
    (results[3].min < results[2].min && results[2].min < results[1].min && results[1].min < results[0].min ? "OK" : "NG") +
    " (" + results[3].min + " < " + results[2].min + " < " + results[1].min + " < " + results[0].min + ")");
  console.log("  Max順序 (足軽<商人<Q無<Q有): " +
    (results[0].max < results[1].max && results[1].max < results[2].max && results[2].max < results[3].max ? "OK" : "NG") +
    " (" + results[0].max + " < " + results[1].max + " < " + results[2].max + " < " + results[3].max + ")");
  console.log("  Range順序 (足軽<商人<Q無<Q有): " +
    (results[0].range < results[1].range && results[1].range < results[2].range && results[2].range < results[3].range ? "OK" : "NG") +
    " (" + results[0].range + " < " + results[1].range + " < " + results[2].range + " < " + results[3].range + ")");
}

console.log("╔════════════════════════════════════════════╗");
console.log("║  忠誠離脱あり/なし比較 (mixed skill)      ║");
console.log("╚════════════════════════════════════════════╝");

printTable("=== [A] 忠誠離脱あり（現行） ===", false);
printTable("=== [B] 忠誠離脱なし ===", true);
