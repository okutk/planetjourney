// 「外部 API・外部通信を使わない」ルールを機械的にチェックする（CI で実行）。
// src/ と index.html を走査し、外部通信につながる書き方を見つけたら失敗する。
// 正当な理由があって許可したい行には `offline-allow: 理由` というコメントを同じ行に書く。
// 実行時の最終防衛線は vite.config.ts の CSP。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGETS = ['src', 'index.html'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css']);

const RULES = [
  { pattern: /\bXMLHttpRequest\b/, reason: 'XMLHttpRequest による通信' },
  { pattern: /\bWebSocket\b/, reason: 'WebSocket による通信' },
  { pattern: /\bEventSource\b/, reason: 'EventSource による通信' },
  { pattern: /\bsendBeacon\b/, reason: 'sendBeacon による送信' },
  { pattern: /\bRTCPeerConnection\b/, reason: 'WebRTC による通信' },
  { pattern: /\b(?:webkit)?SpeechRecognition\b/, reason: '音声認識（音声が外部サーバーへ送られる場合がある）' },
  { pattern: /\bspeechSynthesis\b/, reason: '音声合成（端末によっては外部サービスを使う）' },
  { pattern: /['"`](?:https?:)?\/\/(?!www\.w3\.org\/)[\w.-]+\.[a-z]{2,}/i, reason: '外部 URL' },
  { pattern: /url\(\s*['"]?(?:https?:)?\/\//i, reason: 'CSS からの外部 URL 読み込み' },
];

// ゲーム本体に入れてはいけない、外部サービス前提のパッケージ
const FORBIDDEN_PACKAGES = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  '@mlc-ai/web-llm',
  'firebase',
  '@supabase/supabase-js',
  'axios',
  'socket.io-client',
];

function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return EXTENSIONS.has(extname(path)) ? [path] : [];
  return readdirSync(path).flatMap((name) => collectFiles(join(path, name)));
}

function isComment(line) {
  const trimmed = line.trim();
  return ['//', '/*', '*', '<!--'].some((prefix) => trimmed.startsWith(prefix));
}

const violations = [];

for (const file of TARGETS.flatMap((target) => collectFiles(join(ROOT, target)))) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isComment(line) || line.includes('offline-allow:')) return;
    for (const { pattern, reason } of RULES) {
      if (pattern.test(line)) {
        violations.push(`${relative(ROOT, file)}:${index + 1}  ${reason}\n    ${line.trim()}`);
      }
    }
  });
}

const { dependencies = {} } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const name of FORBIDDEN_PACKAGES) {
  if (name in dependencies) violations.push(`package.json  外部サービス前提のパッケージ: ${name}`);
}

if (violations.length > 0) {
  console.error('外部通信につながる可能性のある箇所が見つかりました（CLAUDE.md「絶対ルール」参照）:\n');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('check-offline: OK（外部通信の疑いなし）');
