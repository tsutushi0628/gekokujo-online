// entities.js - プレイヤー、敵、民間人、弾丸、行列の管理

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
  if (terrain !== TERRAIN_TYPES.VILLAGE && terrain !== TERRAIN_TYPES.CASTLE_TOWN) {
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
// PlayerController
// ============================================================
var PlayerController = {
  x: 0, y: 0,
  hp: 100, maxHp: 100,
  size: 30,
  facingLeft: false,
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
      var spd = def.speed + (ScoreManager.rankIndex * 0.3);
      // Farmer buff from parade (2.5% per follower to all stats)
      if (gameState.selectedChar === "farmer") {
        spd = spd * (1.0 + ParadeController.getLength() * 0.025);
      }
      // River slow: 0.3x speed
      if (TerrainManager.isInRiver(this.x, this.y)) {
        spd = spd * 0.3;
      }
      if (InputManager.keys.w) { this.y -= spd; }
      if (InputManager.keys.s) { this.y += spd; }
      if (InputManager.keys.a) { this.x -= spd; this.facingLeft = true; }
      if (InputManager.keys.d) { this.x += spd; this.facingLeft = false; }
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
    this.hp -= amount;
    EffectRenderer.add(this.x, this.y, "playerHit");
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
    ctx.fillRect(sp.x - 20, sp.y - 45, 40, 5);
    var hpR = this.hp / this.maxHp;
    if (hpR > 0.5) { ctx.fillStyle = "#4a8"; }
    else { ctx.fillStyle = "#c44"; }
    ctx.fillRect(sp.x - 20, sp.y - 45, 40 * hpR, 5);
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
    if (this.enemies.length >= 12) { return; }

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

    // Castle town enemies are stronger
    var terrType = TerrainManager.getTerrainAt(ex, ey);
    var hpMult = 1;
    if (terrType === TERRAIN_TYPES.CASTLE_TOWN) { hpMult = 1.5; }
    if (terrType === TERRAIN_TYPES.MOUNTAIN) { hpMult = 1.3; }

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
      AnnouncementSystem.add("第二波 襲来!");
    }
    if (gameState.gameTime >= 60 && !this.waveAnnounced[1]) {
      this.waveAnnounced[1] = true;
      AnnouncementSystem.add("第三波 襲来!!");
    }

    // Spawning
    this.spawnTimer += dt;
    if (this.spawnTimer > 3) {
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
          ScoreManager.addRaw(en.scoreValue);
          ShoninSystem.addKokuForKill(en.scoreValue);
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
        // Enemies slow down in river too
        if (TerrainManager.isInRiver(en.x, en.y)) {
          enemySpd = enemySpd * 0.3;
        }
        var newX = en.x + (dx / dist) * enemySpd;
        var newY = en.y + (dy / dist) * enemySpd;
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

      // Melee attack on player
      if (dist < PlayerController.size + en.size) {
        en.attackTimer += dt;
        if (en.attackTimer > 0.8) {
          en.attackTimer = 0;
          var dead = PlayerController.takeDamage(en.attack);
          if (dead) {
            gameState.phase = "result";
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

      // Red border for enemies
      ctx.strokeStyle = "rgba(255, 60, 60, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, en.size + 4, 0, Math.PI * 2);
      ctx.stroke();

      if (en.surrendering) {
        ctx.font = Math.round((en.size + 4) * 1.5) + "px " + FONT_FAMILY;
        ctx.fillText("\uD83C\uDFF3\uFE0F", sp.x, sp.y + en.size / 3);
        ctx.fillStyle = "#1a1a1a";
        ctx.font = FONT.h4;
        ctx.fillText("降伏!", sp.x, sp.y - en.size - 8);
      } else if (spritesLoaded) {
        var enemySpriteKey = "nobushi";
        // nobushi default faces LEFT -> flip when enemy needs to face RIGHT (player is to the right)
        var enFlipH = (en.x < PlayerController.x);
        var enemySpriteH = 64 + en.size;
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
        ctx.fillRect(sp.x - 12, sp.y - en.size - 4, 24, 4);
        if (hpR > 0.5) { ctx.fillStyle = "#4a8"; }
        else { ctx.fillStyle = "#c44"; }
        ctx.fillRect(sp.x - 12, sp.y - en.size - 4, 24 * hpR, 4);
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
    var cx, cy;

    // Build weighted block list based on terrain spawn rates
    var weightedBlocks = [];
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var bl = TerrainManager.blocks[i];
      var weight = 1.0;
      if (bl.type === TERRAIN_TYPES.VILLAGE || bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        weight = 2.0;
      } else if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        weight = 1.0;
      } else if (bl.type === TERRAIN_TYPES.MOUNTAIN || bl.type === TERRAIN_TYPES.RIVER) {
        weight = 0.5;
      } else if (bl.type === TERRAIN_TYPES.CASTLE) {
        weight = 0;
      }
      if (weight > 0) {
        weightedBlocks.push({ block: bl, weight: weight });
      }
    }

    // Weighted random selection
    var totalWeight = 0;
    for (var wi = 0; wi < weightedBlocks.length; wi++) {
      totalWeight += weightedBlocks[wi].weight;
    }
    var roll = Math.random() * totalWeight;
    var cumulative = 0;
    var selectedBlock = null;
    for (var si = 0; si < weightedBlocks.length; si++) {
      cumulative += weightedBlocks[si].weight;
      if (roll <= cumulative) {
        selectedBlock = weightedBlocks[si].block;
        break;
      }
    }

    if (selectedBlock) {
      cx = selectedBlock.x + 50 + Math.random() * (selectedBlock.w - 100);
      cy = selectedBlock.y + 50 + Math.random() * (selectedBlock.h - 100);
    } else {
      cx = 50 + Math.random() * (MAP_W - 100);
      cy = 50 + Math.random() * (MAP_H - 100);
    }

    if (TerrainManager.isInRiver(cx, cy)) { cx = TerrainManager.riverX - 30; }
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
      civ.x += Math.cos(civ.wanderAngle) * 0.3;
      civ.y += Math.sin(civ.wanderAngle) * 0.3;

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
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < recruitRange) {
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
      var rDist = Math.sqrt(rdx * rdx + rdy * rdy);
      var effectiveRange = def.recruitRange + ParadeController.getLength() * 5;
      if (rDist < effectiveRange) {
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
// ParadeController (snake-style position history)
// ============================================================
var ParadeController = {
  members: [],
  positionHistory: [],

  init: function() {
    this.members = [];
    this.positionHistory = [];
  },

  addMember: function(x, y) {
    var member = { x: x, y: y, detached: false, attackCooldown: 0 };
    if (gameState.selectedChar === "ashigaru") {
      member.loyaltyTimer = 15 + Math.random() * 10;
    }
    this.members.push(member);
  },

  getLength: function() {
    return this.members.length;
  },

  update: function(dt) {
    // Record player position history
    this.positionHistory.push({ x: PlayerController.x, y: PlayerController.y });
    // Keep reasonable size
    var maxHistory = (this.members.length + 5) * HISTORY_SPACING;
    if (this.positionHistory.length > maxHistory) {
      this.positionHistory.splice(0, this.positionHistory.length - maxHistory);
    }

    // Apply ParadePhysics spacing based on terrain
    var spacing = ParadePhysics.getSpacing(PlayerController.x, PlayerController.y);

    // Update each member position from history + ashigaru leave timer
    for (var i = this.members.length - 1; i >= 0; i--) {
      var m = this.members[i];
      if (m.detached) { continue; }

      // Ashigaru follower loyalty timer
      if (gameState.selectedChar === "ashigaru" && m.loyaltyTimer !== undefined) {
        m.loyaltyTimer -= dt;
        if (m.loyaltyTimer <= 0) {
          var removed = this.members.splice(i, 1)[0];
          EffectRenderer.add(removed.x, removed.y, "surrender");
          CivilianManager.civilians.push({
            x: removed.x, y: removed.y,
            wanderAngle: Math.random() * Math.PI * 2,
            wanderTimer: 0,
            recruitTimer: 0
          });
          ScoreManager.recalculate();
          continue;
        }
      }

      var histIdx = this.positionHistory.length - 1 - ((i + 1) * spacing);
      if (histIdx < 0) { histIdx = 0; }
      if (histIdx >= this.positionHistory.length) { histIdx = this.positionHistory.length - 1; }
      var target = this.positionHistory[histIdx];
      if (target) {
        // Smooth follow (slower in river)
        var followSpeed = 0.2;
        if (TerrainManager.isInRiver(m.x, m.y)) {
          followSpeed = 0.06;
        }
        var dx = target.x - m.x;
        var dy = target.y - m.y;
        m.x += dx * followSpeed;
        m.y += dy * followSpeed;
      }

      // Building collision for parade members
      resolveHouseCollision(m, 12);

      // Parade member attack (all characters)
      if (m.attackCooldown > 0) { m.attackCooldown -= dt; }
      if (m.attackCooldown <= 0) {
        var paradeAttackRadius = 30;
        var paradeDamage = 3;
        if (gameState.selectedChar === "ashigaru") { paradeDamage = 2; }
        for (var ei = EnemyManager.enemies.length - 1; ei >= 0; ei--) {
          var en = EnemyManager.enemies[ei];
          if (en.surrendering) { continue; }
          var edx = m.x - en.x;
          var edy = m.y - en.y;
          var eDist = Math.sqrt(edx * edx + edy * edy);
          if (eDist < paradeAttackRadius) {
            en.hp -= paradeDamage;
            m.attackCooldown = 1.0;
            EffectRenderer.add(en.x, en.y, "hit");
            if (en.hp <= 0) {
              ScoreManager.addRaw(en.scoreValue);
              ShoninSystem.addKokuForKill(en.scoreValue);
              EffectRenderer.add(en.x, en.y, "destroy");
              EnemyManager.enemies.splice(ei, 1);
            }
            break;
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

      // Blue border for ally followers
      ctx.strokeStyle = "rgba(60, 120, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 22, 0, Math.PI * 2);
      ctx.stroke();

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
    this.projectiles.push({ x: x, y: y, vx: vx, vy: vy, damage: damage, life: life, size: size, color: color, homing: homing });
  },

  _findNearestEnemy: function(x, y) {
    var bestDist = 99999;
    var bestEnemy = null;
    for (var i = 0; i < EnemyManager.enemies.length; i++) {
      var en = EnemyManager.enemies[i];
      if (en.surrendering) { continue; }
      var dx = en.x - x;
      var dy = en.y - y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
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
      p.life--;
      if (p.life <= 0 || p.x < -20 || p.x > MAP_W + 20 || p.y < -20 || p.y > MAP_H + 20) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Hit enemies
      for (var j = EnemyManager.enemies.length - 1; j >= 0; j--) {
        var en = EnemyManager.enemies[j];
        if (en.surrendering) { continue; }
        var dx = p.x - en.x;
        var dy = p.y - en.y;
        if (Math.sqrt(dx * dx + dy * dy) < en.size + p.size) {
          en.hp -= p.damage;
          EffectRenderer.add(en.x, en.y, "hit");
          this.projectiles.splice(i, 1);
          if (en.hp <= 0) {
            ScoreManager.addRaw(en.scoreValue);
            ShoninSystem.addKokuForKill(en.scoreValue);
            EffectRenderer.add(en.x, en.y, "destroy");
            EnemyManager.enemies.splice(j, 1);
          }
          break;
        }
      }

      // Hit gekokujo boss
      if (GekokujoSystem.boss) {
        var boss = GekokujoSystem.boss;
        if (i >= 0 && i < this.projectiles.length) {
          var bp = this.projectiles[i];
          if (bp) {
            var bdx = bp.x - boss.x;
            var bdy = bp.y - boss.y;
            if (Math.sqrt(bdx * bdx + bdy * bdy) < boss.size + bp.size) {
              boss.hp -= bp.damage;
              EffectRenderer.add(boss.x, boss.y, "hit");
              this.projectiles.splice(i, 1);
              if (boss.hp <= 0) { GekokujoSystem.success(); }
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
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
