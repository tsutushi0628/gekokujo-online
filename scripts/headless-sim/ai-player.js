// ai-player.js - AIプレイヤーモジュール（ヘッドレスシミュレーション用）
// スキルレベル別の意思決定エンジン

"use strict";

// ============================================================
// Skill-level parameters
// ============================================================
const SKILL_PARAMS = {
  high: {
    accuracy: 0.95,
    reactionTime: 0.2,
    recruitThreshold: 5,
    castleTime: 30,
    dodgeRate: 0.9,
    ikkiMinEnemies: 8,
    ikkiMinParade: 6,
    chargeMinEnemies: 5,
    chargeClusterRadius: 150,
    missGateChance: 0.0,
    fightDistance: 250,
    fleeHpThreshold: 35,
    wanderChance: 0.0,
    bossBackoffOnCastleWait: true,
    bossBackoffOnDecel: true,
    opportunisticAttackRange: 200,
  },
  mid: {
    accuracy: 0.75,
    reactionTime: 0.5,
    recruitThreshold: 3,
    castleTime: 38,
    dodgeRate: 0.6,
    ikkiMinEnemies: 5,
    ikkiMinParade: 3,
    chargeMinEnemies: 3,
    chargeClusterRadius: 200,
    missGateChance: 0.05,
    fightDistance: 200,
    fleeHpThreshold: 30,
    wanderChance: 0.02,
    bossBackoffOnCastleWait: true,
    bossBackoffOnDecel: false,
    opportunisticAttackRange: 150,
  },
  low: {
    accuracy: 0.5,
    reactionTime: 1.0,
    recruitThreshold: 1,
    castleTime: 48,
    dodgeRate: 0.2,
    ikkiMinEnemies: 1,
    ikkiMinParade: 1,
    chargeMinEnemies: 1,
    chargeClusterRadius: 300,
    missGateChance: 0.15,
    fightDistance: 100,
    fleeHpThreshold: 20,
    wanderChance: 0.08,
    bossBackoffOnCastleWait: false,
    bossBackoffOnDecel: false,
    opportunisticAttackRange: 80,
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
    this.accuracy = params.accuracy;

    this.currentState = AI_STATE.RECRUIT;
    this.previousState = null;
    this.stateTimer = 0;
    this.reactionBuffer = 0;
    this.lastBossState = null;

    // Low-skill AI might decide to skip the gate entirely
    this.willMissGate = Math.random() < params.missGateChance;

    // Wander target for low-skill AI
    this.wanderTarget = null;
    this.wanderTimer = 0;

    this.log = [];
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

    // --- FLEE: highest priority ---
    // Use hysteresis: flee below threshold, recover until 50% HP (or threshold+15)
    const fleeThresh = this.params.fleeHpThreshold;
    const recoverThresh = Math.min(state.player.maxHp * 0.5, fleeThresh + 15);
    if (state.player.hp < fleeThresh) {
      this._transitionTo(AI_STATE.FLEE, state);
      return this._fleeDecision(state);
    }
    if (this.currentState === AI_STATE.FLEE && state.player.hp < recoverThresh) {
      return this._fleeDecision(state);
    }

    // --- BOSS_FIGHT: when boss is active ---
    if (state.boss && state.boss.active) {
      this._transitionTo(AI_STATE.BOSS_FIGHT, state);
      return this._bossFightDecision(state);
    }

    // --- GO_TO_CASTLE: when gate is active and conditions met ---
    if (state.game.gateActive && this._shouldGoToCastle(state)) {
      this._transitionTo(AI_STATE.GO_TO_CASTLE, state);
      return this._goToCastle(state);
    }

    // --- RECRUIT vs FIGHT ---
    if (this._shouldRecruit(state)) {
      this._transitionTo(AI_STATE.RECRUIT, state);
      return this._recruitDecision(state);
    }

    this._transitionTo(AI_STATE.FIGHT, state);
    return this._fightDecision(state);
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

  _moveToward(currentX, currentY, targetX, targetY, state, accuracy) {
    let dx = targetX - currentX;
    let dy = targetY - currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      return { moveX: 0, moveY: 0 };
    }

    // Normalize
    dx = dx / dist;
    dy = dy / dist;

    // Add noise based on skill (low skill = more noise)
    const noise = (1 - accuracy) * 0.5;
    dx += (Math.random() - 0.5) * noise;
    dy += (Math.random() - 0.5) * noise;

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
    const noise = (1 - this.accuracy) * 0.3;
    dx += (Math.random() - 0.5) * noise;
    dy += (Math.random() - 0.5) * noise;

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
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
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

  _countEnemiesOnScreen(enemies) {
    if (!enemies) {
      return 0;
    }
    // Approximate: count all enemies (in headless sim, "on screen" = within ~640px)
    return enemies.length;
  }

  // ============================================================
  // Condition checks
  // ============================================================

  _shouldRecruit(state) {
    const paradeLen = state.player.paradeLen;

    // Low-skill AI barely recruits before fighting
    if (paradeLen >= this.params.recruitThreshold) {
      // Have enough followers, consider fighting
      // But if no enemies are nearby, keep recruiting
      const nearEnemy = this._findNearest(state.enemies, state.player.x, state.player.y);
      if (nearEnemy && nearEnemy.dist < 400) {
        return false;
      }
    }

    // If civilians exist and are reachable (within 800px), recruit
    if (state.civilians && state.civilians.length > 0) {
      const nearCivilian = this._findNearest(state.civilians, state.player.x, state.player.y);
      if (nearCivilian && nearCivilian.dist < 800) {
        return true;
      }
      // No reachable civilians: if we have at least 1 follower, switch to fight
      if (paradeLen >= 1) {
        return false;
      }
      // Still try to reach distant civilians if we have none
      return true;
    }

    return false;
  }

  _shouldGoToCastle(state) {
    // Low-skill AI might miss the gate entirely
    if (this.willMissGate) {
      return false;
    }

    const gameTime = state.game.time;

    // Check if game time exceeds our castle threshold
    if (gameTime < this.params.castleTime) {
      return false;
    }

    return true;
  }

  _shouldCharge(state) {
    const paradeLen = state.player.paradeLen;
    if (paradeLen < 3) {
      return false;
    }
    if (state.player.chargeCD > 0) {
      return false;
    }

    const nearbyEnemies = this._countEnemiesInRange(
      state.enemies,
      state.player.x,
      state.player.y,
      this.params.chargeClusterRadius
    );

    if (nearbyEnemies >= this.params.chargeMinEnemies) {
      // High-skill: only charge when enemies are clustered
      // Low-skill: charges at first opportunity (chargeMinEnemies = 1)
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "charge",
        details: {
          nearbyEnemies: nearbyEnemies,
          paradeLen: paradeLen,
        },
      });
      return true;
    }

    return false;
  }

  _shouldIkki(state) {
    // Only farmer in ikki mode can use ikki
    if (this.charKey !== "farmer") {
      return false;
    }
    if (!this.ikkiMode) {
      return false;
    }
    if (state.game.ikkiCD > 0) {
      return false;
    }

    const paradeLen = state.player.paradeLen;
    const enemiesOnScreen = this._countEnemiesOnScreen(state.enemies);

    // Low-skill AI: uses ikki immediately when CD is up, regardless of conditions
    // High-skill AI: only when 8+ enemies and 6+ parade members
    if (paradeLen >= this.params.ikkiMinParade && enemiesOnScreen >= this.params.ikkiMinEnemies) {
      this.log.push({
        time: state.game.time,
        state: this.currentState,
        action: "ikki",
        details: {
          paradeLen: paradeLen,
          enemiesOnScreen: enemiesOnScreen,
        },
      });
      return true;
    }

    return false;
  }

  // ============================================================
  // FLEE decision
  // ============================================================

  _fleeDecision(state) {
    const px = state.player.x;
    const py = state.player.y;
    const nearEnemy = this._findNearest(state.enemies, px, py);

    let moveX = 0;
    let moveY = 0;

    if (nearEnemy) {
      const escape = this._moveAwayFrom(px, py, nearEnemy.x, nearEnemy.y, state);
      moveX = escape.moveX;
      moveY = escape.moveY;
    } else {
      // No enemies visible, move toward map center (safe area)
      const move = this._moveToward(px, py, 1920, 1080, state, this.accuracy);
      moveX = move.moveX;
      moveY = move.moveY;
    }

    // Shoot while fleeing (kiting) for high/mid skill
    const shouldAttack = nearEnemy && nearEnemy.dist < 300 && this.skillLevel !== "low";

    const result = {
      moveX: moveX,
      moveY: moveY,
      attack: shouldAttack,
      charge: false,
      ikki: false,
    };
    if (shouldAttack && nearEnemy) {
      result.aimX = nearEnemy.x;
      result.aimY = nearEnemy.y;
    }
    return result;
  }

  // ============================================================
  // RECRUIT decision
  // ============================================================

  _recruitDecision(state) {
    const px = state.player.x;
    const py = state.player.y;

    // Low-skill AI sometimes wanders randomly instead of heading to civilians
    if (this.params.wanderChance > 0 && Math.random() < this.params.wanderChance) {
      this.wanderTimer = 2.0;
      this.wanderTarget = {
        x: 200 + Math.random() * 3440,
        y: 200 + Math.random() * 1760,
      };
    }

    if (this.wanderTimer > 0) {
      this.wanderTimer -= 0.016;
      if (this.wanderTarget) {
        const move = this._moveToward(px, py, this.wanderTarget.x, this.wanderTarget.y, state, this.accuracy * 0.7);
        return {
          moveX: move.moveX,
          moveY: move.moveY,
          attack: false,
          charge: false,
          ikki: false,
        };
      }
    }

    const nearestCivilian = this._findNearest(state.civilians, px, py);
    if (!nearestCivilian) {
      // No civilians available, switch to fighting
      return this._fightDecision(state);
    }

    const move = this._moveToward(px, py, nearestCivilian.x, nearestCivilian.y, state, this.accuracy);

    // Opportunistic attack: hit enemies while passing by
    const nearEnemy = this._findNearest(state.enemies, px, py);
    const shouldAttackOpportunistically = nearEnemy && nearEnemy.dist < this.params.opportunisticAttackRange;

    const result = {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttackOpportunistically,
      charge: false,
      ikki: false,
    };
    if (shouldAttackOpportunistically && nearEnemy) {
      result.aimX = nearEnemy.x;
      result.aimY = nearEnemy.y;
    }
    return result;
  }

  // ============================================================
  // FIGHT decision
  // ============================================================

  _fightDecision(state) {
    const px = state.player.x;
    const py = state.player.y;

    const nearestEnemy = this._findNearest(state.enemies, px, py);
    if (!nearestEnemy) {
      // No enemies, go recruit
      return this._recruitDecision(state);
    }

    // Move toward enemy, but maintain preferred fight distance for high skill
    let targetX = nearestEnemy.x;
    let targetY = nearestEnemy.y;

    // High-skill AI maintains distance and kites; low-skill runs straight in
    if (this.skillLevel === "high" && nearestEnemy.dist < this.params.fightDistance * 0.6) {
      // Back off to maintain optimal shooting range
      const away = this._moveAwayFrom(px, py, nearestEnemy.x, nearestEnemy.y, state);
      targetX = px + away.moveX * 100;
      targetY = py + away.moveY * 100;
    } else if (this.skillLevel === "mid" && nearestEnemy.dist < this.params.fightDistance * 0.5) {
      const away = this._moveAwayFrom(px, py, nearestEnemy.x, nearestEnemy.y, state);
      targetX = px + away.moveX * 60;
      targetY = py + away.moveY * 60;
    }

    const move = this._moveToward(px, py, targetX, targetY, state, this.accuracy);

    // Attack when in projectile range (~300px based on game constants)
    const shouldAttack = nearestEnemy.dist < 300;
    const shouldCharge = this._shouldCharge(state);
    const shouldIkki = this._shouldIkki(state);

    return {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttack,
      charge: shouldCharge,
      ikki: shouldIkki,
      aimX: nearestEnemy.x,
      aimY: nearestEnemy.y,
    };
  }

  // ============================================================
  // GO_TO_CASTLE decision
  // ============================================================

  _goToCastle(state) {
    const px = state.player.x;
    const py = state.player.y;

    // Castle position (from terrain.castlePos)
    const castlePos = state.terrain.castlePos;
    const castleX = castlePos ? castlePos.x : null;
    const castleY = castlePos ? castlePos.y : null;

    if (castleX == null || castleY == null) {
      return this._fightDecision(state);
    }

    const move = this._moveToward(px, py, castleX, castleY, state, this.accuracy);

    // Attack nearby enemies while traveling
    const nearEnemy = this._findNearest(state.enemies, px, py);
    const shouldAttack = nearEnemy && nearEnemy.dist < 200;

    // Use ikki if overwhelmed on the way
    const shouldIkki = this._shouldIkki(state);

    const result = {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: shouldAttack,
      charge: false,
      ikki: shouldIkki,
    };
    if (shouldAttack && nearEnemy) {
      result.aimX = nearEnemy.x;
      result.aimY = nearEnemy.y;
    }
    return result;
  }

  // ============================================================
  // BOSS_FIGHT decision
  // ============================================================

  _bossFightDecision(state) {
    const px = state.player.x;
    const py = state.player.y;
    const boss = state.boss;

    if (!boss) {
      return this._fightDecision(state);
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
        const defaultMove = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
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
      // High-skill: preemptively move to side
      // Mid/Low: keep attacking (don't react to windup)
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
      const move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
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
        // Smart: back off and wait, don't waste attacks
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
      // Low-skill: keeps attacking invincible boss (wasted effort)
      const move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
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
        // Smart: move away to avoid shockwave (radius 80px)
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
      // Mid/Low: stays close, takes shockwave damage
      const move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
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
      // Chase the boss but dodge projectiles
      // High-skill: weave while chasing
      // Low-skill: run straight at boss
      let move;
      if (this.skillLevel === "high") {
        // Slight zigzag pattern
        const zigzag = Math.sin(state.game.time * 3) * 0.3;
        move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
        move.moveX += zigzag;
      } else {
        move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
      }

      const shouldIkki = this._shouldIkkiBoss(state, boss);

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
      // High-skill: kite at 120-200px distance (close enough for parade melee)
      // Mid-skill: back off at 100px
      // Low-skill: face-tank
      let move;
      if (this.skillLevel === "high") {
        if (bDist < 120) {
          // Too close, back off (boss contact range = player.size + boss.size ~94px)
          move = this._moveAwayFrom(px, py, boss.x, boss.y, state);
        } else if (bDist > 200) {
          // Too far for parade melee, close in
          move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
        } else {
          // Optimal range: strafe perpendicular while shooting
          const perpMove = this._getPerpendicularMove(px, py, boss.x, boss.y);
          move = perpMove;
        }
      } else if (this.skillLevel === "mid" && bDist < 100) {
        move = this._moveAwayFrom(px, py, boss.x, boss.y, state);
      } else {
        move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
      }

      const shouldCharge = this._shouldCharge(state);
      const shouldIkki = this._shouldIkkiBoss(state, boss);

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
    const move = this._moveToward(px, py, boss.x, boss.y, state, this.accuracy);
    return {
      moveX: move.moveX,
      moveY: move.moveY,
      attack: bDist < 300,
      charge: false,
      ikki: this._shouldIkkiBoss(state, boss),
      aimX: boss.x,
      aimY: boss.y,
    };
  }

  // ============================================================
  // Boss fight helpers
  // ============================================================

  _dodgeCharge(state, boss, px, py) {
    // Roll dodge success based on skill
    const dodgeSuccess = Math.random() < this.params.dodgeRate;

    if (dodgeSuccess) {
      // Move perpendicular to the boss's charge direction
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

    // Dodge failed: either freeze (panic) or run straight away (ineffective)
    this.log.push({
      time: state.game.time,
      state: this.currentState,
      action: "boss_dodge_fail",
      details: { bossState: boss.state },
    });

    if (this.skillLevel === "low") {
      // Low-skill: panic freeze or run TOWARD boss (worst case)
      if (Math.random() < 0.3) {
        return { moveX: 0, moveY: 0, attack: false, charge: false, ikki: false };
      }
      // Run toward boss (bad instinct)
      const badMove = this._moveToward(px, py, boss.x, boss.y, state, 0.3);
      return {
        moveX: badMove.moveX,
        moveY: badMove.moveY,
        attack: true,
        charge: false,
        ikki: false,
      };
    }

    // Mid-skill: tries to run away but in the charge line (not perpendicular)
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
      // Use charge direction to compute perpendicular
      perpX = -chargeDirY;
      perpY = chargeDirX;
    } else {
      // Compute from boss->player direction
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

  _shouldIkkiBoss(state, boss) {
    if (this.charKey !== "farmer") {
      return false;
    }
    if (!this.ikkiMode) {
      return false;
    }
    if (state.game.ikkiCD > 0) {
      return false;
    }

    const paradeLen = state.player.paradeLen;

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
      if (paradeLen >= 3 && boss.hp > 100) {
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
    if (paradeLen >= 6 && boss.hp > 200) {
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
