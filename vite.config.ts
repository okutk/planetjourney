import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  // GitHub Pages のサブパス（/planetjourney/）でもローカルでも動くよう相対パスにする
  base: './',
  plugins: [offlineCsp()],
  build: {
    // three.js 単体で 500kB を超えるため、警告の閾値を引き上げておく
    chunkSizeWarningLimit: 1024,
  },
});
