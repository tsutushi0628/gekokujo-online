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
  kokuPerSecond: 0
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

  init: function() {
    this.available = (gameState.selectedChar === "farmer");
    this.active = false;
    this.cooldown = 0;
    this.flashTimer = 0;
  },

  update: function(dt) {
    if (!this.available) { return; }

    if (this.cooldown > 0) { this.cooldown -= dt; }
    if (this.flashTimer > 0) { this.flashTimer -= dt; }

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

    // Consume 10% of parade members (min 1)
    var consumeCount = Math.max(1, Math.floor(paradeLen * 0.1));
    var damageAmount = paradeLen * 8;

    // Remove consumed members from the end (loop-based)
    for (var rc = 0; rc < consumeCount; rc++) {
      if (ParadeController.members.length > 0) {
        ParadeController.members.splice(ParadeController.members.length - 1, 1);
      }
    }

    // Damage enemies within 200px radius
    var ikkiRadius = 200;
    for (var i = EnemyManager.enemies.length - 1; i >= 0; i--) {
      var en = EnemyManager.enemies[i];
      if (en.surrendering) { continue; }
      var idx = en.x - PlayerController.x;
      var idy = en.y - PlayerController.y;
      if (Math.sqrt(idx * idx + idy * idy) > ikkiRadius) { continue; }
      en.hp -= damageAmount;
      EffectRenderer.add(en.x, en.y, "hit");
      if (en.hp <= 0) {
        ScoreManager.addRaw(en.scoreValue);
        ShoninSystem.addKokuForKill(en.scoreValue);
        EffectRenderer.add(en.x, en.y, "destroy");
        EnemyManager.enemies.splice(i, 1);
      }
    }

    // Damage boss if active
    if (GekokujoSystem.boss) {
      GekokujoSystem.boss.hp -= damageAmount;
      EffectRenderer.add(GekokujoSystem.boss.x, GekokujoSystem.boss.y, "hit");
      if (GekokujoSystem.boss.hp <= 0) { GekokujoSystem.success(); }
    }

    // Flash + announcement
    this.flashTimer = 0.3;
    AnnouncementSystem.add("一揆!");
    this.cooldown = 15;
    ScoreManager.recalculate();
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

  init: function() {
    this.available = true;
    this.gateActive = false;
    this.gatePos = null;
    this.boss = null;
    this.battleActive = false;
    this.battleTimer = 0;
    this.scheduleTime = 30 + Math.random() * 20;
    this.declineCooldown = 0;
    this.declinedGatePos = null;
  },

  update: function(dt) {
    // Show gate
    if (this.available && !this.gateActive && !this.battleActive && gameState.gameTime >= this.scheduleTime) {
      var castlePos = MapGenerator.getCastleWorldPos();
      this.gatePos = { x: castlePos.x, y: castlePos.y };
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

    // Boss battle
    if (this.battleActive) {
      this.battleTimer -= dt;
      var boss = this.boss;

      // Boss AI
      var bdx = PlayerController.x - boss.x;
      var bdy = PlayerController.y - boss.y;
      var bDist = Math.sqrt(bdx * bdx + bdy * bdy);
      if (bDist > 1) {
        boss.x += (bdx / bDist) * boss.speed;
        boss.y += (bdy / bDist) * boss.speed;
      }
      if (bDist < PlayerController.size + boss.size) {
        boss.attackTimer += dt;
        if (boss.attackTimer > 1.0) {
          boss.attackTimer = 0;
          var dead = PlayerController.takeDamage(boss.attack);
          if (dead) { this.fail(); return; }
        }
      }

      if (this.battleTimer <= 0) { this.fail(); }
    }
  },

  startBattle: function() {
    this.battleActive = true;
    this.battleTimer = 15;
    EnemyManager.enemies = [];
    var rIdx = Math.min(ScoreManager.rankIndex + 2, RANKS.length - 1);
    // Parade reduces boss HP
    var hpReduction = ParadeController.getLength() * 3;
    var bossHp = Math.max(30, 60 + rIdx * 40 - hpReduction);
    this.boss = {
      x: MapGenerator.getCastleWorldPos().x,
      y: MapGenerator.getCastleWorldPos().y,
      hp: bossHp, maxHp: bossHp,
      attack: 8 + rIdx * 4,
      speed: 2.5,
      size: 52,
      attackTimer: 0
    };
    AnnouncementSystem.add("下克上チャレンジ! 15秒で城主を倒せ!");
  },

  success: function() {
    this.battleActive = false;
    this.boss = null;
    ScoreManager.addRaw(200 + ScoreManager.rankIndex * 100);
    ScoreManager.rankIndex = Math.min(ScoreManager.rankIndex + 2, RANKS.length - 1);
    ScoreManager.recalculate();
    GameDirector.endGame(true);
  },

  fail: function() {
    this.battleActive = false;
    this.boss = null;
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

    // Boss
    if (this.boss) {
      var bsp = CameraController.worldToScreen(this.boss.x, this.boss.y);
      if (spritesLoaded) {
        var bossFlipH = (this.boss.x < PlayerController.x);
        drawSpriteCentered(ctx, "tonosama", bsp.x, bsp.y, 140, bossFlipH);
      } else {
        ctx.font = FONT.iconLarge;
        ctx.textAlign = "center";
        ctx.fillText("\uD83C\uDFEF", bsp.x, bsp.y + 15);
      }
      ctx.fillStyle = "#ddd";
      ctx.fillRect(bsp.x - 30, bsp.y - 40, 60, 6);
      ctx.fillStyle = "#c44";
      ctx.fillRect(bsp.x - 30, bsp.y - 40, 60 * (this.boss.hp / this.boss.maxHp), 6);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = FONT.h4;
      ctx.textAlign = "center";
      ctx.fillText("城主", bsp.x, bsp.y - 45);
    }
  }
};

// ============================================================
// RankSystem
// ============================================================
var RankSystem = {
  check: function() {
    for (var i = RANKS.length - 1; i >= 0; i--) {
      if (ScoreManager.rawScore >= RANKS[i].threshold) {
        if (i > ScoreManager.rankIndex) {
          ScoreManager.rankIndex = i;
          AnnouncementSystem.add("身分上昇! " + RANKS[i].name + "になった!");
          ScoreManager.recalculate();
        }
        break;
      }
    }
  },

  getCurrentName: function() {
    return RANKS[ScoreManager.rankIndex].name;
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
    for (var hi = 0; hi < rawHouses.length; hi++) {
      var worldX = bl.x + rawHouses[hi].x;
      var worldY = bl.y + rawHouses[hi].y;
      if (TerrainManager.isInRiver(worldX, worldY)) {
        continue;
      }
      houses.push(rawHouses[hi]);
    }
    return houses;
  },

  // Castle town: grid layout (streets like a castle town)
  _generateGrid: function(seed) {
    var houses = [];
    var cols = 4;
    var rows = 3;
    var marginX = 120;
    var marginY = 100;
    var spacingX = (BLOCK_W - marginX * 2) / (cols - 1);
    var spacingY = (BLOCK_H - marginY * 2) / (rows - 1);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var jx = (seed % 21) - 10;
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var jy = (seed % 21) - 10;
        var hx = Math.floor(marginX + c * spacingX + jx);
        var hy = Math.floor(marginY + r * spacingY + jy);
        houses.push({ x: hx, y: hy, collisionRadius: 35 });
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
      var houseCount = 2 + (seed % 3);

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
// GameDirector
// ============================================================
var GameDirector = {
  countdownTimer: 0,
  countdownText: "",

  init: function() {
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

  _initSystems: function() {
    gameState.gameTime = 0;
    gameState.paused = false;
    gameState.phase = "countdown";

    // Clear house cache for new map
    HouseManager.clear();
    TreeManager.clear();

    // Generate map
    MapGenerator.generate();

    // Generate trees after terrain is built
    TreeManager.generate();

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
    ScoreManager.init();
    TsujigiriSystem.init();
    IkkiSystem.init();
    ShoninSystem.init();
    GekokujoSystem.init();

    // Initial spawns
    for (var i = 0; i < 5; i++) { EnemyManager.spawn(); }
    for (var j = 0; j < 15; j++) { CivilianManager.spawn(); }

    // Start countdown
    this.countdownTimer = 3.5;
    this.countdownText = "3";

    gameState.lastTimestamp = performance.now();
    requestAnimationFrame(this.countdownLoop.bind(this));
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
      requestAnimationFrame(this.gameLoop.bind(this));
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

    requestAnimationFrame(this.countdownLoop.bind(this));
  },

  showDialog: function(text, callback) {
    dialogTextEl.textContent = text;
    dialogCallback = callback;
    dialogOverlay.classList.add("active");
    gameState.paused = true;
  },

  gameLoop: function(timestamp) {
    if (gameState.phase !== "playing") { return; }
    var dt = (timestamp - gameState.lastTimestamp) / 1000;
    gameState.lastTimestamp = timestamp;
    if (dt > 0.1) { dt = 0.1; }

    if (!gameState.paused) {
      this.update(dt);
    } else {
      // Tsujigiri QTE updates even during pause
      if (TsujigiriSystem.phase !== "idle") {
        TsujigiriSystem.update(dt);
      }
    }
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  },

  update: function(dt) {
    gameState.gameTime += dt;
    InputManager.updateWorldMouse();

    // Time up
    var remaining = MAX_TIME - gameState.gameTime;
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
    if (InputManager.consumeQ()) { IkkiSystem.tryActivate(); }

    // Update all systems
    PlayerController.update(dt);
    CameraController.follow(PlayerController.x, PlayerController.y);
    EnemyManager.update(dt);
    CivilianManager.update(dt);
    if (!ParadeChargeSystem.active) {
      ParadeController.update(dt);
    }
    ParadeChargeSystem.update(dt);
    IntimidationSystem.update(dt);
    ProjectileManager.update(dt);
    TsujigiriSystem.update(dt);
    IkkiSystem.update(dt);
    ShoninSystem.update(dt);
    GekokujoSystem.update(dt);
    EffectRenderer.update(dt);
    AnnouncementSystem.update(dt);
  },

  render: function() {
    // Background: ground color fill (prevents tile gap artifacts)
    ctx.fillStyle = "#d4bdb3";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Washi texture
    ctx.fillStyle = "rgba(200,200,200,0.2)";
    var startX = -(CameraController.x % 20);
    var startY = -(CameraController.y % 20);
    for (var wx = startX; wx < CANVAS_W; wx += 20) {
      for (var wy = startY; wy < CANVAS_H; wy += 20) {
        var worldWx = wx + CameraController.x;
        var worldWy = wy + CameraController.y;
        if (Math.sin(worldWx * 0.7 + worldWy * 1.3) > 0.5) {
          ctx.fillRect(wx, wy, 2, 2);
        }
      }
    }

    // Draw terrain blocks
    for (var bi = 0; bi < TerrainManager.blocks.length; bi++) {
      var bl = TerrainManager.blocks[bi];
      var bsp = CameraController.worldToScreen(bl.x, bl.y);
      // Only draw if visible
      if (bsp.x + bl.w < -50 || bsp.x > CANVAS_W + 50 || bsp.y + bl.h < -50 || bsp.y > CANVAS_H + 50) { continue; }

      // Tsuchi texture on all non-river terrain
      if (bl.type !== TERRAIN_TYPES.RIVER && spritesLoaded && spriteImages.tsuchi) {
        var tsuchiImg = spriteImages.tsuchi;
        var tileSize = 64;
        var tsStartX = bsp.x;
        var tsStartY = bsp.y;
        var tileCol = 0;
        for (var ttx = tsStartX; ttx < tsStartX + bl.w; ttx += tileSize) {
          var tileRow = 0;
          for (var tty = tsStartY; tty < tsStartY + bl.h; tty += tileSize) {
            var tileSeed = ((bl.row * 7919 + bl.col * 6271 + tileCol * 48271 + tileRow * 31547 + tileCol * tileRow * 2969) & 0x7fffffff) % 100;
            var tileWorldX = bl.x + tileCol * tileSize;
            var tileWorldY = bl.y + tileRow * tileSize;
            if (TerrainManager.isInRiver(tileWorldX, tileWorldY)) {
              tileRow++;
              continue;
            }
            if (tileSeed < 30) {
              var drawTW = Math.min(tileSize, tsStartX + bl.w - ttx);
              var drawTH = Math.min(tileSize, tsStartY + bl.h - tty);
              ctx.drawImage(tsuchiImg, 0, 0, SPRITE_DEFS.tsuchi.w * (drawTW / tileSize), SPRITE_DEFS.tsuchi.h * (drawTH / tileSize), ttx, tty, drawTW, drawTH);
            }
            tileRow++;
          }
          tileCol++;
        }
      }

      // Terrain-specific overlays
      if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        ctx.fillStyle = "rgba(120, 180, 80, 0.2)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
      } else if (bl.type === TERRAIN_TYPES.VILLAGE) {
        ctx.fillStyle = "rgba(120, 180, 80, 0.12)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
      } else if (bl.type === TERRAIN_TYPES.CASTLE) {
        // Cobblestone pattern for castle area
        ctx.fillStyle = "rgba(140, 135, 125, 0.25)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
        ctx.strokeStyle = "rgba(100, 95, 85, 0.15)";
        ctx.lineWidth = 1;
        var stoneW = 24;
        var stoneH = 16;
        for (var sy = bsp.y; sy < bsp.y + bl.h; sy += stoneH) {
          var rowIdx = Math.floor((sy - bsp.y) / stoneH);
          var offsetX = (rowIdx % 2 === 0) ? 0 : stoneW / 2;
          for (var sx = bsp.x - stoneW + offsetX; sx < bsp.x + bl.w; sx += stoneW) {
            ctx.strokeRect(sx, sy, stoneW, stoneH);
          }
        }
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        // Lighter cobblestone for castle town
        ctx.fillStyle = "rgba(150, 145, 135, 0.15)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
        ctx.strokeStyle = "rgba(120, 115, 105, 0.08)";
        ctx.lineWidth = 1;
        var ctStoneW = 28;
        var ctStoneH = 18;
        for (var cty = bsp.y; cty < bsp.y + bl.h; cty += ctStoneH) {
          var ctRowIdx = Math.floor((cty - bsp.y) / ctStoneH);
          var ctOffsetX = (ctRowIdx % 2 === 0) ? 0 : ctStoneW / 2;
          for (var ctsx = bsp.x - ctStoneW + ctOffsetX; ctsx < bsp.x + bl.w; ctsx += ctStoneW) {
            ctx.strokeRect(ctsx, cty, ctStoneW, ctStoneH);
          }
        }
      } else if (bl.type === TERRAIN_TYPES.MOUNTAIN) {
        ctx.fillStyle = "rgba(140, 130, 100, 0.15)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
      }

      if (bl.type === TERRAIN_TYPES.CASTLE) {
        // Castle sprite
        if (spritesLoaded) {
          drawSpriteCentered(ctx, "castle", bsp.x + bl.w / 2, bsp.y + bl.h / 2, 120, false);
        } else {
          BuildingRenderer.drawCastle(ctx, bsp.x, bsp.y, bl.w, bl.h);
        }
        ctx.fillStyle = "#1a1a1a";
        ctx.textAlign = "center";
        ctx.font = FONT.h4;
        ctx.fillText("城", bsp.x + bl.w / 2, bsp.y + bl.h / 2 + 70);
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        // Castle town sprites
        if (spritesLoaded) {
          var ctHouses = HouseManager.getHouses(bl.row, bl.col);
          for (var cthi = 0; cthi < ctHouses.length; cthi++) {
            var cth = ctHouses[cthi];
            drawSpriteCentered(ctx, "house_town", bsp.x + cth.x, bsp.y + cth.y, 85, false);
          }
        } else {
          BuildingRenderer.drawCastleTown(ctx, bsp.x, bsp.y, bl.w, bl.h, bi);
        }
      } else if (bl.type === TERRAIN_TYPES.MOUNTAIN) {
        ctx.font = FONT.h3;
        ctx.textAlign = "center";
        ctx.fillStyle = "#1a1a1a";
        ctx.fillText("\u26F0\uFE0F", bsp.x + bl.w / 2, bsp.y + bl.h / 2 + 8);
        ctx.font = FONT.h4;
        ctx.fillText("山道", bsp.x + bl.w / 2, bsp.y + bl.h / 2 + 28);
      } else if (bl.type === TERRAIN_TYPES.VILLAGE) {
        // Village sprites
        if (spritesLoaded) {
          var vHouses = HouseManager.getHouses(bl.row, bl.col);
          for (var vhi = 0; vhi < vHouses.length; vhi++) {
            var vhItem = vHouses[vhi];
            drawSpriteCentered(ctx, "house_villege", bsp.x + vhItem.x, bsp.y + vhItem.y, 80, false);
          }
        } else {
          BuildingRenderer.drawVillage(ctx, bsp.x, bsp.y, bl.w, bl.h, bi);
        }
      }

      // Block border (subtle grid)
      ctx.strokeStyle = "rgba(220,220,220,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bsp.x, bsp.y, bl.w, bl.h);
    }

    // River (vertical)
    var riverSp = CameraController.worldToScreen(TerrainManager.riverX, 0);
    if (riverSp.x + TerrainManager.riverW > 0 && riverSp.x < CANVAS_W) {
      ctx.fillStyle = "rgba(100, 150, 210, 0.4)";
      ctx.fillRect(riverSp.x, 0, TerrainManager.riverW, CANVAS_H);
      // River edges
      ctx.strokeStyle = "rgba(70, 120, 180, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(riverSp.x, 0);
      ctx.lineTo(riverSp.x, CANVAS_H);
      ctx.moveTo(riverSp.x + TerrainManager.riverW, 0);
      ctx.lineTo(riverSp.x + TerrainManager.riverW, CANVAS_H);
      ctx.stroke();
    }

    // Bridges (enhanced)
    for (var bri = 0; bri < TerrainManager.bridges.length; bri++) {
      var br = TerrainManager.bridges[bri];
      var brSp = CameraController.worldToScreen(br.x, br.y);
      if (brSp.x + br.w < 0 || brSp.x > CANVAS_W || brSp.y + br.h < 0 || brSp.y > CANVAS_H) { continue; }

      // Bridge shadow
      ctx.fillStyle = "rgba(60, 40, 20, 0.15)";
      ctx.fillRect(brSp.x + 3, brSp.y + 3, br.w, br.h);

      // Main bridge surface (brighter wood color)
      ctx.fillStyle = "rgba(210, 170, 100, 0.85)";
      ctx.fillRect(brSp.x, brSp.y, br.w, br.h);

      // Plank lines (horizontal boards)
      ctx.strokeStyle = "rgba(150, 110, 60, 0.4)";
      ctx.lineWidth = 1;
      var plankSpacing = 12;
      for (var pi = brSp.y + plankSpacing; pi < brSp.y + br.h; pi += plankSpacing) {
        ctx.beginPath();
        ctx.moveTo(brSp.x, pi);
        ctx.lineTo(brSp.x + br.w, pi);
        ctx.stroke();
      }

      // Handrails (top and bottom edges)
      ctx.strokeStyle = "rgba(100, 60, 30, 0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(brSp.x, brSp.y);
      ctx.lineTo(brSp.x + br.w, brSp.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(brSp.x, brSp.y + br.h);
      ctx.lineTo(brSp.x + br.w, brSp.y + br.h);
      ctx.stroke();

      // Handrail posts
      ctx.fillStyle = "rgba(80, 50, 25, 0.7)";
      var postSpacing = 30;
      for (var ppi = brSp.x; ppi <= brSp.x + br.w; ppi += postSpacing) {
        ctx.fillRect(ppi - 2, brSp.y - 6, 4, 8);
        ctx.fillRect(ppi - 2, brSp.y + br.h - 2, 4, 8);
      }

      // Border
      ctx.strokeStyle = "rgba(120, 80, 40, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(brSp.x, brSp.y, br.w, br.h);

      // Label
      ctx.font = FONT.h5;
      ctx.textAlign = "center";
      ctx.fillStyle = "#3a2a1a";
      if (br.safe) {
        ctx.fillText("大橋", brSp.x + br.w / 2, brSp.y + br.h / 2 + 3);
      } else {
        ctx.fillText("小橋", brSp.x + br.w / 2, brSp.y + br.h / 2 + 3);
      }
    }

    // Trees
    if (spritesLoaded && spriteImages.ki) {
      for (var tri = 0; tri < TreeManager.trees.length; tri++) {
        var tree = TreeManager.trees[tri];
        if (!CameraController.isVisible(tree.x, tree.y, 50)) { continue; }
        var treeSp = CameraController.worldToScreen(tree.x, tree.y);
        drawSpriteCentered(ctx, "ki", treeSp.x, treeSp.y, 70, false);
      }
    }

    // Game entities
    CivilianManager.draw(ctx);
    ParadeController.draw(ctx);
    EnemyManager.draw(ctx);
    PlayerController.draw(ctx);
    ProjectileManager.draw(ctx);
    TsujigiriSystem.draw(ctx);
    GekokujoSystem.draw(ctx);
    EffectRenderer.draw(ctx);

    // === HUD (screen space) ===
    ctx.textAlign = "left";
    var remaining = Math.max(0, Math.ceil(MAX_TIME - gameState.gameTime));
    if (GekokujoSystem.battleActive) { remaining = Math.max(0, Math.ceil(GekokujoSystem.battleTimer)); }
    if (remaining <= 10) { ctx.fillStyle = "#c03030"; }
    else { ctx.fillStyle = "#1a1a1a"; }
    ctx.font = FONT.h2;
    ctx.fillText("残り " + remaining + "秒", 20, 35);

    if (GekokujoSystem.battleActive) {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = FONT.h3;
      ctx.fillText("下克上チャレンジ!", 20, 58);
    }

    ctx.fillStyle = "#1a1a1a";
    ctx.font = FONT.h3;
    ctx.textAlign = "right";
    ctx.fillText("石高: " + ScoreManager.finalScore, MINIMAP_X - 10, 30);
    ctx.fillStyle = "#2a2a2a";
    ctx.font = FONT.h4;
    ctx.fillText("身分: " + RankSystem.getCurrentName(), MINIMAP_X - 10, 52);
    ctx.fillText("民衆: " + ParadeController.getLength() + "人", MINIMAP_X - 10, 72);
    ctx.fillText(gameState.charDef.name + " " + gameState.charDef.emoji, MINIMAP_X - 10, 92);

    // Charge indicator
    ctx.textAlign = "left";
    if (PlayerController.chargeCooldown > 0) {
      ctx.fillStyle = "#aaa";
      ctx.font = FONT.h5;
      ctx.fillText("突撃 [右クリック] " + Math.ceil(PlayerController.chargeCooldown) + "秒", 20, CANVAS_H - 30);
    } else {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = FONT.h5;
      ctx.fillText("突撃 [右クリック] 準備完了", 20, CANVAS_H - 30);
    }

    // Ikki flash effect
    if (IkkiSystem.flashTimer > 0) {
      var flashAlpha = IkkiSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(255,255,255," + (flashAlpha * 0.7) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Ikki HUD (farmer only)
    if (IkkiSystem.available) {
      ctx.textAlign = "left";
      if (IkkiSystem.cooldown > 0) {
        ctx.fillStyle = "#aaa";
        ctx.font = FONT.h5;
        ctx.fillText("一揆 [Q] " + Math.ceil(IkkiSystem.cooldown) + "秒", 20, CANVAS_H - 45);
      } else if (ParadeController.getLength() < 1) {
        ctx.fillStyle = "#aaa";
        ctx.font = FONT.h5;
        ctx.fillText("一揆 [Q] 仲間1人必要", 20, CANVAS_H - 45);
      } else {
        ctx.fillStyle = "#c03030";
        ctx.font = FONT.h5;
        ctx.fillText("一揆 [Q] 準備完了!", 20, CANVAS_H - 45);
      }
    }

    // Merchant koku display
    if (gameState.selectedChar === "merchant") {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = FONT.h5;
      ctx.textAlign = "left";
      var kokuText = "石高: " + Math.floor(gameState.koku);
      if (ShoninSystem.currentTerrainLabel) {
        kokuText += " (" + ShoninSystem.currentTerrainLabel + ")";
      }
      ctx.fillText(kokuText, 20, CANVAS_H - 60);
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
        // Clamp to screen
        if (arrowX < 30) { arrowX = 30; }
        if (arrowX > CANVAS_W - 30) { arrowX = CANVAS_W - 30; }
        if (arrowY < 30) { arrowY = 30; }
        if (arrowY > CANVAS_H - 50) { arrowY = CANVAS_H - 50; }
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(cAngle);
        ctx.fillStyle = "rgba(200, 60, 60, 0.4)";
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-8, -8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(200, 60, 60, 0.4)";
        ctx.font = FONT.h5;
        ctx.textAlign = "center";
        ctx.fillText("城", arrowX, arrowY + 18);
      }
    }

    // Controls hint
    if (gameState.gameTime < 5) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.font = FONT.h4;
      ctx.textAlign = "center";
      var controlsText = "WASD:移動  左クリック:攻撃  右クリック:行列突撃  SPACE:辻斬り返し";
      if (gameState.selectedChar === "farmer") {
        controlsText += "  Q:一揆";
      }
      ctx.fillText(controlsText, CANVAS_W / 2, CANVAS_H - 55);
    }

    // Announcements
    AnnouncementSystem.draw(ctx);

    // Minimap (always on top)
    MinimapRenderer.draw(ctx);
  },

  endGame: function(gekokujoWin) {
    gameState.phase = "result";
    ScoreManager.recalculate();
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
  titleScreen.classList.remove("active");
  charSelect.classList.add("active");
  gameState.phase = "charSelect";
});

var charCards = document.querySelectorAll(".char-card");
for (var i = 0; i < charCards.length; i++) {
  charCards[i].addEventListener("click", function() {
    var charKey = this.getAttribute("data-char");
    gameState.selectedChar = charKey;
    gameState.charDef = CHAR_DEFS[charKey];
    charSelect.classList.remove("active");
    GameDirector.init();
  });
}

document.getElementById("replayBtn").addEventListener("click", function() {
  resultScreen.classList.remove("active");
  titleScreen.classList.add("active");
  gameState.phase = "title";
});

document.getElementById("skullReplayBtn").addEventListener("click", function() {
  skullScreen.classList.remove("active");
  titleScreen.classList.add("active");
  gameState.phase = "title";
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

// Init input
InputManager.init();

