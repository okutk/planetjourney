// ほしめぐりのサービスワーカー。これは雛形で、ビルド時に vite.config.ts が取り込む一覧と版を埋めて dist/sw.js に出す。
// 起動に要るファイルをすべて先に取り込み（precache）、以後は同一オリジンの GET をキャッシュから返す（オフラインで起動できる）。
// 外部への通信はしない。新しい版が出たら別名のキャッシュに取り込み、古いタブが閉じてから切り替える（activate で古い版を消す）。
const CACHE = 'planetjourney-__VERSION__';
const PRECACHE = __PRECACHE__;

/** 取り込むファイルの URL（スコープからの相対）。ページそのものは index.html として持つ */
function precacheUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(precacheUrl))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  // ページへの移動（?debug などが付いていても）は index.html を返す。ほかは URL で引く（クエリは無視）
  const key = request.mode === 'navigate' ? precacheUrl('index.html') : request;
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(key, { ignoreSearch: true }).then((hit) => hit ?? fetch(request))),
  );
});
