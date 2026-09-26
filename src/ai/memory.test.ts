import { describe, expect, it } from 'vitest';
import memoryData from '../data/memory.json';
import type { FactValue } from './dialogue';
import { MemoryBook, parseMemory, parseMemoryRules } from './memory';

const rules = parseMemoryRules(memoryData);
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 12);

describe('MemoryBook', () => {
  it('種類と場所ごとに、回数と最初・最後の日時を覚える', () => {
    const book = new MemoryBook(rules);
    book.record('leftBehind', 'ocean', T0);
    book.record('leftBehind', 'ocean', T0 + DAY, '浮島');
    book.record('leftBehind', 'origin', T0);
    expect(book.count('leftBehind', 'ocean')).toBe(2);
    expect(book.count('leftBehind')).toBe(3);
    expect(book.count('jump')).toBe(0);
    const entry = book.toJSON().entries[0];
    expect(entry).toEqual({ kind: 'leftBehind', place: 'ocean', count: 2, first: T0, last: T0 + DAY, detail: '浮島' });
    expect(book.dirty).toBe(true);
  });

  it('その場所で起きたことを here_〇〇 として書き、別の場所の分は消す', () => {
    const book = new MemoryBook(rules);
    book.record('leftBehind', 'ocean', T0);
    book.record('jump', 'origin', T0);
    const facts: Record<string, FactValue> = {};
    book.writePlaceFacts('ocean', facts);
    expect(facts).toEqual({ here_leftBehind: 1 });
    book.writePlaceFacts('origin', facts);
    expect(facts).toEqual({ here_jump: 1 });
  });

  it('思い出話は、回数の足りた話題から、いまいる場所・話していないものを先に選び、しばらく同じ話はしない', () => {
    const book = new MemoryBook(rules);
    for (let i = 0; i < 5; i++) book.record('jump', 'origin', T0); // 10 回に足りないので話題にしない
    book.record('landed', 'origin', T0);
    book.record('leftBehind', 'ocean', T0);
    expect(book.pick('ocean', 0, T0 + DAY, () => 0)?.kind).toBe('leftBehind');
    expect(book.pick('ocean', 1, T0 + DAY, () => 0)?.kind).toBe('landed');
    // どちらも話したばかりなので、repeatAfter 秒は何も選ばない
    expect(book.pick('ocean', 2, T0 + DAY, () => 0)).toBeNull();
    // 時間が経てば、長く話していないほうから
    expect(book.pick('origin', rules.repeatAfter + 10, T0 + DAY, () => 0)?.kind).toBe('landed');
  });

  it('起きたばかりの出来事は、まだ思い出として話さない', () => {
    const book = new MemoryBook(rules);
    book.record('sit', 'ship', T0);
    expect(book.pick('ship', 0, T0 + 10_000, () => 0)).toBeNull();
    expect(book.pick('ship', 0, T0 + rules.minAge * 1000, () => 0)?.kind).toBe('sit');
  });

  it('思い出話の事実を書く（日数は最初の日から）', () => {
    const book = new MemoryBook(rules);
    book.record('solve', 'crystal', T0, '光の柱');
    book.record('solve', 'crystal', T0 + 2 * DAY, '水晶の扉');
    const entry = book.pick('crystal', 0, T0 + 3 * DAY, () => 0);
    expect(entry).not.toBeNull();
    const facts: Record<string, FactValue> = {};
    book.writeMemoryFacts(entry!, T0 + 3 * DAY + 1000, (id) => `${id}の星`, facts);
    expect(facts).toEqual({
      memoryKind: 'solve',
      memoryPlace: 'crystalの星',
      memoryCount: 2,
      memoryDaysAgo: 3,
      memoryDetail: '水晶の扉',
    });
  });

  it('保存した形から戻せ、壊れた記録は捨てる', () => {
    const book = new MemoryBook(rules);
    book.record('sit', 'ship', T0);
    const saved = JSON.parse(JSON.stringify(book.toJSON()));
    const restored = new MemoryBook(rules, parseMemory(saved));
    expect(restored.count('sit', 'ship')).toBe(1);
    expect(restored.dirty).toBe(false);

    expect(parseMemory(null).entries).toEqual([]);
    expect(parseMemory({ version: 2, entries: [] }).entries).toEqual([]);
    const mixed = parseMemory({
      version: 1,
      entries: [saved.entries[0], { kind: 'jump' }, { ...saved.entries[0], count: 0 }, { ...saved.entries[0], first: 'x' }],
    });
    expect(mixed.entries).toEqual([saved.entries[0]]);
  });

  it('同梱の決まりは正しく読め、おかしな決まりは例外にする', () => {
    expect(rules.topics.landed.minCount).toBe(1);
    expect(() => parseMemoryRules({ ...memoryData, reminisceAfter: 0 })).toThrow('reminisceAfter');
    expect(() => parseMemoryRules({ ...memoryData, topics: { jump: { minCount: 0 } } })).toThrow('jump');
  });
});
