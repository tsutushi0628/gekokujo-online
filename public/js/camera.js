// CameraController — プレイヤー追従カメラとワールド座標変換
var CameraController = {
  x: 0,
  y: 0,
  deadZone: 80,

  follow: function(targetX, targetY) {
    var screenX = targetX - this.x;
    var screenY = targetY - this.y;
    var centerX = CANVAS_W / 2;
    var centerY = CANVAS_H / 2;

    if (screenX < centerX - this.deadZone) {
      this.x = targetX - (centerX - this.deadZone);
    }
    if (screenX > centerX + this.deadZone) {
      this.x = targetX - (centerX + this.deadZone);
    }
    if (screenY < centerY - this.deadZone) {
      this.y = targetY - (centerY - this.deadZone);
    }
    if (screenY > centerY + this.deadZone) {
      this.y = targetY - (centerY + this.deadZone);
    }

    // Clamp camera
    if (this.x < 0) { this.x = 0; }
    if (this.y < 0) { this.y = 0; }
    if (this.x > MAP_W - CANVAS_W) { this.x = MAP_W - CANVAS_W; }
    if (this.y > MAP_H - CANVAS_H) { this.y = MAP_H - CANVAS_H; }
  },

  worldToScreen: function(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  },

  isVisible: function(wx, wy, margin) {
    var m = margin;
    if (m === undefined) { m = 50; }
    return wx >= this.x - m && wx <= this.x + CANVAS_W + m &&
           wy >= this.y - m && wy <= this.y + CANVAS_H + m;
  }
};
