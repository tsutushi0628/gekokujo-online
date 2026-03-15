// スプライト定義: 画像キー・サイズ・キャラクターマッピング
var spriteImages = {};
var spritesLoaded = false;
var SPRITE_DEFS = {
  nomin_play: { src: "assets/nomin_play.png", w: 183, h: 173 },
  ashigaru_play: { src: "assets/ashigaru_play.png", w: 193, h: 207 },
  shonin_play: { src: "assets/shonin_play.png", w: 151, h: 197 },
  nobushi: { src: "assets/nobushi.png", w: 465, h: 504 },
  nomin_npc: { src: "assets/nomin_npc.png", w: 334, h: 470 },
  tsujigiri: { src: "assets/tsujigiri.png", w: 438, h: 488 },
  tsujigiri_end: { src: "assets/tsujigiri_end.png", w: 1056, h: 976 },
  tonosama: { src: "assets/tonosama.png", w: 524, h: 713 },
  castle: { src: "assets/castle.png", w: 517, h: 452 },
  house_town: { src: "assets/house_town.png", w: 496, h: 474 },
  house_villege: { src: "assets/house_villege.png", w: 469, h: 432 },
  tsuchi: { src: "assets/tsuchi.png", w: 32, h: 32 },
  ki: { src: "assets/ki.png", w: 447, h: 476 }
};

// Character class to sprite key mapping
var CHAR_SPRITE_MAP = {
  farmer: "nomin_play",
  ashigaru: "ashigaru_play",
  merchant: "shonin_play",
  shonin: "shonin_play"
};
