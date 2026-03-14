// combat.js - 戦闘、辻斬り、威圧、行列突撃、行列物理・分裂の管理

// ============================================================
// ParadePhysics
// ============================================================
var ParadePhysics = {
  getSpacing: function(x, y) {
    if (TerrainManager.isOnBridge(x, y)) {
      return 4; // tight on bridge
    }
    if (TerrainManager.isInGrassland(x, y)) {
      return 12; // spread on grassland
    }
    return HISTORY_SPACING; // default
  }
};

// ============================================================
// ParadeSplitter
// ============================================================
var ParadeSplitter = {
  splitAt: function(splitIndex) {
    if (splitIndex >= ParadeController.members.length) { return; }
    var detached = ParadeController.members.splice(splitIndex);
    // Return detached as civilians
    for (var i = 0; i < detached.length; i++) {
      CivilianManager.civilians.push({
        x: detached[i].x,
        y: detached[i].y,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 0,
        recruitTimer: 0
      });
    }
    ScoreManager.recalculate();
  },

  splitByLine: function(lineX, lineY, dirX, dirY) {
    // Find the split point: which parade member is closest to the line
    var px = PlayerController.x;
    var py = PlayerController.y;
    var bestIdx = Math.floor(ParadeController.members.length / 2);

    if (TerrainManager.isOnBridge(px, py)) {
      // On bridge, split deeper (more members lost)
      bestIdx = Math.floor(ParadeController.members.length * 0.3);
    }

    if (bestIdx < 1) { bestIdx = 1; }
    this.splitAt(bestIdx);
  }
};

// ============================================================
// IntimidationSystem
// ============================================================
var IntimidationSystem = {
  checkTimer: 0,

  update: function(dt) {
    this.checkTimer += dt;
    if (this.checkTimer < 0.5) { return; }
    this.checkTimer = 0;

    var paradeLen = ParadeController.getLength();
    if (paradeLen < 4) { return; }

    for (var i = EnemyManager.enemies.length - 1; i >= 0; i--) {
      var en = EnemyManager.enemies[i];
      if (en.surrendering) { continue; }

      var dx = en.x - PlayerController.x;
      var dy = en.y - PlayerController.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 200 && paradeLen > en.grit) {
        // Surrender!
        en.surrendering = true;
        en.surrenderTimer = 1.0;
        AnnouncementSystem.add(en.name + " が行列に圧倒された!");
      }
    }
  }
};

// ============================================================
// ParadeChargeSystem
// ============================================================
var ParadeChargeSystem = {
  active: false,
  timer: 0,
  regroupTimer: 0,
  dirX: 0,
  dirY: 0,

  start: function() {
    if (ParadeController.getLength() < 3) {
      AnnouncementSystem.add("行列が短すぎる!");
      return;
    }
    if (this.active) { return; }
    if (this.regroupTimer > 0) { return; }
    if (PlayerController.chargeCooldown > 0) { return; }

    var dx = InputManager.mouseWorldX - PlayerController.x;
    var dy = InputManager.mouseWorldY - PlayerController.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { dist = 1; }
    this.dirX = dx / dist;
    this.dirY = dy / dist;
    this.active = true;
    this.timer = 1.2;
    PlayerController.chargeCooldown = 6;
    AnnouncementSystem.add("行列突撃!!");
  },

  update: function(dt) {
    if (!this.active && this.regroupTimer <= 0) { return; }

    if (this.active) {
      this.timer -= dt;
      var chargeSpeed = 5 * gameState.charDef.chargeMultiplier;
      // Move all parade members toward charge direction
      for (var i = 0; i < ParadeController.members.length; i++) {
        var m = ParadeController.members[i];
        m.x += this.dirX * chargeSpeed;
        m.y += this.dirY * chargeSpeed;

        // Check collision with enemies
        for (var j = EnemyManager.enemies.length - 1; j >= 0; j--) {
          var en = EnemyManager.enemies[j];
          if (en.surrendering) { continue; }
          var edx = m.x - en.x;
          var edy = m.y - en.y;
          if (Math.sqrt(edx * edx + edy * edy) < en.size + 10) {
            en.hp -= gameState.charDef.attack * gameState.charDef.chargeMultiplier;
            EffectRenderer.add(en.x, en.y, "hit");
            if (en.hp <= 0) {
              ScoreManager.addRaw(en.scoreValue);
              ShoninSystem.addKokuForKill(en.scoreValue);
              EffectRenderer.add(en.x, en.y, "destroy");
              EnemyManager.enemies.splice(j, 1);
            }
          }
        }
      }

      if (this.timer <= 0) {
        this.active = false;
        this.regroupTimer = 3 * (1 - gameState.charDef.regroupSpeed + 0.5);
      }
    }

    if (this.regroupTimer > 0) {
      this.regroupTimer -= dt;
      // Regroup: members move back toward their history positions
      // (handled naturally by ParadeController.update)
    }
  }
};

// ============================================================
// CombatSystem
// ============================================================
var CombatSystem = {
  handleAttack: function() {
    if (PlayerController.attackCooldown > 0) { return; }
    var def = gameState.charDef;
    var damage = PlayerController.getAttackPower();
    var dx = InputManager.mouseWorldX - PlayerController.x;
    var dy = InputManager.mouseWorldY - PlayerController.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { dist = 1; }
    var angle = Math.atan2(dy, dx);

    if (gameState.selectedChar === "ashigaru") {
      // Fan 5 projectiles (広範囲・扇状)
      for (var pi = 0; pi < 5; pi++) {
        var a = angle - 0.5 + 0.25 * pi;
        ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(a) * 8, Math.sin(a) * 8, damage, 24, 10, "#1a1a1a", false);
      }
    } else if (gameState.selectedChar === "merchant") {
      // Weak: short range single shot
      ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(angle) * 4, Math.sin(angle) * 4, damage, 15, 4, "#1a1a1a", false);
    } else {
      // Farmer: 短射程・狭範囲・単発 (blast:2, 弾速6, 寿命28)
      ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(angle) * 6, Math.sin(angle) * 6, damage, 28, 2, "#1a1a1a", false);
    }
    PlayerController.attackCooldown = 0.25;

    // Farmer: attack hits can attract civilians (30% chance)
    if (gameState.selectedChar === "farmer" && Math.random() < 0.3) {
      CivilianManager.spawn();
    }
  }
};

// ============================================================
// TsujigiriSystem
// ============================================================
var TsujigiriSystem = {
  checkTimer: 0,
  phase: "idle",
  // phases: idle -> cutin -> input -> resolve
  sequenceTimer: 0,
  inputMaxTimer: 1.0,
  inputAccepted: false,
  attackerIndex: -1,

  init: function() {
    this.checkTimer = 0;
    this.phase = "idle";
    this.sequenceTimer = 0;
    this.inputMaxTimer = 1.0;
    this.inputAccepted = false;
    this.attackerIndex = -1;
  },

  update: function(dt) {
    if (this.phase === "idle") {
      this.checkTimer += dt;
      if (this.checkTimer >= 1.0) {
        this.checkTimer = 0;
        this._tryTrigger();
      }
      return;
    }

    if (this.phase === "cutin") {
      this.sequenceTimer -= dt;
      if (this.sequenceTimer <= 0) {
        this.phase = "input";
        var qteCharMult = 1.0;
        if (gameState.selectedChar === "ashigaru") { qteCharMult = 1.3; }
        if (gameState.selectedChar === "farmer") { qteCharMult = 0.8; }
        var qteTime = 1.8 * qteCharMult * (0.7 + Math.random() * 0.6);
        this.sequenceTimer = qteTime;
        this.inputMaxTimer = qteTime;
        this.inputAccepted = false;
      }
      return;
    }

    if (this.phase === "input") {
      if (InputManager.consumeSpace()) {
        this.inputAccepted = true;
        this._resolve(true);
        return;
      }
      this.sequenceTimer -= dt;
      if (this.sequenceTimer <= 0) {
        this._resolve(false);
      }
      return;
    }

    if (this.phase === "resolve") {
      this.sequenceTimer -= dt;
      if (this.sequenceTimer <= 0) {
        this.phase = "idle";
        gameState.paused = false;
      }
      return;
    }
  },

  _terrainChanceTable: {
    ashigaru: { village: 0.5, castleTown: 0.6, mountain: 0.15, grassland: 0.08 },
    merchant: { village: 1.5, castleTown: 2.0, mountain: 0.1, grassland: 0.05 },
    farmer: { village: 0.8, castleTown: 0.8, mountain: 0.2, grassland: 0.1 }
  },

  _getTerrainChanceMultiplier: function() {
    var px = PlayerController.x;
    var py = PlayerController.y;
    if (TerrainManager.isOnBridge(px, py)) { return 0; }
    if (TerrainManager.isInRiver(px, py)) { return 0; }
    var terrain = TerrainManager.getTerrainAt(px, py);
    var charTable = this._terrainChanceTable[gameState.selectedChar] || this._terrainChanceTable.farmer;
    if (terrain === TERRAIN_TYPES.MOUNTAIN) { return charTable.mountain; }
    if (terrain === TERRAIN_TYPES.VILLAGE) { return charTable.village; }
    if (terrain === TERRAIN_TYPES.CASTLE_TOWN) { return charTable.castleTown; }
    if (terrain === TERRAIN_TYPES.GRASSLAND) { return charTable.grassland; }
    return 1.0;
  },

  _tryTrigger: function() {
    for (var i = 0; i < EnemyManager.enemies.length; i++) {
      var en = EnemyManager.enemies[i];
      if (en.surrendering) { continue; }
      if (en.name === "野盗" || en.name === "侍") {
        var chance = 0.05 * this._getTerrainChanceMultiplier();
        if (Math.random() < chance) {
          this._startCutin(i);
          return;
        }
      }
    }
  },

  _startCutin: function(enemyIndex) {
    this.attackerIndex = enemyIndex;
    this.phase = "cutin";
    this.sequenceTimer = 0.8;
    gameState.paused = true;
    ConcentrationLines.show(1800);
  },

  _resolve: function(success) {
    this.phase = "resolve";
    this.sequenceTimer = 0.3;

    if (success) {
      if (this.attackerIndex >= 0 && this.attackerIndex < EnemyManager.enemies.length) {
        var en = EnemyManager.enemies[this.attackerIndex];
        EffectRenderer.add(en.x, en.y, "destroy");
        EnemyManager.enemies.splice(this.attackerIndex, 1);
      }
      ScoreManager.addRaw(100);
      ShoninSystem.addKokuForKill(100);
    } else {
      // Failure: 50% HP damage
      var tsujiDamage = Math.floor(PlayerController.maxHp * 0.5);
      PlayerController.hp -= tsujiDamage;
      EffectRenderer.add(PlayerController.x, PlayerController.y, "playerHit");
      AnnouncementSystem.add("辻斬りを受けた! (-" + tsujiDamage + "HP)");
      if (PlayerController.hp <= 0) {
        PlayerController.hp = 0;
        gameState.paused = false;
        gameState.phase = "result";
        skullScreen.classList.add("active");
        this.phase = "idle";
        return;
      }
    }
  },

  draw: function(ctx) {
    if (this.phase === "cutin") {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (spritesLoaded) {
        drawSpriteCentered(ctx, "tsujigiri", CANVAS_W / 2, CANVAS_H / 2 - 60, 120, false);
      }
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.fillStyle = "#c03030";
      ctx.fillText("辻斬りがあらわれた！", CANVAS_W / 2, CANVAS_H / 2 + 30);
    }

    if (this.phase === "input") {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (spritesLoaded) {
        drawSpriteCentered(ctx, "tsujigiri", CANVAS_W / 2, CANVAS_H / 2 - 60, 120, false);
      }
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.fillStyle = "#c03030";
      ctx.fillText("辻斬りがあらわれた！", CANVAS_W / 2, CANVAS_H / 2 + 30);
      var blink = Math.sin(performance.now() * 0.01) > 0;
      if (blink) {
        ctx.fillStyle = "#ffffff";
        ctx.font = FONT.h2;
        ctx.fillText("SPACEで回避!", CANVAS_W / 2, CANVAS_H / 2 + 40);
      }
      var barWidth = 200 * (this.sequenceTimer / this.inputMaxTimer);
      ctx.fillStyle = "#c03030";
      ctx.fillRect(CANVAS_W / 2 - 100, CANVAS_H / 2 + 60, barWidth, 8);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(CANVAS_W / 2 - 100, CANVAS_H / 2 + 60, 200, 8);
    }

    if (this.phase === "resolve" && this.inputAccepted) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.fillStyle = "#33cc33";
      ctx.fillText("撃退成功！", CANVAS_W / 2, CANVAS_H / 2);
    }
  }
};
