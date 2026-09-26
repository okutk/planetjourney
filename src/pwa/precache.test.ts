import { describe, expect, it } from 'vitest';
import { precacheList, renderServiceWorker } from './precache';

describe('precacheList', () => {
  it('index.html を必ず含め、sw.js を除き、重なりをなくして並べ替える', () => {
    const list = precacheList(['assets/index-abc.js', './models/mira.vrm', 'sw.js', 'assets/index-abc.js', 'index.html', '/icons/icon.svg']);
    expect(list).toEqual(['assets/index-abc.js', 'icons/icon.svg', 'index.html', 'models/mira.vrm']);
  });

  it('Windows の区切りも / にそろえる', () => {
    expect(precacheList(['icons\\icon-192.png'])).toEqual(['icons/icon-192.png', 'index.html']);
  });
});

describe('renderServiceWorker', () => {
  it('一覧と版をテンプレートに埋める', () => {
    const out = renderServiceWorker("const C = 'pj-__VERSION__';\nconst P = __PRECACHE__;", ['index.html', 'a.js'], 'abc123');
    expect(out).toBe("const C = 'pj-abc123';\nconst P = [\"index.html\",\"a.js\"];");
  });

  it('版に引用符などが混ざっていれば例外にする（スクリプトを壊さない）', () => {
    expect(() => renderServiceWorker('__VERSION__', [], "x'y")).toThrow();
  });
});
