// ui.js - UI描画・エフェクト・アナウンス・スコア表示・ミニマップ等の描画系システム

// ============================================================
// MinimapRenderer
// ============================================================
var MinimapRenderer = {
  draw: function(ctx) {
    var mx = MINIMAP_X;
    var my = MINIMAP_Y;
    var scaleX = MINIMAP_W / MAP_W;
    var scaleY = MINIMAP_H / MAP_H;

    // Background (washi panel style)
    ctx.fillStyle = "rgba(245, 238, 225, 0.88)";
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 130, 90, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H, 10);
    ctx.stroke();

    // Terrain blocks with kanji labels
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 16px sans-serif";
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var bl = TerrainManager.blocks[i];
      var bx = mx + bl.x * scaleX;
      var by = my + bl.y * scaleY;
      var bw = bl.w * scaleX;
      var bh = bl.h * scaleY;
      var label = "";
      if (bl.type === TERRAIN_TYPES.CASTLE) {
        label = "城";
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        label = "町";
      } else if (bl.type === TERRAIN_TYPES.VILLAGE) {
        label = "村";
      }
      if (label) {
        ctx.fillStyle = "rgba(80, 60, 40, 0.7)";
        ctx.fillText(label, bx + bw / 2, by + bh / 2);
      }
    }

    // River
    ctx.fillStyle = "rgba(100, 140, 200, 0.4)";
    ctx.fillRect(mx + TerrainManager.riverX * scaleX, my, TerrainManager.riverW * scaleX, MINIMAP_H);

    // Bridges
    ctx.fillStyle = "rgba(100, 100, 100, 0.5)";
    for (var bi = 0; bi < TerrainManager.bridges.length; bi++) {
      var br = TerrainManager.bridges[bi];
      ctx.fillRect(mx + br.x * scaleX, my + br.y * scaleY, br.w * scaleX, br.h * scaleY);
    }

    // Castle red icon
    var castlePos = MapGenerator.getCastleWorldPos();
    ctx.fillStyle = "#c03030";
    ctx.fillRect(mx + castlePos.x * scaleX - 3, my + castlePos.y * scaleY - 3, 6, 6);

    // Civilians (green dots)
    ctx.fillStyle = "rgba(80, 160, 80, 0.6)";
    var civs = CivilianManager.civilians;
    for (var ci = 0; ci < civs.length; ci++) {
      ctx.fillRect(mx + civs[ci].x * scaleX - 1, my + civs[ci].y * scaleY - 1, 2, 2);
    }

    // Player (triangle arrow showing facing direction)
    var px = mx + PlayerController.x * scaleX;
    var py = my + PlayerController.y * scaleY;
    var arrowSize = 5;
    var angle = PlayerController.facingLeft ? Math.PI : 0;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(angle) * arrowSize, py + Math.sin(angle) * arrowSize);
    ctx.lineTo(px + Math.cos(angle + 2.4) * arrowSize * 0.7, py + Math.sin(angle + 2.4) * arrowSize * 0.7);
    ctx.lineTo(px + Math.cos(angle - 2.4) * arrowSize * 0.7, py + Math.sin(angle - 2.4) * arrowSize * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Camera viewport
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + CameraController.x * scaleX, my + CameraController.y * scaleY, CANVAS_W * scaleX, CANVAS_H * scaleY);
  }
};

// ============================================================
// ScoreManager
// ============================================================
var ScoreManager = {
  rawScore: 0,
  finalScore: 0,
  rankIndex: 0,

  init: function() {
    this.rawScore = 0;
    this.finalScore = 0;
    this.rankIndex = 0;
  },

  addRaw: function(amount) {
    var multiplier = 1.0;
    if (gameState.ikkiMode) { multiplier = 1.8; }
    this.rawScore += Math.floor(amount * multiplier);
    FloatingScoreSystem.show(amount);
    this.recalculate();
    RankSystem.check();
  },

  recalculate: function() {
    var def = gameState.charDef;
    var followerMult = 1.0 + ParadeController.getLength() * def.followerBonus;
    var rankBonus = RANKS[this.rankIndex].bonus;
    this.finalScore = Math.floor(this.rawScore * followerMult * rankBonus);
  }
};

// ============================================================
// RankingManager
// ============================================================
var RankingManager = {
  save: function(score, charName) {
    var rankings = [];
    var stored = localStorage.getItem("gekokujo_final_rankings");
    if (stored) {
      try { rankings = JSON.parse(stored); } catch(e) { rankings = []; }
    }
    rankings.push({ score: score, character: charName, time: Date.now() });
    rankings.sort(function(a, b) { return b.score - a.score; });
    if (rankings.length > 100) { rankings = rankings.slice(0, 100); }
    localStorage.setItem("gekokujo_final_rankings", JSON.stringify(rankings));
    return rankings;
  },

  getRank: function(score) {
    var rankings = [];
    var stored = localStorage.getItem("gekokujo_final_rankings");
    if (stored) {
      try { rankings = JSON.parse(stored); } catch(e) { rankings = []; }
    }
    var rank = 1;
    for (var i = 0; i < rankings.length; i++) {
      if (rankings[i].score > score) { rank++; } else { break; }
    }
    return rank;
  }
};

// ============================================================
// EffectRenderer
// ============================================================
var EffectRenderer = {
  effects: [],

  init: function() { this.effects = []; },

  add: function(x, y, type) {
    var maxTime = (type === "bossExplosion") ? 0.8 : 0.5;
    this.effects.push({ x: x, y: y, type: type, timer: 0, maxTime: maxTime });
  },

  update: function(dt) {
    for (var i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer += dt;
      if (this.effects[i].timer >= this.effects[i].maxTime) {
        this.effects.splice(i, 1);
      }
    }
  },

  draw: function(ctx) {
    for (var i = 0; i < this.effects.length; i++) {
      var eff = this.effects[i];
      if (!CameraController.isVisible(eff.x, eff.y, 50)) { continue; }
      var sp = CameraController.worldToScreen(eff.x, eff.y);
      var alpha = 1.0 - (eff.timer / eff.maxTime);
      ctx.textAlign = "center";
      if (eff.type === "hit") {
        ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
        ctx.font = FONT.effect;
        ctx.fillText("\uD83D\uDCA5", sp.x, sp.y - eff.timer * 30);
      } else if (eff.type === "destroy") {
        ctx.strokeStyle = "rgba(0,0,0," + alpha + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, eff.timer * 40, 0, Math.PI * 2);
        ctx.stroke();
      } else if (eff.type === "recruit") {
        ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
        ctx.font = FONT.h4;
        ctx.fillText("仲間!", sp.x, sp.y - eff.timer * 30);
      } else if (eff.type === "playerHit") {
        ctx.strokeStyle = "rgba(200,50,50," + alpha + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 25, 0, Math.PI * 2);
        ctx.stroke();
      } else if (eff.type === "surrender") {
        ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
        ctx.font = FONT.h3;
        ctx.fillText("\uD83C\uDFF3\uFE0F", sp.x, sp.y - eff.timer * 20);
        ctx.font = FONT.h4;
        ctx.fillText("降伏!", sp.x, sp.y - eff.timer * 20 - 20);
      } else if (eff.type === "bossExplosion") {
        // Rockman-style boss explosion: large fire emoji + expanding ring
        var progress = eff.timer / eff.maxTime;
        var scale = 1.0 + progress * 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = (Math.floor(40 * scale)) + "px " + FONT_FAMILY;
        ctx.fillText("\uD83D\uDD25", sp.x, sp.y - eff.timer * 15);
        // Expanding explosion ring
        ctx.strokeStyle = "rgba(255,100,20," + (alpha * 0.8) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, progress * 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};

// ============================================================
// AnnouncementSystem
// ============================================================
var AnnouncementSystem = {
  announcements: [],
  PANEL_W: 220,
  PANEL_H: 28,
  PANEL_RADIUS: 8,
  MAX_DISPLAY: 4,
  DISPLAY_TIME: 3,
  FADE_DURATION: 0.5,

  init: function() { this.announcements = []; },

  add: function(text) {
    this.announcements.unshift({ text: text, timer: 0 });
    // Enforce max display count
    if (this.announcements.length > this.MAX_DISPLAY) {
      this.announcements.pop();
    }
  },

  update: function(dt) {
    for (var i = this.announcements.length - 1; i >= 0; i--) {
      this.announcements[i].timer += dt;
      if (this.announcements[i].timer >= this.DISPLAY_TIME) {
        this.announcements.splice(i, 1);
      }
    }
  },

  draw: function(ctx) {
    var panelX = CANVAS_W - this.PANEL_W - 10;
    var baseY = 10;

    for (var i = 0; i < this.announcements.length; i++) {
      var ann = this.announcements[i];
      var py = baseY + i * (this.PANEL_H + 4);

      // Alpha: full until last 0.5s, then fade out
      var alpha = 1.0;
      var remaining = this.DISPLAY_TIME - ann.timer;
      if (remaining < this.FADE_DURATION) {
        alpha = remaining / this.FADE_DURATION;
      }
      if (alpha <= 0) { continue; }

      ctx.save();
      ctx.globalAlpha = alpha;

      // Washi panel background
      ctx.fillStyle = "rgba(245, 238, 225, 0.88)";
      ctx.beginPath();
      ctx.roundRect(panelX, py, this.PANEL_W, this.PANEL_H, this.PANEL_RADIUS);
      ctx.fill();

      // Border
      ctx.strokeStyle = "rgba(160, 130, 90, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(panelX, py, this.PANEL_W, this.PANEL_H, this.PANEL_RADIUS);
      ctx.stroke();

      // Left accent line (3px)
      ctx.fillStyle = "rgba(90, 70, 40, 0.6)";
      ctx.beginPath();
      ctx.roundRect(panelX + 3, py + 4, 3, this.PANEL_H - 8, 1.5);
      ctx.fill();

      // Text
      ctx.textAlign = "left";
      ctx.font = "14px " + FONT_FAMILY;
      ctx.fillStyle = "#3a2a1a";
      ctx.fillText(ann.text, panelX + 12, py + this.PANEL_H / 2 + 5);

      ctx.restore();
    }
  }
};

// ============================================================
// ResultRenderer
// ============================================================
var ResultRenderer = {
  _hideImage: function() {
    var img = document.getElementById("resultImage");
    img.style.display = "none";
    img.src = "";
  },

  _submitScoreAndShowRank: function(score) {
    var serverRankArea = document.getElementById("serverRankArea");
    serverRankArea.style.display = "none";

    if (!gameState.sessionId) { return; }

    var maxTime = MAX_TIME;
    if (gameState.ikkiMode) { maxTime = 60; }
    var playDurationSec = Math.max(1, Math.floor(gameState.gameTime));
    if (playDurationSec > maxTime) { playDurationSec = maxTime; }

    var data = {
      sessionId: gameState.sessionId,
      score: score,
      playDurationSec: playDurationSec,
      playLog: {}
    };

    ScoreboardApi.submitScore(data, function(err, result) {
      if (err) { return; }
      if (!result) { return; }
      if (result.rank === null) { return; }

      var label = document.getElementById("serverRankLabel");
      var number = document.getElementById("serverRankNumber");
      label.textContent = "全国ランキング";
      var suffix = "";
      if (result.isApprox) { suffix = "（推定）"; }
      number.textContent = "第" + result.rank + "位 / " + result.totalPlayers + "人中" + suffix;
      serverRankArea.style.display = "";
    });
  },

  showNormal: function(customTitle) {
    var score = ScoreManager.finalScore;
    RankingManager.save(score, gameState.charDef.name);
    var rank = RankingManager.getRank(score);

    var title = "時間切れ";
    if (customTitle) { title = customTitle; }
    this._hideImage();
    document.getElementById("resultTitle").textContent = title;
    document.getElementById("resultTitle").className = "";
    document.getElementById("rankLabel").textContent = "お主は";
    document.getElementById("rankNumber").textContent = rank + "位";
    document.getElementById("resultScore").textContent = score + "石";
    document.getElementById("resultDetails").textContent =
      "身分: " + RankSystem.getCurrentName() + "\n仲間の民衆: " + ParadeController.getLength() + "人\n使用キャラ: " + gameState.charDef.name;
    this._submitScoreAndShowRank(score);
    resultScreen.classList.add("active");
  },

  showGekokujoSuccess: function() {
    var score = ScoreManager.finalScore;
    RankingManager.save(score, gameState.charDef.name);
    var rank = RankingManager.getRank(score);

    this._hideImage();
    document.getElementById("resultTitle").textContent = "下克上成功!!";
    document.getElementById("resultTitle").className = "success-banner";
    document.getElementById("rankLabel").textContent = "お主は";
    document.getElementById("rankNumber").textContent = rank + "位";
    document.getElementById("resultScore").textContent = score + "石";
    document.getElementById("resultDetails").textContent =
      "身分: " + RankSystem.getCurrentName() + "\n仲間の民衆: " + ParadeController.getLength() + "人\n使用キャラ: " + gameState.charDef.name;
    this._submitScoreAndShowRank(score);
    ConcentrationLines.show(2000);
    resultScreen.classList.add("active");
  }
};

// ============================================================
// ConcentrationLines
// ============================================================
var ConcentrationLines = {
  show: function(duration) {
    var lCtx = linesCanvas.getContext("2d");
    linesCanvas.style.display = "block";
    lCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    lCtx.strokeStyle = "rgba(0,0,0,0.2)";
    lCtx.lineWidth = 2;
    for (var i = 0; i < 40; i++) {
      var angle = (Math.PI * 2 / 40) * i;
      var innerR = 100 + Math.random() * 100;
      lCtx.beginPath();
      lCtx.moveTo(CANVAS_W / 2 + Math.cos(angle) * innerR, CANVAS_H / 2 + Math.sin(angle) * innerR);
      lCtx.lineTo(CANVAS_W / 2 + Math.cos(angle) * 400, CANVAS_H / 2 + Math.sin(angle) * 400);
      lCtx.stroke();
    }
    setTimeout(function() { linesCanvas.style.display = "none"; }, duration);
  }
};

// ============================================================
// BuildingRenderer
// ============================================================
var BuildingRenderer = {
  _seededRandom: function(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  },

  drawHouse: function(ctx, x, y, w, h) {
    // Walls
    ctx.fillStyle = "rgba(210,190,160,0.8)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,100,70,0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    // Roof (triangle)
    ctx.fillStyle = "rgba(100,70,40,0.7)";
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + w / 2, y - h * 0.5);
    ctx.lineTo(x + w + 4, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(80,50,30,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Door
    ctx.fillStyle = "rgba(80,60,40,0.6)";
    var doorW = w * 0.25;
    var doorH = h * 0.4;
    ctx.fillRect(x + w / 2 - doorW / 2, y + h - doorH, doorW, doorH);
  },

  drawTemple: function(ctx, x, y, w, h) {
    // Base
    ctx.fillStyle = "rgba(200,185,155,0.85)";
    ctx.fillRect(x, y + h * 0.3, w, h * 0.7);
    ctx.strokeStyle = "rgba(110,90,60,0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y + h * 0.3, w, h * 0.7);
    // Multi-tier roof
    ctx.fillStyle = "rgba(90,65,35,0.75)";
    // Lower roof
    ctx.beginPath();
    ctx.moveTo(x - 6, y + h * 0.3);
    ctx.lineTo(x + w / 2, y + h * 0.1);
    ctx.lineTo(x + w + 6, y + h * 0.3);
    ctx.closePath();
    ctx.fill();
    // Upper roof
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y + h * 0.1);
    ctx.lineTo(x + w / 2, y - h * 0.15);
    ctx.lineTo(x + w * 0.85, y + h * 0.1);
    ctx.closePath();
    ctx.fill();
    // Pillar
    ctx.fillStyle = "rgba(150,50,40,0.5)";
    ctx.fillRect(x + w * 0.15, y + h * 0.3, w * 0.08, h * 0.7);
    ctx.fillRect(x + w * 0.77, y + h * 0.3, w * 0.08, h * 0.7);
  },

  drawCastleKeep: function(ctx, x, y, w, h) {
    // Multi-story castle keep
    var storyH = h / 3;
    // Base story
    ctx.fillStyle = "rgba(230,220,200,0.9)";
    ctx.fillRect(x, y + storyH * 2, w, storyH);
    ctx.strokeStyle = "rgba(50,50,50,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + storyH * 2, w, storyH);
    // Second story (narrower)
    var s2w = w * 0.8;
    ctx.fillRect(x + (w - s2w) / 2, y + storyH, s2w, storyH);
    ctx.strokeRect(x + (w - s2w) / 2, y + storyH, s2w, storyH);
    // Top story with roof
    var s3w = w * 0.6;
    ctx.fillRect(x + (w - s3w) / 2, y + storyH * 0.4, s3w, storyH * 0.6);
    ctx.strokeRect(x + (w - s3w) / 2, y + storyH * 0.4, s3w, storyH * 0.6);
    // Roof
    ctx.fillStyle = "rgba(60,50,30,0.7)";
    ctx.beginPath();
    ctx.moveTo(x + (w - s3w) / 2 - 5, y + storyH * 0.4);
    ctx.lineTo(x + w / 2, y - storyH * 0.2);
    ctx.lineTo(x + (w + s3w) / 2 + 5, y + storyH * 0.4);
    ctx.closePath();
    ctx.fill();
  },

  drawCastle: function(ctx, bx, by, bw, bh) {
    // Large castle keep in center
    this.drawCastleKeep(ctx, bx + bw / 2 - 50, by + bh / 2 - 60, 100, 100);
    // Walls around
    ctx.strokeStyle = "rgba(140,120,90,0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + bw * 0.15, by + bh * 0.15, bw * 0.7, bh * 0.7);
    // Corner towers
    var towers = [
      [bx + bw * 0.15, by + bh * 0.15],
      [bx + bw * 0.85 - 25, by + bh * 0.15],
      [bx + bw * 0.15, by + bh * 0.85 - 25],
      [bx + bw * 0.85 - 25, by + bh * 0.85 - 25]
    ];
    for (var ti = 0; ti < towers.length; ti++) {
      this.drawHouse(ctx, towers[ti][0], towers[ti][1], 25, 22);
    }
    // Label
    ctx.font = FONT.h4;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText("城", bx + bw / 2, by + bh / 2 + 70);
  },

  drawCastleTown: function(ctx, bx, by, bw, bh, seed) {
    // Many buildings in a grid pattern
    var cols = 5;
    var rows = 4;
    var margin = 40;
    var spacingX = (bw - margin * 2) / cols;
    var spacingY = (bh - margin * 2) / rows;
    var buildingCount = 0;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var s = this._seededRandom(seed * 100 + row * 10 + col);
        if (s < 0.2) { continue; } // some gaps for roads
        var hx = bx + margin + col * spacingX + spacingX * 0.1;
        var hy = by + margin + row * spacingY + spacingY * 0.15;
        var hw = spacingX * 0.7;
        var hh = spacingY * 0.55;
        if (s > 0.8) {
          this.drawTemple(ctx, hx, hy, hw, hh);
        } else {
          this.drawHouse(ctx, hx, hy, hw, hh);
        }
        buildingCount++;
      }
    }
    ctx.font = FONT.h4;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText("城下町", bx + bw / 2, by + bh - 15);
  },

  drawVillage: function(ctx, bx, by, bw, bh, seed) {
    // Scattered houses
    var count = 8;
    for (var vi = 0; vi < count; vi++) {
      var s1 = this._seededRandom(seed * 50 + vi * 7 + 1);
      var s2 = this._seededRandom(seed * 50 + vi * 7 + 2);
      var hx = bx + 60 + s1 * (bw - 140);
      var hy = by + 60 + s2 * (bh - 140);
      var hw = 35 + this._seededRandom(seed * 50 + vi * 7 + 3) * 20;
      var hh = 28 + this._seededRandom(seed * 50 + vi * 7 + 4) * 15;
      this.drawHouse(ctx, hx, hy, hw, hh);
    }
    ctx.font = FONT.h4;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText("村", bx + bw / 2, by + bh - 15);
  }
};

// ============================================================
// FloatingScoreSystem
// ============================================================
var FloatingScoreSystem = {
  items: [],
  terrainBuffer: 0,
  terrainBufferTimer: 0,
  MAX_ITEMS: 5,
  // Score panel right edge + offset (scoreX=10, scoreW=120)
  BASE_X: 140,
  BASE_Y: CANVAS_H - 40,

  init: function() {
    this.items = [];
    this.terrainBuffer = 0;
    this.terrainBufferTimer = 0;
  },

  show: function(amount) {
    if (amount === 0) { return; }
    var isLarge = Math.abs(amount) >= 50;
    var maxTime = 1.2;
    var floatDist = 30;
    if (isLarge) {
      maxTime = 1.8;
      floatDist = 45;
    }
    var item = {
      amount: amount,
      timer: 0,
      maxTime: maxTime,
      floatDist: floatDist,
      isLarge: isLarge,
      offsetY: 0
    };

    // Shift existing items up by 10px each
    for (var i = 0; i < this.items.length; i++) {
      this.items[i].offsetY -= 10;
    }

    // Enforce max items: remove oldest if at limit
    if (this.items.length >= this.MAX_ITEMS) {
      this.items.shift();
    }

    this.items.push(item);
  },

  bufferTerrainIncome: function(amount) {
    this.terrainBuffer += amount;
  },

  update: function(dt) {
    // Terrain buffer flush every 3 seconds
    this.terrainBufferTimer += dt;
    if (this.terrainBufferTimer >= 3) {
      if (this.terrainBuffer !== 0) {
        var flushed = Math.round(this.terrainBuffer);
        if (flushed !== 0) {
          this.show(flushed);
        }
        this.terrainBuffer = 0;
      }
      this.terrainBufferTimer = 0;
    }

    // Update item timers, remove expired
    for (var i = this.items.length - 1; i >= 0; i--) {
      this.items[i].timer += dt;
      if (this.items[i].timer >= this.items[i].maxTime) {
        this.items.splice(i, 1);
      }
    }
  },

  draw: function(ctx) {
    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];
      var progress = item.timer / item.maxTime;
      var floatY = progress * item.floatDist;

      // Alpha: full for first 60%, fade out in last 40%
      var alpha = 1.0;
      if (progress > 0.6) {
        alpha = 1.0 - (progress - 0.6) / 0.4;
      }
      if (alpha <= 0) { continue; }

      // Scale for large amounts: pop-in from 1.3 to 1.0 in first 20%
      var scale = 1.0;
      if (item.isLarge && progress < 0.2) {
        scale = 1.3 - (progress / 0.2) * 0.3;
      }

      // Colors
      var fillColor;
      var strokeColor;
      if (item.amount > 0) {
        fillColor = "rgba(56, 102, 46, " + (0.95 * alpha) + ")";
        strokeColor = "rgba(245, 238, 225, " + (0.7 * alpha) + ")";
      } else {
        fillColor = "rgba(160, 50, 40, " + (0.95 * alpha) + ")";
        strokeColor = "rgba(245, 238, 225, " + (0.7 * alpha) + ")";
      }

      // Text
      var text;
      if (item.amount > 0) {
        text = "+" + item.amount;
      } else {
        text = "" + item.amount;
      }

      var fontSize;
      if (item.isLarge) {
        fontSize = "bold 26px " + FONT_FAMILY;
      } else {
        fontSize = "bold 18px " + FONT_FAMILY;
      }

      var drawX = this.BASE_X;
      var drawY = this.BASE_Y - floatY + item.offsetY;

      ctx.save();

      if (scale !== 1.0) {
        ctx.translate(drawX, drawY);
        ctx.scale(scale, scale);
        ctx.translate(-drawX, -drawY);
      }

      ctx.textAlign = "left";
      ctx.font = fontSize;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeText(text, drawX, drawY);
      ctx.fillStyle = fillColor;
      ctx.fillText(text, drawX, drawY);

      ctx.restore();
    }
  }
};

// ============================================================
// DamageVignette
// ============================================================
var DamageVignette = {
  alpha: 0,

  init: function() {
    this.alpha = 0;
  },

  trigger: function() {
    this.alpha = 0.6;
  },

  update: function(dt) {
    if (this.alpha > 0) {
      this.alpha -= dt * 1.5;
      if (this.alpha < 0) { this.alpha = 0; }
    }
  },

  draw: function(ctx) {
    if (this.alpha <= 0) { return; }
    var grd = ctx.createRadialGradient(
      CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.3,
      CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7
    );
    grd.addColorStop(0, "rgba(200, 0, 0, 0)");
    grd.addColorStop(1, "rgba(200, 0, 0, " + this.alpha + ")");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
};

// ============================================================
// OnboardingSystem
// ============================================================
var OnboardingSystem = {
  disabled: false,
  currentTip: null,
  tipQueue: [],
  checkboxChecked: false,
  fadeAlpha: 0,
  fadeDir: 0, // 1 = fading in, -1 = fading out
  dismissTimer: 0,
  AUTO_DISMISS_TIME: 8,
  FADE_SPEED: 3.0,
  // Panel layout
  PANEL_X: 260,
  PANEL_Y: 400,
  PANEL_W: 280,
  PANEL_MIN_H: 80,
  PANEL_RADIUS: 14,
  CHECKBOX_SIZE: 12,

  init: function() {
    var saved = localStorage.getItem("gekokujo_onboarding");
    if (saved) {
      try {
        var data = JSON.parse(saved);
        if (data.disabled) {
          this.disabled = true;
          this.checkboxChecked = true;
        }
      } catch(e) {
        // ignore parse errors
      }
    }
  },

  showTip: function(id, title, lines) {
    if (this.disabled) { return; }

    var tip = {
      id: id,
      title: title,
      lines: lines
    };

    // If something is already showing, queue it
    if (this.currentTip) {
      this.tipQueue.push(tip);
      return;
    }

    this.currentTip = tip;
    this.fadeAlpha = 0;
    this.fadeDir = 1;
    this.dismissTimer = 0;
  },

  dismissCurrent: function() {
    if (!this.currentTip) { return; }
    this.fadeDir = -1;
  },

  _onDismissComplete: function() {
    this.currentTip = null;
    this.fadeAlpha = 0;
    this.fadeDir = 0;
    this.dismissTimer = 0;

    // Show next in queue
    if (this.tipQueue.length > 0) {
      var next = this.tipQueue.shift();
      this.currentTip = next;
      this.fadeAlpha = 0;
      this.fadeDir = 1;
    }
  },

  update: function(dt) {
    if (!this.currentTip) { return; }

    // Fade animation
    if (this.fadeDir === 1) {
      this.fadeAlpha += dt * this.FADE_SPEED;
      if (this.fadeAlpha >= 1) {
        this.fadeAlpha = 1;
        this.fadeDir = 0;
      }
    } else if (this.fadeDir === -1) {
      this.fadeAlpha -= dt * this.FADE_SPEED;
      if (this.fadeAlpha <= 0) {
        this._onDismissComplete();
        return;
      }
    }

    // Auto-dismiss timer
    if (this.fadeDir === 0 && this.fadeAlpha === 1) {
      this.dismissTimer += dt;
      if (this.dismissTimer >= this.AUTO_DISMISS_TIME) {
        this.dismissCurrent();
      }
    }
  },

  handleClick: function(mx, my) {
    if (!this.currentTip) { return false; }
    if (this.fadeAlpha < 0.5) { return false; }

    var tip = this.currentTip;
    var panelH = this._calcPanelHeight(tip);
    var cbX = this.PANEL_X + 14;
    var cbY = this.PANEL_Y + panelH - 24;
    var cbSize = this.CHECKBOX_SIZE;

    // Checkbox hit test (with some padding)
    if (mx >= cbX - 4 && mx <= cbX + cbSize + 4 &&
        my >= cbY - 4 && my <= cbY + cbSize + 4) {
      this._toggleCheckbox();
      return true;
    }

    // Click anywhere on panel dismisses
    if (mx >= this.PANEL_X && mx <= this.PANEL_X + this.PANEL_W &&
        my >= this.PANEL_Y && my <= this.PANEL_Y + panelH) {
      this.dismissCurrent();
      return true;
    }

    return false;
  },

  _calcPanelHeight: function(tip) {
    // Title line + text lines + checkbox line
    var lineCount = tip.lines.length;
    var h = 30 + lineCount * 20 + 30;
    if (h < this.PANEL_MIN_H) { h = this.PANEL_MIN_H; }
    if (h > 120) { h = 120; }
    return h;
  },

  draw: function(ctx) {
    if (!this.currentTip) { return; }
    if (this.fadeAlpha <= 0) { return; }

    var tip = this.currentTip;
    var alpha = this.fadeAlpha;
    var px = this.PANEL_X;
    var py = this.PANEL_Y;
    var pw = this.PANEL_W;
    var ph = this._calcPanelHeight(tip);

    // Washi panel background
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(245, 238, 225, 0.92)";
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, this.PANEL_RADIUS);
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(160, 130, 90, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, this.PANEL_RADIUS);
    ctx.stroke();

    // Left accent line (3px sumi-colored)
    ctx.fillStyle = "rgba(90, 70, 40, 0.6)";
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 8, 3, ph - 16, 1.5);
    ctx.fill();

    // Title
    ctx.textAlign = "left";
    ctx.font = "bold 16px " + FONT_FAMILY;
    ctx.fillStyle = "rgba(58, 42, 26, " + alpha + ")";
    ctx.fillText(tip.title, px + 18, py + 22);

    // Body lines
    ctx.font = "13px " + FONT_FAMILY;
    ctx.fillStyle = "rgba(80, 65, 45, " + alpha + ")";
    for (var i = 0; i < tip.lines.length; i++) {
      ctx.fillText(tip.lines[i], px + 18, py + 42 + i * 20);
    }

    // Checkbox area
    var cbX = px + 14;
    var cbY = py + ph - 24;
    var cbSize = this.CHECKBOX_SIZE;

    // Checkbox box
    ctx.strokeStyle = "rgba(160, 130, 90, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cbX, cbY, cbSize, cbSize, 2);
    ctx.stroke();

    if (this.checkboxChecked) {
      // Fill
      ctx.fillStyle = "rgba(160, 130, 90, 0.4)";
      ctx.beginPath();
      ctx.roundRect(cbX, cbY, cbSize, cbSize, 2);
      ctx.fill();

      // Checkmark
      ctx.strokeStyle = "rgba(90, 70, 40, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cbX + 2, cbY + cbSize * 0.5);
      ctx.lineTo(cbX + cbSize * 0.4, cbY + cbSize - 2);
      ctx.lineTo(cbX + cbSize - 2, cbY + 2);
      ctx.stroke();
    }

    // Checkbox label
    ctx.font = "11px " + FONT_FAMILY;
    ctx.fillStyle = "rgba(120, 100, 70, " + alpha + ")";
    ctx.fillText("次回から表示しない", cbX + cbSize + 6, cbY + cbSize - 1);

    ctx.restore();
  },

  _toggleCheckbox: function() {
    this.checkboxChecked = !this.checkboxChecked;
    this.disabled = this.checkboxChecked;
    localStorage.setItem("gekokujo_onboarding", JSON.stringify({disabled: this.disabled}));
  }
};
