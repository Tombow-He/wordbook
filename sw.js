/* 词书 · Service Worker（离线缓存）
 * 更新策略：
 *   - 页面导航：网络优先（在线取最新，离线回退缓存）→ 改版能立刻生效
 *   - 静态资源：stale-while-revalidate（先用缓存秒开，后台拉新覆盖）
 * 每次改版必须递增 VERSION，强制重建缓存。
 */
const VERSION = 'v3';
const CACHE = 'wordbook-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/vocab.js',
  './js/roots.js',
  './js/view.js',
  './js/audio.js',
  './js/ui.js',
  './js/app.js',
  './data/vocab-data.js',
  './data/wordroot.js',
  './data/version.json',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 支持页面通知新 SW 立即接管 */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  /* 页面导航：网络优先，离线回退缓存 */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  /* 静态资源：先返回缓存，后台拉新覆盖 */
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
