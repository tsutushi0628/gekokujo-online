(function() {
  var ua = navigator.userAgent || '';
  if (/Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|Google-InspectionTool/i.test(ua)) {
    return;
  }
  if (navigator.userAgentData && navigator.userAgentData.brands) {
    var dominated = navigator.userAgentData.brands.some(function(b) {
      return /Googlebot|Google/i.test(b.brand);
    });
    if (dominated) {
      return;
    }
  }
  var isMobileClientHint = !!(navigator.userAgentData && navigator.userAgentData.mobile);
  var isMobileUA = /iPhone|Android.*Mobile|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  var isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (isMobileClientHint || isMobileUA || isIPad) {
    window.location.href = '/sorry.html';
  }
})();
