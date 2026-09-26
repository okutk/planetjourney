/**
 * サービスワーカーの登録。本番ビルドでだけ登録し（開発サーバーでは HMR の邪魔になる）、
 * 対応していないブラウザや登録に失敗したときは何もしない（オフラインで起動できないだけで、遊びは止めない）。
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // 読み込みが終わってから登録する（最初の描画やモデルの読み込みと競わないように）
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      console.warn('サービスワーカーを登録できませんでした（オフラインでは起動できません）:', error);
    });
  });
}
