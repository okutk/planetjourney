// ほしめぐりのサービスワーカー。これは雛形で、ビルド時に vite.config.ts が取り込む一覧と版を埋めて dist/sw.js に出す。
// 起動に要るファイルをすべて先に取り込み（precache）、以後は同一オリジンの GET をキャッシュから返す（オフラインで起動できる）。
// 外部への通信はしない。新しい版が出たら別名のキャッシュに取り込み、古いタブが閉じてから切り替える（activate で古い版を消す）。
// 取り込むとき、中身の版（revision）が前と同じファイルは古いキャッシュから移し、変わったものだけ取りに行く
// （デプロイのたびに 12MB のモデルを取り直さないため）。
const CACHE_PREFIX = 'planetjourney-';
const CACHE = `${CACHE_PREFIX}__VERSION__`;
/** @type {{ url: string, revision: string | null }[]} url はスコープからの相対。revision は中身の版（名前に版が入る成果物は null） */
const PRECACHE = __PRECACHE__;

/** 取り込むファイルの URL（スコープからの相対）。ページそのものは index.html として持つ */
function precacheUrl(path) {
  return new URL(path, self.registration.scope).href;
}

/** キャッシュの鍵。版のあるファイルは版をクエリに付けて、同じ版かどうかを鍵で見分ける（読むときはクエリを無視する） */
function cacheKey(entry) {
  return entry.revision ? `${precacheUrl(entry.url)}?__rev=${entry.revision}` : precacheUrl(entry.url);
}

/** 自分の古い版のキャッシュ（同じオリジンの他のサイトのキャッシュには触らない） */
async function oldCacheNames() {
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE);
}

/** 1 つのファイルを取り込む。古い版に同じ鍵があればそこから移し、なければ取りに行く */
async function precacheOne(cache, olds, entry) {
  const key = cacheKey(entry);
  for (const old of olds) {
    const kept = await old.match(key);
    if (kept) {
      await cache.put(key, kept);
      return;
    }
  }
  // 版のあるファイルは名前が変わらないので、途中の HTTP キャッシュに古いものが残っていても、サーバーに確かめてから使う
  const response = await fetch(precacheUrl(entry.url), entry.revision ? { cache: 'no-cache' } : {});
  if (!response.ok) throw new Error(`取り込めなかった: ${entry.url} (${response.status})`);
  await cache.put(key, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const olds = await Promise.all((await oldCacheNames()).map((name) => caches.open(name)));
      await Promise.all(PRECACHE.map((entry) => precacheOne(cache, olds, entry)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all((await oldCacheNames()).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // ページへの移動（?debug などが付いていても）は index.html を返す。ほかは URL で引く（クエリは無視）
  const key = request.mode === 'navigate' ? precacheUrl('index.html') : request;
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(key, { ignoreSearch: true }).then((hit) => hit ?? fetch(request))),
  );
});
