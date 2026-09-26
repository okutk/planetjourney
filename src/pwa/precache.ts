/**
 * サービスワーカー（src/pwa/sw.js）にビルド時に埋める、先に取り込むファイルの一覧を作る。
 * ファイルの読み書きはしない（vite.config.ts が呼ぶ）。
 */

/** 取り込まないファイル。サービスワーカー自身（ブラウザが登録のときに自分で読む） */
const EXCLUDED = new Set(['sw.js']);

/** 取り込むファイル。revision は中身の版で、同じ版なら古いキャッシュから移せる。名前に版が入る成果物は null */
export interface PrecacheEntry {
  url: string;
  revision: string | null;
}

/**
 * 取り込むファイルの一覧。dist に出るファイルの相対パス（ビルドの成果物と public のファイル）から、
 * サービスワーカー自身を除き、重なりをなくして並べ替える。index.html は必ず入れる（ページの移動に返すため）。
 */
export function precacheList(files: Iterable<string>): string[] {
  const set = new Set<string>(['index.html']);
  for (const file of files) {
    const path = file.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (path && !EXCLUDED.has(path)) set.add(path);
  }
  return [...set].sort();
}

/** 名前に中身のハッシュが入っている成果物（Vite の assets/ 以下）。中身が変われば名前も変わるので版は要らない */
export function isHashedAsset(path: string): boolean {
  return /^assets\/[^/]+-[\w-]{8}\.\w+$/.test(path);
}

/** 一覧に版を付ける。revisionOf は名前に版が入らないファイルの中身の版を返す */
export function precacheEntries(files: string[], revisionOf: (path: string) => string): PrecacheEntry[] {
  return files.map((url) => ({ url, revision: isHashedAsset(url) ? null : revisionOf(url) }));
}

/** テンプレートの __PRECACHE__ と __VERSION__ を埋めて、サービスワーカーの本文を作る */
export function renderServiceWorker(template: string, entries: PrecacheEntry[], version: string): string {
  if (!/^[\w.-]+$/.test(version)) throw new Error(`版の文字列に使えない文字がある: ${version}`);
  return template.replaceAll('__PRECACHE__', JSON.stringify(entries)).replaceAll('__VERSION__', version);
}
