// Lightweight background selector.
// Reads the list of available images from data attributes instead of probing
// every possible filename.  Supported data attributes on <body> (or <html>):
//   data-backgrounds           â€“ comma separated list of files/URLs (preferred)
//   data-backgrounds-dir       â€“ base directory for relative entries
//   data-backgrounds-prefix    â€“ prefix for generated names (default: "background")
//   data-backgrounds-ext       â€“ extension for generated names (default: "jpg")
//   data-backgrounds-count     â€“ number of sequential files to use (max 10)

(function () {
  var DEFAULT_DIR = './img-bg/';
  var DEFAULT_PREFIX = 'background';
  var DEFAULT_EXT = 'jpg';
  var MAX_ITEMS = 16;

  function ensureTrailingSlash(path) {
    if (!path) return '';
    return /[\\/]$/.test(path) ? path : path + '/';
  }

  function normalisePath(baseDir, name) {
    if (!name) return '';
    // Preserve absolute and explicitly relative URLs as-is.
    if (/^(https?:)?\/\//.test(name) || name[0] === '/' || name.startsWith('./') || name.startsWith('../')) {
      return name;
    }
    return baseDir + name;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function applyBackground(url) {
    if (!url) return;
    try {
      var bodyEl = document.body;
      var mainEl = document.querySelector('.body');
      var blurEl = document.querySelector('.bg-blur');
      var focusEl = document.querySelector('.bg-focus');
      document.documentElement.style.setProperty('--bg-image', "url('" + url + "')");
      if (bodyEl) bodyEl.style.backgroundImage = "url('" + url + "')";
      if (mainEl) mainEl.style.backgroundImage = "url('" + url + "')";
      if (blurEl) blurEl.style.backgroundImage = "url('" + url + "')";
      if (focusEl) focusEl.style.backgroundImage = "url('" + url + "')";
    } catch (err) {
      console.warn('Failed to apply background image', err);
    }
  }

  function initBackground() {
    var host = document.body || document.documentElement;
    if (!host) return;

    var baseDir = ensureTrailingSlash(host.getAttribute('data-backgrounds-dir') || DEFAULT_DIR);
    var listAttr = host.getAttribute('data-backgrounds') || '';
    var images = listAttr
      .split(',')
      .map(function (item) { return item && item.trim(); })
      .filter(Boolean)
      .slice(0, MAX_ITEMS)
      .map(function (name) { return normalisePath(baseDir, name); });

    if (images.length === 0) {
      var count = parseInt(host.getAttribute('data-backgrounds-count') || '0', 16) || 0;
      var prefix = host.getAttribute('data-backgrounds-prefix') || DEFAULT_PREFIX;
      var ext = host.getAttribute('data-backgrounds-ext') || DEFAULT_EXT;
      count = Math.min(Math.max(count, 0), MAX_ITEMS);

      for (var i = 1; i <= count; i++) {
        images.push(baseDir + prefix + i + '.' + ext);
      }
    }

    // Remove duplicates while preserving order.
    images = images.filter(function (item, index) { return images.indexOf(item) === index; });

    if (images.length === 0) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var bgParam = params.get('bg');
    var selectedImage = null;

    if (bgParam) {
      selectedImage = images.find(function (img) {
        var parts = img.split('/');
        var filename = parts[parts.length - 1];
        var name = filename.split('.')[0];
        return name === bgParam;
      });
    }

    applyBackground(selectedImage || pickRandom(images));
  }

  if (document.readyState === 'loading' && !document.body) {
    document.addEventListener('DOMContentLoaded', initBackground, { once: true });
  } else {
    initBackground();
  }
})();