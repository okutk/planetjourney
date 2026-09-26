/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { precacheEntries, precacheList, renderServiceWorker } from './src/pwa/precache.ts';

// 本番ビルドの index.html に CSP を埋め込み、外部への通信をブラウザ側で遮断する。
// 「外部 API を使わない」ルールの最後の砦。開発サーバーは HMR の WebSocket を使うので対象外。
// WebAssembly を使うライブラリを入れる場合は script-src に 'wasm-unsafe-eval' を足すこと。
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function offlineCsp(): Plugin {
  return {
    name: 'offline-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/** ディレクトリの中のファイルを、そこからの相対パスで並べる（.DS_Store などのドットファイルは除く） */
function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    if (name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, base) : [relative(base, path)];
  });
}

/** 中身のハッシュ（16 桁） */
function digest(...parts: (string | Uint8Array)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, 16);
}

// PWA: ビルドの成果物と public のファイルを先に取り込むサービスワーカー（src/pwa/sw.js）を dist/sw.js に出す。
// 名前に版が入らないファイル（index.html・public のファイル）には中身の版を付け、キャッシュの版は一覧全体から決める。
// 何か変われば新しいキャッシュになるが、版が同じファイルは古いキャッシュから移すので取り直さない。
function serviceWorker(): Plugin {
  let root = '';
  let publicDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      // process.cwd() ではなく Vite が解決した root と publicDir を使う（--root や別のディレクトリからの実行でも動く）
      root = config.root;
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files = precacheList([...Object.keys(bundle), ...(publicDir ? listFiles(publicDir) : [])]);
      const entries = precacheEntries(files, (file) => {
        const emitted = bundle[file];
        if (emitted) return digest(emitted.type === 'asset' ? emitted.source : emitted.code);
        return digest(readFileSync(join(publicDir, file)));
      });
      const template = readFileSync(join(root, 'src/pwa/sw.js'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(template, entries, digest(JSON.stringify(entries))) });
    },
  };
}

export default defineConfig({
  // GitHub Pages のサブパス（/planetjourney/）でもローカルでも動くよう相対パスにする
  base: './',
  plugins: [offlineCsp(), serviceWorker()],
  build: {
    // three.js 単体で 500kB を超えるため、警告の閾値を引き上げておく
    chunkSizeWarningLimit: 1024,
  },
});
