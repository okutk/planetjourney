import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import diaryData from '../data/diary.json';
import { DIARY_LIMIT, expand, parseDiary, parseDiaryGrammar, VisitLog, writeDiary } from './diary';

const grammar = parseDiaryGrammar(diaryData);
const T0 = Date.UTC(2026, 8, 1, 12);

function visitFacts(overrides: Record<string, number | string | boolean> = {}) {
  return {
    planet: 'はじまりの星',
    firstVisit: true,
    mood: 'calm',
    jumps: 0,
    leftBehind: 0,
    solved: 0,
    inspected: 0,
    sat: 0,
    discoveries: 0,
    idleMinutes: 0,
    stayMinutes: 3,
    ...overrides,
  };
}

describe('文法の展開', () => {
  it('#記号# を候補の 1 つで置き換え、{名前} を事実で埋める', () => {
    const tiny = parseDiaryGrammar({
      paragraphs: [{ when: [], symbol: 'origin' }],
      symbols: { origin: ['#greeting#、{name}。'], greeting: ['こんにちは', 'やあ'] },
    });
    expect(expand('origin', tiny, { name: 'ミラ' }, () => 0)).toBe('こんにちは、ミラ。');
    expect(expand('origin', tiny, { name: 'ミラ' }, () => 0.99)).toBe('やあ、ミラ。');
  });

  it('記号どうしが呼び合っても、深さの上限で止まる', () => {
    const loop = parseDiaryGrammar({ paragraphs: [], symbols: { a: ['あ#b#'], b: ['い#a#'] } });
    const text = expand('a', loop, {}, () => 0);
    expect(text.startsWith('あいあい')).toBe(true);
    expect(text).not.toContain('#');
  });

  it('知らない記号を使う文法は例外にする', () => {
    expect(() => parseDiaryGrammar({ paragraphs: [], symbols: { a: ['#nothing#'] } })).toThrow('nothing');
    expect(() => parseDiaryGrammar({ paragraphs: [{ when: [], symbol: 'x' }], symbols: { a: ['a'] } })).toThrow('x');
  });
});

describe('writeDiary', () => {
  it('その日の出来事に合う段落だけを書く（GDD の例：3 回目は少しわざと）', () => {
    const text = writeDiary(grammar, visitFacts({ firstVisit: false, leftBehind: 3, jumps: 12 }), () => 0);
    expect(text).toContain('3回もわたしを置いていった');
    expect(text).toContain('3回目は、少しわざとだったと思う');
    expect(text).toContain('12回も跳んだ');
    expect(text).toContain('はじまりの星');
    expect(text).not.toContain('初めての');
  });

  it('何もなかった日でも、始まりと終わりの 2 段落は書く', () => {
    const lines = writeDiary(grammar, visitFacts(), () => 0).split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('初めての');
  });

  it('どの組み合わせでも、展開し残しの記号や事実がない', () => {
    const random = createRandom(7);
    for (let i = 0; i < 200; i++) {
      const facts = visitFacts({
        firstVisit: random() < 0.5,
        mood: ['calm', 'joyful', 'anxious', 'curious'][Math.floor(random() * 4)],
        jumps: Math.floor(random() * 15),
        leftBehind: Math.floor(random() * 5),
        solved: Math.floor(random() * 2),
        inspected: Math.floor(random() * 2),
        sat: Math.floor(random() * 2),
        discoveries: Math.floor(random() * 3),
        lastSolve: '消えた灯り',
        lastInspect: '刻まれた石',
      });
      const text = writeDiary(grammar, facts, random);
      expect(text, JSON.stringify(facts)).not.toMatch(/[#{}]/);
    }
  });
});

describe('VisitLog', () => {
  it('訪問のあいだの出来事を数え、最後の中身と、いちばん長い放置を覚える', () => {
    const log = new VisitLog();
    log.start(T0);
    log.note('jump');
    log.note('jump');
    log.note('solve', '消えた灯り');
    log.note('inspect/刻まれた石');
    log.note('codex', '草原');
    log.idle(30);
    log.idle(130);
    log.idle(5);
    expect(log.facts(T0 + 5 * 60000)).toEqual({
      jumps: 2,
      leftBehind: 0,
      solved: 1,
      inspected: 1,
      sat: 0,
      discoveries: 1,
      idleMinutes: 2,
      stayMinutes: 5,
      lastSolve: '消えた灯り',
      lastInspect: '刻まれた石',
      lastCodex: '草原',
    });
    log.start(T0);
    expect(log.facts(T0).jumps).toBe(0);
    expect(log.facts(T0).lastSolve).toBeUndefined();
  });
});

describe('parseDiary', () => {
  it('壊れたページは捨て、多すぎれば新しいほうを残す', () => {
    expect(parseDiary('x')).toEqual([]);
    const good = { at: T0, place: '水晶の星', text: 'きらきら。' };
    expect(parseDiary([good, { at: 'x', place: 'a', text: 'b' }, null])).toEqual([good]);
    const many = Array.from({ length: DIARY_LIMIT + 5 }, (_, i) => ({ ...good, at: i }));
    const kept = parseDiary(many);
    expect(kept.length).toBe(DIARY_LIMIT);
    expect(kept[0].at).toBe(5);
  });
});
