/**
 * サービスワーカーの登録。本番ビルドでだけ登録し（開発サーバーでは HMR の邪魔になる）、
 * 対応していないブラウザや登録に失敗したときは何もしない（オフラインで起動できないだけで、遊びは止めない）。
 */

/** ページの読み込みが終わるまで待つ */
function windowLoaded(): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
}

/**
 * after が終わり、ページの読み込みも終わってから登録する。
 * after にはミラのモデルの読み込みを渡す。初回は取り込み（12MB のモデルを含む）がアプリ側の読み込みと並走しないように。
 */
export function registerServiceWorker(after: Promise<unknown>): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void Promise.all([after, windowLoaded()]).then(() =>
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      console.warn('サービスワーカーを登録できませんでした（オフラインでは起動できません）:', error);
    }),
  );
}
