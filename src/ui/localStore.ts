/**
 * 端末内（localStorage）への薄い保存。セーブデータ（src/ai/save.ts）の読み書きに使う。
 * 保存の中身はプレーンなオブジェクトで、読み書きの形を確かめるのは呼び出し側（src/ai など）の役目。
 * プライベートモードや容量不足で使えないときは、保存しないだけで遊びは止めない。
 */
export interface KeyValueStore {
  /** 保存した値。なければ、または読めなければ null */
  load(key: string): unknown;
  save(key: string, value: unknown): void;
}

const PREFIX = 'planetjourney.';

export const localStore: KeyValueStore = {
  load(key) {
    try {
      const text = window.localStorage.getItem(PREFIX + key);
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  },
  save(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // 保存できなくても続ける（次の起動で「初めて」や「前回の時刻」になるだけ）
    }
  },
};
