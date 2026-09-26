import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import dialogueData from '../data/dialogue.json';
import { DialogueSelector, parseRules } from './dialogue';
import { TalkDirector } from './talk';

const rules = parseRules(dialogueData);

function createDirector(): TalkDirector {
  return new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2, 'はじまりの星');
}

describe('TalkDirector', () => {
  it('着いたときは初回のあいさつをする', () => {
    expect(createDirector().arrive(0)?.ruleId).toBe('greet.first');
  });

  it('話している途中とその直後は割り込まず、次に反応できたジャンプで初回のセリフを言う', () => {
    const director = createDirector();
    director.arrive(0);
    expect(director.isSpeaking(1)).toBe(true);
    expect(director.jumped(1)).toBeNull();
    expect(director.jumped(3)).toBeNull(); // 話し終えて 1.5 秒たつまでは間を置く
    expect(director.isSpeaking(3)).toBe(false);
    expect(director.jumped(4)?.ruleId).toBe('jump.first');
    expect(director.facts.jumps).toBe(3);
    expect(director.jumped(10)?.ruleId).toBe('jump.default'); // 初回のセリフは一度だけ
  });

  it('跳んでいる間は、放っておかれているとは数えない', () => {
    const director = createDirector();
    director.update(10, false, 0);
    director.jumped(10);
    expect(director.facts.idleSeconds).toBe(0);
  });

  it('初めてのジャンプには、初回のセリフで反応する', () => {
    const director = createDirector();
    expect(director.jumped(0)?.ruleId).toBe('jump.first');
  });

  it('止まっている時間を数え、しばらく放っておかれると話しかける。動くと数え直す', () => {
    const director = createDirector();
    let said = null;
    let t = 0;
    for (; t < 19; t += 0.5) said ??= director.update(0.5, false, t);
    expect(said).toBeNull();
    for (; t < 22; t += 0.5) said ??= director.update(0.5, false, t);
    expect(said?.ruleId).toBe('idle.default');
    director.update(0.1, true, t);
    expect(director.facts.idleSeconds).toBe(0);
  });
});
