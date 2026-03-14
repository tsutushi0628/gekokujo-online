// ユーティリティ関数: スプライト描画・スプライト一括読み込み

// Helper: draw a sprite centered at a position, with optional horizontal flip
// targetHeight determines the rendered height; width is calculated from aspect ratio
function drawSpriteCentered(ctx, spriteKey, x, y, targetHeight, flipH) {
  var def = SPRITE_DEFS[spriteKey];
  var img = spriteImages[spriteKey];
  if (!img) { return; }
  var aspect = def.w / def.h;
  var drawW = targetHeight * aspect;
  var drawH = targetHeight;

  ctx.save();
  if (flipH) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
  }
  ctx.restore();
}

function loadAllSprites(callback) {
  var keys = Object.keys(SPRITE_DEFS);
  var loaded = 0;
  var total = keys.length;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    spriteImages[key] = new Image();
    spriteImages[key].onload = function() {
      loaded++;
      if (loaded >= total) {
        spritesLoaded = true;
        callback();
      }
    };
    spriteImages[key].onerror = function() {
      loaded++;
      if (loaded >= total) {
        spritesLoaded = true;
        callback();
      }
    };
    spriteImages[key].src = SPRITE_DEFS[key].src;
  }
}
