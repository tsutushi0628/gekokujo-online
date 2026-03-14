// economy.js - 商人経済システム（石高の収入・支出・雇用管理）

// ============================================================
// ShoninSystem (merchant economy)
// ============================================================
var ShoninSystem = {
  hireCooldown: 0,
  removeCooldown: 0,
  currentTerrainLabel: "",

  init: function() {
    this.hireCooldown = 0;
    this.removeCooldown = 0;
    this.currentTerrainLabel = "";
    var def = gameState.charDef;
    if (def && def.initialKoku) {
      gameState.koku = def.initialKoku;
    } else {
      gameState.koku = 0;
    }
    gameState.kokuPerSecond = 0;
  },

  update: function(dt) {
    if (gameState.selectedChar !== "merchant") { return; }
    var terrain = TerrainManager.getTerrainAt(PlayerController.x, PlayerController.y);
    var incomeRate = 0;
    if (terrain === TERRAIN_TYPES.CASTLE_TOWN) {
      incomeRate = 5;
      this.currentTerrainLabel = "城下町 +5/s";
    } else if (terrain === TERRAIN_TYPES.VILLAGE) {
      incomeRate = 3;
      this.currentTerrainLabel = "村 +3/s";
    } else if (terrain === TERRAIN_TYPES.GRASSLAND) {
      incomeRate = 1;
      this.currentTerrainLabel = "草原 +1/s";
    } else {
      incomeRate = 0;
      this.currentTerrainLabel = "";
    }
    gameState.kokuPerSecond = incomeRate;
    gameState.koku += incomeRate * dt;
    FloatingScoreSystem.bufferTerrainIncome(incomeRate * dt);
    var upkeepCost = ParadeController.getLength() * 0.2 * dt;
    gameState.koku -= upkeepCost;
    if (this.removeCooldown > 0) { this.removeCooldown -= dt; }
    if (gameState.koku < 0) {
      gameState.koku = 0;
      if (this.removeCooldown <= 0 && ParadeController.getLength() > 0) {
        var lastIdx = ParadeController.members.length - 1;
        var removed = ParadeController.members[lastIdx];
        CivilianManager.civilians.push({
          x: removed.x, y: removed.y,
          wanderAngle: Math.random() * Math.PI * 2,
          wanderTimer: 0, recruitTimer: 0
        });
        ParadeController.members.splice(lastIdx, 1);
        ScoreManager.recalculate();
        AnnouncementSystem.add("石高不足! 傭兵が去った!");
        EffectRenderer.add(removed.x, removed.y, "surrender");
        this.removeCooldown = 1;
      }
    }
    if (this.hireCooldown > 0) { this.hireCooldown -= dt; }
    if (gameState.koku >= 15 && this.hireCooldown <= 0) {
      gameState.koku -= 15;
      FloatingScoreSystem.show(-15);
      ParadeController.addMember(PlayerController.x, PlayerController.y);
      AnnouncementSystem.add("傭兵を雇った! (石高 -15)");
      ScoreManager.recalculate();
      this.hireCooldown = 3;
    }
  },

  addKokuForKill: function(scoreValue) {
    var charType = gameState.selectedChar;
    if (charType === "ashigaru") {
      gameState.koku += 5;
    } else if (charType === "farmer") {
      gameState.koku += 2;
    } else if (charType === "merchant") {
      gameState.koku += 3;
    }
  }
};
