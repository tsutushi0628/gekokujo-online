// InputManager — キーボード・マウス入力の一元管理
var InputManager = {
  keys: { w: false, a: false, s: false, d: false, space: false, q: false },
  mouseX: 400,
  mouseY: 300,
  mouseWorldX: 400,
  mouseWorldY: 300,
  leftClick: false,
  rightClick: false,

  init: function() {
    var self = this;
    document.addEventListener("keydown", function(e) {
      if (e.code === "KeyW") { self.keys.w = true; }
      if (e.code === "KeyA") { self.keys.a = true; }
      if (e.code === "KeyS") { self.keys.s = true; }
      if (e.code === "KeyD") { self.keys.d = true; }
      if (e.code === "Space") {
        e.preventDefault();
        self.keys.space = true;
      }
      if (e.code === "KeyQ") { self.keys.q = true; }
    });
    document.addEventListener("keyup", function(e) {
      if (e.code === "KeyW") { self.keys.w = false; }
      if (e.code === "KeyA") { self.keys.a = false; }
      if (e.code === "KeyS") { self.keys.s = false; }
      if (e.code === "KeyD") { self.keys.d = false; }
      if (e.code === "Space") { self.keys.space = false; }
      if (e.code === "KeyQ") { self.keys.q = false; }
    });
    canvas.addEventListener("mousemove", function(e) {
      var rect = canvas.getBoundingClientRect();
      self.mouseX = e.clientX - rect.left;
      self.mouseY = e.clientY - rect.top;
      self.mouseWorldX = self.mouseX + CameraController.x;
      self.mouseWorldY = self.mouseY + CameraController.y;
    });
    canvas.addEventListener("click", function() {
      self.leftClick = true;
    });
    canvas.addEventListener("contextmenu", function(e) {
      e.preventDefault();
      self.rightClick = true;
    });
  },

  consumeLeftClick: function() {
    if (this.leftClick) { this.leftClick = false; return true; }
    return false;
  },

  consumeRightClick: function() {
    if (this.rightClick) { this.rightClick = false; return true; }
    return false;
  },

  consumeSpace: function() {
    if (this.keys.space) { this.keys.space = false; return true; }
    return false;
  },

  consumeQ: function() {
    if (this.keys.q) { this.keys.q = false; return true; }
    return false;
  },

  updateWorldMouse: function() {
    this.mouseWorldX = this.mouseX + CameraController.x;
    this.mouseWorldY = this.mouseY + CameraController.y;
  }
};
