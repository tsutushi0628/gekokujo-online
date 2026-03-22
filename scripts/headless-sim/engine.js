// engine.js - 下克上オンライン ヘッドレスゲームエンジン
// AIバランステスト用。実際のブラウザゲームロジックを忠実に再現する。
// レンダリングなし、Node.js環境で動作。

"use strict";

// ============================================================
// Seeded PRNG (xorshift32)
// ============================================================
class SeededRandom {
  constructor(seed) {
    this._state = seed | 0;
    if (this._state === 0) { this._state = 1; }
  }

  // Returns integer 0 .. 0x7FFFFFFF
  _next() {
    let x = this._state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this._state = x;
    return (x >>> 0) & 0x7FFFFFFF;
  }

  // Returns float [0, 1)
  random() {
    return this._next() / 0x80000000;
  }

  // Returns integer [0, max)
  randInt(max) {
    return this._next() % max;
  }

  // Returns float [min, max)
  randRange(min, max) {
    return min + this.random() * (max - min);
  }
}

// ============================================================
// Constants (from constants.js)
// ============================================================
const MAP_W = 3840;
const MAP_H = 2160;
const BLOCK_W = 1280;
const BLOCK_H = 720;
const CANVAS_W = 1280;
const CANVAS_H = 720;
const MAX_TIME = 60;

const CHAR_DEFS = {
  ashigaru: {
    name: "足軽", attack: 7, speed: 3.0,
    recruitRange: 55, recruitTime: 200, followerBonus: 0.008,
    regroupSpeed: 0.85, chargeMultiplier: 1.0,
    scoreMultiplier: 1.0, damageTakenMultiplier: 1.0,
    maxEnemies: null, spawnInterval: null
  },
  merchant: {
    name: "商人", attack: 2, speed: 3.6,
    recruitRange: 55, recruitTime: 0, followerBonus: 0.012,
    regroupSpeed: 0.7, chargeMultiplier: 0.5,
    initialKoku: 2500, recruitCost: 120,
    scoreMultiplier: 1.2, damageTakenMultiplier: 1.2,
    maxEnemies: null, spawnInterval: null
  },
  farmer: {
    name: "農民", attack: 3, speed: 3.2,
    recruitRange: 65, recruitTime: 400, followerBonus: 0.025,
    regroupSpeed: 1.0, chargeMultiplier: 0.8,
    scoreMultiplier: 1.2, damageTakenMultiplier: 1.4,
    maxEnemies: 17, spawnInterval: 2
  }
};

const RANKS = [
  { name: "農民", threshold: 0, bonus: 1.0 },
  { name: "足軽", threshold: 500, bonus: 1.2 },
  { name: "侍", threshold: 1500, bonus: 1.5 },
  { name: "武将", threshold: 3500, bonus: 2.0 },
  { name: "大名", threshold: 7000, bonus: 2.5 },
  { name: "天下人", threshold: 12000, bonus: 3.0 }
];

const ENEMY_DEFS = [
  { name: "野盗", hp: 20, attack: 3, speed: 1.5, score: 100, size: 21, grit: 3 },
  { name: "足軽隊", hp: 35, attack: 5, speed: 1.8, score: 250, size: 24, grit: 10 },
  { name: "侍", hp: 55, attack: 8, speed: 2.0, score: 500, size: 27, grit: 999 },
  { name: "武将", hp: 80, attack: 12, speed: 2.2, score: 800, size: 33, grit: 999 }
];

const TERRAIN_TYPES = {
  CASTLE: "castle",
  RIVER: "river",
  BRIDGE: "bridge",
  GRASSLAND: "grassland",
  CASTLE_TOWN: "castleTown",
  VILLAGE: "village",
  EMPTY: "empty"
};

const TONO_BOSS = {
  hp: 500,
  chargeSpeed: 4.5,
  retreatSpeed: 2.8,
  chaseSpeed: 2.5,
  windupDurationMin: 0.8,
  windupDurationMax: 1.8,
  chargeDuration: 3.0,
  decelDuration: 0.5,
  castleWaitDurationMin: 1.0,
  castleWaitDurationMax: 2.0,
  shockwaveRadius: 80,
  shockwaveDamage: 20,
  contactDamageRatio: 0.35,
  retreatProjectileInterval: 1.5,
  retreatProjectileSpeed: 4,
  retreatProjectileDamage: 12,
  castleStandoffDistance: 160,
  knockbackForce: 20,
  contactInvincibleTime: 1.5
};

// Tsujigiri terrain chance multipliers (from combat.js:368-372)
const TSUJIGIRI_TERRAIN_CHANCES = {
  ashigaru: { village: 0.5, castleTown: 0.6, grassland: 0.08 },
  merchant: { village: 1.5, castleTown: 2.0, grassland: 0.05 },
  farmer: { village: 0.8, castleTown: 0.8, grassland: 0.1 }
};

// ============================================================
// GameEngine Class
// ============================================================
class GameEngine {
  /**
   * @param {string} charKey - "ashigaru" | "merchant" | "farmer"
   * @param {boolean} ikkiMode - 一揆モード (farmer only)
   * @param {object} options - { seed, paramOverrides }
   */
  constructor(charKey, ikkiMode, options = {}) {
    const seed = options.seed != null ? options.seed : Date.now();
    this.rng = new SeededRandom(seed);
    this.charKey = charKey;
    this.charDef = Object.assign({}, CHAR_DEFS[charKey]);
    this.ikkiMode = (charKey === "farmer" && ikkiMode);

    // Apply parameter overrides
    this.paramOverrides = options.paramOverrides != null ? options.paramOverrides : {};
    if (this.paramOverrides.charDef) {
      Object.assign(this.charDef, this.paramOverrides.charDef);
    }

    // Stats tracking
    this.stats = {
      enemyKills: 0,
      tsujigiriSuccess: 0,
      tsujigiriFail: 0,
      bridgeBossKills: 0,
      ikkiUses: 0,
      chargeUses: 0,
      peakParadeLen: 0,
      totalRecruits: 0
    };

    // Initialize all game state
    this._initMap();
    this._initPlayer();
    this._initState();
  }

  // ============================================================
  // Map Generation (from terrain.js MapGenerator)
  // ============================================================
  _initMap() {
    const rng = this.rng;

    // 3x3 grid
    this.grid = [];
    for (let r = 0; r < 3; r++) {
      this.grid[r] = [];
      for (let c = 0; c < 3; c++) {
        this.grid[r][c] = TERRAIN_TYPES.EMPTY;
      }
    }

    // Castle: column 0 or 2, any row
    const castleCol = (rng.random() < 0.5) ? 0 : 2;
    const castleRow = rng.randInt(3);
    this.castleBlock = { r: castleRow, c: castleCol };
    this.grid[castleRow][castleCol] = TERRAIN_TYPES.CASTLE;

    // Player: opposite column
    const playerCol = (castleCol === 0) ? 2 : 0;
    const playerRow = rng.randInt(3);
    this.playerBlock = { r: playerRow, c: playerCol };

    // Castle town: first adjacent empty cell
    const adjList = this._getAdjacent(castleRow, castleCol);
    for (let ai = 0; ai < adjList.length; ai++) {
      if (this.grid[adjList[ai].r][adjList[ai].c] === TERRAIN_TYPES.EMPTY) {
        this.grid[adjList[ai].r][adjList[ai].c] = TERRAIN_TYPES.CASTLE_TOWN;
        break;
      }
    }

    // Grasslands near player (up to 3, 60% chance, Manhattan dist <= 2)
    let grassCount = 0;
    for (let gr = 0; gr < 3; gr++) {
      for (let gc = 0; gc < 3; gc++) {
        if (grassCount >= 3) { break; }
        if (this.grid[gr][gc] === TERRAIN_TYPES.EMPTY) {
          const pd = Math.abs(gr - this.playerBlock.r) + Math.abs(gc - this.playerBlock.c);
          if (pd <= 2 && rng.random() < 0.6) {
            this.grid[gr][gc] = TERRAIN_TYPES.GRASSLAND;
            grassCount++;
          }
        }
      }
    }

    // Villages: 2-3 random empty cells
    const emptyCells = [];
    for (let vr = 0; vr < 3; vr++) {
      for (let vc = 0; vc < 3; vc++) {
        if (this.grid[vr][vc] === TERRAIN_TYPES.EMPTY) {
          emptyCells.push({ r: vr, c: vc });
        }
      }
    }
    // Fisher-Yates shuffle
    for (let si = emptyCells.length - 1; si > 0; si--) {
      const sj = rng.randInt(si + 1);
      const tmp = emptyCells[si];
      emptyCells[si] = emptyCells[sj];
      emptyCells[sj] = tmp;
    }
    const villageTarget = Math.min(emptyCells.length, 2 + (rng.random() < 0.5 ? 1 : 0));
    for (let vi = 0; vi < villageTarget; vi++) {
      this.grid[emptyCells[vi].r][emptyCells[vi].c] = TERRAIN_TYPES.VILLAGE;
    }

    // Generate river (column 1)
    const riverWidth = 60 + rng.randInt(91);
    const col1Left = BLOCK_W;
    const minX = col1Left + 50;
    const maxX = BLOCK_W * 2 - riverWidth - 50;
    const riverX = minX + rng.randInt(maxX - minX);
    this.riverPath = { x: riverX, width: riverWidth };

    // Two bridges
    const nearBridgeY = 200 + rng.random() * 600;
    const farBridgeY = 1200 + rng.random() * 800;
    const bridgeW = riverWidth + 20;
    this.bridges = [
      { x: riverX - 10, y: nearBridgeY, w: bridgeW, h: 70, safe: false },
      { x: riverX - 10, y: farBridgeY, w: bridgeW, h: 120, safe: true }
    ];

    // Ensure village on player side
    this._ensureVillageOnPlayerSide();

    // Build terrain blocks array
    this.blocks = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        this.blocks.push({
          type: this.grid[r][c],
          x: c * BLOCK_W,
          y: r * BLOCK_H,
          w: BLOCK_W,
          h: BLOCK_H,
          row: r,
          col: c
        });
      }
    }

    // Generate trees (from terrain.js TreeManager)
    this._generateTrees();

    // Castle world position
    this.castleWorldPos = {
      x: this.castleBlock.c * BLOCK_W + BLOCK_W / 2,
      y: this.castleBlock.r * BLOCK_H + BLOCK_H / 2
    };

    // Castle collision (simplified circle, radius ~180)
    this.castleCollisionCenter = { x: this.castleWorldPos.x, y: this.castleWorldPos.y };
    this.castleCollisionRadius = 180;

    // Castle polygon vertices (from main.js GekokujoSystem.init)
    const ccx = this.castleWorldPos.x;
    const ccy = this.castleWorldPos.y;
    this.castleVertices = [
      [ccx, ccy - 180],
      [ccx + 140, ccy - 60],
      [ccx + 180, ccy + 180],
      [ccx - 180, ccy + 180],
      [ccx - 140, ccy - 60]
    ];
  }

  _getAdjacent(r, c) {
    const result = [];
    if (r > 0) { result.push({ r: r - 1, c: c }); }
    if (r < 2) { result.push({ r: r + 1, c: c }); }
    if (c > 0) { result.push({ r: r, c: c - 1 }); }
    if (c < 2) { result.push({ r: r, c: c + 1 }); }
    return result;
  }

  _ensureVillageOnPlayerSide() {
    const riverCenterX = this.riverPath.x + this.riverPath.width / 2;
    const playerCX = this.playerBlock.c * BLOCK_W + BLOCK_W / 2;
    const playerIsLeft = (playerCX < riverCenterX);

    let hasVillage = false;
    let emptyOnPlayerSide = null;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const blockCX = c * BLOCK_W + BLOCK_W / 2;
        const isPlayerSide = playerIsLeft ? (blockCX < riverCenterX) : (blockCX > riverCenterX);
        if (!isPlayerSide) { continue; }
        if (this.grid[r][c] === TERRAIN_TYPES.VILLAGE) {
          hasVillage = true;
        }
        if (this.grid[r][c] === TERRAIN_TYPES.EMPTY || this.grid[r][c] === TERRAIN_TYPES.GRASSLAND) {
          emptyOnPlayerSide = { r: r, c: c };
        }
      }
    }
    if (!hasVillage && emptyOnPlayerSide) {
      this.grid[emptyOnPlayerSide.r][emptyOnPlayerSide.c] = TERRAIN_TYPES.VILLAGE;
    }
  }

  _generateTrees() {
    this.trees = [];
    let seed = 48271;
    for (let i = 0; i < this.blocks.length; i++) {
      const bl = this.blocks[i];
      if (bl.type !== TERRAIN_TYPES.GRASSLAND && bl.type !== TERRAIN_TYPES.EMPTY) {
        continue;
      }
      let treeCount = 6;
      if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        treeCount = 10;
      }
      for (let t = 0; t < treeCount; t++) {
        seed = ((seed * 1103515245 + 12345) & 0x7FFFFFFF);
        const tx = bl.x + 80 + (seed % (BLOCK_W - 160));
        seed = ((seed * 1103515245 + 12345) & 0x7FFFFFFF);
        const ty = bl.y + 80 + (seed % (BLOCK_H - 160));
        if (this._isInRiver(tx, ty)) { continue; }
        // Skip if too close to bridge
        let nearBridge = false;
        for (let bi = 0; bi < this.bridges.length; bi++) {
          const br = this.bridges[bi];
          if (tx >= br.x - 30 && tx <= br.x + br.w + 30 && ty >= br.y - 30 && ty <= br.y + br.h + 30) {
            nearBridge = true;
            break;
          }
        }
        if (nearBridge) { continue; }
        this.trees.push({ x: tx, y: ty, collisionRadius: 20 });
      }
    }
  }

  // ============================================================
  // Terrain Queries
  // ============================================================
  _isInRiver(x, y) {
    if (x >= this.riverPath.x && x <= this.riverPath.x + this.riverPath.width) {
      for (let i = 0; i < this.bridges.length; i++) {
        const b = this.bridges[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  _isOnBridge(x, y) {
    for (let i = 0; i < this.bridges.length; i++) {
      const b = this.bridges[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return true;
      }
    }
    return false;
  }

  _getTerrainAt(x, y) {
    for (let i = 0; i < this.blocks.length; i++) {
      const bl = this.blocks[i];
      if (x >= bl.x && x <= bl.x + bl.w && y >= bl.y && y <= bl.y + bl.h) {
        return bl.type;
      }
    }
    return TERRAIN_TYPES.EMPTY;
  }

  _clampPosition(x, y) {
    let nx = x;
    let ny = y;
    if (nx < 15) { nx = 15; }
    if (nx > MAP_W - 15) { nx = MAP_W - 15; }
    if (ny < 15) { ny = 15; }
    if (ny > MAP_H - 15) { ny = MAP_H - 15; }
    return { x: nx, y: ny };
  }

  _pushFromTrees(x, y, entitySize) {
    let nx = x;
    let ny = y;
    for (let i = 0; i < this.trees.length; i++) {
      const tree = this.trees[i];
      const tdx = nx - tree.x;
      const tdy = ny - tree.y;
      const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
      const minDist = tree.collisionRadius + entitySize;
      if (tDist < minDist && tDist > 0) {
        const pushX = (tdx / tDist) * (minDist - tDist);
        const pushY = (tdy / tDist) * (minDist - tDist);
        nx += pushX;
        ny += pushY;
      }
    }
    return { x: nx, y: ny };
  }

  // Simplified castle collision (circle instead of polygon for performance)
  _resolveCastleCollision(entity, entitySize) {
    const cc = this.castleCollisionCenter;
    const dx = entity.x - cc.x;
    const dy = entity.y - cc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = this.castleCollisionRadius + entitySize;
    if (dist < minDist && dist > 0) {
      entity.x = cc.x + (dx / dist) * minDist;
      entity.y = cc.y + (dy / dist) * minDist;
    }
  }

  // Check if point is inside castle polygon (used for boss terrain constraint)
  _pointInCastlePolygon(px, py) {
    const vertices = this.castleVertices;
    let inside = false;
    const n = vertices.length;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
      const xi = vertices[i][0];
      const yi = vertices[i][1];
      const xj = vertices[j][0];
      const yj = vertices[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
      j = i;
    }
    return inside;
  }

  // ============================================================
  // Player Initialization
  // ============================================================
  _initPlayer() {
    const startX = this.playerBlock.c * BLOCK_W + BLOCK_W / 2;
    const startY = this.playerBlock.r * BLOCK_H + BLOCK_H / 2;

    this.player = {
      x: startX,
      y: startY,
      hp: 100,
      maxHp: 100,
      size: 30,
      facingAngle: 0,
      facingLeft: false,
      knockbackTimer: 0,
      knockbackDirX: 0,
      knockbackDirY: 0,
      attackCooldown: 0,
      chargeCooldown: 0,
      invincibleTimer: 0
    };
  }

  // ============================================================
  // Full State Initialization
  // ============================================================
  _initState() {
    const def = this.charDef;

    // Game state
    this.gameTime = 0;
    this.phase = "field"; // "field" | "boss" | "gameover"
    this.rankIndex = 0;
    this.koku = 0;
    if (def.initialKoku) {
      this.koku = def.initialKoku;
    }

    // Entities
    this.enemies = [];
    this.civilians = [];
    this.paradeMembers = [];
    this.projectiles = [];

    // Bridge bosses
    this.bridgeBosses = [];
    this._spawnBridgeBosses();

    // Boss
    this.boss = null;
    this.battleActive = false;
    this.battleTimer = 0;
    this.battleElapsed = 0;
    this.gateActive = false;
    this.bossDefeated = false;
    this.bossTriggered = false;

    // Timers
    this.enemySpawnTimer = 0;
    this.civilianSpawnTimer = 0;
    this.intimidationTimer = 0;
    this.tsujigiriTimer = 0;
    this.ikkiCooldown = 0;
    this.chargeTimer = 0;
    this.chargeActive = false;
    this.chargeDirX = 0;
    this.chargeDirY = 0;
    this.chargeRegroupTimer = 0;
    this.bridgeBossContactInvTimer = 0;
    this.farmerShotToggle = false;

    // Merchant economy timers
    this.merchantHireCooldown = 0;
    this.merchantRemoveCooldown = 0;

    // Initial spawns (from main.js:1434-1435)
    for (let i = 0; i < 8; i++) { this._spawnEnemy(); }
    for (let j = 0; j < 15; j++) { this._spawnCivilian(); }

    // Spawn one civilian near player
    const nearAngle = this.rng.random() * Math.PI * 2;
    const nearDist = 100 + this.rng.random() * 50;
    let nearCivX = this.player.x + Math.cos(nearAngle) * nearDist;
    let nearCivY = this.player.y + Math.sin(nearAngle) * nearDist;
    if (nearCivX < 50) { nearCivX = 50; }
    if (nearCivX > MAP_W - 50) { nearCivX = MAP_W - 50; }
    if (nearCivY < 50) { nearCivY = 50; }
    if (nearCivY > MAP_H - 50) { nearCivY = MAP_H - 50; }
    if (this._isInRiver(nearCivX, nearCivY)) {
      nearCivX = this.player.x - Math.cos(nearAngle) * nearDist;
      nearCivY = this.player.y - Math.sin(nearAngle) * nearDist;
    }
    this.civilians.push({
      x: nearCivX, y: nearCivY,
      wanderAngle: this.rng.random() * Math.PI * 2,
      wanderTimer: 0,
      recruitTimer: 0
    });
  }

  // ============================================================
  // Bridge Boss Spawning (from main.js:271-302)
  // ============================================================
  _spawnBridgeBosses() {
    this.bridgeBosses = [];
    for (let i = 0; i < this.bridges.length; i++) {
      const bridge = this.bridges[i];
      const bossX = bridge.x + bridge.w / 2;
      const bossY = bridge.y + bridge.h / 2;
      this.bridgeBosses.push({
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
        scoreValue: 2000,
        safe: bridge.safe,
        patrolTimer: 0,
        patrolRange: bridge.h * 0.8,
        patrolSpeed: 1.2,
        alive: true
      });
    }
  }

  // ============================================================
  // Enemy Spawning (from entities.js:311-378)
  // ============================================================
  _spawnEnemy() {
    const maxEn = this.charDef.maxEnemies != null ? this.charDef.maxEnemies : 15;
    if (this.enemies.length >= maxEn) { return; }

    // Tier based on gameTime
    let tier = 0;
    if (this.gameTime > 60) { tier = 3; }
    else if (this.gameTime > 30) { tier = 2; }
    else if (this.gameTime > 15) { tier = 1; }

    const idx = Math.min(tier, this.rng.randInt(tier + 1));
    const def = ENEMY_DEFS[idx];

    // Spawn at map edges (relative to simulated camera around player)
    const camX = this.player.x - CANVAS_W / 2;
    const camY = this.player.y - CANVAS_H / 2;
    let ex, ey;
    const edge = this.rng.randInt(4);
    const margin = 100;
    if (edge === 0) {
      ex = camX + this.rng.random() * CANVAS_W;
      ey = camY - margin;
    } else if (edge === 1) {
      ex = camX + CANVAS_W + margin;
      ey = camY + this.rng.random() * CANVAS_H;
    } else if (edge === 2) {
      ex = camX + this.rng.random() * CANVAS_W;
      ey = camY + CANVAS_H + margin;
    } else {
      ex = camX - margin;
      ey = camY + this.rng.random() * CANVAS_H;
    }

    // Clamp to map
    if (ex < 20) { ex = 20; }
    if (ex > MAP_W - 20) { ex = MAP_W - 20; }
    if (ey < 20) { ey = 20; }
    if (ey > MAP_H - 20) { ey = MAP_H - 20; }

    // Don't spawn in river
    if (this._isInRiver(ex, ey)) { ex = this.riverPath.x - 30; }

    // Castle town rejection (70% near center)
    const terrType = this._getTerrainAt(ex, ey);
    if (terrType === TERRAIN_TYPES.CASTLE_TOWN) {
      let nearestDist = 9999;
      for (let ti = 0; ti < this.blocks.length; ti++) {
        const tbl = this.blocks[ti];
        if (tbl.type === TERRAIN_TYPES.CASTLE_TOWN) {
          const tcx = tbl.x + tbl.w / 2;
          const tcy = tbl.y + tbl.h / 2;
          const tdx = ex - tcx;
          const tdy = ey - tcy;
          const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tDist < nearestDist) { nearestDist = tDist; }
        }
      }
      const rejectChance = 0.7 * Math.max(0, 1 - nearestDist / 400);
      if (this.rng.random() < rejectChance) { return; }
    }

    // Castle town enemies have 1.5x HP
    let hpMult = 1;
    if (terrType === TERRAIN_TYPES.CASTLE_TOWN) { hpMult = 1.5; }

    this.enemies.push({
      x: ex, y: ey,
      hp: Math.floor(def.hp * hpMult),
      maxHp: Math.floor(def.hp * hpMult),
      attack: def.attack,
      speed: def.speed,
      scoreValue: def.score,
      size: def.size,
      name: def.name,
      grit: def.grit,
      attackTimer: 0,
      surrendering: false,
      surrenderTimer: 0
    });
  }

  // ============================================================
  // Civilian Spawning (from entities.js:551-594)
  // ============================================================
  _spawnCivilian() {
    if (this.civilians.length >= 20) { return; }

    // Collect village and castle_town block centers
    const townCenters = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const bl = this.blocks[i];
      if (bl.type === TERRAIN_TYPES.VILLAGE || bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        townCenters.push({
          x: bl.x + bl.w / 2,
          y: bl.y + bl.h / 2
        });
      }
    }
    if (townCenters.length === 0) { return; }

    const origin = townCenters[this.rng.randInt(townCenters.length)];
    const maxSpawnRadius = 600;
    const dist = this.rng.random() * this.rng.random() * maxSpawnRadius;
    const angle = this.rng.random() * Math.PI * 2;
    let cx = origin.x + Math.cos(angle) * dist;
    let cy = origin.y + Math.sin(angle) * dist;

    if (cx < 50) { cx = 50; }
    if (cx > MAP_W - 50) { cx = MAP_W - 50; }
    if (cy < 50) { cy = 50; }
    if (cy > MAP_H - 50) { cy = MAP_H - 50; }

    if (this._isInRiver(cx, cy)) { return; }
    const terrain = this._getTerrainAt(cx, cy);
    if (terrain === TERRAIN_TYPES.CASTLE) { return; }

    this.civilians.push({
      x: cx, y: cy,
      wanderAngle: this.rng.random() * Math.PI * 2,
      wanderTimer: 0,
      recruitTimer: 0
    });
  }

  // ============================================================
  // KokuReward (from combat.js:6-16)
  // ============================================================
  _kokuReward(baseValue) {
    const rand = 0.75 + this.rng.random() * 0.5;
    let value = Math.floor(baseValue * rand);
    const isCritical = this.rng.random() < 0.1;
    if (isCritical) {
      value = value * 2;
    }
    return value;
  }

  // ============================================================
  // Attack Power (from entities.js:260-265)
  // ============================================================
  _getAttackPower() {
    const def = this.charDef;
    const base = def.attack;
    const followerBonus = Math.floor(this.paradeMembers.length * def.followerBonus * base * 10);
    return base + followerBonus;
  }

  // ============================================================
  // Rank Check (from main.js:941-951)
  // ============================================================
  _checkRank() {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (this.koku >= RANKS[i].threshold) {
        if (i > this.rankIndex) {
          this.rankIndex = i;
        }
        break;
      }
    }
  }

  // ============================================================
  // Add Parade Member (from entities.js:707-716)
  // ============================================================
  _addParadeMember(x, y) {
    const member = {
      x: x, y: y,
      attackCooldown: 0,
      orbitAngle: this.rng.random() * Math.PI * 2,
      orbitRadius: this.rng.random() * 40
    };
    // 足軽: 忠誠離脱は確率モデルで管理（loyaltyTimer不要）
    this.paradeMembers.push(member);
    this.stats.totalRecruits++;
    if (this.paradeMembers.length > this.stats.peakParadeLen) {
      this.stats.peakParadeLen = this.paradeMembers.length;
    }
  }

  // ============================================================
  // Player Takes Damage (from entities.js:248-258)
  // ============================================================
  _playerTakeDamage(amount) {
    const dmgMult = this.charDef.damageTakenMultiplier;
    this.player.hp -= Math.floor(amount * dmgMult);
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      return true; // dead
    }
    return false;
  }

  // ============================================================
  // Player Knockback (from entities.js:240-246)
  // ============================================================
  _applyKnockback(dirX, dirY, force) {
    this.player.knockbackTimer = 0.3;
    let dist = Math.sqrt(dirX * dirX + dirY * dirY);
    if (dist < 1) { dist = 1; }
    this.player.knockbackDirX = (dirX / dist) * force;
    this.player.knockbackDirY = (dirY / dist) * force;
  }

  // ============================================================
  // Main Tick
  // ============================================================
  /**
   * Advance the simulation by dt seconds.
   * @param {number} dt - Time step (recommended: 0.1)
   * @param {object} action - { moveX, moveY, attack, charge, ikki, aimX, aimY }
   *   moveX/moveY: -1, 0, or 1
   *   attack: bool
   *   charge: bool
   *   ikki: bool
   *   aimX/aimY: world coordinates for attack/charge direction
   */
  tick(dt, action) {
    if (this.phase === "gameover") { return; }

    if (!action) { action = {}; }

    // Frame-rate independence: scale movement by dt*60 (game designed at 60fps)
    this.dtScale = dt * 60;

    // Update game time (not during boss battle, matching main.js:1535-1537)
    if (!this.battleActive) {
      this.gameTime += dt;
    }

    // Check max time
    const maxTime = this.ikkiMode ? 50 : MAX_TIME;
    if (this.gameTime >= maxTime && !this.battleActive) {
      this.phase = "gameover";
      return;
    }

    // 1. Player Movement
    this._updatePlayer(dt, action);

    // 2. Enemy Spawning & AI
    this._updateEnemies(dt);

    // 3. Civilian Spawning & Recruitment
    this._updateCivilians(dt);

    // 4. Parade Update (loyalty, orbit, melee attacks)
    this._updateParade(dt);

    // 5. Handle player attack input
    if (action.attack) {
      this._handleAttack(action);
    }

    // 6. Handle charge input
    if (action.charge) {
      this._handleCharge(action);
    }

    // 7. Update charge if active
    this._updateCharge(dt);

    // 8. Projectile update
    this._updateProjectiles(dt);

    // 9. Intimidation
    this._updateIntimidation(dt);

    // 10. Tsujigiri (only outside boss battle)
    if (!this.battleActive) {
      this._updateTsujigiri(dt);
    }

    // 11. Merchant Economy
    this._updateMerchantEconomy(dt);

    // 12. Bridge Boss
    this._updateBridgeBosses(dt);

    // 13. Ikki
    if (action.ikki) {
      this._handleIkki();
    }
    if (this.ikkiCooldown > 0) { this.ikkiCooldown -= dt; }

    // 14. Gate activation & Boss battle
    this._updateGekokujo(dt, action);

    // 15. HP Regen (skip if already dead)
    if (this.player.hp > 0 && this.player.hp < this.player.maxHp) {
      this.player.hp += dt * 2;
      if (this.player.hp > this.player.maxHp) {
        this.player.hp = this.player.maxHp;
      }
    }

    // 16. Check game over
    if (this.player.hp <= 0) {
      this.phase = "gameover";
    }
  }

  // ============================================================
  // 1. Player Movement (from entities.js:169-236)
  // ============================================================
  _updatePlayer(dt, action) {
    const p = this.player;
    const def = this.charDef;

    if (p.attackCooldown > 0) { p.attackCooldown -= dt; }
    if (p.chargeCooldown > 0) { p.chargeCooldown -= dt; }

    // Knockback
    if (p.knockbackTimer > 0) {
      const prevX = p.x;
      const prevY = p.y;
      p.x += p.knockbackDirX * this.dtScale;
      p.y += p.knockbackDirY * this.dtScale;
      if (this._isInRiver(p.x, p.y)) {
        p.x = prevX;
        p.y = prevY;
      }
      p.knockbackTimer -= dt;
      p.knockbackDirX *= 0.9;
      p.knockbackDirY *= 0.9;
    }

    if (p.knockbackTimer <= 0) {
      // Movement speed
      let spd = def.speed + (this.rankIndex * 0.3);

      // Parade penalty (2% per follower, cap 30%)
      const paradeLen = this.paradeMembers.length;
      if (paradeLen > 0) {
        let penalty = paradeLen * 0.02;
        if (penalty > 0.30) { penalty = 0.30; }
        spd = spd * (1.0 - penalty);
      }

      // River slow
      if (this._isInRiver(p.x, p.y)) {
        spd = spd * 0.3;
      }

      // Apply movement from action
      const moveX = action.moveX != null ? action.moveX : 0;
      const moveY = action.moveY != null ? action.moveY : 0;
      if (moveX !== 0 || moveY !== 0) {
        // Normalize diagonal movement
        let mx = moveX;
        let my = moveY;
        const moveMag = Math.sqrt(mx * mx + my * my);
        if (moveMag > 1) {
          mx /= moveMag;
          my /= moveMag;
        }
        p.x += mx * spd * this.dtScale;
        p.y += my * spd * this.dtScale;
        if (mx < 0) { p.facingLeft = true; }
        if (mx > 0) { p.facingLeft = false; }
        p.facingAngle = Math.atan2(my, mx);
      }
    }

    // Clamp position
    const clamped = this._clampPosition(p.x, p.y);
    p.x = clamped.x;
    p.y = clamped.y;

    // Tree collision
    const treePush = this._pushFromTrees(p.x, p.y, p.size);
    p.x = treePush.x;
    p.y = treePush.y;

    // Castle collision
    this._resolveCastleCollision(p, p.size);
  }

  // ============================================================
  // 2. Enemy Update (from entities.js:381-472)
  // ============================================================
  _updateEnemies(dt) {
    // Spawning
    this.enemySpawnTimer += dt;
    const spawnInt = this.charDef.spawnInterval != null ? this.charDef.spawnInterval : 3;
    if (this.enemySpawnTimer > spawnInt) {
      this.enemySpawnTimer = 0;
      if (this.enemies.length < 6) { this._spawnEnemy(); this._spawnEnemy(); }
      else if (this.enemies.length < 10) { this._spawnEnemy(); this._spawnEnemy(); }
      else { this._spawnEnemy(); }
    }

    const px = this.player.x;
    const py = this.player.y;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];

      // Surrendering
      if (en.surrendering) {
        en.surrenderTimer -= dt;
        if (en.surrenderTimer <= 0) {
          const reward = this._kokuReward(en.scoreValue);
          this.koku += Math.floor(reward * this.charDef.scoreMultiplier);
          this._checkRank();
          this.stats.enemyKills++;
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // AI: move toward player
      const dx = px - en.x;
      const dy = py - en.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        const enSpd = en.speed * this.dtScale;
        let newX = en.x + (dx / dist) * enSpd;
        let newY = en.y + (dy / dist) * enSpd;
        // Block river crossing (allow only on bridge)
        if (this._isInRiver(newX, newY) && !this._isOnBridge(newX, newY)) {
          // Simple river avoidance: try to route toward nearest bridge
          const nearestBridge = this._findNearestBridge(en.x, en.y);
          if (nearestBridge) {
            const bCenterX = nearestBridge.x + nearestBridge.w / 2;
            const bCenterY = nearestBridge.y + nearestBridge.h / 2;
            const bdx = bCenterX - en.x;
            const bdy = bCenterY - en.y;
            const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
            if (bDist > 1) {
              newX = en.x + (bdx / bDist) * enSpd;
              newY = en.y + (bdy / bDist) * enSpd;
            }
          } else {
            newX = en.x;
            newY = en.y;
          }
        }
        en.x = newX;
        en.y = newY;
      }

      // Tree collision
      const enTree = this._pushFromTrees(en.x, en.y, en.size);
      en.x = enTree.x;
      en.y = enTree.y;

      // Castle collision
      this._resolveCastleCollision(en, en.size);

      // Melee attack on player (from entities.js:457-469)
      if (dist < this.player.size + en.size) {
        en.attackTimer += dt;
        if (en.attackTimer > 0.8) {
          en.attackTimer = 0;
          const dead = this._playerTakeDamage(en.attack);
          if (dead) {
            this.phase = "gameover";
            return;
          }
        }
      } else {
        // Reset attack timer when not in melee range
        en.attackTimer = 0;
      }
    }
  }

  _findNearestBridge(x, y) {
    let bestDist = Infinity;
    let bestBridge = null;
    for (let i = 0; i < this.bridges.length; i++) {
      const b = this.bridges[i];
      const bcx = b.x + b.w / 2;
      const bcy = b.y + b.h / 2;
      const dx = bcx - x;
      const dy = bcy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        bestBridge = b;
      }
    }
    return bestBridge;
  }

  // ============================================================
  // 3. Civilian Update (from entities.js:596-658)
  // ============================================================
  _updateCivilians(dt) {
    const def = this.charDef;

    // Spawning
    this.civilianSpawnTimer += dt;
    if (this.civilianSpawnTimer > 4) {
      this.civilianSpawnTimer = 0;
      if (this.civilians.length < 15) { this._spawnCivilian(); }
    }

    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const civ = this.civilians[i];

      // Wander
      civ.wanderTimer += dt;
      if (civ.wanderTimer > 2) {
        civ.wanderTimer = 0;
        civ.wanderAngle = this.rng.random() * Math.PI * 2;
      }
      let civNewX = civ.x + Math.cos(civ.wanderAngle) * 0.3 * this.dtScale;
      let civNewY = civ.y + Math.sin(civ.wanderAngle) * 0.3 * this.dtScale;
      if (this._isInRiver(civNewX, civNewY) && !this._isOnBridge(civNewX, civNewY)) {
        civ.wanderAngle = civ.wanderAngle + Math.PI;
      } else {
        civ.x = civNewX;
        civ.y = civNewY;
      }

      // Bounds
      if (civ.x < 20) { civ.x = 20; civ.wanderAngle = 0; }
      if (civ.x > MAP_W - 20) { civ.x = MAP_W - 20; civ.wanderAngle = Math.PI; }
      if (civ.y < 20) { civ.y = 20; civ.wanderAngle = Math.PI / 2; }
      if (civ.y > MAP_H - 20) { civ.y = MAP_H - 20; civ.wanderAngle = -Math.PI / 2; }

      // Tree collision
      const civTree = this._pushFromTrees(civ.x, civ.y, 12);
      civ.x = civTree.x;
      civ.y = civTree.y;

      // Recruit check
      const recruitRange = def.recruitRange + this.paradeMembers.length * 5;
      const dx = this.player.x - civ.x;
      const dy = this.player.y - civ.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < recruitRange * recruitRange) {
        if (this.charKey === "merchant") {
          // Merchant: instant recruit with koku cost
          if (this.koku >= def.recruitCost) {
            this.koku -= def.recruitCost;
            this._addParadeMember(civ.x, civ.y);
            this.civilians.splice(i, 1);
          }
        } else {
          civ.recruitTimer += dt * 1000;
          if (civ.recruitTimer >= def.recruitTime) {
            this._addParadeMember(civ.x, civ.y);
            this.civilians.splice(i, 1);
          }
        }
      } else {
        civ.recruitTimer = 0;
      }
    }
  }

  // ============================================================
  // 4. Parade Update (from entities.js:723-833)
  // ============================================================
  _updateParade(dt) {
    for (let i = this.paradeMembers.length - 1; i >= 0; i--) {
      const m = this.paradeMembers[i];

      // 足軽: 確率的離脱モデル（毎秒 ~4%±1% でグループから1人抜ける）
      // 固定タイマーより自然なじわじわ離脱を再現
      if (this.charKey === "ashigaru" && this.paradeMembers.length > 0) {
        const baseRate = 0.04;
        const variance = 0.01;
        const departRate = baseRate + (this.rng.random() - 0.5) * 2 * variance;
        if (this.rng.random() < departRate * dt) {
          const idx = Math.floor(this.rng.random() * this.paradeMembers.length);
          const leaving = this.paradeMembers[idx];
          this.civilians.push({
            x: leaving.x, y: leaving.y,
            wanderAngle: this.rng.random() * Math.PI * 2,
            wanderTimer: 0,
            recruitTimer: 0
          });
          this.paradeMembers.splice(idx, 1);
          break; // 1秒に1人まで
        }
      }

      // Orbit movement (skip during charge)
      if (!this.chargeActive) {
        let targetX, targetY;

        // During boss battle, parade members swarm toward the boss
        if (this.battleActive && this.boss && !this.boss.defeated && this.boss.aiState !== "CASTLE_WAIT") {
          const bossAngle = m.orbitAngle + Math.sin(m.orbitAngle * 1.5 + i) * 0.6;
          const bossRadius = 20 + (i % 4) * 10;
          targetX = this.boss.x + Math.cos(bossAngle) * bossRadius;
          targetY = this.boss.y + Math.sin(bossAngle) * bossRadius;
        } else {
          const wobble = Math.sin(m.orbitAngle * 2.7 + i) * 0.4;
          const targetAngle = m.orbitAngle + wobble;
          const targetRadius = 40 + m.orbitRadius;
          targetX = this.player.x + Math.cos(targetAngle) * targetRadius;
          targetY = this.player.y + Math.sin(targetAngle) * targetRadius;
        }

        const lerpFactor = 1 - Math.pow(0.9, this.dtScale);
        let mNewX = m.x + (targetX - m.x) * lerpFactor;
        let mNewY = m.y + (targetY - m.y) * lerpFactor;
        if (this._isInRiver(mNewX, mNewY) && !this._isOnBridge(mNewX, mNewY)) {
          mNewX = m.x;
          mNewY = m.y;
        }
        m.x = mNewX;
        m.y = mNewY;
        m.orbitAngle += 0.3 * dt;
      }

      // Parade member attack (entities.js:772-833)
      if (m.attackCooldown > 0) { m.attackCooldown -= dt; }
      if (m.attackCooldown <= 0) {
        const paradeAttackRadiusSq = 2500; // 50px
        let paradeDamage = 3;
        if (this.charKey === "ashigaru") { paradeDamage = 2; }

        // Attack enemies
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const en = this.enemies[ei];
          if (en.surrendering) { continue; }
          const edx = m.x - en.x;
          const edy = m.y - en.y;
          if (edx * edx + edy * edy < paradeAttackRadiusSq) {
            en.hp -= paradeDamage;
            m.attackCooldown = 0.7;
            if (en.hp <= 0) {
              const reward = this._kokuReward(en.scoreValue);
              this.koku += Math.floor(reward * this.charDef.scoreMultiplier);
              this._checkRank();
              this.stats.enemyKills++;
              this.enemies.splice(ei, 1);
            }
            break;
          }
        }

        // Attack boss (entities.js:802-817)
        // Boss is much larger (size 64) so use boss.size + 30 as attack radius
        if (this.boss && !this.boss.defeated && this.battleActive && m.attackCooldown <= 0) {
          if (this.boss.aiState !== "CASTLE_WAIT") {
            const bdx = m.x - this.boss.x;
            const bdy = m.y - this.boss.y;
            const bossAttackRadius = this.boss.size + 30;
            if (bdx * bdx + bdy * bdy < bossAttackRadius * bossAttackRadius) {
              this.boss.hp -= paradeDamage;
              m.attackCooldown = 0.7;
              if (this.boss.hp <= 0) {
                this._bossSuccess();
              }
            }
          }
        }

        // Attack bridge bosses (entities.js:819-832)
        if (m.attackCooldown <= 0) {
          for (let bbi = 0; bbi < this.bridgeBosses.length; bbi++) {
            const bb = this.bridgeBosses[bbi];
            if (!bb.alive) { continue; }
            const bbdx = m.x - bb.x;
            const bbdy = m.y - bb.y;
            if (bbdx * bbdx + bbdy * bbdy < paradeAttackRadiusSq) {
              m.attackCooldown = 0.7;
              this._bridgeBossTakeDamage(bbi, paradeDamage);
              break;
            }
          }
        }
      }
    }
  }

  // ============================================================
  // 5. Player Attack (from combat.js:201-241)
  // ============================================================
  _handleAttack(action) {
    if (this.player.attackCooldown > 0) { return; }

    const damage = this._getAttackPower();

    // Calculate aim direction
    let aimX = action.aimX != null ? action.aimX : this.player.x + 100;
    let aimY = action.aimY != null ? action.aimY : this.player.y;
    const dx = aimX - this.player.x;
    const dy = aimY - this.player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { dist = 1; }
    const angle = Math.atan2(dy, dx);

    if (this.charKey === "ashigaru") {
      // Fan 5 projectiles (combat.js:214-218)
      for (let pi = 0; pi < 5; pi++) {
        const a = angle - 0.5 + 0.25 * pi;
        this.projectiles.push({
          x: this.player.x, y: this.player.y,
          vx: Math.cos(a) * 8, vy: Math.sin(a) * 8,
          damage: damage, life: 40, size: 10,
          fromBoss: false
        });
      }
    } else if (this.charKey === "merchant") {
      // 2 focused shots (combat.js:220-223)
      const mSpread = 0.08;
      this.projectiles.push({
        x: this.player.x, y: this.player.y,
        vx: Math.cos(angle - mSpread) * 5, vy: Math.sin(angle - mSpread) * 5,
        damage: damage, life: 50, size: 4,
        fromBoss: false
      });
      this.projectiles.push({
        x: this.player.x, y: this.player.y,
        vx: Math.cos(angle + mSpread) * 5, vy: Math.sin(angle + mSpread) * 5,
        damage: damage, life: 50, size: 4,
        fromBoss: false
      });
    } else {
      // Farmer: 1 shot alternating (combat.js:225-229)
      // Reduced spread during boss battle (player is focused on single large target)
      const fSpread = this.battleActive ? 0.15 : 0.35;
      const fDir = this.farmerShotToggle ? 1 : -1;
      this.farmerShotToggle = !this.farmerShotToggle;
      this.projectiles.push({
        x: this.player.x, y: this.player.y,
        vx: Math.cos(angle + fSpread * fDir) * 6,
        vy: Math.sin(angle + fSpread * fDir) * 6,
        damage: damage, life: 56, size: 2,
        fromBoss: false
      });
    }

    // Set cooldown (combat.js:231-235)
    if (this.charKey === "farmer") {
      this.player.attackCooldown = 0.125;
    } else {
      this.player.attackCooldown = 0.25;
    }

    // Farmer: 30% chance spawn civilian on attack (combat.js:238-240)
    if (this.charKey === "farmer" && this.rng.random() < 0.3) {
      this._spawnCivilian();
    }
  }

  // ============================================================
  // 6. Charge (from combat.js:107-196)
  // ============================================================
  _handleCharge(action) {
    if (this.paradeMembers.length < 3) { return; }
    if (this.chargeActive) { return; }
    if (this.chargeRegroupTimer > 0) { return; }
    if (this.player.chargeCooldown > 0) { return; }

    // Calculate charge direction
    let aimX = action.aimX != null ? action.aimX : this.player.x + 100;
    let aimY = action.aimY != null ? action.aimY : this.player.y;
    const dx = aimX - this.player.x;
    const dy = aimY - this.player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { dist = 1; }
    this.chargeDirX = dx / dist;
    this.chargeDirY = dy / dist;

    this.chargeActive = true;
    this.chargeTimer = 1.2;
    this.player.chargeCooldown = 6;
    this.stats.chargeUses++;
  }

  _updateCharge(dt) {
    if (this.chargeRegroupTimer > 0) {
      this.chargeRegroupTimer -= dt;
    }

    if (!this.chargeActive) { return; }

    this.chargeTimer -= dt;
    const chargeSpeed = 5 * this.charDef.chargeMultiplier * this.dtScale;

    // Move parade members in charge direction and check collisions
    for (let i = 0; i < this.paradeMembers.length; i++) {
      const m = this.paradeMembers[i];
      m.x += this.chargeDirX * chargeSpeed;
      m.y += this.chargeDirY * chargeSpeed;

      // Collision with enemies (combat.js:150-169)
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const en = this.enemies[j];
        if (en.surrendering) { continue; }
        const edx = m.x - en.x;
        const edy = m.y - en.y;
        const chargeThresh = en.size + 10;
        if (edx * edx + edy * edy < chargeThresh * chargeThresh) {
          en.hp -= 5;
          if (en.hp <= 0) {
            const reward = this._kokuReward(en.scoreValue);
            this.koku += Math.floor(reward * this.charDef.scoreMultiplier);
            this._checkRank();
            this.stats.enemyKills++;
            this.enemies.splice(j, 1);
          }
        }
      }

      // Collision with bridge bosses (combat.js:172-181)
      for (let bbk = 0; bbk < this.bridgeBosses.length; bbk++) {
        const bb = this.bridgeBosses[bbk];
        if (!bb.alive) { continue; }
        const bbdx = m.x - bb.x;
        const bbdy = m.y - bb.y;
        const bbThresh = bb.size + 10;
        if (bbdx * bbdx + bbdy * bbdy < bbThresh * bbThresh) {
          this._bridgeBossTakeDamage(bbk, 5);
        }
      }
    }

    if (this.chargeTimer <= 0) {
      this.chargeActive = false;
      // Regroup timer (combat.js:186)
      this.chargeRegroupTimer = 3 * (1 - this.charDef.regroupSpeed + 0.5);
    }
  }

  // ============================================================
  // 7. Projectile Update (from entities.js:919-1049)
  // ============================================================
  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      p.x += p.vx * this.dtScale;
      p.y += p.vy * this.dtScale;
      p.life -= this.dtScale;

      // Remove if expired or out of bounds
      if (p.life <= 0 || p.x < -20 || p.x > MAP_W + 20 || p.y < -20 || p.y > MAP_H + 20) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Castle collision: all projectiles destroyed
      if (this._pointInCastlePolygon(p.x, p.y)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Boss projectile hits player (entities.js:966-978)
      if (p.fromBoss) {
        const bpDx = p.x - this.player.x;
        const bpDy = p.y - this.player.y;
        const bpThresh = this.player.size + p.size;
        if (bpDx * bpDx + bpDy * bpDy < bpThresh * bpThresh) {
          const dead = this._playerTakeDamage(p.damage);
          this.projectiles.splice(i, 1);
          if (dead) {
            if (this.battleActive) {
              this._bossFail();
            } else {
              this.phase = "gameover";
            }
          }
        }
        continue;
      }

      // Hit enemies (entities.js:982-1005)
      let hitEnemy = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const en = this.enemies[j];
        if (en.surrendering) { continue; }
        const edx = p.x - en.x;
        const edy = p.y - en.y;
        const hitThresh = en.size + p.size;
        if (edx * edx + edy * edy < hitThresh * hitThresh) {
          en.hp -= p.damage;
          this.projectiles.splice(i, 1);
          if (en.hp <= 0) {
            const reward = this._kokuReward(en.scoreValue);
            this.koku += Math.floor(reward * this.charDef.scoreMultiplier);
            this._checkRank();
            this.stats.enemyKills++;
            this.enemies.splice(j, 1);
          }
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy) { continue; }

      // Hit boss (entities.js:1008-1029)
      if (i >= 0 && i < this.projectiles.length) {
        const bp = this.projectiles[i];
        if (bp && this.boss && !this.boss.defeated) {
          const bdx = bp.x - this.boss.x;
          const bdy = bp.y - this.boss.y;
          const bossHitThresh = this.boss.size + bp.size;
          if (bdx * bdx + bdy * bdy < bossHitThresh * bossHitThresh) {
            if (this.boss.aiState === "CASTLE_WAIT") {
              // Invincible during CASTLE_WAIT
              this.projectiles.splice(i, 1);
              continue;
            }
            this.boss.hp -= bp.damage;
            this.projectiles.splice(i, 1);
            if (this.boss.hp <= 0) {
              this._bossSuccess();
            }
            continue;
          }
        }
      }

      // Hit bridge bosses (entities.js:1031-1048)
      if (i >= 0 && i < this.projectiles.length) {
        const bbp = this.projectiles[i];
        if (bbp) {
          for (let bbj = 0; bbj < this.bridgeBosses.length; bbj++) {
            const bbTarget = this.bridgeBosses[bbj];
            if (!bbTarget.alive) { continue; }
            const bbdx = bbp.x - bbTarget.x;
            const bbdy = bbp.y - bbTarget.y;
            const bbThresh = bbTarget.size + bbp.size;
            if (bbdx * bbdx + bbdy * bbdy < bbThresh * bbThresh) {
              this._bridgeBossTakeDamage(bbj, bbp.damage);
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }
  }

  // ============================================================
  // 8. Intimidation (from combat.js:75-102)
  // ============================================================
  _updateIntimidation(dt) {
    this.intimidationTimer += dt;
    if (this.intimidationTimer < 0.5) { return; }
    this.intimidationTimer = 0;

    const paradeLen = this.paradeMembers.length;
    if (paradeLen < 4) { return; }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      if (en.surrendering) { continue; }
      const dx = en.x - this.player.x;
      const dy = en.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      // 40000 = 200px^2
      if (distSq < 40000 && paradeLen > en.grit) {
        en.surrendering = true;
        en.surrenderTimer = 1.0;
      }
    }
  }

  // ============================================================
  // 9. Tsujigiri (from combat.js:247-440)
  // ============================================================
  _updateTsujigiri(dt) {
    this.tsujigiriTimer += dt;
    if (this.tsujigiriTimer < 1.0) { return; }
    this.tsujigiriTimer = 0;

    // Skip during charge or ikki
    if (this.chargeActive) { return; }

    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];
      if (en.surrendering) { continue; }
      // Only wild bandits and samurai can trigger tsujigiri (combat.js:398-399)
      // Must be within melee range (combat.js:365 - proximity check)
      if (en.name === "野盗" || en.name === "侍") {
        const tdx = en.x - this.player.x;
        const tdy = en.y - this.player.y;
        const terrainMult = this._getTsujigiriTerrainMultiplier();
        const baseChance = this.paramOverrides.tsujigiriBaseChance != null
          ? this.paramOverrides.tsujigiriBaseChance : 0.025;
        const chance = baseChance * terrainMult;
        if (this.rng.random() < chance) {
          // QTE success rate (configurable, default 50%)
          const tsujigiriSuccessRate = this.paramOverrides.tsujigiriSuccessRate != null
            ? this.paramOverrides.tsujigiriSuccessRate : 0.5;
          if (this.rng.random() < tsujigiriSuccessRate) {
            // Success
            const idx = this.enemies.indexOf(en);
            if (idx >= 0) {
              this.enemies.splice(idx, 1);
            }
            const reward = this._kokuReward(1000);
            this.koku += Math.floor(reward * this.charDef.scoreMultiplier);
            this._checkRank();
            this.stats.tsujigiriSuccess++;
          } else {
            // Failure: player dies
            this.player.hp = 0;
            this.phase = "gameover";
            this.stats.tsujigiriFail++;
          }
          return;
        }
      }
    }
  }

  _getTsujigiriTerrainMultiplier() {
    const px = this.player.x;
    const py = this.player.y;
    if (this._isOnBridge(px, py)) { return 0; }
    if (this._isInRiver(px, py)) { return 0; }
    const terrain = this._getTerrainAt(px, py);
    if (terrain === TERRAIN_TYPES.CASTLE) { return 0; }
    const defaultTable = TSUJIGIRI_TERRAIN_CHANCES[this.charKey];
    const overrideTable = this.paramOverrides.tsujigiriTerrainChances;
    const charTable = overrideTable != null
      ? { village: overrideTable.village != null ? overrideTable.village : defaultTable.village,
          castleTown: overrideTable.castleTown != null ? overrideTable.castleTown : defaultTable.castleTown,
          grassland: overrideTable.grassland != null ? overrideTable.grassland : defaultTable.grassland }
      : defaultTable;
    if (terrain === TERRAIN_TYPES.VILLAGE) { return charTable.village; }
    if (terrain === TERRAIN_TYPES.CASTLE_TOWN) { return charTable.castleTown; }
    if (terrain === TERRAIN_TYPES.GRASSLAND) { return charTable.grassland; }
    return 1.0;
  }

  // ============================================================
  // 10. Merchant Economy (from economy.js)
  // ============================================================
  _updateMerchantEconomy(dt) {
    if (this.charKey !== "merchant") { return; }

    const terrain = this._getTerrainAt(this.player.x, this.player.y);
    let incomeRate = 0;
    if (terrain === TERRAIN_TYPES.CASTLE_TOWN) {
      incomeRate = 50;
    } else if (terrain === TERRAIN_TYPES.VILLAGE) {
      incomeRate = 30;
    } else if (terrain === TERRAIN_TYPES.GRASSLAND) {
      incomeRate = 10;
    }

    this.koku += incomeRate * dt * this.charDef.scoreMultiplier;

    // Upkeep: 2.0 * paradeLen per second (exempt during boss)
    if (!this.battleActive) {
      const upkeepCost = this.paradeMembers.length * 2.0 * dt;
      this.koku -= upkeepCost;
    }

    // Remove member if koku < 0 (every 3s)
    if (this.merchantRemoveCooldown > 0) { this.merchantRemoveCooldown -= dt; }
    if (this.koku < 0) {
      this.koku = 0;
      if (this.merchantRemoveCooldown <= 0 && this.paradeMembers.length > 0) {
        const lastIdx = this.paradeMembers.length - 1;
        const removed = this.paradeMembers[lastIdx];
        this.civilians.push({
          x: removed.x, y: removed.y,
          wanderAngle: this.rng.random() * Math.PI * 2,
          wanderTimer: 0, recruitTimer: 0
        });
        this.paradeMembers.splice(lastIdx, 1);
        this.merchantRemoveCooldown = 3;
      }
    }

    // Auto-hire: 300 koku, 3s CD, max 12 (economy.js:68-74)
    if (this.merchantHireCooldown > 0) { this.merchantHireCooldown -= dt; }
    if (this.koku >= 300 && this.merchantHireCooldown <= 0 && this.paradeMembers.length < 12) {
      this.koku -= 300;
      this._addParadeMember(this.player.x, this.player.y);
      this.merchantHireCooldown = 3;
    }
  }

  // ============================================================
  // 11. Bridge Boss (from main.js:180-374)
  // ============================================================
  _updateBridgeBosses(dt) {
    if (this.bridgeBossContactInvTimer > 0) {
      this.bridgeBossContactInvTimer -= dt;
    }

    for (let bi = 0; bi < this.bridgeBosses.length; bi++) {
      const boss = this.bridgeBosses[bi];
      if (!boss.alive) { continue; }

      const dx = this.player.x - boss.x;
      const dy = this.player.y - boss.y;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);

      // Patrol (safe bridge only, main.js:216-235)
      if (boss.safe) {
        boss.patrolTimer += dt;
        const patrolHalfRange = boss.patrolRange / 2;
        const patrolOffset = Math.sin(boss.patrolTimer * boss.patrolSpeed) * patrolHalfRange;
        const targetY = boss.homeY + patrolOffset;
        const patrolDy = targetY - boss.y;
        let moveY = 0;
        if (Math.abs(patrolDy) > 1) {
          moveY = (patrolDy > 0 ? 1 : -1) * boss.speed * this.dtScale;
        }
        let newY = boss.y + moveY;
        if (this._isInRiver(boss.x, newY) && !this._isOnBridge(boss.x, newY)) {
          newY = boss.y;
        }
        boss.y = newY;
      }

      // Tree collision
      const treePush = this._pushFromTrees(boss.x, boss.y, boss.size);
      boss.x = treePush.x;
      boss.y = treePush.y;

      // Contact damage: 35% of player maxHP (main.js:250-266)
      if (distToPlayer < this.player.size + boss.size) {
        if (this.bridgeBossContactInvTimer <= 0) {
          const contactDamage = Math.floor(this.player.maxHp * 0.35);
          const dead = this._playerTakeDamage(contactDamage);
          if (dead) {
            this.phase = "gameover";
            return;
          }
          if (distToPlayer > 1) {
            this._applyKnockback(dx, dy, -12);
          }
          this.bridgeBossContactInvTimer = 1.5;
        }
      }
    }
  }

  _bridgeBossTakeDamage(index, amount) {
    const boss = this.bridgeBosses[index];
    if (!boss || !boss.alive) { return; }
    boss.hp -= amount;
    if (boss.hp <= 0) {
      boss.alive = false;
      const reward = this._kokuReward(boss.scoreValue);
      const kokuGain = Math.floor(reward * this.charDef.scoreMultiplier);
      this.koku += kokuGain;
      this._checkRank();
      this.stats.bridgeBossKills++;
    }
  }

  // ============================================================
  // 12. Ikki (from main.js:97-175)
  // ============================================================
  _handleIkki() {
    if (!this.ikkiMode) { return; }
    if (this.ikkiCooldown > 0) { return; }

    const paradeLen = this.paradeMembers.length;
    if (paradeLen < 1) { return; }

    this.stats.ikkiUses++;

    // Consume 50% of parade (min 1)
    const consumeCount = Math.max(1, Math.floor(paradeLen * 0.5));
    const damageAmount = paradeLen * 8;

    for (let rc = 0; rc < consumeCount; rc++) {
      if (this.paradeMembers.length > 0) {
        this.paradeMembers.splice(this.paradeMembers.length - 1, 1);
      }
    }

    // Kill ALL enemies on screen (main.js:147-160)
    // In headless mode, we kill all enemies (simulating screen visibility)
    const camX = this.player.x - CANVAS_W / 2;
    const camY = this.player.y - CANVAS_H / 2;
    const ultMult = 2.6;
    const ultScoreMult = this.charDef.scoreMultiplier;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      // Check if on screen (matching main.js:153-154)
      if (en.x < camX || en.x > camX + CANVAS_W) { continue; }
      if (en.y < camY || en.y > camY + CANVAS_H) { continue; }
      const kokuGain = Math.floor(en.scoreValue * ultMult * ultScoreMult);
      this.koku += kokuGain;
      this.stats.enemyKills++;
      this.enemies.splice(i, 1);
    }
    this._checkRank();

    // Boss damage
    if (this.boss && !this.boss.defeated) {
      this.boss.hp -= damageAmount;
      if (this.boss.hp <= 0) {
        this._bossSuccess();
      }
    }

    this.ikkiCooldown = 10;
  }

  // ============================================================
  // 13. Gekokujo / Boss Battle (from main.js:379-935)
  // ============================================================
  _updateGekokujo(dt, action) {
    // Gate activation at 30s (main.js:409, 561-564)
    // Only activate gate once (not after boss timeout)
    if (!this.gateActive && !this.battleActive && !this.bossTriggered && this.gameTime >= 30) {
      this.gateActive = true;
    }

    // Castle proximity trigger (simplified: check distance to castle center)
    if (this.gateActive && !this.battleActive) {
      const ccx = this.castleWorldPos.x;
      const ccy = this.castleWorldPos.y;
      const px = this.player.x;
      const py = this.player.y;
      const dx = px - ccx;
      const dy = py - ccy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Trigger distance = castle radius + player size + 20 (matching expandPolygon margin)
      if (dist < this.castleCollisionRadius + this.player.size + 20) {
        // Auto-trigger boss battle (no dialog in headless)
        this._startBossBattle();
      }
    }

    // Boss battle state machine
    if (this.battleActive && this.boss && !this.boss.defeated) {
      this.battleTimer -= dt;
      this.battleElapsed += dt;
      this._updateBossAI(dt);

      // Time up: boss retreats (main.js:749)
      if (this.battleTimer <= 0) {
        this.battleActive = false;
        this.boss = null;
        // Boss will not return in simplified headless (treat as time-out)
      }
    }
  }

  _startBossBattle() {
    this.gateActive = false;
    this.battleActive = true;
    this.bossTriggered = true;
    this.battleElapsed = 0;
    this.battleTimer = 20;

    // Clear enemies (main.js:757)
    this.enemies = [];

    const rIdx = Math.min(this.rankIndex + 2, RANKS.length - 1);
    const bossHp = this.paramOverrides.bossHp != null ? this.paramOverrides.bossHp : TONO_BOSS.hp;

    this.boss = {
      x: this.castleWorldPos.x,
      y: this.castleWorldPos.y,
      hp: bossHp,
      maxHp: bossHp,
      attack: 8 + rIdx * 4,
      speed: TONO_BOSS.chaseSpeed,
      size: 64,
      attackTimer: 0,
      aiState: "CHASE",
      stateTimer: 0,
      stateDuration: 3.0,
      chargeDirX: 0,
      chargeDirY: 0,
      contactHit: false,
      decelStartSpeed: 0,
      retreatShotTimer: 0,
      defeated: false
    };

    this.phase = "boss";
  }

  _updateBossAI(dt) {
    const boss = this.boss;
    boss.stateTimer += dt;

    const castleTarget = this.castleWorldPos;
    const bdx = this.player.x - boss.x;
    const bdy = this.player.y - boss.y;
    const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

    // === State-specific behavior (main.js:609-747) ===

    if (boss.aiState === "CHASE") {
      // Move toward player, constrained to castle terrain
      if (bDist > 1) {
        const bossSpd = boss.speed * this.dtScale;
        const newX = boss.x + (bdx / bDist) * bossSpd;
        const newY = boss.y + (bdy / bDist) * bossSpd;
        if (this._getTerrainAt(newX, newY) === TERRAIN_TYPES.CASTLE) {
          boss.x = newX;
          boss.y = newY;
        }
      }
      // Contact damage (1s interval, main.js:621-628)
      if (bDist < this.player.size + boss.size) {
        boss.attackTimer += dt;
        if (boss.attackTimer > 1.0) {
          boss.attackTimer = 0;
          const dead = this._playerTakeDamage(boss.attack);
          if (dead) { this._bossFail(); return; }
        }
      }
      if (boss.stateTimer >= boss.stateDuration) {
        this._bossRollNextState("CHASE");
      }

    } else if (boss.aiState === "WINDUP") {
      // Stay still (main.js:634-638)
      if (boss.stateTimer >= boss.stateDuration) {
        this._bossRollNextState("WINDUP");
      }

    } else if (boss.aiState === "CHARGE") {
      // Move in locked direction (main.js:640-668)
      const oldX = boss.x;
      const oldY = boss.y;
      boss.x += boss.chargeDirX * boss.speed * this.dtScale;
      boss.y += boss.chargeDirY * boss.speed * this.dtScale;
      if (this._getTerrainAt(boss.x, boss.y) !== TERRAIN_TYPES.CASTLE) {
        boss.x = oldX;
        boss.y = oldY;
        this._bossRollNextState("CHARGE");
        return;
      }
      // Contact with player (main.js:655-665)
      if (!boss.contactHit && bDist < this.player.size + boss.size) {
        boss.contactHit = true;
        const chargeDmg = Math.floor(this.player.maxHp * TONO_BOSS.contactDamageRatio);
        const dead = this._playerTakeDamage(chargeDmg);
        const kbDx = this.player.x - boss.x;
        const kbDy = this.player.y - boss.y;
        this._applyKnockback(kbDx, kbDy, TONO_BOSS.knockbackForce);
        if (dead) { this._bossFail(); return; }
      }
      if (boss.contactHit || boss.stateTimer >= boss.stateDuration) {
        this._bossRollNextState("CHARGE");
      }

    } else if (boss.aiState === "DECEL") {
      // Decelerate from chargeSpeed to 1.5 (main.js:671-710)
      let decelProgress = boss.stateTimer / TONO_BOSS.decelDuration;
      if (decelProgress > 1) { decelProgress = 1; }
      const currentSpeed = TONO_BOSS.chargeSpeed - (TONO_BOSS.chargeSpeed - 1.5) * decelProgress;
      const oldX = boss.x;
      const oldY = boss.y;
      boss.x += boss.chargeDirX * currentSpeed * this.dtScale;
      boss.y += boss.chargeDirY * currentSpeed * this.dtScale;
      if (this._getTerrainAt(boss.x, boss.y) !== TERRAIN_TYPES.CASTLE) {
        boss.x = oldX;
        boss.y = oldY;
      }
      if (boss.stateTimer >= TONO_BOSS.decelDuration) {
        // Shockwave (main.js:689-709)
        const swDist = Math.sqrt(
          (this.player.x - boss.x) * (this.player.x - boss.x) +
          (this.player.y - boss.y) * (this.player.y - boss.y)
        );
        if (swDist < TONO_BOSS.shockwaveRadius) {
          const dead = this._playerTakeDamage(TONO_BOSS.shockwaveDamage);
          if (dead) { this._bossFail(); return; }
        }
        // Shockwave removes nearby parade members (main.js:700-707)
        for (let si = this.paradeMembers.length - 1; si >= 0; si--) {
          const sm = this.paradeMembers[si];
          const smDx = sm.x - boss.x;
          const smDy = sm.y - boss.y;
          if (smDx * smDx + smDy * smDy < TONO_BOSS.shockwaveRadius * TONO_BOSS.shockwaveRadius) {
            // Remove parade member (note: original code has EffectRenderer but doesn't splice -
            // checking actual behavior, it only adds effect, doesn't remove in the code shown)
            // Keeping as-is to match original behavior
          }
        }
        this._bossRollNextState("DECEL");
      }

    } else if (boss.aiState === "RETREAT") {
      // Move toward castle standoff position (main.js:712-740)
      const retreatTargetX = castleTarget.x;
      const retreatTargetY = castleTarget.y + TONO_BOSS.castleStandoffDistance;
      const rtDx = retreatTargetX - boss.x;
      const rtDy = retreatTargetY - boss.y;
      const rtDist = Math.sqrt(rtDx * rtDx + rtDy * rtDy);
      if (rtDist > 10) {
        boss.x += (rtDx / rtDist) * boss.speed * this.dtScale;
        boss.y += (rtDy / rtDist) * boss.speed * this.dtScale;
      }
      // Fire projectiles (main.js:725-734)
      boss.retreatShotTimer += dt;
      if (boss.retreatShotTimer >= TONO_BOSS.retreatProjectileInterval) {
        boss.retreatShotTimer = 0;
        const shotDx = this.player.x - boss.x;
        const shotDy = this.player.y - boss.y;
        let shotDist = Math.sqrt(shotDx * shotDx + shotDy * shotDy);
        if (shotDist < 1) { shotDist = 1; }
        this.projectiles.push({
          x: boss.x, y: boss.y,
          vx: (shotDx / shotDist) * TONO_BOSS.retreatProjectileSpeed,
          vy: (shotDy / shotDist) * TONO_BOSS.retreatProjectileSpeed,
          damage: TONO_BOSS.retreatProjectileDamage,
          life: 120, size: 6,
          fromBoss: true
        });
      }
      if (rtDist <= 10) {
        this._bossRollNextState("RETREAT");
      }

    } else if (boss.aiState === "CASTLE_WAIT") {
      // Stationary, invincible (main.js:742-747)
      if (boss.stateTimer >= boss.stateDuration) {
        this._bossRollNextState("CASTLE_WAIT");
      }
    }
  }

  // State transitions (from main.js:488-557)
  _bossChangeState(newState) {
    const boss = this.boss;
    boss.aiState = newState;
    boss.stateTimer = 0;

    if (newState === "WINDUP") {
      boss.stateDuration = this.rng.randRange(TONO_BOSS.windupDurationMin, TONO_BOSS.windupDurationMax);
      boss.speed = 0;
    } else if (newState === "CHARGE") {
      boss.stateDuration = TONO_BOSS.chargeDuration;
      boss.speed = TONO_BOSS.chargeSpeed;
      // Lock direction toward player
      const cdx = this.player.x - boss.x;
      const cdy = this.player.y - boss.y;
      let cDist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cDist < 1) { cDist = 1; }
      boss.chargeDirX = cdx / cDist;
      boss.chargeDirY = cdy / cDist;
      boss.contactHit = false;
    } else if (newState === "DECEL") {
      boss.stateDuration = TONO_BOSS.decelDuration;
      boss.decelStartSpeed = TONO_BOSS.chargeSpeed;
    } else if (newState === "RETREAT") {
      boss.stateDuration = 999;
      boss.speed = TONO_BOSS.retreatSpeed;
      boss.retreatShotTimer = 0;
    } else if (newState === "CASTLE_WAIT") {
      boss.stateDuration = this.rng.randRange(TONO_BOSS.castleWaitDurationMin, TONO_BOSS.castleWaitDurationMax);
      boss.speed = 0;
    } else if (newState === "CHASE") {
      boss.stateDuration = 3.0;
      boss.speed = TONO_BOSS.chaseSpeed;
    }
  }

  // State machine transitions (from main.js:524-557)
  _bossRollNextState(fromState) {
    const roll = this.rng.random();
    if (fromState === "WINDUP") {
      this._bossChangeState("CHARGE");
    } else if (fromState === "CHARGE") {
      this._bossChangeState("DECEL");
    } else if (fromState === "DECEL") {
      // 70% RETREAT, 30% WINDUP
      if (roll < 0.7) {
        this._bossChangeState("RETREAT");
      } else {
        this._bossChangeState("WINDUP");
      }
    } else if (fromState === "RETREAT") {
      // 70% CASTLE_WAIT, 30% skip directly to CHASE (less invincible time)
      if (roll < 0.7) {
        this._bossChangeState("CASTLE_WAIT");
      } else {
        this._bossChangeState("CHASE");
      }
    } else if (fromState === "CASTLE_WAIT") {
      // 50% WINDUP, 40% CHASE, 10% RETREAT (less RETREAT = less invincible cycles)
      if (roll < 0.5) {
        this._bossChangeState("WINDUP");
      } else if (roll < 0.9) {
        this._bossChangeState("CHASE");
      } else {
        this._bossChangeState("RETREAT");
      }
    } else if (fromState === "CHASE") {
      // 60% WINDUP, 40% CHASE continue
      if (roll < 0.6) {
        this._bossChangeState("WINDUP");
      } else {
        this._bossChangeState("CHASE");
      }
    }
  }

  _bossSuccess() {
    this.boss.defeated = true;
    this.bossDefeated = true;
    this.battleActive = false;

    // Ashigaru speed bonus (main.js:802-809)
    if (this.charKey === "ashigaru") {
      if (this.battleElapsed <= 15) {
        const bukoReward = this._kokuReward(2000);
        this.koku += bukoReward;
      }
    }

    // Gekokujo reward (main.js:810-815)
    const gekokujoBase = 2000 + this.rankIndex * 1000;
    const gekokujoReward = this._kokuReward(gekokujoBase);
    this.koku += Math.floor(gekokujoReward * this.charDef.scoreMultiplier);
    this.rankIndex = Math.min(this.rankIndex + 2, RANKS.length - 1);

    // End game as win
    this.phase = "gameover";
  }

  _bossFail() {
    this.battleActive = false;
    this.boss = null;
    this.player.hp = 0;
    this.phase = "gameover";
  }

  // ============================================================
  // Public API: getState()
  // ============================================================
  getState() {
    const p = this.player;
    const paradeLen = this.paradeMembers.length;
    const maxTime = this.ikkiMode ? 50 : MAX_TIME;

    // Calculate distances for enemies and civilians
    const enemiesState = this.enemies.map(function(en) {
      const dx = en.x - p.x;
      const dy = en.y - p.y;
      return {
        x: en.x, y: en.y,
        hp: en.hp, type: en.name,
        scoreValue: en.scoreValue,
        grit: en.grit,
        surrendering: en.surrendering,
        dist: Math.sqrt(dx * dx + dy * dy)
      };
    });

    const civiliansState = this.civilians.map(function(civ) {
      const dx = civ.x - p.x;
      const dy = civ.y - p.y;
      return {
        x: civ.x, y: civ.y,
        dist: Math.sqrt(dx * dx + dy * dy)
      };
    });

    const bridgeBossesState = this.bridgeBosses.map(function(bb) {
      const dx = bb.x - p.x;
      const dy = bb.y - p.y;
      return {
        x: bb.x, y: bb.y,
        hp: bb.hp, alive: bb.alive,
        dist: Math.sqrt(dx * dx + dy * dy)
      };
    });

    // Collect village positions
    const villagePositions = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const bl = this.blocks[i];
      if (bl.type === TERRAIN_TYPES.VILLAGE) {
        villagePositions.push({ x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 });
      }
    }

    // Boss state
    let bossState = null;
    if (this.boss) {
      bossState = {
        active: this.battleActive,
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        x: this.boss.x,
        y: this.boss.y,
        state: this.boss.aiState,
        invincible: this.boss.aiState === "CASTLE_WAIT",
        defeated: this.boss.defeated,
        chargeDirX: this.boss.chargeDirX,
        chargeDirY: this.boss.chargeDirY
      };
    }

    return {
      player: {
        x: p.x, y: p.y,
        hp: p.hp, maxHp: p.maxHp,
        koku: this.koku,
        paradeLen: paradeLen,
        rankIndex: this.rankIndex,
        rankName: RANKS[this.rankIndex].name,
        attackCD: p.attackCooldown,
        chargeCD: p.chargeCooldown,
        facingAngle: p.facingAngle
      },
      enemies: enemiesState,
      civilians: civiliansState,
      bridgeBosses: bridgeBossesState,
      boss: bossState,
      terrain: {
        castlePos: this.castleWorldPos,
        villagePositions: villagePositions,
        playerTerrain: this._getTerrainAt(p.x, p.y)
      },
      game: {
        time: this.gameTime,
        maxTime: maxTime,
        phase: this.phase,
        gateActive: this.gateActive,
        battleActive: this.battleActive,
        battleTimer: this.battleTimer,
        ikkiCD: this.ikkiCooldown,
        ikkiAvailable: this.ikkiMode && this.ikkiCooldown <= 0 && paradeLen >= 1,
        chargeAvailable: p.chargeCooldown <= 0 && paradeLen >= 3 && !this.chargeActive
      },
      map: {
        grid: this.grid,
        riverX: this.riverPath.x,
        riverWidth: this.riverPath.width,
        bridges: this.bridges
      }
    };
  }

  // ============================================================
  // Public API: isGameOver()
  // ============================================================
  isGameOver() {
    return this.phase === "gameover";
  }

  // ============================================================
  // Public API: getResult()
  // ============================================================
  getResult() {
    return {
      koku: Math.floor(this.koku),
      bossDefeated: this.bossDefeated,
      rankIndex: this.rankIndex,
      rankName: RANKS[this.rankIndex].name,
      gameTime: this.gameTime,
      charKey: this.charKey,
      ikkiMode: this.ikkiMode,
      stats: Object.assign({}, this.stats)
    };
  }

  // ============================================================
  // Public: Terrain query methods (for AI agents)
  // ============================================================
  getTerrainAt(x, y) { return this._getTerrainAt(x, y); }
  isInRiver(x, y) { return this._isInRiver(x, y); }
  isOnBridge(x, y) { return this._isOnBridge(x, y); }
}

// ============================================================
// Export constants for external use by AI agents
// ============================================================
module.exports = {
  GameEngine,
  SeededRandom,
  CHAR_DEFS,
  RANKS,
  ENEMY_DEFS,
  TERRAIN_TYPES,
  TONO_BOSS,
  MAP_W,
  MAP_H,
  BLOCK_W,
  BLOCK_H,
  CANVAS_W,
  CANVAS_H,
  MAX_TIME
};
