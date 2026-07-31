/* 词书 · 启动入口 */
window.App = window.App || {};

(function () {
  var state = {
    currentBook: App.store.getLastBook(),
    search: '',
    searchScope: 'book',
    selectMode: false,
    selected: new Set(),
    visibleCount: 300,
    mode: 'book'        // 'book' 词书 / 'roots' 词根词缀浏览
  };

  App.state = state;
  App.ui.init(state);

  /* 版本号（每次发布递增，用于确认更新是否生效） */
  App.VERSION = '1.6.0';
  var vEl = document.getElementById('app-version');
  if (vEl) vEl.textContent = 'v' + App.VERSION;

  /* 检查更新：比对线上 version.json，发现新版则提示刷新 */
  function checkUpdate() {
    try {
      fetch('data/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.version && data.version !== App.VERSION) {
            showUpdateBanner(data.version);
          }
        })
        .catch(function () { /* 离线或失败则忽略 */ });
    } catch (e) { /* ignore */ }
  }

  function showUpdateBanner(remoteVersion) {
    var b = document.getElementById('update-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'update-banner';
      b.innerHTML = '<span>发现新版本 ' + remoteVersion + '，点击刷新获取</span><button id="update-refresh">刷新</button>';
      document.body.appendChild(b);
      document.getElementById('update-refresh').addEventListener('click', function () {
        location.reload();
      });
    }
  }

  /* PWA：仅在 http(s) 下注册 Service Worker（file:// 下跳过） */
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    if ('serviceWorker' in navigator) {
      var updated = false;   // 是否主动请求了更新接管
      function requestUpdate(sw) {
        updated = true;
        if (sw && sw.postMessage) sw.postMessage({ type: 'SKIP_WAITING' });
      }

      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          /* 已有等待接管的新版本 → 请求接管（仅此时后续才刷新） */
          if (reg.waiting) requestUpdate(reg.waiting);
          /* 检测到新版本安装完成且旧版本在控制 → 请求接管 */
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                requestUpdate(nw);
              }
            });
          });
        }).catch(function () {});
      });

      /* 接管后：仅当主动请求过更新才刷新一次（首次激活不刷新） */
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (updated) { updated = false; location.reload(); }
      });
    }
    checkUpdate();
  }
})();
