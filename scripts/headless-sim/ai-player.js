// ai-player.js - AIプレイヤーモジュール（ヘッドレスシミュレーション用）
// Goal-driven アーキテクチャ: latent state（目標・信念）から行動を導く

"use strict";

// ============================================================
// Skill-level noise parameters
// ============================================================
const SKILL_NOISE = {
  high: { evalNoise: 0.0, moveNoise: 0.05, randomActionChance: 0.0 },
  mid:  { evalNoise: 0.2, moveNoise: 0.15, randomActionChance: 0.0 },
  low:  { evalNoise: 0.5, moveNoise: 0.30, randomActionChance: 0.08 },
};

// ============================================================
// Skill-level tactical parameters
// ============================================================
const SKILL_PARAMS = {
  high: {
    dodgeRate: 0.9,
    reactionTime: 0.2,
    missGateChance: 0.0,
    fightDistance: 250,
    bossBackoffOnCastleWait: true,
    bossBackoffOnDecel: true,
    kiteEnabled: true,
    zigzagEnabled: true,
    fleeKiteEnabled: true,
    ikkiMinParadeBoss: 6,
    ikkiMinBossHp: 200,
  },
  mid: {
    dodgeRate: 0.6,
    reactionTime: 0.5,
    missGateChance: 0.05,
    fightDistance: 200,
    bossBackoffOnCastleWait: true,
    bossBackoffOnDecel: false,
    kiteEnabled: true,
    zigzagEnabled: false,
    fleeKiteEnabled: false,
    ikkiMinParadeBoss: 3,
    ikkiMinBossHp: 100,
  },
  low: {
    dodgeRate: 0.2,
    reactionTime: 1.0,
    missGateChance: 0.15,
    fightDistance: 100,
    bossBackoffOnCastleWait: false,
    bossBackoffOnDecel: false,
    kiteEnabled: false,
    zigzagEnabled: false,
    fleeKiteEnabled: false,
    ikkiMinParadeBoss: 1,
    ikkiMinBossHp: 0,
  },
};

// ============================================================
// AI State constants
// ============================================================
const AI_STATE = {
  RECRUIT: "RECRUIT",
  FIGHT: "FIGHT",
  GO_TO_CASTLE: "GO_TO_CASTLE",
  BOSS_FIGHT: "BOSS_FIGHT",
  FLEE: "FLEE",
};

// ============================================================
// Priority calculation functions
// ============================================================

/**
 * 村に行ってフォロワーを集める価値を計算する
 * @param {object} belief - 現在の信念状態
 * @returns {number} 0〜100のスコア
 */
function calcRecruitPriority(belief) {
  let score = 0;

  // フォロワーが少ないほど価値が高い
  if (belief.paradeLen < 3) {
    score += 60;
  } else if (belief.paradeLen < 5) {
    score += 40;
  } else if (belief.paradeLen < 8) {
    score += 15;
  }
  // 8人以上はほぼ不要
  // （ただし0人は最優先）
  if (belief.paradeLen === 0) {
    score += 20;
  }

  // 残り時間が多いほどリクルートの投資価値が高い
  if (belief.timeLeft > 40) {
    score += 20;
  } else if (belief.timeLeft > 25) {
    score += 10;
  } else if (belief.timeLeft < 15) {
    // 残り少ないならリクルートは非効率
    score -= 30;
  }

  // 近くに村がある（民間人がいる）ならボーナス
  if (belief.nearestCivilianDist < 200) {
    score += 25;
  } else if (belief.nearestCivilianDist < 500) {
    score += 10;
  }
  // 民間人がいなければリクルート不可
  if (belief.nearestCivilianDist === Infinity) {
    return 0;
  }

  return Math.max(0, score);
}

/**
 * 通常敵を倒す価値を計算する
 * @param {object} belief - 現在の信念状態
 * @returns {number} 0〜100のスコア
 */
function calcFightPriority(belief) {
  let score = 30; // 基本値: 常に戦うことには一定の価値がある

  // 近くに敵がいるほど戦う価値が高い（移動コストが低い）
  if (belief.nearestEnemyDist < 150) {
    score += 30;
  } else if (belief.nearestEnemyDist < 300) {
    score += 20;
  } else if (belief.nearestEnemyDist < 500) {
    score += 5;
  } else {
    // 敵が遠い場合は別のことをしたほうがいい
    score -= 20;
  }

  // 敵がいなければ戦えない
  if (belief.nearestEnemyDist === Infinity) {
    return 0;
  }

  // フォロワーが多いと威圧で降伏 → 効率UP
  if (belief.paradeLen >= 5) {
    score += 15;
  } else if (belief.paradeLen >= 3) {
    score += 5;
  }

  // HP低いと戦いたくない
  if (belief.hpRatio < 0.3) {
    score -= 30;
  } else if (belief.hpRatio < 0.5) {
    score -= 10;
  }

  return Math.max(0, score);
}

/**
 * 城を攻める（殿様戦に向かう）価値を計算する
 * @param {object} belief - 現在の信念状態
 * @returns {number} 0〜100のスコア
 */
function calcCastlePriority(belief) {
  // 城門が開いていなければゼロ
  if (!belief.gateActive) {
    return 0;
  }

  let score = 0;

  // 残り時間が少ないほど城に行く緊急性が高い
  if (belief.timeLeft < 10) {
    score += 80;
  } else if (belief.timeLeft < 20) {
    score += 50;
  } else if (belief.timeLeft < 30) {
    score += 30;
  }

  // フォロワーが多いほど勝てる可能性が高い
  if (belief.paradeLen >= 8) {
    score += 25;
  } else if (belief.paradeLen >= 5) {
    score += 15;
  } else if (belief.paradeLen >= 3) {
    score += 5;
  }

  // 一揆モード（農民）はフォロワーが多い時に大ダメージを与えられる
  if (belief.ikkiMode && belief.paradeLen >= 5) {
    score += 10;
  }

  // HPが十分あるか
  if (belief.hpRatio < 0.3) {
    score -= 20;
  }

  return Math.max(0, score);
}

// ============================================================
// AIPlayer class
// ============================================================
class AIPlayer {
  /**
   * @param {"low"|"mid"|"high"} skillLevel
   * @param {"ashigaru"|"merchant"|"farmer"} charKey
   * @param {boolean} ikkiMode
   */
  constructor(skillLevel, charKey, ikkiMode) {
    this.skillLevel = skillLevel;
    this.charKey = charKey;
    this.ikkiMode = ikkiMode;

    const params = SKILL_PARAMS[skillLevel];
    if (!params) {
      throw new Error("Unknown skill level: " + skillLevel);
    }
    this.params = params;

    const noise = SKILL_NOISE[skillLevel];
    if (!noise) {
      throw new Error("Unknown skill level: " + skillLevel);
    }
    this.noise = noise;

    this.currentState = AI_STATE.RECRUIT;
    this.previousState = null;
    this.stateTimer = 0;
    this.reactionBuffer = 0;
    this.lastBossState = null;

    // Low-skill AI might decide to skip the gate entirely
    this.willMissGate = Math.random() < params.missGateChance;

    this.log = [];
  }

  // ============================================================
  // Belief extraction
  // ============================================================

  /**
   * ゲーム状態から「信念」を抽出する
   * @param {object} state - engine.getState() の返り値
   * @returns {object} belief
   */
  _extractBelief(state) {
    const maxTime = state.game.maxTime;
    const timeLeft = maxTime - state.game.time;

    const nearestEnemy = this._findNearest(state.enemies, state.player.x, state.player.y);
    const nearestCivilian = this._findNearest(state.civilians, state.player.x, state.player.y);

    const nearEnemyCount = this._countEnemiesInRange(
      state.enemies, state.player.x, state.player.y, 300
    );

    return {
      timeLeft: timeLeft,
      paradeLen: state.player.paradeLen,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      hpRatio: state.player.hp / state.player.maxHp,
      koku: state.player.koku,
      nearestEnemyDist: nearestEnemy ? nearestEnemy.dist : Infinity,
      nearestEnemy: nearestEnemy,
      nearestCivilianDist: nearestCivilian ? nearestCivilian.dist : Infinity,
      nearestCivilian: nearestCivilian,
      nearEnemyCount: nearEnemyCount,
      gateActive: state.game.gateActive,
      bossActive: state.boss && state.boss.active,
      ikkiMode: this.ikkiMode,
      chargeAvailable: state.game.chargeAvailable,
      ikkiAvailable: state.game.ikkiAvailable,
    };
  }

  /**
   * 信念に基づいて目標の優先度を計算する
   * @param {object} belief
   * @returns {object} goal priorities
   */
  _evaluateGoals(belief) {
    let recruit = calcRecruitPriority(belief);
    let fight = calcFightPriority(belief);
    let castle = calcCastlePriority(belief);

    // スキル差: ノイズを加える
    const evalNoise = this.noise.evalNoise;
    if (evalNoise > 0) {
      recruit += recruit * (Math.random() - 0.5) * 2 * evalNoise;
      fight += fight * (Math.random() - 0.5) * 2 * evalNoise;
      castle += castle * (Math.random() - 0.5) * 2 * evalNoise;
    }

    return {
      recruitPriority: Math.max(0, recruit),
      fightPriority: Math.max(0, fight),
      castlePriority: Math.max(0, castle),
    };
  }

  // ============================================================
  // Main decision entry point
  // ============================================================

  /**
   * @param {object} state - gameState from engine.getState()
   * @returns {{ moveX: number, moveY: number, attack: boolean, charge: boolean, ikki: boolean }}
   */
  decide(state) {
    this.stateTimer += 0.1;

    // Low-skill: 時々ランダム行動する（計算できていない）
    if (this.noise.randomActionChance > 0 && Math.random() < this.noise.randomActionChance) {
      return this._randomAction();
    }

    const belief = this._extractBelief(state);

    // --- FLEE: HP低下は最優先で処理する ---
    const fleeThreshold = 0.25 + this.noise.evalNoise * 0.1;
    const recoverThreshold = 0.5;
    if (belief.hpRatio < fleeThreshold) {
      this._transitionTo(AI_STATE.FLEE, state);
      return this._fleeDecision(state, belief);
    }
    if (this.currentState === AI_STATE.FLEE && belief.hpRatio < recoverThreshold) {
      return this._fleeDecision(state, belief);
    }

    // --- BOSS_FIGHT: ボスが出現したら戦う ---
    if (belief.bossActive) {
      this._transitionTo(AI_STATE.BOSS_FIGHT, state);
      return this._bossFightDecision(state, belief);
    }

    // --- Goal-driven 意思決定 ---
    const goal = this._evaluateGoals(belief);

    // 最高優先度の行動を選択
    if (goal.castlePriority >= goal.recruitPriority && goal.castlePriority >= goal.fightPriority && goal.castlePriority > 0) {
      // 城門を見逃すAI
      if (this.willMissGate) {
        // castle以外で最高のものを選ぶ
        if (goal.recruitPriority >= goal.fightPriority && goal.recruitPriority > 0) {
          this._transitionTo(AI_STATE.RECRUIT, state);
          return this._recruitDecision(state, belief);
        }
        this._transitionTo(AI_STATE.FIGHT, state);
        return this._fightDecision(state, belief);
      }
      this._transitionTo(AI_STATE.GO_TO_CASTLE, state);
      return this._goToCastle(state, belief);
    }

    if (goal.recruitPriority >= goal.fightPriority && goal.recruitPriority > 0) {
      this._transitionTo(AI_STATE.RECRUIT, state);
      return this._recruitDecision(state, belief);
    }

    this._transitionTo(AI_STATE.FIGHT, state);
    return this._fightDecision(state, belief);
  }

  // ============================================================
  // Random action (low-skill)
  // ============================================================

  _randomAction() {
    const angle = Math.random() * Math.PI * 2;
    return {
      moveX: Math.cos(angle),
      moveY: Math.sin(angle),
      attack: Math.random() < 0.3,
      charge: false,
      ikki: false,
    };
  }

  // ============================================================
  // State transition
  // ============================================================

  _transitionTo(newState, state) {
    if (this.currentState === newState) {
      return;
    }
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTimer = 0;
    this.log.push({
      time: state.game.time,
      state: newState,
      action: "state_transition",
      details: {
        from: this.previousState,
        to: newState,
        paradeLen: state.player.paradeLen,
        hp: state.player.hp,
      },
    });
  }

  // ============================================================
  // Movement helpers
  // ============================================================

  _moveToward(currentX, currentY, targetX, targetY, state) {
    let dx = targetX - currentX;
    let dy = targetY - currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      return { moveX: 0, moveY: 0 };
    }

    // Normalize
    dx = dx / dist;
    dy = dy / dist;

    // Add noise based on skill
    const moveNoise = this.noise.moveNoise;
    dx += (Math.random() - 0.5) * moveNoise;
    dy += (Math.random() - 0.5) * moveNoise;

    // River avoidance: if heading toward river, reroute to nearest bridge
    if (state.map && state.map.riverX != null) {
      const river = { x: state.map.riverX, w: state.map.riverWidth };
      const predictX = currentX + dx * 60;
      if (this._isInRiver(predictX, currentY, river)) {
        const bridge = this._findNearestBridge(currentX, currentY, state);
        if (bridge) {
          const bdx = bridge.cx - currentX;
          const bdy = bridge.cy - currentY;
          const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
          if (bDist > 1) {
            dx = bdx / bDist;
            dy = bdy / bDist;
          }
        }
      }
    }

    return { moveX: dx, moveY: dy };
  }

  _moveAwayFrom(currentX, currentY, threatX, threatY, state) {
    let dx = currentX - threatX;
    let dy = currentY - threatY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      // Random escape direction
      const angle = Math.random() * Math.PI * 2;
      return { moveX: Math.cos(angle), moveY: Math.sin(angle) };
    }
    dx = dx / dist;
    dy = dy / dist;

    // Add slight noise
    const moveNoise = this.noise.moveNoise * 0.6;
    dx += (Math.random() - 0.5) * moveNoise;
    dy += (Math.random() - 0.5) * moveNoise;

    return { moveX: dx, moveY: dy };
  }

  _isInRiver(x, y, river) {
    if (!river) {
      return false;
    }
    return x >= river.x && x <= river.x + river.w;
  }

  _findNearestBridge(x, y, state) {
    if (!state.map || !state.map.bridges || state.map.bridges.length === 0) {
      return null;
    }
    let bestDist = Infinity;
    let bestBridge = null;
    for (let i = 0; i < state.map.bridges.length; i++) {
      const b = state.map.bridges[i];
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const bdx = cx - x;
      const bdy = cy - y;
      const d = Math.sqrt(bdx * bdx + bdy * bdy);
      if (d < bestDist) {
        bestDist = d;
        bestBridge = { cx: cx, cy: cy, x: b.x, y: b.y, w: b.w, h: b.h };
      }
    }
    return bestBridge;
  }

  // ============================================================
  // Entity search helpers
  // ============================================================

  _findNearest(entities, px, py) {
    if (!entities || entities.length === 0) {
      return null;
    }
    let bestDist = Infinity;
    let best = null;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const dx = e.x - px;
      const dy = e.y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    if (best) {
      const dx = best.x - px;
      const dy = best.y - py;
      best.dist = Math.sqrt(dx * dx + dy * dy);
    }
    return best;
  }

  _countEnemiesInRange(enemies, px, py, range) {
    if (!enemies) {
      return 0;
    }
    let count = 0;
    const rangeSq = range * range;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy < rangeSq) {
        count++;
      }
    }
    return count;
  }

  // ============================================================
  // Charge / Ikki evaluation
  // ============================================================

  _shouldCharge(state, belief) {
    if (!state.game.chargeAvailable) {
      return false;
    }
    if (belief.paradeLen < 3) {
      return false;
    }

    // 高スキル: クラスタリングされた敵が多い時のみ
    // 低スキル: 敵がいればすぐ使う
    const minEnemies = this.skillLevel === "high" ? 5 : this.skillLevel === "mid" ? 3 : 1;
    const radius = this.skillLevel === "high" ? 150 : this.skillLevel === "mid" ? 200 : 300;

    const nearbyEnemies = this._countEnemiesInRange(
      state.enemies, state.player.x, state.player.y, radius
    );

    if (nearbyEnemies >= minEnemies) {
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "charge",
        details: { nearbyEnemies: nearbyEnemies, paradeLen: belief.paradeLen },
      });
      return true;
    }

    return false;
  }

  _shouldIkki(state, belief) {
    if (this.charKey !== "farmer") {
      return false;
    }
    if (!this.ikkiMode) {
      return false;
    }
    if (!state.game.ikkiAvailable) {
      return false;
    }

    // 高スキル: 敵が多い＋パレードが多い時のみ
    // 低スキル: 使えればすぐ使う
    const minParade = this.skillLevel === "high" ? 6 : this.skillLevel === "mid" ? 3 : 1;
    const minEnemies = this.skillLevel === "high" ? 8 : this.skillLevel === "mid" ? 5 : 1;

    const enemyCount = state.enemies ? state.enemies.length : 0;

    if (belief.paradeLen >= minParade && enemyCount >= minEnemies) {
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "ikki",
        details: { paradeLen: belief.paradeLen, enemyCount: enemyCount },
      });
      return true;
    }

    return false;
  }

  _shouldIkkiBoss(state, belief, boss) {
    if (this.charKey !== "farmer") {
      return false;
    }
    if (!this.ikkiMode) {
      return false;
    }
    if (!state.game.ikkiAvailable) {
      return false;
    }

    const paradeLen = belief.paradeLen;

    // Low-skill: uses ikki immediately
    if (this.skillLevel === "low") {
      if (paradeLen >= 1) {
        this.log.push({
          time: state.game.time,
          state: this.currentState,
          action: "ikki_boss",
          details: { paradeLen: paradeLen, bossHp: boss.hp, reason: "low_skill_immediate" },
        });
        return true;
      }
      return false;
    }

    // Mid-skill: use when parade is decent
    if (this.skillLevel === "mid") {
      if (paradeLen >= this.params.ikkiMinParadeBoss && boss.hp > this.params.ikkiMinBossHp) {
        this.log.push({
          time: state.game.time,
          state: this.currentState,
          action: "ikki_boss",
          details: { paradeLen: paradeLen, bossHp: boss.hp, reason: "mid_skill_decent_parade" },
        });
        return true;
      }
      return false;
    }

    // High-skill: maximize damage - only use with large parade when boss HP is high
    if (paradeLen >= this.params.ikkiMinParadeBoss && boss.hp > this.params.ikkiMinBossHp) {
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "ikki_boss",
        details: { paradeLen: paradeLen, bossHp: boss.hp, reason: "high_skill_optimal" },
      });
      return true;
    }

    // Also use as a finisher if boss HP is low enough for ikki to kill
    // ikki damage = paradeLen * 8
    const ikkiDamage = paradeLen * 8;
    if (ikkiDamage >= boss.hp && paradeLen >= 2) {
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "ikki_boss",
        details: { paradeLen: paradeLen, bossHp: boss.hp, reason: "high_skill_finisher" },
      });
      return true;
    }

    return false;
  }

  // ============================================================
  // FLEE decision
  // ============================================================

  _fleeDecision(state, belief) {
    const px = state.player.x;
    const py = state.player.y;

    let moveX = 0;
    let moveY = 0;

    if (belief.nearestEnemy) {
      const escape = this._moveAwayFrom(px, py, belief.nearestEnemy.x, belief.nearestEnemy.y, state);
      moveX = escape.moveX;
      moveY = escape.moveY;
    } else {
      // No enemies visible, move toward map center (safe area)
      const move = this._moveToward(px, py, 1920, 1080, state);
      moveX = move.moveX;
      moveY = move.moveY;
    }

    // High/mid-skill: kite while fleeing
    const shouldAttack = this.params.fleeKiteEnabled && belief.nearestEnemy && belief.nearestEnemyDist < 300;

    const result = {
      moveX: moveX,
      moveY: moveY,
      attack: shouldAttack,
      charge: false,
      ikki: false,
    };
    if (shouldAttack && belief.nearestEnemy) {
      result.aimX = belief.nearestEnemy.x;
      result.aimY = belief.nearestEnemy.y;
    }
    return result;
  }

  // ============================================================
  // RECRUIT decision
  // ============================================================

  _recruitDecision(state, belief) {
    const px = state.player.x;
    const py = state.player.y;

    if (!belief.nearestCivilian) {
      // No civilians available, switch to fighting
      return this._fightDecision(state, belief);
    }

    const move = this._moveToward(px, py, belief.nearestCivilian.x, belief.nearestCivilian.y, state);

    // Opportunistic attack: hit enemies while passing by
    const oppRange = this.skillLevel === "high" ? 200 : this.skillLevel === "mid" ? 150 : 80;
    const shouldAttackOpp = belief.nearestEnemy && belief.nearestEnemyDist < oppRange;

    const result = {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttackOpp,
      charge: false,
      ikki: false,
    };
    if (shouldAttackOpp && belief.nearestEnemy) {
      result.aimX = belief.nearestEnemy.x;
      result.aimY = belief.nearestEnemy.y;
    }
    return result;
  }

  // ============================================================
  // FIGHT decision
  // ============================================================

  _fightDecision(state, belief) {
    const px = state.player.x;
    const py = state.player.y;

    if (!belief.nearestEnemy) {
      // No enemies, try to recruit instead
      if (belief.nearestCivilian) {
        return this._recruitDecision(state, belief);
      }
      // Nothing to do, move toward center
      const move = this._moveToward(px, py, 1920, 1080, state);
      return { moveX: move.moveX, moveY: move.moveY, attack: false, charge: false, ikki: false };
    }

    const enemy = belief.nearestEnemy;
    let targetX = enemy.x;
    let targetY = enemy.y;

    // Kiting: maintain optimal distance for high/mid skill
    if (this.params.kiteEnabled) {
      const optimalDist = this.params.fightDistance * 0.6;
      if (enemy.dist < optimalDist) {
        const away = this._moveAwayFrom(px, py, enemy.x, enemy.y, state);
        const backoffDist = this.skillLevel === "high" ? 100 : 60;
        targetX = px + away.moveX * backoffDist;
        targetY = py + away.moveY * backoffDist;
      }
    }

    const move = this._moveToward(px, py, targetX, targetY, state);

    // Attack when in projectile range (~300px)
    const shouldAttack = enemy.dist < 300;
    const shouldCharge = this._shouldCharge(state, belief);
    const shouldIkki = this._shouldIkki(state, belief);

    return {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttack,
      charge: shouldCharge,
      ikki: shouldIkki,
      aimX: enemy.x,
      aimY: enemy.y,
    };
  }

  // ============================================================
  // GO_TO_CASTLE decision
  // ============================================================

  _goToCastle(state, belief) {
    const px = state.player.x;
    const py = state.player.y;

    // Castle position
    const castlePos = state.terrain.castlePos;
    if (!castlePos) {
      return this._fightDecision(state, belief);
    }
    const castleX = castlePos.x;
    const castleY = castlePos.y;
    if (castleX == null || castleY == null) {
      return this._fightDecision(state, belief);
    }

    const move = this._moveToward(px, py, castleX, castleY, state);

    // Attack nearby enemies while traveling
    const shouldAttack = belief.nearestEnemy && belief.nearestEnemyDist < 200;

    // Use ikki if overwhelmed on the way
    const shouldIkki = this._shouldIkki(state, belief);

    const result = {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttack,
      charge: false,
      ikki: shouldIkki,
    };
    if (shouldAttack && belief.nearestEnemy) {
      result.aimX = belief.nearestEnemy.x;
      result.aimY = belief.nearestEnemy.y;
    }
    return result;
  }

  // ============================================================
  // BOSS_FIGHT decision
  // ============================================================

  _bossFightDecision(state, belief) {
    const px = state.player.x;
    const py = state.player.y;
    const boss = state.boss;

    if (!boss) {
      return this._fightDecision(state, belief);
    }

    const bdx = boss.x - px;
    const bdy = boss.y - py;
    const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

    // Reaction time buffer: delay response to boss state changes
    if (boss.state !== this.lastBossState) {
      this.reactionBuffer = this.params.reactionTime;
      this.lastBossState = boss.state;
    }
    if (this.reactionBuffer > 0) {
      this.reactionBuffer -= 0.016;
      // During reaction delay, continue previous behavior (move toward boss)
      if (this.reactionBuffer > 0 && this.skillLevel !== "high") {
        const defaultMove = this._moveToward(px, py, boss.x, boss.y, state);
        return {
          moveX: defaultMove.moveX,
          moveY: defaultMove.moveY,
          attack: bDist < 300,
          charge: false,
          ikki: false,
          aimX: boss.x,
          aimY: boss.y,
        };
      }
    }

    // --- CHARGE state: dodge ---
    if (boss.state === "CHARGE") {
      return this._dodgeCharge(state, boss, px, py);
    }

    // --- WINDUP state: prepare to dodge ---
    if (boss.state === "WINDUP") {
      if (this.skillLevel === "high") {
        const perpMove = this._getPerpendicularMove(px, py, boss.x, boss.y);
        return {
          moveX: perpMove.moveX,
          moveY: perpMove.moveY,
          attack: bDist < 300,
          charge: false,
          ikki: false,
          aimX: boss.x,
          aimY: boss.y,
        };
      }
      // Mid/Low: just attack normally during windup
      const move = this._moveToward(px, py, boss.x, boss.y, state);
      return {
        moveX: move.moveX,
        moveY: move.moveY,
        attack: bDist < 300,
        charge: false,
        ikki: false,
        aimX: boss.x,
        aimY: boss.y,
      };
    }

    // --- CASTLE_WAIT state: boss is invincible ---
    if (boss.state === "CASTLE_WAIT") {
      if (this.params.bossBackoffOnCastleWait) {
        const away = this._moveAwayFrom(px, py, boss.x, boss.y, state);
        this.log.push({
          time: state.game.time,
          state: this.currentState,
          action: "boss_backoff_castle_wait",
          details: { bossHp: boss.hp },
        });
        return {
          moveX: away.moveX,
          moveY: away.moveY,
          attack: false,
          charge: false,
          ikki: false,
        };
      }
      // Low-skill: keeps attacking invincible boss
      const move = this._moveToward(px, py, boss.x, boss.y, state);
      return {
        moveX: move.moveX,
        moveY: move.moveY,
        attack: bDist < 300,
        charge: false,
        ikki: false,
        aimX: boss.x,
        aimY: boss.y,
      };
    }

    // --- DECEL state: shockwave incoming ---
    if (boss.state === "DECEL") {
      if (this.params.bossBackoffOnDecel) {
        if (bDist < 120) {
          const away = this._moveAwayFrom(px, py, boss.x, boss.y, state);
          return {
            moveX: away.moveX,
            moveY: away.moveY,
            attack: false,
            charge: false,
            ikki: false,
          };
        }
      }
      const move = this._moveToward(px, py, boss.x, boss.y, state);
      return {
        moveX: move.moveX,
        moveY: move.moveY,
        attack: bDist < 300,
        charge: false,
        ikki: false,
        aimX: boss.x,
        aimY: boss.y,
      };
    }

    // --- RETREAT state: boss is retreating and shooting projectiles ---
    if (boss.state === "RETREAT") {
      let move;
      if (this.params.zigzagEnabled) {
        // High-skill: slight zigzag pattern to dodge projectiles
        const zigzag = Math.sin(state.game.time * 3) * 0.3;
        move = this._moveToward(px, py, boss.x, boss.y, state);
        move.moveX += zigzag;
      } else {
        move = this._moveToward(px, py, boss.x, boss.y, state);
      }

      const shouldIkki = this._shouldIkkiBoss(state, belief, boss);

      return {
        moveX: move.moveX,
        moveY: move.moveY,
        attack: bDist < 300,
        charge: false,
        ikki: shouldIkki,
        aimX: boss.x,
        aimY: boss.y,
      };
    }

    // --- CHASE state: boss is coming to us, stand and fight ---
    if (boss.state === "CHASE") {
      let move;
      if (this.skillLevel === "high") {
        if (bDist < 120) {
          move = this._moveAwayFrom(px, py, boss.x, boss.y, state);
        } else if (bDist > 200) {
          move = this._moveToward(px, py, boss.x, boss.y, state);
        } else {
          const perpMove = this._getPerpendicularMove(px, py, boss.x, boss.y);
          move = perpMove;
        }
      } else if (this.skillLevel === "mid" && bDist < 100) {
        move = this._moveAwayFrom(px, py, boss.x, boss.y, state);
      } else {
        move = this._moveToward(px, py, boss.x, boss.y, state);
      }

      const shouldCharge = this._shouldCharge(state, belief);
      const shouldIkki = this._shouldIkkiBoss(state, belief, boss);

      return {
        moveX: move.moveX,
        moveY: move.moveY,
        attack: bDist < 300,
        charge: shouldCharge,
        ikki: shouldIkki,
        aimX: boss.x,
        aimY: boss.y,
      };
    }

    // Default boss behavior: approach and attack
    const move = this._moveToward(px, py, boss.x, boss.y, state);
    return {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: bDist < 300,
      charge: false,
      ikki: this._shouldIkkiBoss(state, belief, boss),
      aimX: boss.x,
      aimY: boss.y,
    };
  }

  // ============================================================
  // Boss fight helpers
  // ============================================================

  _dodgeCharge(state, boss, px, py) {
    const dodgeSuccess = Math.random() < this.params.dodgeRate;

    if (dodgeSuccess) {
      const perpMove = this._getPerpendicularMove(
        px, py,
        boss.x, boss.y,
        boss.chargeDirX, boss.chargeDirY
      );

      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "boss_dodge_success",
        details: { bossState: boss.state },
      });

      return {
        moveX: perpMove.moveX,
        moveY: perpMove.moveY,
        attack: false,
        charge: false,
        ikki: false,
      };
    }

    // Dodge failed
    this.log.push({
      time: state.game.time,
      state: this.currentState,
      action: "boss_dodge_fail",
      details: { bossState: boss.state },
    });

    if (this.skillLevel === "low") {
      // Low-skill: panic freeze or run TOWARD boss
      if (Math.random() < 0.3) {
        return { moveX: 0, moveY: 0, attack: false, charge: false, ikki: false };
      }
      const badMove = this._moveToward(px, py, boss.x, boss.y, state);
      return {
        moveX: badMove.moveX,
        moveY: badMove.moveY,
        attack: true,
        charge: false,
        ikki: false,
      };
    }

    // Mid-skill: tries to run away but not perpendicular
    const away = this._moveAwayFrom(px, py, boss.x, boss.y, state);
    return {
      moveX: away.moveX,
      moveY: away.moveY,
      attack: false,
      charge: false,
      ikki: false,
    };
  }

  _getPerpendicularMove(px, py, bossX, bossY, chargeDirX, chargeDirY) {
    let perpX, perpY;

    if (chargeDirX != null && chargeDirY != null) {
      perpX = -chargeDirY;
      perpY = chargeDirX;
    } else {
      const dx = px - bossX;
      const dy = py - bossY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        return { moveX: 1, moveY: 0 };
      }
      perpX = -dy / dist;
      perpY = dx / dist;
    }

    // Choose the side that moves us further from boss
    const testX1 = px + perpX * 10;
    const testY1 = py + perpY * 10;
    const testX2 = px - perpX * 10;
    const testY2 = py - perpY * 10;

    const dist1 = Math.sqrt((testX1 - bossX) * (testX1 - bossX) + (testY1 - bossY) * (testY1 - bossY));
    const dist2 = Math.sqrt((testX2 - bossX) * (testX2 - bossX) + (testY2 - bossY) * (testY2 - bossY));

    if (dist1 >= dist2) {
      return { moveX: perpX, moveY: perpY };
    }
    return { moveX: -perpX, moveY: -perpY };
  }

  // ============================================================
  // Logging helpers
  // ============================================================

  logEvent(state, action, details) {
    this.log.push({
      time: state.game.time,
      state: this.currentState,
      action: action,
      details: details,
    });
  }

  getLog() {
    return this.log;
  }

  getState() {
    return this.currentState;
  }
}

module.exports = { AIPlayer, SKILL_PARAMS, AI_STATE };
