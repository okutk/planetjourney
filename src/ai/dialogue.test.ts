import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import dialogueData from '../data/dialogue.json';
import {
  DialogueSelector,
  fillLine,
  matches,
  parseRules,
  placeholdersOf,
  type DialogueRule,
} from './dialogue';

function rule(partial: Partial<DialogueRule> & Pick<DialogueRule, 'id'>): DialogueRule {
  return { concept: 'greet', criteria: [], lines: [partial.id], ...partial };
}

describe('matches', () => {
  const facts = { planet: 'はじまりの星', affection: 40, night: true };

  it('比較の演算子', () => {
    expect(matches({ fact: 'planet', op: 'eq', value: 'はじまりの星' }, facts)).toBe(true);
    expect(matches({ fact: 'planet', op: 'ne', value: 'はじまりの星' }, facts)).toBe(false);
    expect(matches({ fact: 'affection', op: 'gt', value: 40 }, facts)).toBe(false);
    expect(matches({ fact: 'affection', op: 'gte', value: 40 }, facts)).toBe(true);
    expect(matches({ fact: 'affection', op: 'lt', value: 50 }, facts)).toBe(true);
    expect(matches({ fact: 'affection', op: 'lte', value: 39 }, facts)).toBe(false);
    expect(matches({ fact: 'night', op: 'eq', value: true }, facts)).toBe(true);
  });

  it('exists / missing と、数でない値の大小比較', () => {
    expect(matches({ fact: 'planet', op: 'exists' }, facts)).toBe(true);
    expect(matches({ fact: 'weather', op: 'missing' }, facts)).toBe(true);
    expect(matches({ fact: 'planet', op: 'gt', value: 1 }, facts)).toBe(false);
    expect(matches({ fact: 'weather', op: 'lt', value: 1 }, facts)).toBe(false);
  });
});

describe('DialogueSelector', () => {
  const rules = [
    rule({ id: 'default' }),
    rule({ id: 'planet', criteria: [{ fact: 'planet', op: 'exists' }] }),
    rule({
      id: 'planet-night',
      criteria: [
        { fact: 'planet', op: 'exists' },
        { fact: 'night', op: 'eq', value: true },
      ],
    }),
  ];

  it('条件がすべて合うルールのうち、条件がいちばん多いものを選ぶ', () => {
    const selector = new DialogueSelector(rules, createRandom(1));
    expect(selector.select('greet', {}, 0)?.ruleId).toBe('default');
    expect(selector.select('greet', { planet: 'A' }, 0)?.ruleId).toBe('planet');
    expect(selector.select('greet', { planet: 'A', night: true }, 0)?.ruleId).toBe('planet-night');
    expect(selector.select('greet', { planet: 'A', night: false }, 0)?.ruleId).toBe('planet');
  });

  it('合うルールがない concept では null', () => {
    const selector = new DialogueSelector(rules, createRandom(1));
    expect(selector.select('unknown', {}, 0)).toBeNull();
  });

  it('once のルールは一度しか使わず、cooldown の間は次に細かいルールへ譲る', () => {
    const selector = new DialogueSelector(
      [
        rule({
          id: 'first',
          criteria: [
            { fact: 'n', op: 'eq', value: 1 },
            { fact: 'first', op: 'eq', value: true },
          ],
          once: true,
        }),
        rule({ id: 'cool', criteria: [{ fact: 'n', op: 'exists' }], cooldown: 10 }),
        rule({ id: 'default' }),
      ],
      createRandom(1),
    );
    const facts = { n: 1, first: true };
    expect(selector.select('greet', facts, 0)?.ruleId).toBe('first');
    expect(selector.select('greet', facts, 1)?.ruleId).toBe('cool');
    expect(selector.select('greet', facts, 5)?.ruleId).toBe('default');
    expect(selector.select('greet', facts, 11)?.ruleId).toBe('cool');
  });

  it('同じルールでは、前回と同じセリフを続けて選ばない', () => {
    const selector = new DialogueSelector([rule({ id: 'a', lines: ['1', '2', '3'] })], createRandom(5));
    let previous = '';
    for (let i = 0; i < 50; i++) {
      const text = selector.select('greet', {}, i)!.text;
      expect(text).not.toBe(previous);
      previous = text;
    }
  });

  it('セリフの {名前} を事実の値で埋める', () => {
    const selector = new DialogueSelector([rule({ id: 'a', lines: ['{planet}に着いた'] })], createRandom(1));
    expect(selector.select('greet', { planet: '水晶の星' }, 0)?.text).toBe('水晶の星に着いた');
    expect(fillLine('{laps}周目、{unknown}', { laps: 3 })).toBe('3周目、{unknown}');
  });
});

describe('parseRules', () => {
  it('形のおかしいルールは、どのルールかが分かる例外にする', () => {
    expect(() => parseRules({})).toThrow('配列');
    expect(() => parseRules([{ id: 'a', concept: 'x', criteria: [], lines: [] }])).toThrow('a');
    expect(() =>
      parseRules([
        { id: 'a', concept: 'x', criteria: [], lines: ['1'] },
        { id: 'a', concept: 'x', criteria: [], lines: ['1'] },
      ]),
    ).toThrow('重複');
    expect(() =>
      parseRules([{ id: 'b', concept: 'x', criteria: [{ fact: 'n', op: 'gte' }], lines: ['1'] }]),
    ).toThrow('value');
    expect(() =>
      parseRules([{ id: 'd', concept: 'x', criteria: [{ fact: 'n', op: 'eq', value: null }], lines: ['1'] }]),
    ).toThrow('value');
    expect(() => parseRules([{ id: 'e', concept: 'x', criteria: [], lines: ['1', '1'] }])).toThrow('重複');
    expect(() => parseRules([{ id: 'f', concept: 'x', criteria: [], lines: ['1'], cooldwon: 5 }])).toThrow(
      'cooldwon',
    );
    expect(() => parseRules([{ id: 'g', concept: 'x', criteria: [], lines: ['1'], once: 'true' }])).toThrow('once');
    expect(() =>
      parseRules([{ id: 'c', concept: 'x', criteria: [{ fact: 'n', op: 'like', value: 1 }], lines: ['1'] }]),
    ).toThrow('op');
  });
});

describe('src/data/dialogue.json', () => {
  const rules = parseRules(dialogueData);

  it('形が正しい', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('初めて着いたときは、必ず初回のセリフになる（同点で乱数に回らない）', () => {
    for (let seed = 0; seed < 50; seed++) {
      const selector = new DialogueSelector(rules, createRandom(seed));
      expect(selector.select('greet', { visits: 1, planetId: 'origin', planet: 'はじまりの星' }, 0)?.ruleId).toBe('greet.first');
    }
  });

  it('セリフの {名前} は、そのルールの条件で必ずある事実だけを使う', () => {
    const guaranteed = (r: DialogueRule) =>
      new Set(r.criteria.filter((c) => c.op !== 'missing' && c.op !== 'ne').map((c) => c.fact));
    for (const r of rules) {
      const facts = guaranteed(r);
      for (const line of r.lines) {
        for (const name of placeholdersOf(line)) {
          expect(facts.has(name), `${r.id} の {${name}}`).toBe(true);
        }
      }
    }
  });
});
