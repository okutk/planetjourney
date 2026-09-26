import { describe, expect, it } from 'vitest';
import planetsData from '../data/planets.json';
import souvenirData from '../data/souvenirs.json';
import { chooseSlot, collectSouvenir, parseSouvenirRules, parseSouvenirs, type PlacedSouvenir } from './souvenir';

const rules = parseSouvenirRules(souvenirData);

describe('parseSouvenirRules', () => {
  it('同梱の定義は正しく読め、どのおみやげも実在する星のもの', () => {
    const planets = new Set((planetsData as { id: string }[]).map((p) => p.id));
    for (const s of rules.souvenirs) expect(planets.has(s.planet), s.id).toBe(true);
    // 置き場所はおみやげより多い（全部の星から持ち帰っても、すべて飾れる）
    expect(rules.slots.length).toBeGreaterThanOrEqual(rules.souvenirs.length);
  });

  it('書き間違いは例外にする', () => {
    const base = JSON.parse(JSON.stringify(souvenirData));
    expect(() => parseSouvenirRules({ ...base, chatAfter: 0 })).toThrow('chatAfter');
    expect(() => parseSouvenirRules({ ...base, slots: [base.slots[0], base.slots[0]] })).toThrow('重複');
    expect(() => parseSouvenirRules({ ...base, souvenirs: [base.souvenirs[0], { ...base.souvenirs[0], id: 'x' }] })).toThrow('2 つ');
    expect(() => parseSouvenirRules({ ...base, slots: [{ ...base.slots[0], position: [0, 1] }] })).toThrow('position');
  });
});

describe('置き場所と持ち帰り', () => {
  it('ミラは、おみやげの好みにいちばん合う空いた置き場所を選ぶ', () => {
    const shard = rules.souvenirs.find((s) => s.id === 'crystal.shard')!;
    expect(chooseSlot(shard, rules, [])?.id).toBe('sill-left');
    // 窓辺がふさがっていれば、窓辺の右はし
    expect(chooseSlot(shard, rules, [{ id: 'x', slot: 'sill-left', at: 0 }])?.id).toBe('sill-right');
    const all: PlacedSouvenir[] = rules.slots.map((slot, i) => ({ id: `s${i}`, slot: slot.id, at: 0 }));
    expect(chooseSlot(shard, rules, all)).toBeNull();
  });

  it('星ごとに 1 つだけ持ち帰る。おみやげのない星では何もしない', () => {
    const placed: PlacedSouvenir[] = [];
    const first = collectSouvenir('origin', rules, placed, 1000);
    expect(first?.souvenir.id).toBe('origin.pebble');
    expect(first?.slot?.id).toBe('console');
    expect(placed).toEqual([{ id: 'origin.pebble', slot: 'console', at: 1000 }]);
    expect(collectSouvenir('origin', rules, placed, 2000)).toBeNull();
    expect(collectSouvenir('nowhere', rules, placed, 2000)).toBeNull();
    expect(placed.length).toBe(1);
  });

  it('保存から読むとき、壊れた記録・知らないおみやげ・重複は捨て、知らない置き場所は置かなかったことにする', () => {
    const parsed = parseSouvenirs(
      [
        { id: 'origin.pebble', slot: 'console', at: 1 },
        { id: 'origin.pebble', slot: 'corner', at: 2 },
        { id: 'moon.rock', slot: 'corner', at: 3 },
        { id: 'ocean.shell', slot: 'attic', at: 4 },
        { id: 'crystal.shard', at: 'x' },
        null,
      ],
      rules,
    );
    expect(parsed).toEqual([
      { id: 'origin.pebble', slot: 'console', at: 1 },
      { id: 'ocean.shell', slot: null, at: 4 },
    ]);
    expect(parseSouvenirs('broken', rules)).toEqual([]);
  });
});
