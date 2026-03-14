// スプライト定義: 画像キー・サイズ・キャラクターマッピング
var spriteImages = {};
var spritesLoaded = false;
var SPRITE_DEFS = {
  nomin_play: { src: "sprites/nomin_play.png", w: 183, h: 173 },
  ashigaru_play: { src: "sprites/ashigaru_play.png", w: 193, h: 207 },
  shonin_play: { src: "sprites/shonin_play.png", w: 151, h: 197 },
  nobushi: { src: "sprites/nobushi.png", w: 465, h: 504 },
  nomin_npc: { src: "sprites/nomin_npc.png", w: 334, h: 470 },
  tsujigiri: { src: "sprites/tsujigiri.png", w: 438, h: 488 },
  tonosama: { src: "sprites/tonosama.png", w: 524, h: 713 },
  castle: { src: "sprites/castle.png", w: 517, h: 452 },
  house_town: { src: "sprites/house_town.png", w: 496, h: 474 },
  house_villege: { src: "sprites/house_villege.png", w: 469, h: 432 },
  tsuchi: { src: "sprites/tsuchi.png", w: 32, h: 32 },
  ki: { src: "sprites/ki.png", w: 447, h: 476 }
};

// Character class to sprite key mapping
var CHAR_SPRITE_MAP = {
  farmer: "nomin_play",
  ashigaru: "ashigaru_play",
  merchant: "shonin_play",
  shonin: "shonin_play"
};
