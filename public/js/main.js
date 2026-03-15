// main.js - ゲーム状態管理・ゲームディレクター・ランクシステム・一揆/商人/下克上システム・家屋管理・シーン制御

// ============================================================
// DOM References
// ============================================================
var canvas = document.getElementById("gameCanvas");
var ctx = canvas.getContext("2d");
var titleScreen = document.getElementById("title-screen");
var charSelect = document.getElementById("char-select");
var resultScreen = document.getElementById("result-screen");
var skullScreen = document.getElementById("skull-screen");
var dialogOverlay = document.getElementById("dialog-overlay");
var dialogTextEl = document.getElementById("dialogText");
var dialogYesBtn = document.getElementById("dialogYes");
var dialogNoBtn = document.getElementById("dialogNo");
var linesCanvas = document.getElementById("linesCanvas");
var ikkiOverlay = document.getElementById("ikki-overlay");
var bgm = document.getElementById("bgm");
var muteBtn = document.getElementById("muteBtn");
var howtoLink = document.getElementById("howtoLink");
var creditsLink = document.getElementById("creditsLink");
var howtoOverlay = document.getElementById("howto-overlay");
var creditsOverlay = document.getElementById("credits-overlay");
var onboardingScreen = document.getElementById("onboarding-screen");

// ============================================================
// BgmController (fade in/out)
// ============================================================
var BgmController = {
  fadeInterval: null,
  targetVolume: 0.3,

  fadeIn: function(duration) {
    var self = this;
    if (self.fadeInterval) { clearInterval(self.fadeInterval); }
    bgm.volume = 0;
    bgm.play();
    var step = self.targetVolume / (duration / 50);
    self.fadeInterval = setInterval(function() {
      bgm.volume = Math.min(bgm.volume + step, self.targetVolume);
      if (bgm.volume >= self.targetVolume) {
        clearInterval(self.fadeInterval);
        self.fadeInterval = null;
      }
    }, 50);
  },

  fadeOut: function(duration, callback) {
    var self = this;
    if (self.fadeInterval) { clearInterval(self.fadeInterval); }
    var startVol = bgm.volume;
    var step = startVol / (duration / 50);
    self.fadeInterval = setInterval(function() {
      bgm.volume = Math.max(bgm.volume - step, 0);
      if (bgm.volume <= 0) {
        clearInterval(self.fadeInterval);
        self.fadeInterval = null;
        bgm.pause();
        bgm.currentTime = 0;
        if (callback) { callback(); }
      }
    }, 50);
  },

  stop: function() {
    if (this.fadeInterval) { clearInterval(this.fadeInterval); this.fadeInterval = null; }
    bgm.pause();
    bgm.currentTime = 0;
    bgm.volume = this.targetVolume;
  }
};

// ============================================================
// Shared Game State (minimal globals)
// ============================================================
var gameState = {
  phase: "title",
  paused: false,
  selectedChar: null,
  charDef: null,
  gameTime: 0,
  lastTimestamp: 0,
  koku: 0,
  kokuPerSecond: 0,
  speedMultiplier: 1,
  ikkiMode: false,
  sessionId: null,
  rankIndex: 0,
  criticalTimer: 0
};

var dialogCallback = null;

// ============================================================
// IkkiSystem
// ============================================================
var IkkiSystem = {
  available: false,
  active: false,
  cooldown: 0,
  flashTimer: 0,
  cutinTimer: 0,

  init: function() {
    this.available = (gameState.selectedChar === "farmer" && gameState.ikkiMode);
    this.active = false;
    this.cooldown = 0;
    this.flashTimer = 0;
    this.cutinTimer = 0;
  },

  update: function(dt) {
    if (!this.available) { return; }

    if (this.cooldown > 0) { this.cooldown -= dt; }
    if (this.flashTimer > 0) { this.flashTimer -= dt; }
    if (this.cutinTimer > 0) { this.cutinTimer -= dt; }

    // Q key activation is handled in the main game loop
  },

  tryActivate: function() {
    if (!this.available) { return; }
    if (this.cooldown > 0 || this.active) { return; }
    this._activate();
  },

  _activate: function() {
    var paradeLen = ParadeController.getLength();
    if (paradeLen < 1) {
      AnnouncementSystem.add("一揆には最低1人必要!");
      return;
    }

    // Consume 50% of parade members (min 1)
    var consumeCount = Math.max(1, Math.floor(paradeLen * 0.5));
    var damageAmount = paradeLen * 8;

    // Remove consumed members from the end (loop-based)
    for (var rc = 0; rc < consumeCount; rc++) {
      if (ParadeController.members.length > 0) {
        ParadeController.members.splice(ParadeController.members.length - 1, 1);
      }
    }

    // 画面内の敵を即死させる（殿様を除く）
    var camX = CameraController.x;
    var camY = CameraController.y;
    var ultMult = 2.6;
    var ultScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
    for (var i = EnemyManager.enemies.length - 1; i >= 0; i--) {
      var en = EnemyManager.enemies[i];
      if (en.x < camX || en.x > camX + CANVAS_W) { continue; }
      if (en.y < camY || en.y > camY + CANVAS_H) { continue; }
      var kokuGain = Math.floor(en.scoreValue * ultMult * ultScoreMult);
      gameState.koku += kokuGain;
      FloatingScoreSystem.show(en.scoreValue);
      EffectRenderer.add(en.x, en.y, "destroy");
      EnemyManager.enemies.splice(i, 1);
    }
    RankSystem.check();

    // 殿様にはダメージ（即死ではない）
    if (GekokujoSystem.boss && !GekokujoSystem.boss.defeated) {
      GekokujoSystem.boss.hp -= damageAmount;
      EffectRenderer.add(GekokujoSystem.boss.x, GekokujoSystem.boss.y, "hit");
      if (GekokujoSystem.boss.hp <= 0) { GekokujoSystem.success(); }
    }

    // Flash + cutin
    this.flashTimer = 0.3;
    this.cutinTimer = 0.8;
    this.cooldown = 10;
  }
};

// ============================================================
// BridgeBossSystem (橋の中ボス - 辻斬り)
// ============================================================
var BridgeBossSystem = {
  bosses: [],
  contactInvincibleTimer: 0,

  init: function() {
    this.bosses = [];
    this.contactInvincibleTimer = 0;
    this._spawn();
  },

  // 外部互換: 最初の生存ボスを返す
  _getFirstBoss: function() {
    for (var i = 0; i < this.bosses.length; i++) {
      if (this.bosses[i]) { return this.bosses[i]; }
    }
    return null;
  },

  update: function(dt) {
    // 接触無敵タイマー減算
    if (this.contactInvincibleTimer > 0) {
      this.contactInvincibleTimer -= dt;
    }

    var px = PlayerController.x;
    var py = PlayerController.y;

    for (var bi = 0; bi < this.bosses.length; bi++) {
      var boss = this.bosses[bi];
      if (!boss) { continue; }

      var dx = px - boss.x;
      var dy = py - boss.y;
      var distToPlayer = Math.sqrt(dx * dx + dy * dy);

      if (boss.safe) {
        // safe=true（幅広い橋）: Y軸サイン波パトロールのみ、X移動なし
        boss.patrolTimer += dt;
        var patrolHalfRange = boss.patrolRange / 2;
        var patrolOffset = Math.sin(boss.patrolTimer * boss.patrolSpeed) * patrolHalfRange;
        var targetY = boss.homeY + patrolOffset;
        var patrolDy = targetY - boss.y;
        var moveY = 0;
        if (Math.abs(patrolDy) > 1) {
          moveY = (patrolDy > 0 ? 1 : -1) * boss.speed;
        }

        var newY = boss.y + moveY;

        // 川には入らない（橋の上は許可）
        if (TerrainManager.isInRiver(boss.x, newY) && !TerrainManager.isOnBridge(boss.x, newY)) {
          newY = boss.y;
        }

        boss.y = newY;
      }
      // safe=false（幅狭い橋）: 完全固定、移動なし

      // 向き（プレイヤーの方を向く）
      if (dx < 0) { boss.facingLeft = true; }
      if (dx > 0) { boss.facingLeft = false; }

      // 木との衝突
      var treePush = TerrainManager.pushFromTrees(boss.x, boss.y, boss.size);
      boss.x = treePush.x;
      boss.y = treePush.y;

      // 建物との衝突
      resolveHouseCollision(boss, boss.size);

      // 接触ダメージ（大ダメージ: HPの35%）
      if (distToPlayer < PlayerController.size + boss.size) {
        if (this.contactInvincibleTimer <= 0) {
          var contactDamage = Math.floor(PlayerController.maxHp * 0.35);
          var dead = PlayerController.takeDamage(contactDamage);
          if (dead) {
            gameState.phase = "result";
            BgmController.fadeOut(500);
            skullScreen.classList.add("active");
            return;
          }
          // ノックバック（強め）
          if (distToPlayer > 1) {
            PlayerController.applyKnockback(dx, dy, -12);
          }
          this.contactInvincibleTimer = 1.5;
        }
      }
    }
  },

  _spawn: function() {
    var bridges = TerrainManager.bridges;
    if (bridges.length === 0) { return; }

    this.bosses = [];
    for (var i = 0; i < bridges.length; i++) {
      var bridge = bridges[i];
      var bossX = bridge.x + bridge.w / 2;
      var bossY = bridge.y + bridge.h / 2;

      var bossData = {
        x: bossX,
        y: bossY,
        homeX: bossX,
        homeY: bossY,
        hp: 240,
        maxHp: 240,
        attack: 10,
        speed: 1.8,
        size: 30,
        attackTimer: 0,
        facingLeft: false,
        scoreValue: 2000,
        safe: bridge.safe,
        patrolTimer: 0,
        patrolRange: bridge.h * 0.8,
        patrolSpeed: 1.2
      };

      this.bosses.push(bossData);
    }

    AnnouncementSystem.add("橋の辻斬りが現れた!");
  },

  takeDamageAt: function(index, amount) {
    var boss = this.bosses[index];
    if (!boss) { return; }
    boss.hp -= amount;
    EffectRenderer.add(boss.x, boss.y, "hit");
    if (boss.hp <= 0) {
      this._defeat(index);
    }
  },

  // 外部互換: 単体ボス前提の呼び出し用（最初の生存ボスにダメージ）
  takeDamage: function(amount) {
    for (var i = 0; i < this.bosses.length; i++) {
      if (this.bosses[i]) {
        this.takeDamageAt(i, amount);
        return;
      }
    }
  },

  _defeat: function(index) {
    var boss = this.bosses[index];
    if (!boss) { return; }
    var bbScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
    var bbReward = KokuReward.apply(boss.scoreValue, gameState);
    var bbKokuGain = Math.floor(bbReward * bbScoreMult);
    gameState.koku += bbKokuGain;
    FloatingScoreSystem.show(bbReward);
    RankSystem.check();
    EffectRenderer.add(boss.x, boss.y, "destroy");
    AnnouncementSystem.add("橋の辻斬りを討ち取った! +2000点!");
    this.bosses[index] = null;
  },

  draw: function(ctx) {
    for (var bi = 0; bi < this.bosses.length; bi++) {
      var boss = this.bosses[bi];
      if (!boss) { continue; }
      if (!CameraController.isVisible(boss.x, boss.y, 40)) { continue; }
      var sp = CameraController.worldToScreen(boss.x, boss.y);

      // 紫のオーラ（中ボス感）
      var pulseAlpha = 0.3 + Math.sin(performance.now() * 0.004) * 0.15;
      ctx.strokeStyle = "rgba(160, 40, 200, " + pulseAlpha + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, boss.size + 8, 0, Math.PI * 2);
      ctx.stroke();

      // スプライト描画
      if (spritesLoaded) {
        drawSpriteCentered(ctx, "tsujigiri", sp.x, sp.y, 96, !boss.facingLeft);
      } else {
        ctx.font = "40px " + FONT_FAMILY;
        ctx.textAlign = "center";
        ctx.fillText("\u2694\uFE0F", sp.x, sp.y + 10);
      }

      // HPバー
      var hpR = boss.hp / boss.maxHp;
      ctx.fillStyle = "#ddd";
      ctx.fillRect(sp.x - 24, sp.y - boss.size - 24, 48, 7);
      if (hpR > 0.5) { ctx.fillStyle = "#4a8"; }
      else { ctx.fillStyle = "#c44"; }
      ctx.fillRect(sp.x - 24, sp.y - boss.size - 24, 48 * hpR, 7);

      // ラベル
      ctx.fillStyle = "#1a1a1a";
      ctx.font = FONT.h5;
      ctx.textAlign = "center";
      ctx.fillText("辻斬り", sp.x, sp.y - boss.size - 22);
    }
  }
};

// ============================================================
// GekokujoSystem
// ============================================================
var GekokujoSystem = {
  available: true,
  gateActive: false,
  gatePos: null,
  boss: null,
  battleActive: false,
  battleTimer: 0,
  scheduleTime: 0,
  declineCooldown: 0,
  declinedGatePos: null,

  slowTimer: 0,
  slowMultiplier: 1.0,
  flashTimer: 0,
  endGamePending: false,
  gekokujoWin: false,
  defeatTimer: 0,
  defeatExplosionTimer: 0,

  // Castle collision rect (always active)
  castleCollision: null,

  // Boss cutin timers
  chargeCutinTimer: 0,
  retreatCutinTimer: 0,

  // Shockwave effect
  shockwave: null,

  init: function() {
    this.available = true;
    this.gateActive = false;
    this.gatePos = null;
    this.boss = null;
    this.battleActive = false;
    this.battleTimer = 0;
    if (gameState.ikkiMode) {
      this.scheduleTime = 50 * 0.2 + Math.random() * 10;
    } else {
      this.scheduleTime = MAX_TIME * 0.2 + Math.random() * 20;
    }
    this.declineCooldown = 0;
    this.declinedGatePos = null;
    this.slowTimer = 0;
    this.slowMultiplier = 1.0;
    this.flashTimer = 0;
    this.endGamePending = false;
    this.gekokujoWin = false;
    this.defeatTimer = 0;
    this.defeatExplosionTimer = 0;
    this.chargeCutinTimer = 0;
    this.retreatCutinTimer = 0;
    this.shockwave = null;

    // Setup castle collision (matches castle keep visual: 480x320, offset up by 30)
    var castlePos = MapGenerator.getCastleWorldPos();
    this.castleCollision = {
      x: castlePos.x - 240,
      y: castlePos.y - 160 - 30,
      w: 480,
      h: 320
    };
  },

  // Called with raw (unslowed) dt from gameLoop, before dt is multiplied
  updateTimers: function(rawDt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowMultiplier = 1.0;
        // Clear defeated boss sprite at end of defeat sequence
        if (this.boss && this.boss.defeated) {
          // Final big explosion burst
          for (var fi = 0; fi < 6; fi++) {
            var fx = (Math.random() - 0.5) * 120;
            var fy = (Math.random() - 0.5) * 120;
            EffectRenderer.add(this.boss.x + fx, this.boss.y + fy, "destroy");
          }
          this.boss = null;
        }
        if (this.endGamePending) {
          this.endGamePending = false;
          GameDirector.endGame(this.gekokujoWin);
        }
      }
    }
    // Defeat sequence: staggered explosions every 0.25s during slow-mo
    if (this.defeatTimer > 0 && this.boss) {
      this.defeatTimer -= rawDt;
      this.defeatExplosionTimer -= rawDt;
      if (this.defeatExplosionTimer <= 0) {
        this.defeatExplosionTimer = 0.25;
        var ex = (Math.random() - 0.5) * 100;
        var ey = (Math.random() - 0.5) * 100;
        EffectRenderer.add(this.boss.x + ex, this.boss.y + ey, "bossExplosion");
      }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= rawDt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 0;
      }
    }
    if (this.chargeCutinTimer > 0) {
      this.chargeCutinTimer -= rawDt;
      if (this.chargeCutinTimer < 0) { this.chargeCutinTimer = 0; }
    }
    if (this.retreatCutinTimer > 0) {
      this.retreatCutinTimer -= rawDt;
      if (this.retreatCutinTimer < 0) { this.retreatCutinTimer = 0; }
    }
    if (this.shockwave) {
      this.shockwave.timer -= rawDt;
      if (this.shockwave.timer <= 0) { this.shockwave = null; }
    }
  },

  // Helper: random float between min and max
  _randRange: function(min, max) {
    return min + Math.random() * (max - min);
  },

  // State machine: transition to new AI state
  _changeState: function(newState) {
    var boss = this.boss;
    boss.aiState = newState;
    boss.stateTimer = 0;

    if (newState === "WINDUP") {
      boss.stateDuration = this._randRange(TONO_BOSS.windupDurationMin, TONO_BOSS.windupDurationMax);
      boss.speed = 0;
    } else if (newState === "CHARGE") {
      boss.stateDuration = TONO_BOSS.chargeDuration;
      boss.speed = TONO_BOSS.chargeSpeed;
      // Lock charge direction toward player at start
      var cdx = PlayerController.x - boss.x;
      var cdy = PlayerController.y - boss.y;
      var cDist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cDist < 1) { cDist = 1; }
      boss.chargeDirX = cdx / cDist;
      boss.chargeDirY = cdy / cDist;
      boss.contactHit = false;
      // Charge cutin (show 0.4s before windup ends, so trigger here at charge start)
      this.chargeCutinTimer = 0.8;
    } else if (newState === "DECEL") {
      boss.stateDuration = TONO_BOSS.decelDuration;
      boss.decelStartSpeed = TONO_BOSS.chargeSpeed;
    } else if (newState === "RETREAT") {
      boss.stateDuration = 999; // ends when reaching castle
      boss.speed = TONO_BOSS.retreatSpeed;
      boss.retreatShotTimer = 0;
      this.retreatCutinTimer = 0.5;
    } else if (newState === "CASTLE_WAIT") {
      boss.stateDuration = this._randRange(TONO_BOSS.castleWaitDurationMin, TONO_BOSS.castleWaitDurationMax);
      boss.speed = 0;
    } else if (newState === "CHASE") {
      boss.stateDuration = 3.0;
      boss.speed = TONO_BOSS.chaseSpeed;
    }
  },

  // State machine: pick next state based on transition rules
  _rollNextState: function(fromState) {
    var roll = Math.random();
    if (fromState === "WINDUP") {
      this._changeState("CHARGE");
    } else if (fromState === "CHARGE") {
      this._changeState("DECEL");
    } else if (fromState === "DECEL") {
      // 70% RETREAT, 30% WINDUP (consecutive charge)
      if (roll < 0.7) {
        this._changeState("RETREAT");
      } else {
        this._changeState("WINDUP");
      }
    } else if (fromState === "RETREAT") {
      this._changeState("CASTLE_WAIT");
    } else if (fromState === "CASTLE_WAIT") {
      // 50% WINDUP, 30% CHASE, 20% RETREAT
      if (roll < 0.5) {
        this._changeState("WINDUP");
      } else if (roll < 0.8) {
        this._changeState("CHASE");
      } else {
        this._changeState("RETREAT");
      }
    } else if (fromState === "CHASE") {
      // 60% WINDUP, 40% CHASE continue
      if (roll < 0.6) {
        this._changeState("WINDUP");
      } else {
        this._changeState("CHASE");
      }
    }
  },

  update: function(dt) {
    // Show gate
    if (this.available && !this.gateActive && !this.battleActive && gameState.gameTime >= this.scheduleTime) {
      var castlePos = MapGenerator.getCastleWorldPos();
      this.gatePos = { x: castlePos.x, y: castlePos.y + 200 };
      this.gateActive = true;
      this.available = false;
      AnnouncementSystem.add("城門が出現した!");
    }

    // Decline cooldown: restore gate after 3 seconds
    if (this.declineCooldown > 0) {
      this.declineCooldown -= dt;
      if (this.declineCooldown <= 0) {
        this.declineCooldown = 0;
        if (this.declinedGatePos) {
          this.gatePos = this.declinedGatePos;
          this.gateActive = true;
          this.declinedGatePos = null;
        }
      }
    }

    // Gate approach
    if (this.gatePos && !this.battleActive && this.declineCooldown <= 0) {
      var dx = PlayerController.x - this.gatePos.x;
      var dy = PlayerController.y - this.gatePos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 60) {
        this.gateActive = false;
        var savedGatePos = this.gatePos;
        this.gatePos = null;
        GameDirector.showDialog("城に攻め込む! 下克上を仕掛ける?", function(yes) {
          if (yes) {
            GekokujoSystem.startBattle();
          } else {
            GekokujoSystem.declineCooldown = 5;
            GekokujoSystem.declinedGatePos = savedGatePos;
            AnnouncementSystem.add("5秒後に再挑戦できます");
          }
        });
      }
    }

    // Boss battle - state machine AI
    if (this.battleActive) {
      this.battleTimer -= dt;
      this.battleElapsed += dt;
      var boss = this.boss;
      boss.stateTimer += dt;

      var castleTarget = MapGenerator.getCastleWorldPos();
      var bdx = PlayerController.x - boss.x;
      var bdy = PlayerController.y - boss.y;
      var bDist = Math.sqrt(bdx * bdx + bdy * bdy);

      // === State-specific behavior ===
      if (boss.aiState === "CHASE") {
        // Move toward player (constrained to castle/castle_town)
        if (bDist > 1) {
          var bossNewX = boss.x + (bdx / bDist) * boss.speed;
          var bossNewY = boss.y + (bdy / bDist) * boss.speed;
          var bossTerrain = TerrainManager.getTerrainAt(bossNewX, bossNewY);
          if (bossTerrain === TERRAIN_TYPES.CASTLE_TOWN || bossTerrain === TERRAIN_TYPES.CASTLE) {
            boss.x = bossNewX;
            boss.y = bossNewY;
          }
        }
        // Contact damage (1s interval, same as old behavior)
        if (bDist < PlayerController.size + boss.size) {
          boss.attackTimer += dt;
          if (boss.attackTimer > 1.0) {
            boss.attackTimer = 0;
            var dead = PlayerController.takeDamage(boss.attack);
            if (dead) { this.fail(); return; }
          }
        }
        // Transition after duration
        if (boss.stateTimer >= boss.stateDuration) {
          this._rollNextState("CHASE");
        }

      } else if (boss.aiState === "WINDUP") {
        // Stay still, pulse effect handled in draw
        if (boss.stateTimer >= boss.stateDuration) {
          this._rollNextState("WINDUP");
        }

      } else if (boss.aiState === "CHARGE") {
        // Move in locked direction
        boss.x += boss.chargeDirX * boss.speed;
        boss.y += boss.chargeDirY * boss.speed;
        // Clamp to map bounds
        if (boss.x < 30) { boss.x = 30; }
        if (boss.x > MAP_W - 30) { boss.x = MAP_W - 30; }
        if (boss.y < 30) { boss.y = 30; }
        if (boss.y > MAP_H - 30) { boss.y = MAP_H - 30; }

        // Check contact with player
        if (!boss.contactHit && bDist < PlayerController.size + boss.size) {
          boss.contactHit = true;
          // 35% HP damage
          var chargeDmg = Math.floor(PlayerController.maxHp * TONO_BOSS.contactDamageRatio);
          var chargeDead = PlayerController.takeDamage(chargeDmg);
          // Knockback
          var kbDx = PlayerController.x - boss.x;
          var kbDy = PlayerController.y - boss.y;
          PlayerController.applyKnockback(kbDx, kbDy, TONO_BOSS.knockbackForce);
          if (chargeDead) { this.fail(); return; }
        }
        // End on contact or time
        if (boss.contactHit || boss.stateTimer >= boss.stateDuration) {
          this._rollNextState("CHARGE");
        }

      } else if (boss.aiState === "DECEL") {
        // Linear deceleration from chargeSpeed to 1.5
        var decelProgress = boss.stateTimer / TONO_BOSS.decelDuration;
        if (decelProgress > 1) { decelProgress = 1; }
        var currentSpeed = TONO_BOSS.chargeSpeed - (TONO_BOSS.chargeSpeed - 1.5) * decelProgress;
        // Continue in charge direction
        boss.x += boss.chargeDirX * currentSpeed;
        boss.y += boss.chargeDirY * currentSpeed;
        // Clamp
        if (boss.x < 30) { boss.x = 30; }
        if (boss.x > MAP_W - 30) { boss.x = MAP_W - 30; }
        if (boss.y < 30) { boss.y = 30; }
        if (boss.y > MAP_H - 30) { boss.y = MAP_H - 30; }

        if (boss.stateTimer >= TONO_BOSS.decelDuration) {
          // Shockwave at end of decel
          this.shockwave = { x: boss.x, y: boss.y, timer: 0.3, maxTimer: 0.3 };
          // Shockwave damage to player and followers
          var swDx = PlayerController.x - boss.x;
          var swDy = PlayerController.y - boss.y;
          var swDist = Math.sqrt(swDx * swDx + swDy * swDy);
          if (swDist < TONO_BOSS.shockwaveRadius) {
            var swDead = PlayerController.takeDamage(TONO_BOSS.shockwaveDamage);
            if (swDead) { this.fail(); return; }
          }
          // Shockwave damage to followers
          for (var si = 0; si < ParadeController.members.length; si++) {
            var sm = ParadeController.members[si];
            var smDx = sm.x - boss.x;
            var smDy = sm.y - boss.y;
            if (smDx * smDx + smDy * smDy < TONO_BOSS.shockwaveRadius * TONO_BOSS.shockwaveRadius) {
              // Follower takes shockwave hit (remove from parade)
              EffectRenderer.add(sm.x, sm.y, "hit");
            }
          }
          this._rollNextState("DECEL");
        }

      } else if (boss.aiState === "RETREAT") {
        // Move toward castle front
        var retreatTargetX = castleTarget.x;
        var retreatTargetY = castleTarget.y + TONO_BOSS.castleStandoffDistance;
        var rtDx = retreatTargetX - boss.x;
        var rtDy = retreatTargetY - boss.y;
        var rtDist = Math.sqrt(rtDx * rtDx + rtDy * rtDy);
        if (rtDist > 10) {
          boss.x += (rtDx / rtDist) * boss.speed;
          boss.y += (rtDy / rtDist) * boss.speed;
        }

        // Fire projectiles at player
        boss.retreatShotTimer += dt;
        if (boss.retreatShotTimer >= TONO_BOSS.retreatProjectileInterval) {
          boss.retreatShotTimer = 0;
          var shotDx = PlayerController.x - boss.x;
          var shotDy = PlayerController.y - boss.y;
          var shotDist = Math.sqrt(shotDx * shotDx + shotDy * shotDy);
          if (shotDist < 1) { shotDist = 1; }
          var shotVx = (shotDx / shotDist) * TONO_BOSS.retreatProjectileSpeed;
          var shotVy = (shotDy / shotDist) * TONO_BOSS.retreatProjectileSpeed;
          ProjectileManager.addBossProjectile(boss.x, boss.y, shotVx, shotVy, TONO_BOSS.retreatProjectileDamage, 120, 6);
        }

        // Arrived at castle?
        if (rtDist <= 10) {
          this._rollNextState("RETREAT");
        }

      } else if (boss.aiState === "CASTLE_WAIT") {
        // Stationary, invincible (handled in damage code)
        if (boss.stateTimer >= boss.stateDuration) {
          this._rollNextState("CASTLE_WAIT");
        }
      }

      if (this.battleTimer <= 0) { this.retreat(); }
    }
  },

  startBattle: function() {
    this.battleActive = true;
    this.battleElapsed = 0;
    this.battleTimer = 20;
    EnemyManager.enemies = [];
    var rIdx = Math.min(gameState.rankIndex + 2, RANKS.length - 1);
    var bossHp = TONO_BOSS.hp;
    this.boss = {
      x: MapGenerator.getCastleWorldPos().x,
      y: MapGenerator.getCastleWorldPos().y,
      hp: bossHp, maxHp: bossHp,
      attack: 8 + rIdx * 4,
      speed: TONO_BOSS.chaseSpeed,
      size: 52,
      attackTimer: 0,
      // State machine
      aiState: "CHASE",
      stateTimer: 0,
      stateDuration: 3.0,
      chargeDirX: 0,
      chargeDirY: 0,
      contactHit: false,
      decelStartSpeed: 0,
      retreatShotTimer: 0,
      scaleMultiplier: 1.0
    };
    AnnouncementSystem.add("下克上チャレンジ! 殿様出現! 20秒以内に倒せ!");
  },

  success: function() {
    // Mark boss as defeated (keep for blinking animation)
    this.boss.defeated = true;
    this.boss.speed = 0;

    // Slow-motion: 2 seconds at 0.05x speed (nearly frozen)
    this.slowTimer = 2.0;
    this.slowMultiplier = 0.05;

    // Defeat sequence timer (staggered explosions for 2s)
    this.defeatTimer = 2.0;
    this.defeatExplosionTimer = 0;

    // Screen flash: 0.8 second white flash
    this.flashTimer = 0.8;

    // Announcement
    AnnouncementSystem.add("下克上成就!!");

    this.battleActive = false;
    if (gameState.selectedChar === "ashigaru") {
      if (this.battleElapsed <= 15) {
        var bukoReward = KokuReward.apply(2000, gameState);
        gameState.koku += bukoReward;
        FloatingScoreSystem.show(bukoReward);
        AnnouncementSystem.add("武功ボーナス! +" + bukoReward + "石!");
      }
    }
    var gekokujoBase = 2000 + gameState.rankIndex * 1000;
    var gekokujoReward = KokuReward.apply(gekokujoBase, gameState);
    var gekScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
    gameState.koku += Math.floor(gekokujoReward * gekScoreMult);
    FloatingScoreSystem.show(gekokujoReward);
    gameState.rankIndex = Math.min(gameState.rankIndex + 2, RANKS.length - 1);
    this.endGamePending = true;
    this.gekokujoWin = true;
  },

  retreat: function() {
    this.battleActive = false;
    this.boss = null;
    AnnouncementSystem.add("殿様は去った...");
    // Allow re-challenge after 5 seconds
    var castlePos = MapGenerator.getCastleWorldPos();
    this.declineCooldown = 5;
    this.declinedGatePos = { x: castlePos.x, y: castlePos.y };
  },

  fail: function() {
    this.battleActive = false;
    this.boss = null;
    BgmController.fadeOut(500);
    gameState.phase = "result";
    skullScreen.classList.add("active");
  },

  draw: function(ctx) {
    // Gate
    if (this.gatePos) {
      var sp = CameraController.worldToScreen(this.gatePos.x, this.gatePos.y);
      if (spritesLoaded) {
        drawSpriteCentered(ctx, "castle", sp.x, sp.y, 80, false);
      } else {
        ctx.font = FONT.iconMedium;
        ctx.textAlign = "center";
        ctx.fillText("\uD83C\uDFEF", sp.x, sp.y + 10);
      }
      ctx.font = FONT.h5;
      ctx.textAlign = "center";
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText("城門", sp.x, sp.y + 45);
      var pa = 0.3 + Math.sin(performance.now() / 300) * 0.2;
      ctx.strokeStyle = "rgba(0,0,0," + pa + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 50, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shockwave effect
    if (this.shockwave) {
      var swSp = CameraController.worldToScreen(this.shockwave.x, this.shockwave.y);
      var swProgress = 1.0 - (this.shockwave.timer / this.shockwave.maxTimer);
      var swRadius = TONO_BOSS.shockwaveRadius * swProgress;
      var swAlpha = 1.0 - swProgress;
      ctx.strokeStyle = "rgba(255, 255, 255, " + swAlpha + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(swSp.x, swSp.y, swRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Boss
    if (this.boss) {
      var bsp = CameraController.worldToScreen(this.boss.x, this.boss.y);

      // WINDUP: red aura ripple
      if (this.boss.aiState === "WINDUP" && !this.boss.defeated) {
        var auraPhase = this.boss.stateTimer * 5;
        var auraRadius = 40 + Math.sin(auraPhase) * 20;
        var auraAlpha = 0.3 + Math.sin(auraPhase * 0.7) * 0.15;
        ctx.strokeStyle = "rgba(200, 40, 40, " + auraAlpha + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bsp.x, bsp.y, auraRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // CASTLE_WAIT: blue shield barrier
      if (this.boss.aiState === "CASTLE_WAIT" && !this.boss.defeated) {
        ctx.strokeStyle = "rgba(60, 120, 255, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bsp.x, bsp.y, this.boss.size + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(60, 120, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(bsp.x, bsp.y, this.boss.size + 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rockman-style blinking when defeated (toggle every 0.08s)
      var showBossSprite = true;
      if (this.boss.defeated) {
        showBossSprite = (Math.floor(Date.now() / 80) % 2 === 0);
      }

      // WINDUP scale pulse
      var drawScale = 1.0;
      if (this.boss.aiState === "WINDUP" && !this.boss.defeated) {
        drawScale = 1.0 + 0.15 * Math.sin(this.boss.stateTimer * 8);
      }

      if (showBossSprite) {
        if (spritesLoaded) {
          var bossFlipH = (this.boss.x < PlayerController.x);
          drawSpriteCentered(ctx, "tonosama", bsp.x, bsp.y, Math.floor(140 * drawScale), bossFlipH);
        } else {
          ctx.font = Math.floor(70 * drawScale) + "px " + FONT_FAMILY;
          ctx.textAlign = "center";
          ctx.fillText("\uD83C\uDFEF", bsp.x, bsp.y + 15);
        }
      }
      if (!this.boss.defeated) {
        // HP bar
        ctx.fillStyle = "#ddd";
        ctx.fillRect(bsp.x - 34, bsp.y - 46, 68, 8);
        ctx.fillStyle = "#c44";
        ctx.fillRect(bsp.x - 34, bsp.y - 46, 68 * (this.boss.hp / this.boss.maxHp), 8);
        ctx.fillStyle = "#1a1a1a";
        ctx.font = FONT.h4;
        ctx.textAlign = "center";
        ctx.fillText("城主", bsp.x, bsp.y - 45);

        // CASTLE_WAIT: shield icon on HP bar
        if (this.boss.aiState === "CASTLE_WAIT") {
          ctx.font = "14px " + FONT_FAMILY;
          ctx.fillText("\uD83D\uDEE1\uFE0F", bsp.x + 40, bsp.y - 42);
        }
      }
    }
  }
};

// ============================================================
// RankSystem
// ============================================================
var RankSystem = {
  check: function() {
    for (var i = RANKS.length - 1; i >= 0; i--) {
      if (gameState.koku >= RANKS[i].threshold) {
        if (i > gameState.rankIndex) {
          gameState.rankIndex = i;
          AnnouncementSystem.add("身分上昇! " + RANKS[i].name + "になった!");
        }
        break;
      }
    }
  },

  getCurrentName: function() {
    return RANKS[gameState.rankIndex].name;
  }
};

// ============================================================
// HouseManager - deterministic house placement for terrain blocks
// ============================================================
var HouseManager = {
  _cache: {},

  clear: function() {
    this._cache = {};
  },

  getHouses: function(row, col) {
    var key = row + "_" + col;
    if (this._cache[key]) {
      return this._cache[key];
    }
    var houses = this._generate(row, col);
    this._cache[key] = houses;
    return houses;
  },

  _generate: function(row, col) {
    var houses = [];
    var seed = (row * 7919 + col * 6271) & 0x7fffffff;
    var bl = null;
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var b = TerrainManager.blocks[i];
      if (b.row === row && b.col === col) {
        bl = b;
        break;
      }
    }
    if (!bl) { return houses; }

    var rawHouses;
    if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
      rawHouses = this._generateGrid(seed);
    } else {
      rawHouses = this._generateClusters(seed);
    }

    // Filter out houses that overlap with the river
    // Check center and edges (collisionRadius) to prevent visual overlap
    for (var hi = 0; hi < rawHouses.length; hi++) {
      var worldX = bl.x + rawHouses[hi].x;
      var worldY = bl.y + rawHouses[hi].y;
      var hRadius = rawHouses[hi].collisionRadius;
      if (TerrainManager.isInRiver(worldX, worldY)
        || TerrainManager.isInRiver(worldX - hRadius, worldY)
        || TerrainManager.isInRiver(worldX + hRadius, worldY)) {
        continue;
      }
      houses.push(rawHouses[hi]);
    }
    return houses;
  },

  // Castle town: 通り配置（2つ or 4つ横並び、行間はキャラ通行可）
  _generateGrid: function(seed) {
    var houses = [];
    var marginX = 70;
    var marginY = 50;
    var buildingW = 70;
    var pairGap = 12;
    var groupGap = 50;

    // 3〜4行（通り）
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
    var rowCount = 3 + (seed % 2);
    var rowSpacing = (BLOCK_H - marginY * 2) / rowCount;

    for (var row = 0; row < rowCount; row++) {
      var rowY = marginY + Math.floor(rowSpacing * (row + 0.5));

      // 左端からグループを詰めていく
      var curX = marginX;
      var maxX = BLOCK_W - marginX;

      while (curX + buildingW * 2 + pairGap < maxX) {
        // 2つ組 or 4つ組
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var isQuad = (seed % 3) === 0;

        var groupW;
        if (isQuad) {
          groupW = buildingW * 4 + pairGap * 3;
        } else {
          groupW = buildingW * 2 + pairGap;
        }

        // 残りスペースに入らなければ2つ組にフォールバック
        if (curX + groupW > maxX) {
          isQuad = false;
          groupW = buildingW * 2 + pairGap;
        }
        if (curX + groupW > maxX) { break; }

        if (isQuad) {
          houses.push({ x: Math.floor(curX), y: rowY, collisionRadius: 30 });
          houses.push({ x: Math.floor(curX + buildingW + pairGap), y: rowY, collisionRadius: 30 });
          houses.push({ x: Math.floor(curX + (buildingW + pairGap) * 2), y: rowY, collisionRadius: 30 });
          houses.push({ x: Math.floor(curX + (buildingW + pairGap) * 3), y: rowY, collisionRadius: 30 });
        } else {
          houses.push({ x: Math.floor(curX), y: rowY, collisionRadius: 30 });
          houses.push({ x: Math.floor(curX + buildingW + pairGap), y: rowY, collisionRadius: 30 });
        }

        curX = curX + groupW;

        // グループ間スペース（ランダム幅）
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var extraGap = seed % 30;
        curX = curX + groupGap + extraGap;
      }
    }
    return houses;
  },

  // Village: cluster layout (small groups like a settlement)
  _generateClusters: function(seed) {
    var houses = [];
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
    var clusterCount = 2 + (seed % 2);

    for (var ci = 0; ci < clusterCount; ci++) {
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      var cx = 180 + (seed % (BLOCK_W - 360));
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      var cy = 150 + (seed % (BLOCK_H - 300));

      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      var houseCount = 3 + (seed % 3);

      for (var h = 0; h < houseCount; h++) {
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var ox = (seed % 101) - 50;
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var oy = (seed % 101) - 50;
        var hx = cx + ox;
        var hy = cy + oy;
        if (hx < 80) { hx = 80; }
        if (hx > BLOCK_W - 80) { hx = BLOCK_W - 80; }
        if (hy < 80) { hy = 80; }
        if (hy > BLOCK_H - 80) { hy = BLOCK_H - 80; }
        var overlaps = false;
        for (var oi = 0; oi < houses.length; oi++) {
          var odx = houses[oi].x - hx;
          var ody = houses[oi].y - hy;
          if (Math.sqrt(odx * odx + ody * ody) < 75) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          houses.push({ x: hx, y: hy, collisionRadius: 35 });
        }
      }
    }
    return houses;
  }
};

// ============================================================
// TerrainRenderer - オフスクリーンCanvasへの地形プリレンダリング
// ============================================================
var TerrainRenderer = {
  canvas: null,
  ctx: null,
  rendered: false,

  init: function() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = MAP_W;
    this.canvas.height = MAP_H;
    this.ctx = this.canvas.getContext("2d");
    this.rendered = false;
  },

  invalidate: function() {
    this.rendered = false;
  },

  render: function() {
    var tCtx = this.ctx;

    // Background: ground color fill
    tCtx.fillStyle = "#d8c5b4";
    tCtx.fillRect(0, 0, MAP_W, MAP_H);

    // Draw terrain blocks
    for (var bi = 0; bi < TerrainManager.blocks.length; bi++) {
      var bl = TerrainManager.blocks[bi];
      var bx = bl.x;
      var by = bl.y;

      // Tsuchi texture on non-river, non-castle terrain only
      if (bl.type !== TERRAIN_TYPES.RIVER && bl.type !== TERRAIN_TYPES.CASTLE && bl.type !== TERRAIN_TYPES.CASTLE_TOWN && spritesLoaded && spriteImages.tsuchi) {
        var tsuchiImg = spriteImages.tsuchi;
        var tileSize = 64;
        var tileCol = 0;
        for (var ttx = bx; ttx < bx + bl.w; ttx += tileSize) {
          var tileRow = 0;
          for (var tty = by; tty < by + bl.h; tty += tileSize) {
            var tileSeed = ((bl.row * 7919 + bl.col * 6271 + tileCol * 48271 + tileRow * 31547 + tileCol * tileRow * 2969) & 0x7fffffff) % 100;
            var tileWorldX = bl.x + tileCol * tileSize;
            var tileWorldY = bl.y + tileRow * tileSize;
            if (TerrainManager.isInRiver(tileWorldX, tileWorldY)) {
              tileRow++;
              continue;
            }
            if (tileSeed < 30) {
              var drawTW = Math.min(tileSize, bx + bl.w - ttx);
              var drawTH = Math.min(tileSize, by + bl.h - tty);
              tCtx.drawImage(tsuchiImg, 0, 0, SPRITE_DEFS.tsuchi.w * (drawTW / tileSize), SPRITE_DEFS.tsuchi.h * (drawTH / tileSize), ttx, tty, drawTW, drawTH);
            }
            tileRow++;
          }
          tileCol++;
        }
      }

      // Terrain-specific overlays (castle/castle_town only)
      if (bl.type === TERRAIN_TYPES.CASTLE) {
        // Cobblestone pattern for castle area
        tCtx.fillStyle = "rgba(140, 135, 125, 0.25)";
        tCtx.fillRect(bx, by, bl.w, bl.h);
        tCtx.strokeStyle = "rgba(100, 95, 85, 0.15)";
        tCtx.lineWidth = 1;
        var stoneW = 24;
        var stoneH = 16;
        for (var sy = by; sy < by + bl.h; sy += stoneH) {
          var rowIdx = Math.floor((sy - by) / stoneH);
          var offsetX = 0;
          if (rowIdx % 2 !== 0) { offsetX = stoneW / 2; }
          for (var sx = bx - stoneW + offsetX; sx < bx + bl.w; sx += stoneW) {
            tCtx.strokeRect(sx, sy, stoneW, stoneH);
          }
        }
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        // Lighter cobblestone for castle town
        tCtx.fillStyle = "rgba(150, 145, 135, 0.15)";
        tCtx.fillRect(bx, by, bl.w, bl.h);
        tCtx.strokeStyle = "rgba(120, 115, 105, 0.08)";
        tCtx.lineWidth = 1;
        var ctStoneW = 28;
        var ctStoneH = 18;
        for (var cty = by; cty < by + bl.h; cty += ctStoneH) {
          var ctRowIdx = Math.floor((cty - by) / ctStoneH);
          var ctOffsetX = 0;
          if (ctRowIdx % 2 !== 0) { ctOffsetX = ctStoneW / 2; }
          for (var ctsx = bx - ctStoneW + ctOffsetX; ctsx < bx + bl.w; ctsx += ctStoneW) {
            tCtx.strokeRect(ctsx, cty, ctStoneW, ctStoneH);
          }
        }
      }

      if (bl.type === TERRAIN_TYPES.CASTLE) {
        // Castle sprite
        if (spritesLoaded) {
          drawSpriteCentered(tCtx, "castle", bx + bl.w / 2, by + bl.h / 2, 120, false);
        } else {
          BuildingRenderer.drawCastle(tCtx, bx, by, bl.w, bl.h);
        }
        tCtx.fillStyle = "#1a1a1a";
        tCtx.textAlign = "center";
        tCtx.font = FONT.h4;
        tCtx.fillText("城", bx + bl.w / 2, by + bl.h / 2 + 70);
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        // Castle town sprites
        if (spritesLoaded) {
          var ctHouses = HouseManager.getHouses(bl.row, bl.col);
          for (var cthi = 0; cthi < ctHouses.length; cthi++) {
            var cth = ctHouses[cthi];
            drawSpriteCentered(tCtx, "house_town", bx + cth.x, by + cth.y, 85, false);
          }
        } else {
          BuildingRenderer.drawCastleTown(tCtx, bx, by, bl.w, bl.h, bi);
        }
      } else if (bl.type === TERRAIN_TYPES.VILLAGE) {
        // Village sprites
        if (spritesLoaded) {
          var vHouses = HouseManager.getHouses(bl.row, bl.col);
          for (var vhi = 0; vhi < vHouses.length; vhi++) {
            var vhItem = vHouses[vhi];
            drawSpriteCentered(tCtx, "house_villege", bx + vhItem.x, by + vhItem.y, 80, false);
          }
        } else {
          BuildingRenderer.drawVillage(tCtx, bx, by, bl.w, bl.h, bi);
        }
      }

      // Block border (subtle grid)
      tCtx.strokeStyle = "rgba(220,220,220,0.15)";
      tCtx.lineWidth = 1;
      tCtx.strokeRect(bx, by, bl.w, bl.h);
    }

    // River (vertical) - full map height
    var riverX = TerrainManager.riverX;
    var riverW = TerrainManager.riverW;
    tCtx.fillStyle = "rgba(100, 150, 210, 0.4)";
    tCtx.fillRect(riverX, 0, riverW, MAP_H);
    // River edges
    tCtx.strokeStyle = "rgba(70, 120, 180, 0.5)";
    tCtx.lineWidth = 2;
    tCtx.beginPath();
    tCtx.moveTo(riverX, 0);
    tCtx.lineTo(riverX, MAP_H);
    tCtx.moveTo(riverX + riverW, 0);
    tCtx.lineTo(riverX + riverW, MAP_H);
    tCtx.stroke();

    // Bridges (enhanced)
    for (var bri = 0; bri < TerrainManager.bridges.length; bri++) {
      var br = TerrainManager.bridges[bri];
      var brX = br.x;
      var brY = br.y;

      // Bridge shadow
      tCtx.fillStyle = "rgba(60, 40, 20, 0.15)";
      tCtx.fillRect(brX + 3, brY + 3, br.w, br.h);

      // Main bridge surface (brighter wood color)
      tCtx.fillStyle = "rgba(210, 170, 100, 0.85)";
      tCtx.fillRect(brX, brY, br.w, br.h);

      // Plank lines (horizontal boards)
      tCtx.strokeStyle = "rgba(150, 110, 60, 0.4)";
      tCtx.lineWidth = 1;
      var plankSpacing = 12;
      for (var pi = brY + plankSpacing; pi < brY + br.h; pi += plankSpacing) {
        tCtx.beginPath();
        tCtx.moveTo(brX, pi);
        tCtx.lineTo(brX + br.w, pi);
        tCtx.stroke();
      }

      // Handrails (top and bottom edges)
      tCtx.strokeStyle = "rgba(100, 60, 30, 0.8)";
      tCtx.lineWidth = 4;
      tCtx.beginPath();
      tCtx.moveTo(brX, brY);
      tCtx.lineTo(brX + br.w, brY);
      tCtx.stroke();
      tCtx.beginPath();
      tCtx.moveTo(brX, brY + br.h);
      tCtx.lineTo(brX + br.w, brY + br.h);
      tCtx.stroke();

      // Handrail posts
      tCtx.fillStyle = "rgba(80, 50, 25, 0.7)";
      var postSpacing = 30;
      for (var ppi = brX; ppi <= brX + br.w; ppi += postSpacing) {
        tCtx.fillRect(ppi - 2, brY - 6, 4, 8);
        tCtx.fillRect(ppi - 2, brY + br.h - 2, 4, 8);
      }

      // Border
      tCtx.strokeStyle = "rgba(120, 80, 40, 0.6)";
      tCtx.lineWidth = 2;
      tCtx.strokeRect(brX, brY, br.w, br.h);

      // Label
      tCtx.font = FONT.h5;
      tCtx.textAlign = "center";
      tCtx.fillStyle = "#3a2a1a";
      if (br.safe) {
        tCtx.fillText("大橋", brX + br.w / 2, brY + br.h / 2 + 3);
      } else {
        tCtx.fillText("小橋", brX + br.w / 2, brY + br.h / 2 + 3);
      }
    }

    // Trees
    if (spritesLoaded && spriteImages.ki) {
      for (var tri = 0; tri < TreeManager.trees.length; tri++) {
        var tree = TreeManager.trees[tri];
        drawSpriteCentered(tCtx, "ki", tree.x, tree.y, 70, false);
      }
    }

    this.rendered = true;
  },

  draw: function(mainCtx) {
    if (!this.rendered) {
      this.render();
    }
    mainCtx.drawImage(this.canvas, -CameraController.x, -CameraController.y);
  }
};

// ============================================================
// GameDirector
// ============================================================
var GameDirector = {
  countdownTimer: 0,
  countdownText: "",

  init: function() {
    muteBtn.style.display = "";
    var self = this;
    if (spritesLoaded) {
      self._initSystems();
      return;
    }
    // Show loading state
    gameState.phase = "loading";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = FONT.h3;
    ctx.textAlign = "center";
    ctx.fillText("読み込み中...", CANVAS_W / 2, CANVAS_H / 2);

    loadAllSprites(function() {
      self._initSystems();
    });
  },

  _boundGameLoop: null,
  _boundCountdownLoop: null,

  _initSystems: function() {
    this._boundGameLoop = this.gameLoop.bind(this);
    this._boundCountdownLoop = this.countdownLoop.bind(this);

    gameState.gameTime = 0;
    gameState.paused = false;
    gameState.phase = "countdown";
    gameState.sessionId = null;

    // セッション作成（失敗してもゲームは続行）
    ScoreboardApi.createSession(function(err, data) {
      if (err) { return; }
      gameState.sessionId = data.sessionId;
    });

    BgmController.fadeIn(1000);

    // Clear house cache for new map
    HouseManager.clear();
    TreeManager.clear();

    // Generate map
    MapGenerator.generate();

    // Generate trees after terrain is built
    TreeManager.generate();

    // Pre-render terrain to offscreen canvas
    TerrainRenderer.init();

    // Init all systems
    var startPos = MapGenerator.getPlayerStartPos();
    PlayerController.init(startPos);
    CameraController.x = startPos.x - CANVAS_W / 2;
    CameraController.y = startPos.y - CANVAS_H / 2;

    EnemyManager.init();
    CivilianManager.init();
    ParadeController.init();
    ProjectileManager.init();
    EffectRenderer.init();
    AnnouncementSystem.init();
    gameState.rankIndex = 0;
    FloatingScoreSystem.init();
    TsujigiriSystem.init();
    IkkiSystem.init();
    KobuSystem.init();
    BaishuSystem.init();
    ShoninSystem.init();
    BridgeBossSystem.init();
    GekokujoSystem.init();
    DamageVignette.init();

    // Initial spawns
    for (var i = 0; i < 5; i++) { EnemyManager.spawn(); }
    for (var j = 0; j < 15; j++) { CivilianManager.spawn(); }

    // Spawn one civilian near player so beginners discover the parade system
    var nearCivAngle = Math.random() * Math.PI * 2;
    var nearCivDist = 100 + Math.random() * 50;
    var nearCivX = startPos.x + Math.cos(nearCivAngle) * nearCivDist;
    var nearCivY = startPos.y + Math.sin(nearCivAngle) * nearCivDist;
    if (nearCivX < 50) { nearCivX = 50; }
    if (nearCivX > MAP_W - 50) { nearCivX = MAP_W - 50; }
    if (nearCivY < 50) { nearCivY = 50; }
    if (nearCivY > MAP_H - 50) { nearCivY = MAP_H - 50; }
    if (TerrainManager.isInRiver(nearCivX, nearCivY)) {
      nearCivX = startPos.x - Math.cos(nearCivAngle) * nearCivDist;
      nearCivY = startPos.y - Math.sin(nearCivAngle) * nearCivDist;
    }
    CivilianManager.civilians.push({
      x: nearCivX, y: nearCivY,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 0,
      recruitTimer: 0
    });

    // Start countdown
    this.countdownTimer = 3.5;
    this.countdownText = "3";

    gameState.lastTimestamp = performance.now();
    requestAnimationFrame(this._boundCountdownLoop);
  },

  countdownLoop: function(timestamp) {
    if (gameState.phase !== "countdown") { return; }
    var dt = (timestamp - gameState.lastTimestamp) / 1000;
    gameState.lastTimestamp = timestamp;
    if (dt > 0.1) { dt = 0.1; }

    this.countdownTimer -= dt;

    if (this.countdownTimer > 2.5) {
      this.countdownText = "3";
    } else if (this.countdownTimer > 1.5) {
      this.countdownText = "2";
    } else if (this.countdownTimer > 0.5) {
      this.countdownText = "1";
    } else if (this.countdownTimer > 0) {
      this.countdownText = "始め!";
    } else {
      gameState.phase = "playing";
      gameState.lastTimestamp = performance.now();
      requestAnimationFrame(this._boundGameLoop);
      return;
    }

    // Render scene (frozen) + countdown overlay
    this.render();

    // Draw countdown text on top
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.font = "bold 120px 'Chika', 'MokoMori', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(this.countdownText, CANVAS_W / 2, CANVAS_H / 2);
    ctx.textBaseline = "alphabetic";

    requestAnimationFrame(this._boundCountdownLoop);
  },

  showDialog: function(text, callback) {
    dialogTextEl.textContent = text;
    dialogCallback = callback;
    dialogOverlay.classList.add("active");
    gameState.paused = true;
  },

  gameLoop: function(timestamp) {
    if (gameState.phase !== "playing") { return; }
    var rawDt = (timestamp - gameState.lastTimestamp) / 1000;
    gameState.lastTimestamp = timestamp;
    if (rawDt > 0.1) { rawDt = 0.1; }

    // Update slow-mo / flash timers with real (unslowed) dt
    GekokujoSystem.updateTimers(rawDt);

    var dt = rawDt * GekokujoSystem.slowMultiplier * gameState.speedMultiplier;

    if (!gameState.paused) {
      this.update(dt);
    } else {
      // Tsujigiri QTE updates even during pause
      if (TsujigiriSystem.phase !== "idle") {
        TsujigiriSystem.update(dt);
      }
    }
    this.render();
    requestAnimationFrame(this._boundGameLoop);
  },

  update: function(dt) {
    if (!GekokujoSystem.battleActive) {
      gameState.gameTime += dt;
    }
    InputManager.updateWorldMouse();

    // Time up
    var maxTime = MAX_TIME;
    if (gameState.ikkiMode) { maxTime = 50; }
    var remaining = maxTime - gameState.gameTime;
    if (remaining <= 0 && !GekokujoSystem.battleActive) {
      this.endGame(false);
      return;
    }

    // Handle input
    if (InputManager.consumeLeftClick()) {
      CombatSystem.handleAttack();
    }
    if (InputManager.consumeRightClick()) {
      ParadeChargeSystem.start();
    }
    if (InputManager.consumeQ()) {
      if (gameState.selectedChar === "farmer" && gameState.ikkiMode) {
        IkkiSystem.tryActivate();
      }
    }

    // Update all systems
    PlayerController.update(dt);
    CameraController.follow(PlayerController.x, PlayerController.y);
    EnemyManager.update(dt);
    CivilianManager.update(dt);
    ParadeController.update(dt);
    ParadeChargeSystem.update(dt);
    IntimidationSystem.update(dt);
    ProjectileManager.update(dt);
    if (!GekokujoSystem.battleActive) {
      TsujigiriSystem.update(dt);
    }
    IkkiSystem.update(dt);
    KobuSystem.update(dt);
    BaishuSystem.update(dt);
    ShoninSystem.update(dt);
    BridgeBossSystem.update(dt);
    GekokujoSystem.update(dt);
    EffectRenderer.update(dt);
    AnnouncementSystem.update(dt);
    FloatingScoreSystem.update(dt);
    OnboardingSystem.update(dt);
    DamageVignette.update(dt);
    if (gameState.criticalTimer > 0) { gameState.criticalTimer -= dt; }
  },

  render: function() {
    // Terrain (pre-rendered offscreen canvas, 1 drawImage call)
    TerrainRenderer.draw(ctx);

    // Game entities
    CivilianManager.draw(ctx);
    ParadeController.draw(ctx);
    EnemyManager.draw(ctx);
    BridgeBossSystem.draw(ctx);
    PlayerController.draw(ctx);
    ProjectileManager.draw(ctx);
    TsujigiriSystem.draw(ctx);

    // death_cutin中は全画面白塗りの上に描画済みなので、後続の描画をすべてスキップ
    if (TsujigiriSystem.phase === "death_cutin") {
      return;
    }

    GekokujoSystem.draw(ctx);
    EffectRenderer.draw(ctx);

    // Damage vignette (screen-space overlay, before HUD)
    DamageVignette.draw(ctx);

    // === HUD (screen space) - washi panel style ===
    var maxTime = MAX_TIME;
    if (gameState.ikkiMode) { maxTime = 50; }
    var remaining = Math.max(0, Math.ceil(maxTime - gameState.gameTime));
    if (GekokujoSystem.battleActive) {
      remaining = Math.max(0, Math.ceil(GekokujoSystem.battleTimer));
    }

    // --- Timer panel (top center) ---
    var timerW = 140;
    var timerH = 100;
    var timerX = CANVAS_W / 2 - timerW / 2;
    var timerY = 8;
    var timerLabel = "のこり";
    var timerLabelColor = "#9a8a6a";
    var timerValueColor = "#3a2a1a";
    var timerBg = "rgba(245, 238, 225, 0.82)";
    var timerBorder = "rgba(160, 130, 90, 0.45)";

    if (GekokujoSystem.battleActive) {
      timerLabel = "殿様出現!";
      timerLabelColor = "#8b6914";
      timerValueColor = "#8b5e14";
      timerBg = "rgba(250, 240, 220, 0.88)";
      timerBorder = "rgba(160, 100, 40, 0.6)";
    } else if (gameState.ikkiMode && !GekokujoSystem.battleActive) {
      timerLabel = "一揆";
      timerLabelColor = "#b03020";
      timerValueColor = "#b03020";
      timerBorder = "rgba(180, 80, 60, 0.5)";
    } else if (remaining <= 10) {
      timerLabelColor = "#b07060";
      timerValueColor = "#b03020";
      timerBorder = "rgba(180, 80, 60, 0.5)";
    }

    ctx.fillStyle = timerBg;
    ctx.beginPath();
    ctx.roundRect(timerX, timerY, timerW, timerH, 12);
    ctx.fill();
    ctx.strokeStyle = timerBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(timerX, timerY, timerW, timerH, 12);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "14px " + FONT_FAMILY;
    ctx.fillStyle = timerLabelColor;
    ctx.fillText(timerLabel, CANVAS_W / 2, timerY + 26);
    ctx.font = "bold 52px " + FONT_FAMILY;
    ctx.strokeStyle = "#f5eee1";
    ctx.lineWidth = 3;
    ctx.strokeText("" + remaining, CANVAS_W / 2, timerY + 76);
    ctx.fillStyle = timerValueColor;
    ctx.fillText("" + remaining, CANVAS_W / 2, timerY + 76);

    // --- Score panel (bottom left) ---
    var scoreW = 200;
    var scoreH = 76;
    var scoreX = 10;
    var scoreY = CANVAS_H - 86;

    ctx.fillStyle = "rgba(245, 238, 225, 0.82)";
    ctx.beginPath();
    ctx.roundRect(scoreX, scoreY, scoreW, scoreH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 130, 90, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(scoreX, scoreY, scoreW, scoreH, 12);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = "14px " + FONT_FAMILY;
    ctx.fillStyle = "#9a8a6a";
    ctx.fillText("石高", scoreX + 12, scoreY + 26);
    ctx.textAlign = "right";
    ctx.font = "bold 26px " + FONT_FAMILY;
    ctx.fillStyle = "#8b6914";
    var displayKoku = Math.floor(gameState.koku);
    ctx.fillText("" + displayKoku, scoreX + scoreW - 12, scoreY + 28);

    ctx.textAlign = "left";
    ctx.font = "14px " + FONT_FAMILY;
    ctx.fillStyle = "#9a8a6a";
    ctx.fillText("身分", scoreX + 12, scoreY + 58);
    ctx.textAlign = "right";
    ctx.font = "20px " + FONT_FAMILY;
    ctx.fillStyle = "#6b4226";
    ctx.fillText(RankSystem.getCurrentName(), scoreX + scoreW - 12, scoreY + 60);

    // --- Ability bar (bottom left, next to score panel) ---
    var slotW = 86;
    var slotH = scoreH;
    var slotGap = 10;
    var showQSlot = (gameState.selectedChar === "farmer" && gameState.ikkiMode);
    var barStartX = scoreX + scoreW + 8;
    var barY = scoreY;
    var keyBadgeW = 20;
    var keyBadgeH = 14;

    // Slot 1: Charge (right click)
    var chargeReady = PlayerController.chargeCooldown <= 0;
    var chargeBorderColor = "rgba(160, 150, 130, 0.4)";
    var chargeKanjiColor = "#aaa090";
    var chargeNameColor = "#b0a090";
    if (chargeReady) {
      chargeBorderColor = "rgba(180, 140, 60, 0.7)";
      chargeKanjiColor = "#5a3a10";
      chargeNameColor = "#8a7a5a";
    }

    ctx.save();
    if (chargeReady) {
      ctx.shadowColor = "rgba(200, 160, 60, 0.25)";
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = "rgba(245, 238, 225, 0.8)";
    ctx.beginPath();
    ctx.roundRect(barStartX, barY, slotW, slotH, 14);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = chargeBorderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barStartX, barY, slotW, slotH, 14);
    ctx.stroke();

    // Label "右クリック"
    ctx.textAlign = "center";
    ctx.font = "12px " + FONT_FAMILY;
    ctx.fillStyle = chargeNameColor;
    ctx.fillText("右クリック", barStartX + slotW / 2, barY + 22);

    // Name "突撃"
    ctx.font = "bold 26px " + FONT_FAMILY;
    ctx.fillStyle = chargeKanjiColor;
    ctx.fillText("突撃", barStartX + slotW / 2, barY + 54);

    // Charge cooldown overlay
    if (!chargeReady) {
      var cdOverlayH = slotH * 0.55;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(barStartX, barY + slotH - cdOverlayH, slotW, cdOverlayH, [0, 0, 12, 12]);
      ctx.clip();
      ctx.fillStyle = "rgba(200, 190, 170, 0.7)";
      ctx.fillRect(barStartX, barY + slotH - cdOverlayH, slotW, cdOverlayH);
      ctx.restore();
      ctx.font = "bold 22px " + FONT_FAMILY;
      ctx.fillStyle = "#5a4a3a";
      ctx.textAlign = "center";
      ctx.fillText("" + Math.ceil(PlayerController.chargeCooldown), barStartX + slotW / 2, barY + slotH - cdOverlayH / 2 + 8);
    }

    // Slot 2: Q ability (ikki farmer only)
    if (showQSlot) {
      var qSlotX = barStartX + slotW + slotGap;
      var qOnCD = IkkiSystem.cooldown > 0;
      var qDisabled = ParadeController.getLength() < 1;
      var qName = "一揆";
      var qCooldownVal = IkkiSystem.cooldown;

      var qReady = !qOnCD && !qDisabled;
      var qBorderColor = "rgba(160, 150, 130, 0.4)";
      var qKanjiColor = "#aaa090";
      var qNameColor = "#b0a090";
      var qSlotAlpha = 1.0;

      if (qReady) {
        qBorderColor = "rgba(180, 80, 60, 0.6)";
        qKanjiColor = "#8b3020";
        qNameColor = "#8b3020";
      } else if (qDisabled && !qOnCD) {
        qSlotAlpha = 0.45;
      }

      ctx.save();
      ctx.globalAlpha = qSlotAlpha;
      if (qReady) {
        ctx.shadowColor = "rgba(200, 160, 60, 0.25)";
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = "rgba(245, 238, 225, 0.8)";
      ctx.beginPath();
      ctx.roundRect(qSlotX, barY, slotW, slotH, 14);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = qSlotAlpha;
      ctx.strokeStyle = qBorderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(qSlotX, barY, slotW, slotH, 14);
      ctx.stroke();

      // Q label
      ctx.textAlign = "center";
      ctx.font = "12px " + FONT_FAMILY;
      ctx.fillStyle = qNameColor;
      ctx.fillText("Qキー", qSlotX + slotW / 2, barY + 22);

      // Q name
      ctx.font = "bold 26px " + FONT_FAMILY;
      ctx.fillStyle = qKanjiColor;
      ctx.fillText(qName, qSlotX + slotW / 2, barY + 54);
      ctx.restore();

      // Q cooldown overlay
      if (qOnCD) {
        var qOverlayH = slotH * 0.55;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(qSlotX, barY + slotH - qOverlayH, slotW, qOverlayH, [0, 0, 12, 12]);
        ctx.clip();
        ctx.fillStyle = "rgba(200, 190, 170, 0.7)";
        ctx.fillRect(qSlotX, barY + slotH - qOverlayH, slotW, qOverlayH);
        ctx.restore();
        ctx.font = "bold 22px " + FONT_FAMILY;
        ctx.fillStyle = "#5a4a3a";
        ctx.textAlign = "center";
        ctx.fillText("" + Math.ceil(qCooldownVal), qSlotX + slotW / 2, barY + slotH - qOverlayH / 2 + 7);
      }
    }

    // Q ability flash effects (ikki only)
    if (IkkiSystem.flashTimer > 0) {
      var flashAlpha = IkkiSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(255,255,255," + (flashAlpha * 0.7) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Charge cutin text
    if (ParadeChargeSystem.cutinTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("突撃！！", CANVAS_W / 2, CANVAS_H / 2);
      ctx.fillStyle = "#ffcc00";
      ctx.fillText("突撃！！", CANVAS_W / 2, CANVAS_H / 2);
    }

    // Ikki cutin text
    if (IkkiSystem.cutinTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("一揆！！", CANVAS_W / 2, CANVAS_H / 2);
      ctx.fillStyle = "#ff3333";
      ctx.fillText("一揆！！", CANVAS_W / 2, CANVAS_H / 2);
    }

    // Boss charge cutin
    if (GekokujoSystem.chargeCutinTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("\u7A81\u6483\uFF01\uFF01", CANVAS_W / 2, CANVAS_H / 2);
      ctx.fillStyle = "#ffcc00";
      ctx.fillText("\u7A81\u6483\uFF01\uFF01", CANVAS_W / 2, CANVAS_H / 2);
    }

    // Boss retreat cutin
    if (GekokujoSystem.retreatCutinTimer > 0) {
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("\u9000\u5374\uFF01", CANVAS_W / 2, CANVAS_H / 2);
      ctx.fillStyle = "#9966ff";
      ctx.fillText("\u9000\u5374\uFF01", CANVAS_W / 2, CANVAS_H / 2);
    }

    // Critical hit display
    if (gameState.criticalTimer > 0) {
      var critAlpha = Math.min(1.0, gameState.criticalTimer / 0.3);
      ctx.save();
      ctx.globalAlpha = critAlpha;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(CANVAS_W / 2 - 80, CANVAS_H / 2 - 80, 160, 60);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("会心！", CANVAS_W / 2, CANVAS_H / 2 - 50);
      ctx.fillStyle = "#ffcc00";
      ctx.fillText("会心！", CANVAS_W / 2, CANVAS_H / 2 - 50);
      ctx.restore();
    }

    // Gekokujo success flash (white)
    if (GekokujoSystem.flashTimer > 0) {
      var gFlashAlpha = Math.min(1.0, GekokujoSystem.flashTimer / 0.8);
      ctx.fillStyle = "rgba(255,255,255," + gFlashAlpha + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // --- End-game countdown (last 5 seconds) ---
    var countdownMaxTime = MAX_TIME;
    if (gameState.ikkiMode) { countdownMaxTime = 50; }
    var countdownRemaining = Math.max(0, Math.ceil(countdownMaxTime - gameState.gameTime));
    if (GekokujoSystem.battleActive) {
      countdownRemaining = Math.max(0, Math.ceil(GekokujoSystem.battleTimer));
    }
    if (countdownRemaining <= 5 && countdownRemaining >= 1) {
      var cdR = 58;
      var cdG = 42;
      var cdB = 26;
      var cdAlpha = 0.75;
      if (countdownRemaining <= 1) {
        cdR = 176; cdG = 48; cdB = 32; cdAlpha = 0.9;
      } else if (countdownRemaining <= 2) {
        cdR = 150; cdG = 46; cdB = 30; cdAlpha = 0.87;
      } else if (countdownRemaining <= 3) {
        cdR = 120; cdG = 44; cdB = 28; cdAlpha = 0.85;
      } else if (countdownRemaining <= 4) {
        cdR = 90; cdG = 43; cdB = 27; cdAlpha = 0.8;
      }
      ctx.font = "bold 120px " + FONT_FAMILY;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(" + cdR + ", " + cdG + ", " + cdB + ", " + cdAlpha + ")";
      ctx.fillText("" + countdownRemaining, CANVAS_W / 2, CANVAS_H / 2 + 40);
    }

    // Castle direction arrow
    if (!GekokujoSystem.battleActive) {
      var castlePos = MapGenerator.getCastleWorldPos();
      var cdx = castlePos.x - PlayerController.x;
      var cdy = castlePos.y - PlayerController.y;
      var cDist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cDist > 300) {
        var cAngle = Math.atan2(cdy, cdx);
        var arrowX = CANVAS_W / 2 + Math.cos(cAngle) * 250;
        var arrowY = CANVAS_H / 2 + Math.sin(cAngle) * 200;
        if (arrowX < 30) { arrowX = 30; }
        if (arrowX > CANVAS_W - 30) { arrowX = CANVAS_W - 30; }
        if (arrowY < 30) { arrowY = 30; }
        if (arrowY > CANVAS_H - 50) { arrowY = CANVAS_H - 50; }
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(cAngle);
        ctx.fillStyle = "rgba(200, 60, 60, 0.7)";
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-12, -12);
        ctx.lineTo(-12, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(200, 60, 60, 0.7)";
        ctx.font = FONT.h4;
        ctx.textAlign = "center";
        ctx.fillText("城", arrowX, arrowY + 24);
      }
    }

    // Controls hint (first 5 seconds only)
    if (gameState.gameTime < 5) {
      var hintW = 240;
      var hintH = 24;
      var hintX = CANVAS_W / 2 - hintW / 2;
      var hintY = CANVAS_H - slotH - 46;
      ctx.fillStyle = "rgba(245, 238, 225, 0.82)";
      ctx.beginPath();
      ctx.roundRect(hintX, hintY, hintW, hintH, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 130, 90, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(hintX, hintY, hintW, hintH, 12);
      ctx.stroke();
      ctx.fillStyle = "#7a6a4a";
      ctx.font = "12px " + FONT_FAMILY;
      ctx.textAlign = "center";
      ctx.fillText("WASD 移動  左Click 攻撃", CANVAS_W / 2, hintY + 16);
    }

    // Floating score popups
    FloatingScoreSystem.draw(ctx);

    // Onboarding hints
    OnboardingSystem.draw(ctx);

    // Announcements
    AnnouncementSystem.draw(ctx);

    // Minimap (always on top)
    MinimapRenderer.draw(ctx);
  },

  endGame: function(gekokujoWin) {
    BgmController.fadeOut(800);
    gameState.phase = "result";
    if (gekokujoWin) {
      ResultRenderer.showGekokujoSuccess();
    } else if (PlayerController.hp <= 0) {
      // Player died - show skull screen with 下克上失敗
      skullScreen.classList.add("active");
    } else {
      ResultRenderer.showNormal();
    }
  }
};

// ============================================================
// Scene Management (UI event wiring)
// ============================================================
document.getElementById("startBtn").addEventListener("click", function() {
  var skipOnboarding = false;
  try {
    skipOnboarding = localStorage.getItem("gekokujo_skip_onboarding") === "1";
  } catch (e) {
    // localStorage unavailable
  }

  titleScreen.classList.remove("active");
  if (skipOnboarding) {
    charSelect.classList.add("active");
    gameState.phase = "charSelect";
  } else {
    onboardingScreen.classList.add("active");
    gameState.phase = "onboarding";
    OnboardingController.reset();
  }
});

// ============================================================
// OnboardingController
// ============================================================
var OnboardingController = {
  currentStep: 1,
  totalSteps: 5,

  reset: function() {
    this.currentStep = 1;
    this._renderStep(1);
  },

  goStep: function(n) {
    if (n < 1 || n > this.totalSteps) { return; }
    this.currentStep = n;
    this._renderStep(n);
  },

  _renderStep: function(n) {
    var steps = onboardingScreen.querySelectorAll(".ob-step");
    var i;
    for (i = 0; i < steps.length; i++) {
      steps[i].className = "ob-step";
    }

    var target = document.getElementById("obStep" + n);
    if (target) {
      target.className = "ob-step ob-active";
    }

    var dots = onboardingScreen.querySelectorAll(".ob-step-dot");
    for (i = 0; i < dots.length; i++) {
      if (i < n) {
        dots[i].className = "ob-step-dot ob-active";
      } else {
        dots[i].className = "ob-step-dot";
      }
    }
  },

  finish: function() {
    var skipCheckbox = document.getElementById("obSkipOnboarding");
    if (skipCheckbox && skipCheckbox.checked) {
      try {
        localStorage.setItem("gekokujo_skip_onboarding", "1");
      } catch (e) {
        // localStorage unavailable
      }
    }

    onboardingScreen.style.opacity = "0";
    onboardingScreen.style.transition = "opacity 0.4s";
    setTimeout(function() {
      onboardingScreen.classList.remove("active");
      onboardingScreen.style.opacity = "";
      onboardingScreen.style.transition = "";
      charSelect.classList.add("active");
      gameState.phase = "charSelect";
    }, 400);
  }
};

// --- Onboarding button wiring ---
document.getElementById("obNext1").addEventListener("click", function() { OnboardingController.goStep(2); });
document.getElementById("obPrev2").addEventListener("click", function() { OnboardingController.goStep(1); });
document.getElementById("obNext2").addEventListener("click", function() { OnboardingController.goStep(3); });
document.getElementById("obPrev3").addEventListener("click", function() { OnboardingController.goStep(2); });
document.getElementById("obNext3").addEventListener("click", function() { OnboardingController.goStep(4); });
document.getElementById("obPrev4").addEventListener("click", function() { OnboardingController.goStep(3); });
document.getElementById("obNext4").addEventListener("click", function() { OnboardingController.goStep(5); });
document.getElementById("obPrev5").addEventListener("click", function() { OnboardingController.goStep(4); });
document.getElementById("obStartBtn").addEventListener("click", function() { OnboardingController.finish(); });

var charCards = document.querySelectorAll(".char-card");
for (var i = 0; i < charCards.length; i++) {
  charCards[i].addEventListener("click", function() {
    var charKey = this.getAttribute("data-char");
    gameState.selectedChar = charKey;
    gameState.charDef = CHAR_DEFS[charKey];
    if (InputManager.keys.q) {
      gameState.speedMultiplier = 2;
    } else {
      gameState.speedMultiplier = 1;
    }
    charSelect.classList.remove("active");
    if (charKey === "farmer") {
      ikkiOverlay.classList.add("active");
    } else {
      gameState.ikkiMode = false;
      GameDirector.init();
    }
  });
}

document.getElementById("ikkiYes").addEventListener("click", function() {
  ikkiOverlay.classList.remove("active");
  gameState.ikkiMode = true;
  GameDirector.init();
});

document.getElementById("ikkiNo").addEventListener("click", function() {
  ikkiOverlay.classList.remove("active");
  gameState.ikkiMode = false;
  GameDirector.init();
});


document.getElementById("replayBtn").addEventListener("click", function() {
  resultScreen.classList.remove("active");
  titleScreen.classList.add("active");
  gameState.phase = "title";
  muteBtn.style.display = "none";
});

document.getElementById("skullReplayBtn").addEventListener("click", function() {
  skullScreen.classList.remove("active");
  titleScreen.classList.add("active");
  gameState.phase = "title";
  muteBtn.style.display = "none";
});

dialogYesBtn.addEventListener("click", function() {
  dialogOverlay.classList.remove("active");
  gameState.paused = false;
  if (dialogCallback) { dialogCallback(true); dialogCallback = null; }
});

dialogNoBtn.addEventListener("click", function() {
  dialogOverlay.classList.remove("active");
  gameState.paused = false;
  if (dialogCallback) { dialogCallback(false); dialogCallback = null; }
});

// --- Mute toggle ---
var muteIconOn = muteBtn.querySelector(".mute-icon-on");
var muteIconOff = muteBtn.querySelector(".mute-icon-off");

function updateMuteIcon(muted) {
  muteIconOn.style.display = muted ? "none" : "";
  muteIconOff.style.display = muted ? "" : "none";
}

muteBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  if (bgm.muted) {
    bgm.muted = false;
    localStorage.setItem("gekokujo_muted", "false");
  } else {
    bgm.muted = true;
    localStorage.setItem("gekokujo_muted", "true");
  }
  updateMuteIcon(bgm.muted);
});

if (localStorage.getItem("gekokujo_muted") === "true") {
  bgm.muted = true;
  updateMuteIcon(true);
}

// --- How to play overlay ---
howtoLink.addEventListener("click", function(e) {
  e.stopPropagation();
  howtoOverlay.classList.add("active");
});

document.getElementById("howtoCloseBtn").addEventListener("click", function() {
  howtoOverlay.classList.remove("active");
});

// --- Credits overlay ---
creditsLink.addEventListener("click", function(e) {
  e.stopPropagation();
  creditsOverlay.classList.add("active");
});

document.getElementById("creditsCloseBtn").addEventListener("click", function() {
  creditsOverlay.classList.remove("active");
});

// Init input
InputManager.init();

