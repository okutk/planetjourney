/**
 * サービスワーカー（src/pwa/sw.js）にビルド時に埋める、先に取り込むファイルの一覧を作る。
 * ファイルの読み書きはしない（vite.config.ts が呼ぶ）。
 */

/** 取り込まないファイル。サービスワーカー自身と、ブラウザが自分で読む manifest */
const EXCLUDED = new Set(['sw.js']);

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

/** テンプレートの __PRECACHE__ と __VERSION__ を埋めて、サービスワーカーの本文を作る */
export function renderServiceWorker(template: string, files: string[], version: string): string {
  if (!/^[\w.-]+$/.test(version)) throw new Error(`版の文字列に使えない文字がある: ${version}`);
  return template.replaceAll('__PRECACHE__', JSON.stringify(files)).replaceAll('__VERSION__', version);
}
