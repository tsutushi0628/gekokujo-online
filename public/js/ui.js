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

    // Background
    ctx.fillStyle = "rgba(240, 240, 240, 0.85)";
    ctx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, MINIMAP_W, MINIMAP_H);

    // Terrain blocks
    for (var i = 0; i < TerrainManager.blocks.length; i++) {
      var bl = TerrainManager.blocks[i];
      var bx = mx + bl.x * scaleX;
      var by = my + bl.y * scaleY;
      var bw = bl.w * scaleX;
      var bh = bl.h * scaleY;
      if (bl.type === TERRAIN_TYPES.CASTLE) {
        ctx.fillStyle = "rgba(200, 60, 60, 0.5)";
        ctx.fillRect(bx, by, bw, bh);
      } else if (bl.type === TERRAIN_TYPES.GRASSLAND) {
        ctx.fillStyle = "rgba(100, 160, 80, 0.3)";
        ctx.fillRect(bx, by, bw, bh);
      } else if (bl.type === TERRAIN_TYPES.CASTLE_TOWN) {
        ctx.fillStyle = "rgba(100, 100, 100, 0.2)";
        ctx.fillRect(bx, by, bw, bh);
      } else if (bl.type === TERRAIN_TYPES.MOUNTAIN) {
        ctx.fillStyle = "rgba(100, 100, 100, 0.2)";
        ctx.fillRect(bx, by, bw, bh);
      } else if (bl.type === TERRAIN_TYPES.VILLAGE) {
        ctx.fillStyle = "rgba(100, 100, 100, 0.15)";
        ctx.fillRect(bx, by, bw, bh);
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

    // Player (white)
    var px = mx + PlayerController.x * scaleX;
    var py = my + PlayerController.y * scaleY;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
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
    this.rawScore += amount;
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
    this.effects.push({ x: x, y: y, type: type, timer: 0, maxTime: 0.5 });
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
      }
    }
  }
};

// ============================================================
// AnnouncementSystem
// ============================================================
var AnnouncementSystem = {
  announcements: [],

  init: function() { this.announcements = []; },

  add: function(text) {
    this.announcements.push({ text: text, timer: 0, maxTime: 2.5 });
  },

  update: function(dt) {
    for (var i = this.announcements.length - 1; i >= 0; i--) {
      this.announcements[i].timer += dt;
      if (this.announcements[i].timer >= this.announcements[i].maxTime) {
        this.announcements.splice(i, 1);
      }
    }
  },

  draw: function(ctx) {
    ctx.textAlign = "center";
    for (var i = 0; i < this.announcements.length; i++) {
      var ann = this.announcements[i];
      var alpha = 1.0 - (ann.timer / ann.maxTime);
      ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
      ctx.font = FONT.h3;
      ctx.fillText(ann.text, CANVAS_W / 2, 130 + i * 25 - ann.timer * 10);
    }
  }
};

// ============================================================
// ResultRenderer
// ============================================================
var ResultRenderer = {
  showNormal: function() {
    var score = ScoreManager.finalScore;
    RankingManager.save(score, gameState.charDef.name);
    var rank = RankingManager.getRank(score);

    document.getElementById("resultTitle").textContent = "時間切れ";
    document.getElementById("resultTitle").className = "";
    document.getElementById("rankLabel").textContent = "お主は";
    document.getElementById("rankNumber").textContent = rank + "位";
    document.getElementById("resultScore").textContent = score + "石";
    document.getElementById("resultDetails").textContent =
      "身分: " + RankSystem.getCurrentName() + "\n仲間の民衆: " + ParadeController.getLength() + "人\n使用キャラ: " + gameState.charDef.name;
    resultScreen.classList.add("active");
  },

  showGekokujoSuccess: function() {
    var score = ScoreManager.finalScore;
    RankingManager.save(score, gameState.charDef.name);
    var rank = RankingManager.getRank(score);

    document.getElementById("resultTitle").textContent = "下克上成功!!";
    document.getElementById("resultTitle").className = "success-banner";
    document.getElementById("rankLabel").textContent = "お主は";
    document.getElementById("rankNumber").textContent = rank + "位";
    document.getElementById("resultScore").textContent = score + "石";
    document.getElementById("resultDetails").textContent =
      "身分: " + RankSystem.getCurrentName() + "\n仲間の民衆: " + ParadeController.getLength() + "人\n使用キャラ: " + gameState.charDef.name;
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
    lCtx.clearRect(0, 0, 800, 600);
    lCtx.strokeStyle = "rgba(0,0,0,0.2)";
    lCtx.lineWidth = 2;
    for (var i = 0; i < 40; i++) {
      var angle = (Math.PI * 2 / 40) * i;
      var innerR = 100 + Math.random() * 100;
      lCtx.beginPath();
      lCtx.moveTo(400 + Math.cos(angle) * innerR, 300 + Math.sin(angle) * innerR);
      lCtx.lineTo(400 + Math.cos(angle) * 400, 300 + Math.sin(angle) * 400);
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
