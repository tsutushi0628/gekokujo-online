// MapGenerator / TerrainManager — マップ生成と地形データ管理
var MapGenerator = {
  grid: null,
  castleBlock: null,
  playerBlock: null,
  bridges: [],
  riverPath: null,

  generate: function() {
    this.grid = [];
    for (var r = 0; r < 3; r++) {
      this.grid[r] = [];
      for (var c = 0; c < 3; c++) {
        this.grid[r][c] = TERRAIN_TYPES.EMPTY;
      }
    }

    // Castle on outer ring
    var outerBlocks = [
      [0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,1],[2,2]
    ];
    var castleIdx = Math.floor(Math.random() * outerBlocks.length);
    this.castleBlock = { r: outerBlocks[castleIdx][0], c: outerBlocks[castleIdx][1] };
    this.grid[this.castleBlock.r][this.castleBlock.c] = TERRAIN_TYPES.CASTLE;

    // Player: different column from castle, not center (1,1), distance >= 2
    var candidates = [];
    for (var pr = 0; pr < 3; pr++) {
      for (var pc = 0; pc < 3; pc++) {
        if (pr === 1 && pc === 1) { continue; }
        var dist = Math.abs(pr - this.castleBlock.r) + Math.abs(pc - this.castleBlock.c);
        if (dist >= 2 && pc !== this.castleBlock.c) { candidates.push({ r: pr, c: pc }); }
      }
    }
    var pIdx = Math.floor(Math.random() * candidates.length);
    this.playerBlock = candidates[pIdx];

    // Castle town adjacent to castle
    var adjList = this._getAdjacent(this.castleBlock.r, this.castleBlock.c);
    for (var ai = 0; ai < adjList.length; ai++) {
      if (this.grid[adjList[ai].r][adjList[ai].c] === TERRAIN_TYPES.EMPTY) {
        this.grid[adjList[ai].r][adjList[ai].c] = TERRAIN_TYPES.CASTLE_TOWN;
        break;
      }
    }

    // Grasslands near player
    var grassCount = 0;
    for (var gr = 0; gr < 3; gr++) {
      for (var gc = 0; gc < 3; gc++) {
        if (grassCount >= 3) { break; }
        if (this.grid[gr][gc] === TERRAIN_TYPES.EMPTY) {
          var pd = Math.abs(gr - this.playerBlock.r) + Math.abs(gc - this.playerBlock.c);
          if (pd <= 2 && Math.random() < 0.6) {
            this.grid[gr][gc] = TERRAIN_TYPES.GRASSLAND;
            grassCount++;
          }
        }
      }
    }

    // Villages
    for (var vr = 0; vr < 3; vr++) {
      for (var vc = 0; vc < 3; vc++) {
        if (this.grid[vr][vc] === TERRAIN_TYPES.EMPTY && Math.random() < 0.4) {
          this.grid[vr][vc] = TERRAIN_TYPES.VILLAGE;
        }
      }
    }

    // Generate river between castle and player
    this._generateRiver();

    // Guarantee at least one village on player's side of the river
    this._ensureVillageOnPlayerSide();

    // Build terrain data
    TerrainManager.buildFromGrid(this.grid, this.bridges, this.riverPath);
  },

  _getAdjacent: function(r, c) {
    var result = [];
    if (r > 0) { result.push({ r: r - 1, c: c }); }
    if (r < 2) { result.push({ r: r + 1, c: c }); }
    if (c > 0) { result.push({ r: r, c: c - 1 }); }
    if (c < 2) { result.push({ r: r, c: c + 1 }); }
    return result;
  },

  _ensureVillageOnPlayerSide: function() {
    // Determine which columns are on player's side of the river
    var riverCenterX = this.riverPath.x + this.riverPath.width / 2;
    var playerCX = this.playerBlock.c * BLOCK_W + BLOCK_W / 2;
    var playerIsLeft = (playerCX < riverCenterX);

    // Check if any village exists on player's side
    var hasVillage = false;
    var emptyOnPlayerSide = null;
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var blockCX = c * BLOCK_W + BLOCK_W / 2;
        var isPlayerSide = playerIsLeft ? (blockCX < riverCenterX) : (blockCX > riverCenterX);
        if (!isPlayerSide) { continue; }

        if (this.grid[r][c] === TERRAIN_TYPES.VILLAGE) {
          hasVillage = true;
        }
        if (this.grid[r][c] === TERRAIN_TYPES.EMPTY || this.grid[r][c] === TERRAIN_TYPES.GRASSLAND) {
          emptyOnPlayerSide = { r: r, c: c };
        }
      }
    }

    // If no village on player's side, convert an empty/grassland block
    if (!hasVillage && emptyOnPlayerSide) {
      this.grid[emptyOnPlayerSide.r][emptyOnPlayerSide.c] = TERRAIN_TYPES.VILLAGE;
    }
  },

  _generateRiver: function() {
    // Vertical river crosses between castle and player columns
    var castleCX = this.castleBlock.c * BLOCK_W + BLOCK_W / 2;
    var playerCX = this.playerBlock.c * BLOCK_W + BLOCK_W / 2;
    var riverX = (castleCX + playerCX) / 2;
    // Clamp
    if (riverX < 400) { riverX = 400; }
    if (riverX > 1400) { riverX = 1400; }

    // Random river width: 60px to 150px
    var riverWidth = 60 + Math.floor(Math.random() * 91);

    // Ensure river does not overlap with the castle block
    var castleLeft = this.castleBlock.c * BLOCK_W;
    var castleRight = castleLeft + BLOCK_W;
    var riverRight = riverX + riverWidth;
    if (riverX < castleRight && riverRight > castleLeft) {
      // River overlaps castle block — push river away
      var pushLeft = castleRight - riverX;
      var pushRight = riverRight - castleLeft;
      if (pushLeft < pushRight) {
        // Easier to push river to the right of castle
        riverX = castleRight + 20;
      } else {
        // Push river to the left of castle
        riverX = castleLeft - riverWidth - 20;
      }
      // Re-clamp
      if (riverX < 100) { riverX = 100; }
      if (riverX > MAP_W - riverWidth - 100) { riverX = MAP_W - riverWidth - 100; }
    }

    this.riverPath = {
      x: riverX,
      width: riverWidth
    };

    // Two horizontal bridges crossing the vertical river
    var nearBridgeY = 200 + Math.random() * 600;
    var farBridgeY = 1200 + Math.random() * 800;
    var bridgeW = riverWidth + 20;
    this.bridges = [
      { x: riverX - 10, y: nearBridgeY, w: bridgeW, h: 70, safe: false },
      { x: riverX - 10, y: farBridgeY, w: bridgeW, h: 120, safe: true }
    ];
  },

  getCastleWorldPos: function() {
    return {
      x: this.castleBlock.c * BLOCK_W + BLOCK_W / 2,
      y: this.castleBlock.r * BLOCK_H + BLOCK_H / 2
    };
  },

  getPlayerStartPos: function() {
    return {
      x: this.playerBlock.c * BLOCK_W + BLOCK_W / 2,
      y: this.playerBlock.r * BLOCK_H + BLOCK_H / 2
    };
  }
};

var TerrainManager = {
  blocks: [],
  riverX: 0,
  riverW: 50,
  bridges: [],

  buildFromGrid: function(grid, bridges, riverPath) {
    this.blocks = [];
    this.bridges = bridges;
    if (riverPath) {
      this.riverX = riverPath.x;
      this.riverW = riverPath.width;
    }

    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        this.blocks.push({
          type: grid[r][c],
          x: c * BLOCK_W,
          y: r * BLOCK_H,
          w: BLOCK_W,
          h: BLOCK_H,
          row: r,
          col: c
        });
      }
    }
  },

  isInRiver: function(x, y) {
    if (x >= this.riverX && x <= this.riverX + this.riverW) {
      for (var i = 0; i < this.bridges.length; i++) {
        var b = this.bridges[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          return false;
        }
      }
      return true;
    }
    return false;
  },

  isOnBridge: function(x, y) {
    for (var i = 0; i < this.bridges.length; i++) {
      var b = this.bridges[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return true;
      }
    }
    return false;
  },

  isInGrassland: function(x, y) {
    for (var i = 0; i < this.blocks.length; i++) {
      var bl = this.blocks[i];
      if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        if (x >= bl.x && x <= bl.x + bl.w && y >= bl.y && y <= bl.y + bl.h) {
          return true;
        }
      }
    }
    return false;
  },

  getTerrainAt: function(x, y) {
    for (var i = 0; i < this.blocks.length; i++) {
      var bl = this.blocks[i];
      if (x >= bl.x && x <= bl.x + bl.w && y >= bl.y && y <= bl.y + bl.h) {
        return bl.type;
      }
    }
    return TERRAIN_TYPES.EMPTY;
  },

  isTreeCollision: function(x, y, entitySize) {
    var trees = TreeManager.trees;
    for (var i = 0; i < trees.length; i++) {
      var tree = trees[i];
      var tdx = x - tree.x;
      var tdy = y - tree.y;
      var tDist = Math.sqrt(tdx * tdx + tdy * tdy);
      var minDist = tree.collisionRadius + entitySize;
      if (tDist < minDist) {
        return true;
      }
    }
    return false;
  },

  pushFromTrees: function(x, y, entitySize) {
    var trees = TreeManager.trees;
    var nx = x;
    var ny = y;
    for (var i = 0; i < trees.length; i++) {
      var tree = trees[i];
      var tdx = nx - tree.x;
      var tdy = ny - tree.y;
      var tDist = Math.sqrt(tdx * tdx + tdy * tdy);
      var minDist = tree.collisionRadius + entitySize;
      if (tDist < minDist && tDist > 0) {
        var pushX = (tdx / tDist) * (minDist - tDist);
        var pushY = (tdy / tDist) * (minDist - tDist);
        nx += pushX;
        ny += pushY;
      }
    }
    return { x: nx, y: ny };
  },

  clampPosition: function(x, y) {
    var nx = x;
    var ny = y;
    if (nx < 15) { nx = 15; }
    if (nx > MAP_W - 15) { nx = MAP_W - 15; }
    if (ny < 15) { ny = 15; }
    if (ny > MAP_H - 15) { ny = MAP_H - 15; }
    return { x: nx, y: ny };
  }
};

// ============================================================
// TreeManager - deterministic tree placement with collision
// ============================================================
var TreeManager = {
  trees: [],

  clear: function() {
    this.trees = [];
  },

  generate: function() {
    this.trees = [];
    var seed = 48271;
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var bl = TerrainManager.blocks[i];
      // Place trees on grassland and empty terrain
      if (bl.type !== TERRAIN_TYPES.GRASSLAND && bl.type !== TERRAIN_TYPES.EMPTY) {
        continue;
      }
      var treeCount = 6;
      if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        treeCount = 10;
      }
      for (var t = 0; t < treeCount; t++) {
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var tx = bl.x + 80 + (seed % (BLOCK_W - 160));
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        var ty = bl.y + 80 + (seed % (BLOCK_H - 160));
        // Skip if in river
        if (TerrainManager.isInRiver(tx, ty)) { continue; }
        // Skip if too close to bridge
        var nearBridge = false;
        for (var bi = 0; bi < TerrainManager.bridges.length; bi++) {
          var br = TerrainManager.bridges[bi];
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
};
