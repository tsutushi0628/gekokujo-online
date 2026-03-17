// entities.js - プレイヤー、敵、民間人、弾丸、行列の管理

// ============================================================
// Polygon collision utilities
// ============================================================
function pointInPolygon(px, py, vertices) {
  var inside = false;
  var n = vertices.length;
  var j = n - 1;
  for (var i = 0; i < n; i++) {
    var xi = vertices[i][0];
    var yi = vertices[i][1];
    var xj = vertices[j][0];
    var yj = vertices[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function expandPolygon(vertices, cx, cy, margin) {
  var expanded = [];
  for (var i = 0; i < vertices.length; i++) {
    var vx = vertices[i][0] - cx;
    var vy = vertices[i][1] - cy;
    var dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < 1) { dist = 1; }
    expanded.push([cx + vx / dist * (dist + margin), cy + vy / dist * (dist + margin)]);
  }
  return expanded;
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  var abx = bx - ax;
  var aby = by - ay;
  var apx = px - ax;
  var apy = py - ay;
  var t = (apx * abx + apy * aby) / (abx * abx + aby * aby);
  if (t < 0) { t = 0; }
  if (t > 1) { t = 1; }
  return { x: ax + t * abx, y: ay + t * aby };
}

function resolvePolygonPushOut(entity, entitySize, vertices) {
  if (!pointInPolygon(entity.x, entity.y, vertices)) {
    // Check if entity circle overlaps any edge
    var pushed = false;
    var n = vertices.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var cp = closestPointOnSegment(entity.x, entity.y, vertices[i][0], vertices[i][1], vertices[j][0], vertices[j][1]);
      var dx = entity.x - cp.x;
      var dy = entity.y - cp.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < entitySize && dist > 0) {
        entity.x = cp.x + (dx / dist) * entitySize;
        entity.y = cp.y + (dy / dist) * entitySize;
        pushed = true;
      }
    }
    return;
  }
  // Entity center is inside polygon: push out to nearest edge
  var bestDist = 999999;
  var bestNx = 0;
  var bestNy = 0;
  var n = vertices.length;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n;
    var cp = closestPointOnSegment(entity.x, entity.y, vertices[i][0], vertices[i][1], vertices[j][0], vertices[j][1]);
    var dx = entity.x - cp.x;
    var dy = entity.y - cp.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      if (dist > 0) {
        bestNx = dx / dist;
        bestNy = dy / dist;
      } else {
        // On the edge exactly: use edge normal
        var ex = vertices[j][0] - vertices[i][0];
        var ey = vertices[j][1] - vertices[i][1];
        var eLen = Math.sqrt(ex * ex + ey * ey);
        if (eLen > 0) {
          bestNx = -ey / eLen;
          bestNy = ex / eLen;
        }
      }
    }
  }
  entity.x += bestNx * (bestDist + entitySize);
  entity.y += bestNy * (bestDist + entitySize);
}

// ============================================================
// Shared building collision resolution
// ============================================================
function resolveHouseCollision(entity, entitySize) {
  var blockRow = Math.floor(entity.y / BLOCK_H);
  var blockCol = Math.floor(entity.x / BLOCK_W);
  if (blockRow < 0) { blockRow = 0; }
  if (blockRow > 2) { blockRow = 2; }
  if (blockCol < 0) { blockCol = 0; }
  if (blockCol > 2) { blockCol = 2; }
  var terrain = TerrainManager.getTerrainAt(entity.x, entity.y);
  if (terrain !== TERRAIN_TYPES.VILLAGE && terrain !== TERRAIN_TYPES.CASTLE_TOWN && terrain !== TERRAIN_TYPES.CASTLE) {
    return;
  }
  var blockHouses = HouseManager.getHouses(blockRow, blockCol);
  var blockOriginX = blockCol * BLOCK_W;
  var blockOriginY = blockRow * BLOCK_H;
  for (var hi = 0; hi < blockHouses.length; hi++) {
    var house = blockHouses[hi];
    var houseWorldX = blockOriginX + house.x;
    var houseWorldY = blockOriginY + house.y;
    var hdx = entity.x - houseWorldX;
    var hdy = entity.y - houseWorldY;
    var hDist = Math.sqrt(hdx * hdx + hdy * hdy);
    var minDist = house.collisionRadius + entitySize;
    if (hDist < minDist && hDist > 0) {
      var pushX = (hdx / hDist) * (minDist - hDist);
      var pushY = (hdy / hDist) * (minDist - hDist);
      entity.x += pushX;
      entity.y += pushY;
    }
  }
}

// ============================================================
// Castle collision (pentagon push-out)
// ============================================================
function resolveCastleCollision(entity, entitySize) {
  if (!GekokujoSystem.castleCollision) { return; }
  var cc = GekokujoSystem.castleCollision;
  resolvePolygonPushOut(entity, entitySize, cc.vertices);
}

// ============================================================
// PlayerController
// ============================================================
var PlayerController = {
  x: 0, y: 0,
  hp: 100, maxHp: 100,
  size: 30,
  facingLeft: false,
  facingAngle: 0,
  knockbackTimer: 0,
  knockbackDirX: 0,
  knockbackDirY: 0,
  attackCooldown: 0,
  chargeCooldown: 0,

  init: function(startPos) {
    var def = gameState.charDef;
    this.x = startPos.x;
    this.y = startPos.y;
    this.hp = 100;
    this.maxHp = 100;
    this.size = 30;
    this.facingLeft = false;
    this.facingAngle = 0;
    this.knockbackTimer = 0;
    this.attackCooldown = 0;
    this.chargeCooldown = 0;
  },

  update: function(dt) {
    var def = gameState.charDef;
    if (this.attackCooldown > 0) { this.attackCooldown -= dt; }

    if (this.chargeCooldown > 0) { this.chargeCooldown -= dt; }

    // HP regen
    if (this.hp < this.maxHp) {
      this.hp += dt * 2;
      if (this.hp > this.maxHp) { this.hp = this.maxHp; }
    }

    // Knockback
    if (this.knockbackTimer > 0) {
      var prevX = this.x;
      var prevY = this.y;
      this.x += this.knockbackDirX;
      this.y += this.knockbackDirY;
      if (TerrainManager.isInRiver(this.x, this.y)) {
        this.x = prevX;
        this.y = prevY;
      }
      this.knockbackTimer -= dt;
      this.knockbackDirX *= 0.9;
      this.knockbackDirY *= 0.9;
    }

    if (this.knockbackTimer <= 0) {
      // WASD movement
      var spd = def.speed + (gameState.rankIndex * 0.3);
      // Parade penalty: 2% slowdown per follower, cap 30%
      var paradeLen = ParadeController.getLength();
      if (paradeLen > 0) {
        var penalty = paradeLen * 0.02;
        if (penalty > 0.30) { penalty = 0.30; }
        spd = spd * (1.0 - penalty);
      }
      // River slow: 0.3x speed
      if (TerrainManager.isInRiver(this.x, this.y)) {
        spd = spd * 0.3;
      }
      var mdx = 0;
      var mdy = 0;
      if (InputManager.keys.w) { this.y -= spd; mdy -= 1; }
      if (InputManager.keys.s) { this.y += spd; mdy += 1; }
      if (InputManager.keys.a) { this.x -= spd; this.facingLeft = true; mdx -= 1; }
      if (InputManager.keys.d) { this.x += spd; this.facingLeft = false; mdx += 1; }
      if (mdx !== 0 || mdy !== 0) {
        this.facingAngle = Math.atan2(mdy, mdx);
      }
    }

    // Clamp
    var clamped = TerrainManager.clampPosition(this.x, this.y);
    this.x = clamped.x;
    this.y = clamped.y;

    // Tree collision
    var treePush = TerrainManager.pushFromTrees(this.x, this.y, this.size);
    this.x = treePush.x;
    this.y = treePush.y;

    // Building collision (shared function)
    resolveHouseCollision(this, this.size);

    // Castle collision
    resolveCastleCollision(this, this.size);

    // SPACE is reserved for Tsujigiri QTE only
  },

  applyKnockback: function(dirX, dirY, force) {
    this.knockbackTimer = 0.3;
    var dist = Math.sqrt(dirX * dirX + dirY * dirY);
    if (dist < 1) { dist = 1; }
    this.knockbackDirX = (dirX / dist) * force;
    this.knockbackDirY = (dirY / dist) * force;
  },

  takeDamage: function(amount) {
    var dmgMult = CHAR_DEFS[gameState.selectedChar].damageTakenMultiplier;
    this.hp -= Math.floor(amount * dmgMult);
    EffectRenderer.add(this.x, this.y, "playerHit");
    DamageVignette.trigger();
    if (this.hp <= 0) {
      this.hp = 0;
      return true; // dead
    }
    return false;
  },

  getAttackPower: function() {
    var def = gameState.charDef;
    var base = def.attack;
    var followerBonus = Math.floor(ParadeController.getLength() * def.followerBonus * base * 10);
    return base + followerBonus;
  },

  draw: function(ctx) {
    var sp = CameraController.worldToScreen(this.x, this.y);
    if (this.knockbackTimer > 0) { ctx.globalAlpha = 0.6 + Math.sin(performance.now() * 0.05) * 0.3; }

    var spriteKey = CHAR_SPRITE_MAP[gameState.selectedChar];
    if (spritesLoaded && spriteKey) {
      var playerFlipH = false;
      if (gameState.selectedChar === "merchant") {
        playerFlipH = false;
      } else {
        playerFlipH = !this.facingLeft;
      }
      drawSpriteCentered(ctx, spriteKey, sp.x, sp.y, 80, playerFlipH);
    } else {
      ctx.font = FONT.player;
      ctx.textAlign = "center";
      ctx.fillText(gameState.charDef.emoji, sp.x, sp.y + 8);
    }
    ctx.globalAlpha = 1.0;

    // HP bar
    ctx.fillStyle = "#ddd";
    ctx.fillRect(sp.x - 22, sp.y - 48, 44, 7);
    var hpR = this.hp / this.maxHp;
    if (hpR > 0.5) { ctx.fillStyle = "#4a8"; }
    else { ctx.fillStyle = "#c44"; }
    ctx.fillRect(sp.x - 22, sp.y - 48, 44 * hpR, 7);
  }
};

// ============================================================
// EnemyManager
// ============================================================
var EnemyManager = {
  enemies: [],
  spawnTimer: 0,
  waveAnnounced: [false, false, false],

  init: function() {
    this.enemies = [];
    this.spawnTimer = 0;
    this.waveAnnounced = [false, false, false];
  },

  spawn: function() {
    var charDef = CHAR_DEFS[gameState.selectedChar];
    var maxEn = 12;
    if (charDef.maxEnemies) { maxEn = charDef.maxEnemies; }
    if (this.enemies.length >= maxEn) { return; }

    var tier = 0;
    if (gameState.gameTime > 60) { tier = 3; }
    else if (gameState.gameTime > 30) { tier = 2; }
    else if (gameState.gameTime > 15) { tier = 1; }

    var idx = Math.min(tier, Math.floor(Math.random() * (tier + 1)));
    var def = ENEMY_DEFS[idx];

    // Spawn near edges of visible area or around map
    var ex, ey;
    var edge = Math.floor(Math.random() * 4);
    var margin = 100;
    if (edge === 0) { ex = CameraController.x + Math.random() * CANVAS_W; ey = CameraController.y - margin; }
    else if (edge === 1) { ex = CameraController.x + CANVAS_W + margin; ey = CameraController.y + Math.random() * CANVAS_H; }
    else if (edge === 2) { ex = CameraController.x + Math.random() * CANVAS_W; ey = CameraController.y + CANVAS_H + margin; }
    else { ex = CameraController.x - margin; ey = CameraController.y + Math.random() * CANVAS_H; }

    // Clamp to map
    if (ex < 20) { ex = 20; }
    if (ex > MAP_W - 20) { ex = MAP_W - 20; }
    if (ey < 20) { ey = 20; }
    if (ey > MAP_H - 20) { ey = MAP_H - 20; }
    // Don't spawn in river
    if (TerrainManager.isInRiver(ex, ey)) { ex = TerrainManager.riverX - 30; }

    // Reduce spawn rate near castle town (well-guarded area)
    var terrType = TerrainManager.getTerrainAt(ex, ey);
    if (terrType === TERRAIN_TYPES.CASTLE_TOWN) {
      // Find distance to nearest castle_town center
      var nearestDist = 9999;
      for (var ti = 0; ti < TerrainManager.blocks.length; ti++) {
        var tbl = TerrainManager.blocks[ti];
        if (tbl.type === TERRAIN_TYPES.CASTLE_TOWN) {
          var tcx = tbl.x + tbl.w / 2;
          var tcy = tbl.y + tbl.h / 2;
          var tdx = ex - tcx;
          var tdy = ey - tcy;
          var tDist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tDist < nearestDist) { nearestDist = tDist; }
        }
      }
      // Closer to center = less likely to spawn (70% rejection at center, 0% at 400px+)
      var rejectChance = 0.7 * Math.max(0, 1 - nearestDist / 400);
      if (Math.random() < rejectChance) { return; }
    }

    // Castle town enemies are stronger
    var hpMult = 1;
    if (terrType === TERRAIN_TYPES.CASTLE_TOWN) { hpMult = 1.5; }


    this.enemies.push({
      x: ex, y: ey,
      hp: Math.floor(def.hp * hpMult), maxHp: Math.floor(def.hp * hpMult),
      attack: def.attack, speed: def.speed,
      scoreValue: def.score, size: def.size,
      emoji: def.emoji, name: def.name,
      grit: def.grit,
      attackTimer: 0,
      surrendering: false, surrenderTimer: 0,
      facingLeft: false
    });
  },

  update: function(dt) {
    // Wave announcements
    if (gameState.gameTime >= 30 && !this.waveAnnounced[0]) {
      this.waveAnnounced[0] = true;
      AnnouncementSystem.add("第二波 襲来!", "bad");
    }
    if (gameState.gameTime >= 60 && !this.waveAnnounced[1]) {
      this.waveAnnounced[1] = true;
      AnnouncementSystem.add("第三波 襲来!!", "bad");
    }

    // Spawning
    this.spawnTimer += dt;
    var charDefForSpawn = CHAR_DEFS[gameState.selectedChar];
    var spawnInt = 3;
    if (charDefForSpawn.spawnInterval) { spawnInt = charDefForSpawn.spawnInterval; }
    if (this.spawnTimer > spawnInt) {
      this.spawnTimer = 0;
      if (this.enemies.length < 6) { this.spawn(); this.spawn(); }
      else if (this.enemies.length < 10) { this.spawn(); }
    }

    var px = PlayerController.x;
    var py = PlayerController.y;

    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var en = this.enemies[i];

      // Surrendering
      if (en.surrendering) {
        en.surrenderTimer -= dt;
        if (en.surrenderTimer <= 0) {
          var surrenderScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
          var surrenderReward = KokuReward.apply(en.scoreValue, gameState);
          gameState.koku += Math.floor(surrenderReward * surrenderScoreMult);
          FloatingScoreSystem.show(surrenderReward);
          RankSystem.check();
          EffectRenderer.add(en.x, en.y, "surrender");
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // AI: move toward player
      var dx = px - en.x;
      var dy = py - en.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        var enemySpd = en.speed;
        var newX = en.x + (dx / dist) * enemySpd;
        var newY = en.y + (dy / dist) * enemySpd;
        // Block river crossing (allow only on bridge)
        if (TerrainManager.isInRiver(newX, newY) && !TerrainManager.isOnBridge(newX, newY)) {
          newX = en.x;
          newY = en.y;
        }
        // Track facing direction
        if (dx < 0) { en.facingLeft = true; }
        if (dx > 0) { en.facingLeft = false; }
        en.x = newX;
        en.y = newY;
      }

      // Tree collision for enemies
      var enTreePush = TerrainManager.pushFromTrees(en.x, en.y, en.size);
      en.x = enTreePush.x;
      en.y = enTreePush.y;

      // Building collision for enemies
      resolveHouseCollision(en, en.size);

      // Castle collision for enemies
      resolveCastleCollision(en, en.size);

      // Melee attack on player
      if (dist < PlayerController.size + en.size) {
        en.attackTimer += dt;
        if (en.attackTimer > 0.8) {
          en.attackTimer = 0;
          var dead = PlayerController.takeDamage(en.attack);
          if (dead) {
            gameState.phase = "result";
            BgmController.fadeOut(500);
            skullScreen.classList.add("active");
            return;
          }
        }
      }

      // All parade members are invincible (cannot die from enemy attacks)
    }
  },

  removeEnemy: function(index) {
    this.enemies.splice(index, 1);
  },

  draw: function(ctx) {
    for (var i = 0; i < this.enemies.length; i++) {
      var en = this.enemies[i];
      if (!CameraController.isVisible(en.x, en.y, 30)) { continue; }
      var sp = CameraController.worldToScreen(en.x, en.y);
      ctx.textAlign = "center";

      if (en.surrendering) {
        ctx.font = Math.round((en.size + 4) * 1.5) + "px " + FONT_FAMILY;
        ctx.fillText("\uD83C\uDFF3\uFE0F", sp.x, sp.y + en.size / 3);
        ctx.fillStyle = "#1a1a1a";
        ctx.font = FONT.h4;
        ctx.fillText("降伏!", sp.x, sp.y - en.size - 8);
      } else if (spritesLoaded) {
        var enemySpriteKey = "nobushi";
        var enFlipH = (en.x < PlayerController.x);
        var enemySpriteH = 64 + en.size;
        var enShadowColor = en.doushiuchi ? "180, 60, 255" : "255, 40, 40";
        var enShadowY = sp.y + (64 + en.size) / 2;
        var enShadowRx = (14 + en.size * 0.3) * 1.5;
        var enGrad = ctx.createRadialGradient(sp.x, enShadowY, 0, sp.x, enShadowY, enShadowRx);
        enGrad.addColorStop(0,   "rgba(" + enShadowColor + ", 0.55)");
        enGrad.addColorStop(0.4, "rgba(" + enShadowColor + ", 0.25)");
        enGrad.addColorStop(1,   "rgba(" + enShadowColor + ", 0)");
        ctx.fillStyle = enGrad;
        ctx.beginPath();
        ctx.ellipse(sp.x, enShadowY, enShadowRx, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSpriteCentered(ctx, enemySpriteKey, sp.x, sp.y, enemySpriteH, enFlipH);
      } else {
        var facingLeft = (en.x > PlayerController.x);
        ctx.font = Math.round((en.size + 4) * 1.5) + "px " + FONT_FAMILY;
        ctx.save();
        if (facingLeft) {
          ctx.translate(sp.x, sp.y + en.size / 3);
          ctx.scale(-1, 1);
          ctx.fillText(en.emoji, 0, 0);
        } else {
          ctx.fillText(en.emoji, sp.x, sp.y + en.size / 3);
        }
        ctx.restore();
      }

      // HP bar
      if (en.hp < en.maxHp && !en.surrendering) {
        var hpR = en.hp / en.maxHp;
        ctx.fillStyle = "#ddd";
        ctx.fillRect(sp.x - 16, sp.y - en.size - 22, 32, 6);
        if (hpR > 0.5) { ctx.fillStyle = "#4a8"; }
        else { ctx.fillStyle = "#c44"; }
        ctx.fillRect(sp.x - 16, sp.y - en.size - 22, 32 * hpR, 6);
      }
    }
  }
};

// ============================================================
// CivilianManager
// ============================================================
var CivilianManager = {
  civilians: [],
  spawnTimer: 0,

  init: function() {
    this.civilians = [];
    this.spawnTimer = 0;
  },

  spawn: function() {
    if (this.civilians.length >= 20) { return; }

    // Collect village and castle_town block centers
    var townCenters = [];
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var bl = TerrainManager.blocks[i];
      if (bl.type === TERRAIN_TYPES.VILLAGE || bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        townCenters.push({
          x: bl.x + bl.w / 2,
          y: bl.y + bl.h / 2
        });
      }
    }
    if (townCenters.length === 0) { return; }

    // Pick a random town/village as spawn origin
    var origin = townCenters[Math.floor(Math.random() * townCenters.length)];

    // Distance decay: Math.random() * Math.random() biases toward 0 (close to origin)
    var maxSpawnRadius = 600;
    var dist = Math.random() * Math.random() * maxSpawnRadius;
    var angle = Math.random() * Math.PI * 2;
    var cx = origin.x + Math.cos(angle) * dist;
    var cy = origin.y + Math.sin(angle) * dist;

    // Clamp to map bounds
    if (cx < 50) { cx = 50; }
    if (cx > MAP_W - 50) { cx = MAP_W - 50; }
    if (cy < 50) { cy = 50; }
    if (cy > MAP_H - 50) { cy = MAP_H - 50; }

    // Skip river, castle
    if (TerrainManager.isInRiver(cx, cy)) { return; }
    var terrain = TerrainManager.getTerrainAt(cx, cy);
    if (terrain === TERRAIN_TYPES.CASTLE) { return; }

    this.civilians.push({
      x: cx, y: cy,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 0,
      recruitTimer: 0
    });
  },

  update: function(dt) {
    var def = gameState.charDef;
    this.spawnTimer += dt;
    if (this.spawnTimer > 4) {
      this.spawnTimer = 0;
      if (this.civilians.length < 15) { this.spawn(); }
    }

    for (var i = this.civilians.length - 1; i >= 0; i--) {
      var civ = this.civilians[i];
      // Wander
      civ.wanderTimer += dt;
      if (civ.wanderTimer > 2) { civ.wanderTimer = 0; civ.wanderAngle = Math.random() * Math.PI * 2; }
      var civNewX = civ.x + Math.cos(civ.wanderAngle) * 0.3;
      var civNewY = civ.y + Math.sin(civ.wanderAngle) * 0.3;
      // Block river crossing (allow only on bridge)
      if (TerrainManager.isInRiver(civNewX, civNewY) && !TerrainManager.isOnBridge(civNewX, civNewY)) {
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

      // Tree collision for civilians
      var civTreePush = TerrainManager.pushFromTrees(civ.x, civ.y, 12);
      civ.x = civTreePush.x;
      civ.y = civTreePush.y;

      // Building collision for civilians
      resolveHouseCollision(civ, 12);

      // Recruit check
      var recruitRange = def.recruitRange + ParadeController.getLength() * 5;
      var dx = PlayerController.x - civ.x;
      var dy = PlayerController.y - civ.y;
      var distSq = dx * dx + dy * dy;
      if (distSq < recruitRange * recruitRange) {
        if (gameState.selectedChar === "merchant") {
          // Merchant: instant recruit with koku cost
          if (gameState.koku >= def.recruitCost) {
            gameState.koku -= def.recruitCost;
            ParadeController.addMember(civ.x, civ.y);
            EffectRenderer.add(civ.x, civ.y, "recruit");
            this.civilians.splice(i, 1);
          }
        } else {
          civ.recruitTimer += dt * 1000;
          if (civ.recruitTimer >= def.recruitTime) {
            ParadeController.addMember(civ.x, civ.y);
            EffectRenderer.add(civ.x, civ.y, "recruit");
            this.civilians.splice(i, 1);
          }
        }
      } else {
        civ.recruitTimer = 0;
      }
    }
  },

  draw: function(ctx) {
    var def = gameState.charDef;
    for (var i = 0; i < this.civilians.length; i++) {
      var civ = this.civilians[i];
      if (!CameraController.isVisible(civ.x, civ.y, 20)) { continue; }
      var sp = CameraController.worldToScreen(civ.x, civ.y);
      if (spritesLoaded) {
        var civFacingLeft = (Math.cos(civ.wanderAngle) < 0);
        drawSpriteCentered(ctx, "nomin_npc", sp.x, sp.y, 48, civFacingLeft);
      } else {
        ctx.font = FONT.civilian;
        ctx.textAlign = "center";
        ctx.fillText("\uD83D\uDC64", sp.x, sp.y + 4);
      }

      // Recruiting indicator
      var rdx = PlayerController.x - civ.x;
      var rdy = PlayerController.y - civ.y;
      var rDistSq = rdx * rdx + rdy * rdy;
      var effectiveRange = def.recruitRange + ParadeController.getLength() * 5;
      if (rDistSq < effectiveRange * effectiveRange) {
        if (gameState.selectedChar === "merchant") { continue; }
        ctx.fillStyle = "#1a1a1a";
        ctx.font = FONT.h4;
        if (civ.recruitTimer > def.recruitTime * 0.5) {
          ctx.fillText("!", sp.x, sp.y - 12);
        } else {
          ctx.fillText("?", sp.x, sp.y - 12);
        }
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(sp.x - 10, sp.y - 20, 20 * (civ.recruitTimer / def.recruitTime), 3);
      }
    }
  }
};

// ============================================================
// ParadeController (pikmin-style orbit around player)
// ============================================================
var ParadeController = {
  members: [],

  init: function() {
    this.members = [];
  },

  addMember: function(x, y) {
    var member = {
      x: x, y: y, detached: false, attackCooldown: 0,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitRadius: Math.random() * 40
    };
    this.members.push(member);
  },

  getLength: function() {
    return this.members.length;
  },

  update: function(dt) {
    // Ashigaru/Merchant: probability-based follower departure
    // Ashigaru: 0.5%/sec × 人数スケール（大人数ほど不安定）, Merchant: 8%±4%/sec
    var isDepartingChar = gameState.selectedChar === "ashigaru" || gameState.selectedChar === "merchant";
    if (isDepartingChar && this.members.length > 0) {
      var departRate;
      if (gameState.selectedChar === "merchant") {
        var variance = 0.04;
        departRate = 0.08 + (Math.random() - 0.5) * 2 * variance;
      } else {
        departRate = 0.005 * this.members.length;
      }
      if (Math.random() < departRate * dt) {
        var idx = Math.floor(Math.random() * this.members.length);
        var departed = this.members.splice(idx, 1)[0];
        EffectRenderer.add(departed.x, departed.y, "surrender");
        if (gameState.selectedChar === "ashigaru") {
          AnnouncementSystem.add("農民が抜けた!", "bad");
        }
        var spawnX, spawnY;
        if (gameState.selectedChar === "merchant") {
          // Spawn at a random village/castle_town so they can't be instantly re-recruited
          var townCenters = [];
          for (var ti = 0; ti < TerrainManager.blocks.length; ti++) {
            var tb = TerrainManager.blocks[ti];
            if (tb.type === TERRAIN_TYPES.VILLAGE || tb.type === TERRAIN_TYPES.CASTLE_TOWN) {
              townCenters.push({ x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 });
            }
          }
          if (townCenters.length > 0) {
            var origin = townCenters[Math.floor(Math.random() * townCenters.length)];
            spawnX = origin.x + (Math.random() - 0.5) * 400;
            spawnY = origin.y + (Math.random() - 0.5) * 400;
          } else {
            spawnX = Math.random() * MAP_W;
            spawnY = Math.random() * MAP_H;
          }
        } else {
          spawnX = departed.x;
          spawnY = departed.y;
        }
        CivilianManager.civilians.push({
          x: spawnX, y: spawnY,
          wanderAngle: Math.random() * Math.PI * 2,
          wanderTimer: 0,
          recruitTimer: 0
        });
      }
    }

    // Update each member: orbit around player (pikmin-style)
    for (var i = this.members.length - 1; i >= 0; i--) {
      var m = this.members[i];
      if (m.detached) { continue; }


      // Pikmin orbit movement (skip during charge - ParadeChargeSystem handles movement)
      if (!ParadeChargeSystem.active) {
        var wobble = Math.sin(m.orbitAngle * 2.7 + i) * 0.4;
        var targetAngle = m.orbitAngle + wobble;
        var targetRadius = 40 + m.orbitRadius;
        var targetX = PlayerController.x + Math.cos(targetAngle) * targetRadius;
        var targetY = PlayerController.y + Math.sin(targetAngle) * targetRadius;

        // Lerp toward target position
        var mNewX = m.x + (targetX - m.x) * 0.1;
        var mNewY = m.y + (targetY - m.y) * 0.1;

        // Block river crossing (allow only on bridge)
        if (TerrainManager.isInRiver(mNewX, mNewY) && !TerrainManager.isOnBridge(mNewX, mNewY)) {
          mNewX = m.x;
          mNewY = m.y;
        }
        m.x = mNewX;
        m.y = mNewY;

        // Slowly rotate orbit angle for wandering feel
        m.orbitAngle += 0.3 * dt;

        // Building collision for parade members
        resolveHouseCollision(m, 12);
      }

      // Parade member attack (all characters)
      if (m.attackCooldown > 0) { m.attackCooldown -= dt; }
      if (m.attackCooldown <= 0) {
        var paradeAttackRadius = 50;
        var paradeAttackRadiusSq = 2500;
        var paradeDamage = 3;
        if (gameState.selectedChar === "ashigaru") { paradeDamage = 2; }
        for (var ei = EnemyManager.enemies.length - 1; ei >= 0; ei--) {
          var en = EnemyManager.enemies[ei];
          if (en.surrendering) { continue; }
          var edx = m.x - en.x;
          var edy = m.y - en.y;
          if (edx * edx + edy * edy < paradeAttackRadiusSq) {
            en.hp -= paradeDamage;
            m.attackCooldown = KobuSystem.getAttackCooldown();
            EffectRenderer.add(en.x, en.y, "hit");
            if (en.hp <= 0) {
              var paradeScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
              var paradeReward = KokuReward.apply(en.scoreValue, gameState);
              gameState.koku += Math.floor(paradeReward * paradeScoreMult);
              FloatingScoreSystem.show(paradeReward);
              RankSystem.check();
              EffectRenderer.add(en.x, en.y, "destroy");
              EnemyManager.enemies.splice(ei, 1);
            }
            break;
          }
        }

        // ボスへの攻撃
        if (GekokujoSystem.boss && !GekokujoSystem.boss.defeated && GekokujoSystem.battleActive && m.attackCooldown <= 0) {
          var boss = GekokujoSystem.boss;
          // CASTLE_WAIT state: invincible to follower attacks
          if (boss.aiState !== "CASTLE_WAIT") {
            var bdx = m.x - boss.x;
            var bdy = m.y - boss.y;
            if (bdx * bdx + bdy * bdy < paradeAttackRadiusSq) {
              boss.hp -= paradeDamage;
              m.attackCooldown = KobuSystem.getAttackCooldown();
              EffectRenderer.add(boss.x, boss.y, "hit");
              if (boss.hp <= 0) {
                GekokujoSystem.success();
              }
            }
          }
        }

        // 橋の中ボスへの攻撃（各ボスをチェック）
        if (m.attackCooldown <= 0) {
          for (var bbi = 0; bbi < BridgeBossSystem.bosses.length; bbi++) {
            var bboss = BridgeBossSystem.bosses[bbi];
            if (!bboss) { continue; }
            var bbdx = m.x - bboss.x;
            var bbdy = m.y - bboss.y;
            if (bbdx * bbdx + bbdy * bbdy < paradeAttackRadiusSq) {
              m.attackCooldown = KobuSystem.getAttackCooldown();
              BridgeBossSystem.takeDamageAt(bbi, paradeDamage);
              break;
            }
          }
        }
      }
    }
  },

  draw: function(ctx) {
    var isIkki = (IkkiSystem.flashTimer > 0);
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (!CameraController.isVisible(m.x, m.y, 20)) { continue; }
      var sp = CameraController.worldToScreen(m.x, m.y);

      // Ashigaru loyalty blink warning
      var savedAlpha = ctx.globalAlpha;
      if (gameState.selectedChar === "ashigaru" && m.loyaltyTimer !== undefined && m.loyaltyTimer < 5) {
        var blinkPhase = Math.floor(m.loyaltyTimer / 0.3) % 2;
        if (blinkPhase === 0) {
          ctx.globalAlpha = 0.3;
        } else {
          ctx.globalAlpha = 1.0;
        }
      }

      // [光輪案] ctx.shadowColor = "rgba(0, 120, 255, 0.8)"; ctx.shadowBlur = 8;
      var fGrad = ctx.createRadialGradient(sp.x, sp.y + 26, 0, sp.x, sp.y + 26, 16);
      fGrad.addColorStop(0,   "rgba(0, 120, 255, 0.5)");
      fGrad.addColorStop(0.4, "rgba(0, 120, 255, 0.25)");
      fGrad.addColorStop(1,   "rgba(0, 120, 255, 0)");
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 26, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (spritesLoaded && !isIkki) {
        var mFacingLeft = PlayerController.facingLeft;
        if (i > 0) {
          var prevM = this.members[i - 1];
          mFacingLeft = (m.x > prevM.x);
        }
        drawSpriteCentered(ctx, "nomin_npc", sp.x, sp.y, 48, mFacingLeft);
      } else {
        ctx.font = FONT.follower;
        ctx.textAlign = "center";
        if (isIkki) {
          ctx.fillText("\uD83D\uDE24", sp.x, sp.y + 3);
        } else {
          ctx.fillText("\uD83D\uDE0A", sp.x, sp.y + 3);
        }
      }
      // [光輪案] ctx.shadowBlur = 0;

      ctx.globalAlpha = savedAlpha;
    }
  }
};

// ============================================================
// ProjectileManager
// ============================================================
var ProjectileManager = {
  projectiles: [],

  init: function() { this.projectiles = []; },

  add: function(x, y, vx, vy, damage, life, size, color, homing) {
    var emoji = "\uD83E\uDE93"; // default: axe (farmer)
    if (gameState.selectedChar === "ashigaru") {
      emoji = "\uD83C\uDF19"; // crescent moon
    } else if (gameState.selectedChar === "merchant") {
      emoji = "\uD83E\uDDEE"; // abacus
    }
    this.projectiles.push({ x: x, y: y, vx: vx, vy: vy, damage: damage, life: life, size: size, color: color, homing: homing, emoji: emoji, rotation: 0, bossProjectile: false });
  },

  addBossProjectile: function(x, y, vx, vy, damage, life, size) {
    this.projectiles.push({ x: x, y: y, vx: vx, vy: vy, damage: damage, life: life, size: size, color: "#555555", homing: false, emoji: null, rotation: 0, bossProjectile: true });
  },

  _findNearestEnemy: function(x, y) {
    var bestDistSq = 99999 * 99999;
    var bestEnemy = null;
    for (var i = 0; i < EnemyManager.enemies.length; i++) {
      var en = EnemyManager.enemies[i];
      if (en.surrendering) { continue; }
      var dx = en.x - x;
      var dy = en.y - y;
      var distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestEnemy = en;
      }
    }
    return bestEnemy;
  },

  update: function(dt) {
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];

      // Homing: gently steer toward nearest enemy
      if (p.homing) {
        var target = this._findNearestEnemy(p.x, p.y);
        if (target) {
          var hdx = target.x - p.x;
          var hdy = target.y - p.y;
          var hDist = Math.sqrt(hdx * hdx + hdy * hdy);
          if (hDist > 1) {
            var currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            var desiredVx = (hdx / hDist) * currentSpeed;
            var desiredVy = (hdy / hDist) * currentSpeed;
            // Gentle turn (lerp factor 0.05)
            p.vx += (desiredVx - p.vx) * 0.05;
            p.vy += (desiredVy - p.vy) * 0.05;
            // Normalize speed
            var newSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (newSpeed > 0) {
              p.vx = (p.vx / newSpeed) * currentSpeed;
              p.vy = (p.vy / newSpeed) * currentSpeed;
            }
          }
        }
      }

      p.x += p.vx;
      p.y += p.vy;
      p.rotation += 6 * dt;
      p.life--;
      if (p.life <= 0 || p.x < -20 || p.x > MAP_W + 20 || p.y < -20 || p.y > MAP_H + 20) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Castle collision: all projectiles (player and boss) are destroyed on hitting castle
      if (GekokujoSystem.castleCollision) {
        var cc = GekokujoSystem.castleCollision;
        if (pointInPolygon(p.x, p.y, cc.vertices)) {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Boss projectile: hits player, not enemies
      if (p.bossProjectile) {
        var bpDx = p.x - PlayerController.x;
        var bpDy = p.y - PlayerController.y;
        var bpThresh = PlayerController.size + p.size;
        if (bpDx * bpDx + bpDy * bpDy < bpThresh * bpThresh) {
          var bpDead = PlayerController.takeDamage(p.damage);
          this.projectiles.splice(i, 1);
          if (bpDead) {
            GekokujoSystem.fail();
          }
        }
        continue;
      }

      // Hit enemies
      var hitEnemy = false;
      for (var j = EnemyManager.enemies.length - 1; j >= 0; j--) {
        var en = EnemyManager.enemies[j];
        if (en.surrendering) { continue; }
        var dx = p.x - en.x;
        var dy = p.y - en.y;
        var hitThresh = en.size + p.size;
        if (dx * dx + dy * dy < hitThresh * hitThresh) {
          en.hp -= p.damage;
          EffectRenderer.add(en.x, en.y, "hit");
          this.projectiles.splice(i, 1);
          if (en.hp <= 0) {
            var projScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
            var projReward = KokuReward.apply(en.scoreValue, gameState);
            gameState.koku += Math.floor(projReward * projScoreMult);
            FloatingScoreSystem.show(projReward);
            RankSystem.check();
            EffectRenderer.add(en.x, en.y, "destroy");
            EnemyManager.enemies.splice(j, 1);
          }
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy) { continue; }

      // Hit gekokujo boss
      if (GekokujoSystem.boss && !GekokujoSystem.boss.defeated) {
        var boss = GekokujoSystem.boss;
        if (i >= 0 && i < this.projectiles.length) {
          var bp = this.projectiles[i];
          if (bp) {
            var bdx = bp.x - boss.x;
            var bdy = bp.y - boss.y;
            var bossHitThresh = boss.size + bp.size;
            if (bdx * bdx + bdy * bdy < bossHitThresh * bossHitThresh) {
              // CASTLE_WAIT state: invincible to normal attacks
              if (boss.aiState === "CASTLE_WAIT") {
                this.projectiles.splice(i, 1);
                continue;
              }
              boss.hp -= bp.damage;
              EffectRenderer.add(boss.x, boss.y, "hit");
              this.projectiles.splice(i, 1);
              if (boss.hp <= 0) { GekokujoSystem.success(); }
            }
          }
        }
      }

      // Hit bridge boss（各ボスをチェック）
      if (i >= 0 && i < this.projectiles.length) {
        var bbp = this.projectiles[i];
        if (bbp) {
          for (var bbj = 0; bbj < BridgeBossSystem.bosses.length; bbj++) {
            var bbTarget = BridgeBossSystem.bosses[bbj];
            if (!bbTarget) { continue; }
            var bbdx = bbp.x - bbTarget.x;
            var bbdy = bbp.y - bbTarget.y;
            var bbThresh = bbTarget.size + bbp.size;
            if (bbdx * bbdx + bbdy * bbdy < bbThresh * bbThresh) {
              BridgeBossSystem.takeDamageAt(bbj, bbp.damage);
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }
  },

  draw: function(ctx) {
    for (var i = 0; i < this.projectiles.length; i++) {
      var p = this.projectiles[i];
      if (!CameraController.isVisible(p.x, p.y, 10)) { continue; }
      var sp = CameraController.worldToScreen(p.x, p.y);
      if (p.bossProjectile) {
        // Boss projectile: gray circle
        ctx.fillStyle = "#555555";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(p.rotation);
        ctx.font = "32px " + FONT_FAMILY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }
    }
  }
};
