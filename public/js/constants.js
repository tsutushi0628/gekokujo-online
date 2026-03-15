// 定数定義: キャンバス・マップサイズ、キャラクター、ランク、敵、地形、フォント
var CANVAS_W = 1280;
var CANVAS_H = 720;
var MAP_W = 3840;
var MAP_H = 2160;
var BLOCK_W = 1280;
var BLOCK_H = 720;
var HISTORY_SPACING = 8;
var MAX_TIME = 60;
var MINIMAP_W = 160;
var MINIMAP_H = 120;
var MINIMAP_X = 10;
var MINIMAP_Y = 10;

var CHAR_DEFS = {
  ashigaru: {
    name: "足軽", emoji: "\u2694\uFE0F", attack: 7, speed: 3.0,
    recruitRange: 55, recruitTime: 200, followerBonus: 0.008,
    regroupSpeed: 0.85, chargeMultiplier: 1.0,
    scoreMultiplier: 1.0, damageTakenMultiplier: 1.0,
    maxEnemies: null, spawnInterval: null
  },
  merchant: {
    name: "商人", emoji: "\uD83D\uDCB0", attack: 2, speed: 3.6,
    recruitRange: 55, recruitTime: 0, followerBonus: 0.012,
    regroupSpeed: 0.7, chargeMultiplier: 0.5,
    initialKoku: 6500, recruitCost: 120,
    scoreMultiplier: 1.2, damageTakenMultiplier: 1.2,
    maxEnemies: null, spawnInterval: null
  },
  farmer: {
    name: "農民", emoji: "\uD83D\uDC68\u200D\uD83C\uDF3E", attack: 3, speed: 3.2,
    recruitRange: 65, recruitTime: 400, followerBonus: 0.025,
    regroupSpeed: 1.0, chargeMultiplier: 0.8,
    scoreMultiplier: 1.4, damageTakenMultiplier: 1.4,
    maxEnemies: 17, spawnInterval: 2
  }
};

var RANKS = [
  { name: "農民", threshold: 0, bonus: 1.0 },
  { name: "足軽", threshold: 500, bonus: 1.2 },
  { name: "侍", threshold: 1500, bonus: 1.5 },
  { name: "武将", threshold: 3500, bonus: 2.0 },
  { name: "大名", threshold: 7000, bonus: 2.5 },
  { name: "天下人", threshold: 12000, bonus: 3.0 }
];

var ENEMY_DEFS = [
  { name: "野盗", emoji: "\uD83D\uDC79", hp: 20, attack: 3, speed: 1.5, score: 100, size: 21, grit: 3 },
  { name: "足軽隊", emoji: "\uD83D\uDD34", hp: 35, attack: 5, speed: 1.8, score: 250, size: 24, grit: 10 },
  { name: "侍", emoji: "\u26E9\uFE0F", hp: 55, attack: 8, speed: 2.0, score: 500, size: 27, grit: 999 },
  { name: "武将", emoji: "\uD83C\uDFF4", hp: 80, attack: 12, speed: 2.2, score: 800, size: 33, grit: 999 }
];

var TERRAIN_TYPES = {
  CASTLE: "castle",
  RIVER: "river",
  BRIDGE: "bridge",
  GRASSLAND: "grassland",
  CASTLE_TOWN: "castleTown",

  VILLAGE: "village",
  EMPTY: "empty"
};

var FONT_FAMILY = "'Chika', 'MokoMori', sans-serif";
var FONT = {
  h1: "bold 48px " + FONT_FAMILY,
  h2: "bold 36px " + FONT_FAMILY,
  h3: "bold 28px " + FONT_FAMILY,
  h4: "22px " + FONT_FAMILY,
  h5: "18px " + FONT_FAMILY,
  small: "14px " + FONT_FAMILY,
  player: "42px " + FONT_FAMILY,
  enemyLarge: "32px " + FONT_FAMILY,
  enemyMedium: "24px " + FONT_FAMILY,
  civilian: "24px " + FONT_FAMILY,
  follower: "18px " + FONT_FAMILY,
  iconLarge: "70px " + FONT_FAMILY,
  iconMedium: "56px " + FONT_FAMILY,
  effect: "24px " + FONT_FAMILY,
  warning: "bold 56px " + FONT_FAMILY
};
