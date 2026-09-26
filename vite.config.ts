/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { precacheList, renderServiceWorker } from './src/pwa/precache';

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

/** ディレクトリの中のファイルを、そこからの相対パスで並べる */
function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, base) : [relative(base, path)];
  });
}

// PWA: ビルドの成果物と public のファイルを先に取り込むサービスワーカー（src/pwa/sw.js）を dist/sw.js に出す。
// 版は取り込むファイルの名前と中身から決め、何か変わればキャッシュを作り直す（成果物の名前には中身のハッシュが付くので名前だけでよい）。
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles('public');
      const files = precacheList([...Object.keys(bundle), ...publicFiles]);
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file);
        const emitted = bundle[file];
        if (emitted) hash.update(emitted.type === 'asset' ? emitted.source : emitted.code);
        else if (publicFiles.includes(file)) hash.update(readFileSync(join('public', file)));
      }
      const template = readFileSync('src/pwa/sw.js', 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(template, files, hash.digest('hex').slice(0, 16)) });
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
