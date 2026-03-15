// api.js - スコアボードAPI連携

var ScoreboardApi = {
  _getBaseUrl: function() {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "http://localhost:5001/gekokujo-online/asia-northeast1/api";
    }
    return "";
  },

  _collectSessionData: function() {
    var nav = navigator;
    var conn = nav.connection;
    var params = new URLSearchParams(location.search);

    var data = {
      userAgent: nav.userAgent,
      platform: nav.platform,
      screenWidth: screen.width,
      screenHeight: screen.height,
      devicePixelRatio: window.devicePixelRatio,
      touchSupport: nav.maxTouchPoints,
      language: nav.language,
      languages: Array.prototype.slice.call(nav.languages),
      cookieEnabled: nav.cookieEnabled,
      hardwareConcurrency: nav.hardwareConcurrency,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    if (nav.deviceMemory) {
      data.deviceMemory = nav.deviceMemory;
    }
    if (conn) {
      if (conn.effectiveType) {
        data.connectionType = conn.effectiveType;
      }
      if (conn.downlink !== undefined) {
        data.connectionDownlink = conn.downlink;
      }
    }
    if (document.referrer) {
      data.referrer = document.referrer;
    }
    var utmSource = params.get("utm_source");
    if (utmSource) {
      data.utmSource = utmSource;
    }

    return data;
  },

  createSession: function(callback) {
    var url = this._getBaseUrl() + "/api/scoreboard/sessions";
    var body = JSON.stringify(this._collectSessionData());

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function(res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    }).then(function(json) {
      callback(null, json.data);
    }).catch(function(err) {
      callback(err, null);
    });
  },

  submitScore: function(data, callback) {
    var url = this._getBaseUrl() + "/api/scoreboard/scores";
    var body = JSON.stringify(data);

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function(res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    }).then(function(json) {
      callback(null, json.data);
    }).catch(function(err) {
      callback(err, null);
    });
  },

  getThresholds: function(callback) {
    var url = this._getBaseUrl() + "/api/scoreboard/thresholds";

    fetch(url).then(function(res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    }).then(function(json) {
      callback(null, json.data);
    }).catch(function(err) {
      callback(err, null);
    });
  }
};
