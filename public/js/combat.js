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
      var distSq = dx * dx + dy * dy;

      if (distSq < 40000 && paradeLen > en.grit) {
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
  cutinTimer: 0,
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
    this.cutinTimer = 0.8;
    PlayerController.chargeCooldown = 6;
  },

  update: function(dt) {
    if (this.cutinTimer > 0) { this.cutinTimer -= dt; }
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
          var chargeThresh = en.size + 10;
          if (edx * edx + edy * edy < chargeThresh * chargeThresh) {
            en.hp -= 5;
            EffectRenderer.add(en.x, en.y, "hit");
            if (en.hp <= 0) {
              var chargeScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
              gameState.koku += Math.floor(en.scoreValue * chargeScoreMult);
              FloatingScoreSystem.show(en.scoreValue);
              RankSystem.check();
              EffectRenderer.add(en.x, en.y, "destroy");
              EnemyManager.enemies.splice(j, 1);
            }
          }
        }

        // Check collision with bridge boss（各ボスをチェック）
        for (var bbk = 0; bbk < BridgeBossSystem.bosses.length; bbk++) {
          var bbChargeBoss = BridgeBossSystem.bosses[bbk];
          if (!bbChargeBoss) { continue; }
          var bbdx = m.x - bbChargeBoss.x;
          var bbdy = m.y - bbChargeBoss.y;
          var bbChargeThresh = bbChargeBoss.size + 10;
          if (bbdx * bbdx + bbdy * bbdy < bbChargeThresh * bbChargeThresh) {
            BridgeBossSystem.takeDamageAt(bbk, 5);
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
  farmerShotToggle: false,
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
      // Merchant: 2発同時・狭角度（ダブルバレル）・長射程 (弾速5, 寿命50)
      var mSpread = 0.08;
      ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(angle - mSpread) * 5, Math.sin(angle - mSpread) * 5, damage, 50, 4, "#1a1a1a", false);
      ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(angle + mSpread) * 5, Math.sin(angle + mSpread) * 5, damage, 50, 4, "#1a1a1a", false);
    } else {
      // Farmer: 1発ずつ交互投げ（左右切替）・広角度・中射程 (弾速6, 寿命56)
      var fSpread = 0.35;
      var fDir = CombatSystem.farmerShotToggle ? 1 : -1;
      CombatSystem.farmerShotToggle = !CombatSystem.farmerShotToggle;
      ProjectileManager.add(PlayerController.x, PlayerController.y, Math.cos(angle + fSpread * fDir) * 6, Math.sin(angle + fSpread * fDir) * 6, damage, 56, 2, "#1a1a1a", false);
    }
    if (gameState.selectedChar === "farmer") {
      PlayerController.attackCooldown = 0.125;
    } else {
      PlayerController.attackCooldown = 0.25;
    }

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
  // phases: idle -> cutin -> input -> resolve / death_cutin
  sequenceTimer: 0,
  inputMaxTimer: 1.0,
  inputAccepted: false,
  attacker: null,
  needlePosition: 0,
  needleSpeed: 0,
  needleDirection: 1,
  hitZoneStart: 0,
  hitZoneEnd: 0,
  qteTimeLeft: 0,

  init: function() {
    this.checkTimer = 0;
    this.phase = "idle";
    this.sequenceTimer = 0;
    this.inputMaxTimer = 1.0;
    this.inputAccepted = false;
    this.attacker = null;
    this.needlePosition = 0;
    this.needleSpeed = 0;
    this.needleDirection = 1;
    this.hitZoneStart = 0;
    this.hitZoneEnd = 0;
    this.qteTimeLeft = 0;
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
        this.inputAccepted = false;

        // Set needle speed (2x base, bounces back and forth)
        var baseSpeed = 1.0;
        if (gameState.selectedChar === "ashigaru") { baseSpeed = 0.8; }
        if (gameState.selectedChar === "farmer") { baseSpeed = 1.2; }
        if (gameState.selectedChar === "merchant") { baseSpeed = 1.0; }
        this.needleSpeed = baseSpeed * (0.8 + Math.random() * 0.4);
        this.needleDirection = 1;

        // Set hit zone position
        this.needlePosition = 0;
        this.hitZoneStart = 0.15 + Math.random() * 0.5;
        this.hitZoneEnd = this.hitZoneStart + 0.2;
        if (this.hitZoneEnd > 0.85) {
          this.hitZoneEnd = 0.85;
          this.hitZoneStart = this.hitZoneEnd - 0.2;
        }

        // Time limit for QTE
        this.qteTimeLeft = 4.0;
      }
      return;
    }

    if (this.phase === "input") {
      this.needlePosition += this.needleSpeed * this.needleDirection * dt;

      // Bounce at edges
      if (this.needlePosition >= 1.0) {
        this.needlePosition = 1.0;
        this.needleDirection = -1;
      }
      if (this.needlePosition <= 0.0) {
        this.needlePosition = 0.0;
        this.needleDirection = 1;
      }

      if (InputManager.consumeSpace()) {
        if (this.needlePosition >= this.hitZoneStart && this.needlePosition <= this.hitZoneEnd) {
          this.inputAccepted = true;
          this._resolve(true);
        } else {
          this._resolve(false);
        }
        return;
      }

      // Time limit
      this.qteTimeLeft -= dt;
      if (this.qteTimeLeft <= 0) {
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

    if (this.phase === "death_cutin") {
      this.sequenceTimer -= dt;
      if (this.sequenceTimer <= 0) {
        gameState.paused = false;
        gameState.phase = "result";
        ResultRenderer.showNormal("辻斬りにあってしまった");
        this.phase = "idle";
      }
      return;
    }
  },

  _terrainChanceTable: {
    ashigaru: { village: 0.5, castleTown: 0.6, grassland: 0.08 },
    merchant: { village: 1.5, castleTown: 2.0, grassland: 0.05 },
    farmer: { village: 0.8, castleTown: 0.8, grassland: 0.1 }
  },

  _getTerrainChanceMultiplier: function() {
    var px = PlayerController.x;
    var py = PlayerController.y;
    if (TerrainManager.isOnBridge(px, py)) { return 0; }
    if (TerrainManager.isInRiver(px, py)) { return 0; }
    var terrain = TerrainManager.getTerrainAt(px, py);
    if (terrain === TERRAIN_TYPES.CASTLE) { return 0; }
    var charTable = this._terrainChanceTable[gameState.selectedChar];
    if (!charTable) { charTable = this._terrainChanceTable.farmer; }

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
        var chance = 0.025 * this._getTerrainChanceMultiplier();
        if (Math.random() < chance) {
          this._startCutin(i);
          return;
        }
      }
    }
  },

  _startCutin: function(enemyIndex) {
    this.attacker = EnemyManager.enemies[enemyIndex];
    this.phase = "cutin";
    this.sequenceTimer = 0.8;
    gameState.paused = true;
    ConcentrationLines.show(1800);
  },

  _resolve: function(success) {
    this.phase = "resolve";
    this.sequenceTimer = 0.3;

    if (success) {
      var idx = EnemyManager.enemies.indexOf(this.attacker);
      if (idx >= 0) {
        EffectRenderer.add(this.attacker.x, this.attacker.y, "destroy");
        EnemyManager.enemies.splice(idx, 1);
      }
      var tsujScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
      gameState.koku += Math.floor(100 * tsujScoreMult);
      FloatingScoreSystem.show(100);
      RankSystem.check();
    } else {
      // Failure: start death cutscene
      PlayerController.hp = 0;
      EffectRenderer.add(PlayerController.x, PlayerController.y, "playerHit");
      BgmController.fadeOut(500);
      this.phase = "death_cutin";
      this.sequenceTimer = 2.0;
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
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText("辻斬りがあらわれた！", CANVAS_W / 2, CANVAS_H / 2 + 30);
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
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText("辻斬りがあらわれた！", CANVAS_W / 2, CANVAS_H / 2 + 30);
      ctx.fillStyle = "#c03030";
      ctx.fillText("辻斬りがあらわれた！", CANVAS_W / 2, CANVAS_H / 2 + 30);

      // QTE gauge bar
      var barW = 300;
      var barH = 10;
      var barX = CANVAS_W / 2 - barW / 2;
      var barY = CANVAS_H / 2 + 90;

      // "SPACEで撃退!" text above the bar
      ctx.font = FONT.h3;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText("SPACEで撃退!", CANVAS_W / 2, barY - 30);

      // Bar background (dark gray)
      ctx.fillStyle = "#333333";
      ctx.fillRect(barX, barY, barW, barH);

      // Hit zone (bulging section - taller and green)
      var zoneX = barX + this.hitZoneStart * barW;
      var zoneW = (this.hitZoneEnd - this.hitZoneStart) * barW;
      var bulgeH = 24;
      var bulgeY = barY - (bulgeH - barH) / 2;
      ctx.fillStyle = "#33cc33";
      ctx.fillRect(zoneX, bulgeY, zoneW, bulgeH);

      // Bar outline
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);

      // Needle (vertical line that sweeps)
      var needleX = barX + this.needlePosition * barW;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(needleX, barY - 15);
      ctx.lineTo(needleX, barY + barH + 15);
      ctx.stroke();

      // Small triangle above needle
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(needleX - 6, barY - 18);
      ctx.lineTo(needleX + 6, barY - 18);
      ctx.lineTo(needleX, barY - 10);
      ctx.closePath();
      ctx.fill();
    }

    if (this.phase === "resolve" && this.inputAccepted) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.font = FONT.h1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText("撃退成功！", CANVAS_W / 2, CANVAS_H / 2);
      ctx.fillStyle = "#33cc33";
      ctx.fillText("撃退成功！", CANVAS_W / 2, CANVAS_H / 2);
    }

    if (this.phase === "death_cutin") {
      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      if (spritesLoaded) {
        // Draw tsujigiri_end sprite (right side)
        drawSpriteCentered(ctx, "tsujigiri_end", CANVAS_W / 2 + 60, CANVAS_H / 2 - 40, 160, false);

        // Draw fallen player character (left side, rotated 90deg CCW)
        var charKey = gameState.selectedChar;
        var spriteKey = CHAR_SPRITE_MAP[charKey];
        var pDef = SPRITE_DEFS[spriteKey];
        var pImg = spriteImages[spriteKey];
        if (pDef && pImg) {
          var pH = 100;
          var pAspect = pDef.w / pDef.h;
          var pW = pH * pAspect;
          var pX = CANVAS_W / 2 - 80;
          var pY = CANVAS_H / 2 - 20;
          var needFlip = (charKey === "farmer" || charKey === "ashigaru");
          ctx.save();
          ctx.translate(pX, pY);
          ctx.rotate(-Math.PI / 2);
          if (needFlip) {
            ctx.scale(-1, 1);
          }
          ctx.drawImage(pImg, -pW / 2, -pH / 2, pW, pH);
          ctx.restore();
        }
      }

      // Double-bordered box with inverted (concave) corners
      var bannerText = "辻斬りにあってしまった";
      ctx.font = FONT.h2;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var textWidth = ctx.measureText(bannerText).width;
      var bannerW = textWidth + 60;
      var bannerH = 56;
      var bannerX = CANVAS_W / 2 - bannerW / 2;
      var bannerY = CANVAS_H / 2 + 50;
      var r = 8;

      // Outer box with inverted corners
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bannerX + r, bannerY);
      ctx.lineTo(bannerX + bannerW - r, bannerY);
      ctx.quadraticCurveTo(bannerX + bannerW - r, bannerY + r, bannerX + bannerW, bannerY + r);
      ctx.lineTo(bannerX + bannerW, bannerY + bannerH - r);
      ctx.quadraticCurveTo(bannerX + bannerW - r, bannerY + bannerH - r, bannerX + bannerW - r, bannerY + bannerH);
      ctx.lineTo(bannerX + r, bannerY + bannerH);
      ctx.quadraticCurveTo(bannerX + r, bannerY + bannerH - r, bannerX, bannerY + bannerH - r);
      ctx.lineTo(bannerX, bannerY + r);
      ctx.quadraticCurveTo(bannerX + r, bannerY + r, bannerX + r, bannerY);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner box with inverted corners (inset)
      var inset = 5;
      var ir = r - 2;
      var ix = bannerX + inset;
      var iy = bannerY + inset;
      var iw = bannerW - inset * 2;
      var ih = bannerH - inset * 2;
      ctx.beginPath();
      ctx.moveTo(ix + ir, iy);
      ctx.lineTo(ix + iw - ir, iy);
      ctx.quadraticCurveTo(ix + iw - ir, iy + ir, ix + iw, iy + ir);
      ctx.lineTo(ix + iw, iy + ih - ir);
      ctx.quadraticCurveTo(ix + iw - ir, iy + ih - ir, ix + iw - ir, iy + ih);
      ctx.lineTo(ix + ir, iy + ih);
      ctx.quadraticCurveTo(ix + ir, iy + ih - ir, ix, iy + ih - ir);
      ctx.lineTo(ix, iy + ir);
      ctx.quadraticCurveTo(ix + ir, iy + ir, ix + ir, iy);
      ctx.closePath();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Text (vertically centered)
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(bannerText, CANVAS_W / 2, bannerY + bannerH / 2);
      ctx.textBaseline = "alphabetic";
    }
  }
};

// ============================================================
// KobuSystem (足軽専用Q: 鼓舞 - 仲間の攻撃速度UP)
// ============================================================
var KobuSystem = {
  active: false,
  timer: 0,
  duration: 5,
  cooldown: 0,
  cooldownMax: 15,
  flashTimer: 0,

  init: function() {
    this.active = false;
    this.timer = 0;
    this.cooldown = 0;
    this.flashTimer = 0;
  },

  tryActivate: function() {
    if (this.cooldown > 0) { return; }
    if (this.active) { return; }
    this.active = true;
    this.timer = this.duration;
    this.cooldown = this.cooldownMax;
    this.flashTimer = 0.3;
    AnnouncementSystem.add("鼓舞!!");
  },

  update: function(dt) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown < 0) { this.cooldown = 0; }
    }
    if (this.flashTimer > 0) { this.flashTimer -= dt; }
    if (!this.active) { return; }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
      this.timer = 0;
    }
  },

  getAttackCooldown: function() {
    return 0.7;
  }
};

// ============================================================
// BaishuSystem (商人専用Q: 買収 - 範囲内の敵を仲間化)
// ============================================================
var BaishuSystem = {
  active: false,
  timer: 0,
  duration: 5,
  cooldown: 0,
  cooldownMax: 15,
  range: 150,
  cost: 50,
  flashTimer: 0,

  init: function() {
    this.active = false;
    this.timer = 0;
    this.cooldown = 0;
    this.flashTimer = 0;
  },

  tryActivate: function() {
    if (this.cooldown > 0) { return; }
    if (this.active) { return; }
    if (gameState.koku < this.cost) { return; }
    gameState.koku -= this.cost;
    this.active = true;
    this.timer = this.duration;
    this.cooldown = this.cooldownMax;
    this.flashTimer = 0.3;
    AnnouncementSystem.add("買収!!");
  },

  update: function(dt) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown < 0) { this.cooldown = 0; }
    }
    if (this.flashTimer > 0) { this.flashTimer -= dt; }
    if (!this.active) { return; }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
      this.timer = 0;
      return;
    }
    // 範囲内の敵を仲間化
    var px = PlayerController.x;
    var py = PlayerController.y;
    var i = EnemyManager.enemies.length - 1;
    while (i >= 0) {
      var en = EnemyManager.enemies[i];
      var dx = en.x - px;
      var dy = en.y - py;
      var rangeSq = this.range * this.range;
      if (dx * dx + dy * dy <= rangeSq) {
        ParadeController.addMember(en.x, en.y);
        EnemyManager.enemies.splice(i, 1);
      }
      i--;
    }
  }
};
