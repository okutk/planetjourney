import { describe, expect, it } from 'vitest';
import codexData from '../data/codex.json';
import memoryData from '../data/memory.json';
import planetsData from '../data/planets.json';
import { Codex, isExperienced, parseCodex } from './codex';
import { MemoryBook, parseMemoryRules } from './memory';

const entries = parseCodex(codexData);
const memoryRules = parseMemoryRules(memoryData);
const T0 = Date.UTC(2026, 8, 1, 12);

describe('parseCodex', () => {
  it('同梱の図鑑は正しく読め、場所はどれも実在する星か船', () => {
    const places = new Set(['ship', ...(planetsData as { id: string }[]).map((p) => p.id)]);
    for (const entry of entries) {
      expect(places.has(entry.place), entry.id).toBe(true);
      expect(entry.when.place, entry.id).toBe(entry.place);
    }
    // 図鑑の画面は場所ごとにまとめるので、同じ場所の項目は続けて並べる
    const order = entries.map((e) => e.place).filter((p, i, all) => i === 0 || all[i - 1] !== p);
    expect(new Set(order).size).toBe(order.length);
  });

  it('書き間違いは、どの項目かが分かる例外にする', () => {
    const base = JSON.parse(JSON.stringify(codexData)) as Record<string, unknown>[];
    expect(() => parseCodex([{ ...base[0], titel: 'x' }])).toThrow('titel');
    expect(() => parseCodex([{ ...base[0], impression: '' }])).toThrow('impression');
    expect(() => parseCodex([base[0], base[0]])).toThrow('重複');
    expect(() => parseCodex([{ ...base[0], when: { kind: 'jump', place: 'origin', count: 0 } }])).toThrow('count');
  });
});

describe('Codex', () => {
  it('記憶に出来事が決まった回数残ると体験に変わり、珍しい発見を先に話す', () => {
    const memory = new MemoryBook(memoryRules);
    const codex = new Codex(entries, memory);
    expect(codex.count).toBe(0);
    memory.record('landed', 'ocean', T0);
    codex.check();
    const first = codex.next();
    expect(first?.rare).toBe(true);
    expect(codex.next()?.id).toBe('ocean.sea');
    expect(codex.next()).toBeNull();
    expect(codex.count).toBe(2);

    const gravity = entries.find((e) => e.id === 'origin.gravity')!;
    for (let i = 0; i < 4; i++) memory.record('jump', 'origin', T0);
    expect(isExperienced(gravity, memory)).toBe(false);
    memory.record('jump', 'origin', T0);
    codex.check();
    expect(codex.has(gravity)).toBe(true);
    expect(codex.next()).toBe(gravity);
  });

  it('起動時にすでに体験していた項目は、新しい発見として話さない', () => {
    const memory = new MemoryBook(memoryRules);
    memory.record('landed', 'origin', T0);
    const codex = new Codex(entries, memory);
    expect(codex.count).toBe(1);
    codex.check();
    expect(codex.next()).toBeNull();
  });
});
