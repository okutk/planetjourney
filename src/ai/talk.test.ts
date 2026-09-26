import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import dialogueData from '../data/dialogue.json';
import { DialogueSelector, parseRules } from './dialogue';
import { TalkDirector } from './talk';

const rules = parseRules(dialogueData);

function createDirector(): TalkDirector {
  const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
  director.enterPlanet('はじまりの星', 1);
  director.greet(-10);
  return director;
}

describe('TalkDirector', () => {
  it('初めて星に着いたときは初回のあいさつをし、2 回目からは星の名前を入れて話す', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
    director.enterPlanet('はじまりの星', 1);
    expect(director.greet(0)?.ruleId).toBe('greet.first');
    director.enterPlanet('はじまりの星', 2);
    const again = director.greet(100);
    expect(again?.ruleId).toBe('greet.planet');
    expect(again?.text).toContain('はじまりの星');
  });

  it('旅の始まりは船の案内、星から戻ったら星の名前を入れて迎える', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
    director.enterShip();
    expect(director.greet(0)?.ruleId).toBe('board.first');
    director.enterPlanet('はじまりの星', 1);
    director.greet(100);
    director.enterShip();
    const back = director.greet(200);
    expect(back?.ruleId).toBe('board.return');
    expect(director.facts.place).toBe('ship');
  });

  it('星に降りた直後（あいさつの前）に跳んでも、船のセリフにはならず、あいさつも言える', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 0.2);
    director.enterShip();
    director.greet(0);
    director.enterPlanet('はじまりの星', 1);
    expect(director.facts.place).toBe('planet');
    expect(director.jumped(2)?.ruleId).toBe('jump.first');
    expect(director.greet(4)?.ruleId).toBe('greet.first');
  });

  it('打ち切ると、話している途中でも次のセリフを話せる', () => {
    const director = createDirector();
    director.enterPlanet('はじまりの星', 2);
    director.greet(0);
    director.enterShip();
    expect(director.greet(1)).toBeNull();
    director.interrupt();
    expect(director.isSpeaking(1)).toBe(false);
    expect(director.greet(1)?.ruleId).toBe('board.return');
  });

  it('船の中では、星の上とは違うセリフで反応する', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
    director.enterShip();
    director.greet(0);
    expect(director.jumped(10)?.ruleId).toBe('jump.ship');
    let said = null;
    for (let t = 20; t < 45 && !said; t += 1) said = director.update(1, false, t);
    expect(said?.ruleId).toBe('idle.ship');
  });

  it('話している途中とその直後は割り込まず、次に反応できたジャンプで初回のセリフを言う', () => {
    const director = createDirector();
    director.enterPlanet('はじまりの星', 2);
    director.greet(0);
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
    expect(said?.ruleId).toBe('idle.planet');
    director.update(0.1, true, t);
    expect(director.facts.idleSeconds).toBe(0);
  });
});
