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
      incomeRate = 50;
      this.currentTerrainLabel = "城下町 +50/s";
    } else if (terrain === TERRAIN_TYPES.VILLAGE) {
      incomeRate = 30;
      this.currentTerrainLabel = "村 +30/s";
    } else if (terrain === TERRAIN_TYPES.GRASSLAND) {
      incomeRate = 10;
      this.currentTerrainLabel = "草原 +10/s";
    } else {
      incomeRate = 0;
      this.currentTerrainLabel = "";
    }
    gameState.kokuPerSecond = incomeRate;
    var incScoreMult = CHAR_DEFS[gameState.selectedChar].scoreMultiplier;
    gameState.koku += incomeRate * dt * incScoreMult;
    FloatingScoreSystem.bufferTerrainIncome(incomeRate * dt);
    // ボス戦中は維持費免除（集めた仲間で殿様を倒すフェーズ）
    if (!GekokujoSystem.battleActive) {
      var upkeepCost = ParadeController.getLength() * 2.0 * dt;
      gameState.koku -= upkeepCost;
    }
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
          AnnouncementSystem.add("石高不足! 傭兵が去った!");
        EffectRenderer.add(removed.x, removed.y, "surrender");
        this.removeCooldown = 3;
      }
    }
    if (this.hireCooldown > 0) { this.hireCooldown -= dt; }
    if (gameState.koku >= 300 && this.hireCooldown <= 0 && ParadeController.getLength() < 12) {
      gameState.koku -= 300;
      FloatingScoreSystem.show(-300);
      ParadeController.addMember(PlayerController.x, PlayerController.y);
      AnnouncementSystem.add("傭兵を雇った! (石高 -300)");
      this.hireCooldown = 3;
    }
  }
};
