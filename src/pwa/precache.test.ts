import { describe, expect, it } from 'vitest';
import { isHashedAsset, precacheEntries, precacheList, renderServiceWorker } from './precache';

describe('precacheList', () => {
  it('index.html を必ず含め、sw.js を除き、重なりをなくして並べ替える', () => {
    const list = precacheList(['assets/index-abc.js', './models/mira.vrm', 'sw.js', 'assets/index-abc.js', 'index.html', '/icons/icon.svg']);
    expect(list).toEqual(['assets/index-abc.js', 'icons/icon.svg', 'index.html', 'models/mira.vrm']);
  });

  it('Windows の区切りも / にそろえる', () => {
    expect(precacheList(['icons\\icon-192.png'])).toEqual(['icons/icon-192.png', 'index.html']);
  });
});

describe('precacheEntries', () => {
  it('名前にハッシュが入る成果物は版なし、それ以外は中身の版を付ける', () => {
    expect(isHashedAsset('assets/index-CA_6IJSa.js')).toBe(true);
    expect(isHashedAsset('assets/index-Dl5paQCd.css')).toBe(true);
    expect(isHashedAsset('index.html')).toBe(false);
    expect(isHashedAsset('models/mira.vrm')).toBe(false);
    const entries = precacheEntries(['assets/index-CA_6IJSa.js', 'index.html', 'models/mira.vrm'], (path) => `rev-${path.length}`);
    expect(entries).toEqual([
      { url: 'assets/index-CA_6IJSa.js', revision: null },
      { url: 'index.html', revision: 'rev-10' },
      { url: 'models/mira.vrm', revision: 'rev-15' },
    ]);
  });
});

describe('renderServiceWorker', () => {
  it('一覧と版をテンプレートに埋める', () => {
    const out = renderServiceWorker("const C = 'pj-__VERSION__';\nconst P = __PRECACHE__;", [{ url: 'a.js', revision: null }], 'abc123');
    expect(out).toBe("const C = 'pj-abc123';\nconst P = [{\"url\":\"a.js\",\"revision\":null}];");
  });

  it('版に引用符などが混ざっていれば例外にする（スクリプトを壊さない）', () => {
    expect(() => renderServiceWorker('__VERSION__', [], "x'y")).toThrow();
  });
});
