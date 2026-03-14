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
  kokuPerSecond: 0,
  speedMultiplier: 1
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

  slowTimer: 0,
  slowMultiplier: 1.0,
  flashTimer: 0,
  endGamePending: false,
  gekokujoWin: false,

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
    this.slowTimer = 0;
    this.slowMultiplier = 1.0;
    this.flashTimer = 0;
    this.endGamePending = false;
    this.gekokujoWin = false;
  },

  // Called with raw (unslowed) dt from gameLoop, before dt is multiplied
  updateTimers: function(rawDt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowMultiplier = 1.0;
        if (this.endGamePending) {
          this.endGamePending = false;
          GameDirector.endGame(this.gekokujoWin);
        }
      }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= rawDt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 0;
      }
    }
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

      if (this.battleTimer <= 0) { this.retreat(); }
    }
  },

  startBattle: function() {
    this.battleActive = true;
    this.battleTimer = 20;
    EnemyManager.enemies = [];
    var rIdx = Math.min(ScoreManager.rankIndex + 2, RANKS.length - 1);
    // Parade reduces boss HP
    var hpReduction = ParadeController.getLength() * 3;
    var bossHp = Math.max(60, (120 + rIdx * 80) - hpReduction);
    this.boss = {
      x: MapGenerator.getCastleWorldPos().x,
      y: MapGenerator.getCastleWorldPos().y,
      hp: bossHp, maxHp: bossHp,
      attack: 8 + rIdx * 4,
      speed: 2.5,
      size: 52,
      attackTimer: 0
    };
    AnnouncementSystem.add("下克上チャレンジ! 殿様出現! 20秒以内に倒せ!");
  },

  success: function() {
    // Save boss position before clearing
    var bossX = this.boss.x;
    var bossY = this.boss.y;

    // Slow-motion: 2 seconds at 0.05x speed (nearly frozen)
    this.slowTimer = 2.0;
    this.slowMultiplier = 0.05;

    // Screen flash: 0.8 second white flash
    this.flashTimer = 0.8;

    // Announcement
    AnnouncementSystem.add("下克上成就!!");

    // Destroy effects at boss position (3-4 scattered)
    var destroyCount = 3 + Math.floor(Math.random() * 2);
    for (var di = 0; di < destroyCount; di++) {
      var offsetX = (Math.random() - 0.5) * 80;
      var offsetY = (Math.random() - 0.5) * 80;
      EffectRenderer.add(bossX + offsetX, bossY + offsetY, "destroy");
    }

    this.battleActive = false;
    this.boss = null;
    ScoreManager.addRaw(200 + ScoreManager.rankIndex * 100);
    ScoreManager.rankIndex = Math.min(ScoreManager.rankIndex + 2, RANKS.length - 1);
    ScoreManager.recalculate();
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
    KobuSystem.init();
    BaishuSystem.init();
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
    if (InputManager.consumeQ()) {
      if (gameState.selectedChar === "farmer") { IkkiSystem.tryActivate(); }
      else if (gameState.selectedChar === "ashigaru") { KobuSystem.tryActivate(); }
      else if (gameState.selectedChar === "merchant") { BaishuSystem.tryActivate(); }
    }

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
    if (!GekokujoSystem.battleActive) {
      TsujigiriSystem.update(dt);
    }
    IkkiSystem.update(dt);
    KobuSystem.update(dt);
    BaishuSystem.update(dt);
    ShoninSystem.update(dt);
    GekokujoSystem.update(dt);
    EffectRenderer.update(dt);
    AnnouncementSystem.update(dt);
    FloatingScoreSystem.update(dt);
    OnboardingSystem.update(dt);
  },

  render: function() {
    // Background: ground color fill (prevents tile gap artifacts)
    ctx.fillStyle = "#d8c5b4";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);



    // Draw terrain blocks
    for (var bi = 0; bi < TerrainManager.blocks.length; bi++) {
      var bl = TerrainManager.blocks[bi];
      var bsp = CameraController.worldToScreen(bl.x, bl.y);
      // Only draw if visible
      if (bsp.x + bl.w < -50 || bsp.x > CANVAS_W + 50 || bsp.y + bl.h < -50 || bsp.y > CANVAS_H + 50) { continue; }

      // Tsuchi texture on non-river, non-castle terrain only
      if (bl.type !== TERRAIN_TYPES.RIVER && bl.type !== TERRAIN_TYPES.CASTLE && bl.type !== TERRAIN_TYPES.CASTLE_TOWN && spritesLoaded && spriteImages.tsuchi) {
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

      // Terrain-specific overlays (castle/castle_town only)
      if (bl.type === TERRAIN_TYPES.CASTLE) {
        // Cobblestone pattern for castle area
        ctx.fillStyle = "rgba(140, 135, 125, 0.25)";
        ctx.fillRect(bsp.x, bsp.y, bl.w, bl.h);
        ctx.strokeStyle = "rgba(100, 95, 85, 0.15)";
        ctx.lineWidth = 1;
        var stoneW = 24;
        var stoneH = 16;
        for (var sy = bsp.y; sy < bsp.y + bl.h; sy += stoneH) {
          var rowIdx = Math.floor((sy - bsp.y) / stoneH);
          var offsetX = 0;
          if (rowIdx % 2 !== 0) { offsetX = stoneW / 2; }
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
          var ctOffsetX = 0;
          if (ctRowIdx % 2 !== 0) { ctOffsetX = ctStoneW / 2; }
          for (var ctsx = bsp.x - ctStoneW + ctOffsetX; ctsx < bsp.x + bl.w; ctsx += ctStoneW) {
            ctx.strokeRect(ctsx, cty, ctStoneW, ctStoneH);
          }
        }
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

    // === HUD (screen space) - washi panel style ===
    var remaining = Math.max(0, Math.ceil(MAX_TIME - gameState.gameTime));
    if (GekokujoSystem.battleActive) {
      remaining = Math.max(0, Math.ceil(GekokujoSystem.battleTimer));
    }

    // --- Timer panel (top center) ---
    var timerW = 90;
    var timerH = 48;
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
    ctx.font = "10px " + FONT_FAMILY;
    ctx.fillStyle = timerLabelColor;
    ctx.fillText(timerLabel, CANVAS_W / 2, timerY + 15);
    ctx.font = "bold 28px " + FONT_FAMILY;
    ctx.strokeStyle = "#f5eee1";
    ctx.lineWidth = 3;
    ctx.strokeText("" + remaining, CANVAS_W / 2, timerY + 42);
    ctx.fillStyle = timerValueColor;
    ctx.fillText("" + remaining, CANVAS_W / 2, timerY + 42);

    // --- Score panel (top left) ---
    var scoreW = 120;
    var scoreH = 48;
    var scoreX = 8;
    var scoreY = 8;

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
    ctx.font = "11px " + FONT_FAMILY;
    ctx.fillStyle = "#9a8a6a";
    ctx.fillText("石高", scoreX + 10, scoreY + 20);
    ctx.textAlign = "right";
    ctx.font = "bold 20px " + FONT_FAMILY;
    ctx.fillStyle = "#8b6914";
    ctx.fillText("" + ScoreManager.finalScore, scoreX + scoreW - 10, scoreY + 22);

    ctx.textAlign = "left";
    ctx.font = "11px " + FONT_FAMILY;
    ctx.fillStyle = "#9a8a6a";
    ctx.fillText("身分", scoreX + 10, scoreY + 40);
    ctx.textAlign = "right";
    ctx.font = "16px " + FONT_FAMILY;
    ctx.fillStyle = "#6b4226";
    ctx.fillText(RankSystem.getCurrentName(), scoreX + scoreW - 10, scoreY + 42);

    // --- Ability bar (bottom center, 2 slots) ---
    var slotW = 58;
    var slotH = 62;
    var slotGap = 10;
    var barW = 2 * slotW + slotGap;
    var barStartX = CANVAS_W / 2 - barW / 2;
    var barY = CANVAS_H - slotH - 10;
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

    // Key badge "右"
    ctx.textAlign = "center";
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(220, 210, 190, 0.55)";
    ctx.beginPath();
    ctx.roundRect(barStartX + slotW / 2 - keyBadgeW / 2, barY + 4, keyBadgeW, keyBadgeH, 4);
    ctx.fill();
    ctx.fillStyle = "#7a6a4a";
    ctx.fillText("右", barStartX + slotW / 2, barY + 14);

    // Kanji "突"
    ctx.font = "24px " + FONT_FAMILY;
    ctx.fillStyle = chargeKanjiColor;
    ctx.fillText("突", barStartX + slotW / 2, barY + 40);

    // Name "突撃"
    ctx.font = "8px " + FONT_FAMILY;
    ctx.fillStyle = chargeNameColor;
    ctx.fillText("突撃", barStartX + slotW / 2, barY + 52);

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
      ctx.font = "bold 18px " + FONT_FAMILY;
      ctx.fillStyle = "#5a4a3a";
      ctx.textAlign = "center";
      ctx.fillText("" + Math.ceil(PlayerController.chargeCooldown), barStartX + slotW / 2, barY + slotH - cdOverlayH / 2 + 7);
    }

    // Slot 2: Q ability (character-specific)
    var qSlotX = barStartX + slotW + slotGap;
    var qOnCD = false;
    var qDisabled = false;
    var qKanji = "";
    var qName = "";
    var qCooldownVal = 0;

    if (gameState.selectedChar === "farmer") {
      qKanji = "揆";
      qName = "一揆";
      qOnCD = IkkiSystem.cooldown > 0;
      qCooldownVal = IkkiSystem.cooldown;
      qDisabled = ParadeController.getLength() < 1;
    } else if (gameState.selectedChar === "ashigaru") {
      qKanji = "鼓";
      qName = "鼓舞";
      qOnCD = KobuSystem.cooldown > 0;
      qCooldownVal = KobuSystem.cooldown;
      qDisabled = false;
    } else if (gameState.selectedChar === "merchant") {
      qKanji = "買";
      qName = "買収";
      qOnCD = BaishuSystem.cooldown > 0;
      qCooldownVal = BaishuSystem.cooldown;
      qDisabled = gameState.koku < BaishuSystem.cost;
    }

    var qReady = !qOnCD && !qDisabled;
    var qBorderColor = "rgba(160, 150, 130, 0.4)";
    var qKanjiColor = "#aaa090";
    var qNameColor = "#b0a090";
    var qSlotAlpha = 1.0;

    if (qReady) {
      if (gameState.selectedChar === "farmer") {
        qBorderColor = "rgba(180, 80, 60, 0.6)";
        qKanjiColor = "#8b3020";
        qNameColor = "#8b3020";
      } else if (gameState.selectedChar === "ashigaru") {
        qBorderColor = "rgba(60, 80, 180, 0.6)";
        qKanjiColor = "#203080";
        qNameColor = "#203080";
      } else if (gameState.selectedChar === "merchant") {
        qBorderColor = "rgba(180, 100, 40, 0.6)";
        qKanjiColor = "#8b5020";
        qNameColor = "#8b5020";
      }
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

    // Q key badge
    ctx.textAlign = "center";
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(220, 210, 190, 0.55)";
    ctx.beginPath();
    ctx.roundRect(qSlotX + slotW / 2 - keyBadgeW / 2, barY + 4, keyBadgeW, keyBadgeH, 4);
    ctx.fill();
    ctx.fillStyle = "#7a6a4a";
    ctx.fillText("Q", qSlotX + slotW / 2, barY + 14);

    // Q kanji
    ctx.font = "24px " + FONT_FAMILY;
    ctx.fillStyle = qKanjiColor;
    ctx.fillText(qKanji, qSlotX + slotW / 2, barY + 40);

    // Q name
    ctx.font = "8px " + FONT_FAMILY;
    ctx.fillStyle = qNameColor;
    ctx.fillText(qName, qSlotX + slotW / 2, barY + 52);
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
      ctx.font = "bold 18px " + FONT_FAMILY;
      ctx.fillStyle = "#5a4a3a";
      ctx.textAlign = "center";
      ctx.fillText("" + Math.ceil(qCooldownVal), qSlotX + slotW / 2, barY + slotH - qOverlayH / 2 + 7);
    }

    // Q ability flash effects
    if (IkkiSystem.flashTimer > 0) {
      var flashAlpha = IkkiSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(255,255,255," + (flashAlpha * 0.7) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (KobuSystem.flashTimer > 0) {
      var jFlashAlpha = KobuSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(200,220,255," + (jFlashAlpha * 0.7) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (BaishuSystem.flashTimer > 0) {
      var dFlashAlpha = BaishuSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(255,200,200," + (dFlashAlpha * 0.5) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Gekokujo success flash (white)
    if (GekokujoSystem.flashTimer > 0) {
      var gFlashAlpha = GekokujoSystem.flashTimer / 0.3;
      ctx.fillStyle = "rgba(255,255,255," + gFlashAlpha + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // --- End-game countdown (last 5 seconds) ---
    var normalRemaining = Math.max(0, Math.ceil(MAX_TIME - gameState.gameTime));
    if (!GekokujoSystem.battleActive && normalRemaining <= 5 && normalRemaining >= 1) {
      var cdR = 58;
      var cdG = 42;
      var cdB = 26;
      var cdAlpha = 0.75;
      if (normalRemaining <= 1) {
        cdR = 176; cdG = 48; cdB = 32; cdAlpha = 0.9;
      } else if (normalRemaining <= 2) {
        cdR = 150; cdG = 46; cdB = 30; cdAlpha = 0.87;
      } else if (normalRemaining <= 3) {
        cdR = 120; cdG = 44; cdB = 28; cdAlpha = 0.85;
      } else if (normalRemaining <= 4) {
        cdR = 90; cdG = 43; cdB = 27; cdAlpha = 0.8;
      }
      ctx.font = "bold 120px " + FONT_FAMILY;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(" + cdR + ", " + cdG + ", " + cdB + ", " + cdAlpha + ")";
      ctx.fillText("" + normalRemaining, CANVAS_W / 2, CANVAS_H / 2 + 40);
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
    if (InputManager.keys.q) {
      gameState.speedMultiplier = 2;
    } else {
      gameState.speedMultiplier = 1;
    }
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

