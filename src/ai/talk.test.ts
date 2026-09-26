import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import dialogueData from '../data/dialogue.json';
import emotionData from '../data/emotion.json';
import { DialogueSelector, parseRules } from './dialogue';
import { Emotion, parseEmotionRules } from './emotion';
import { TalkDirector } from './talk';

const rules = parseRules(dialogueData);
const emotionRules = parseEmotionRules(emotionData);

function createDirector(): TalkDirector {
  const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
  director.enterPlanet('origin', 'はじまりの星', 1);
  director.greet(-10);
  return director;
}

describe('TalkDirector', () => {
  it('初めて星に着いたときは初回のあいさつをし、2 回目からは星の名前を入れて話す', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
    director.enterPlanet('origin', 'はじまりの星', 1);
    expect(director.greet(0)?.ruleId).toBe('greet.first');
    director.enterPlanet('origin', 'はじまりの星', 2);
    const again = director.greet(100);
    expect(again?.ruleId).toBe('greet.planet');
    expect(again?.text).toContain('はじまりの星');
  });

  it('旅の始まりは船の案内、星から戻ったら星の名前を入れて迎える', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2);
    director.enterShip();
    expect(director.greet(0)?.ruleId).toBe('board.first');
    director.enterPlanet('origin', 'はじまりの星', 1);
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
    director.enterPlanet('origin', 'はじまりの星', 1);
    expect(director.facts.place).toBe('planet');
    expect(director.jumped(2)?.ruleId).toBe('jump.first');
    expect(director.greet(4)?.ruleId).toBe('greet.first');
  });

  it('星図を開くと最初は案内をし、ワープでは行き先の名前を入れて話す', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 0.2);
    director.enterShip();
    expect(director.openedStarMap(0)?.ruleId).toBe('starmap.first');
    const warp = director.warp(10, 'はじまりの星');
    expect(warp?.ruleId).toBe('warp.first');
    expect(warp?.text).toContain('はじまりの星');
    expect(director.facts.warps).toBe(1);
    expect(director.openedStarMap(20)?.ruleId).toBe('starmap.default');
    expect(director.warp(30, 'はじまりの星')?.ruleId).toBe('warp.default');
  });

  it('星ごとの初回のあいさつは id で選ばれ、名前を変えても効く', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 0.2);
    director.enterPlanet('crystal', 'すいしょうの星', 1);
    const line = director.greet(0);
    expect(line?.ruleId).toBe('greet.crystal.first');
    director.enterPlanet('ocean', '海だけの星', 1);
    expect(director.greet(10)?.ruleId).toBe('greet.ocean.first');
  });

  it('仕掛けを頼むと種類ごとのセリフで応え、終えると報告し、離れると止まったことを言う', () => {
    const director = createDirector();
    // 灯りを先に解いても、初めてのスキャンには「最初の発見」のセリフが出る
    expect(director.askTask(0, 'light', '消えた灯り')?.ruleId).toBe('ask.light');
    expect(director.finishTask(10, 1)?.ruleId).toBe('taskDone.light');
    const ask = director.askTask(20, 'scan', '刻まれた石');
    expect(ask?.ruleId).toBe('ask.scan');
    expect(ask?.text).toContain('刻まれた石');
    expect(director.finishTask(30, 2)?.ruleId).toBe('taskDone.scan.first');
    expect(director.facts.scanDone).toBe(1);
    expect(director.askTask(40, 'crawl', '岩のすきま')?.ruleId).toBe('ask.crawl');
    expect(director.cancelTask(50)?.ruleId).toBe('taskCancelled.default');
    expect(director.askTask(60, 'crawl', '岩のすきま')?.ruleId).toBe('ask.crawl');
    expect(director.finishTask(70, 3)?.ruleId).toBe('taskDone.crawl');
  });

  it('結果のセリフは、頼んだセリフの途中や直後でも打ち切って必ず出る', () => {
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 3);
    director.enterPlanet('origin', 'はじまりの星', 1);
    director.askTask(0, 'light', '消えた灯り');
    expect(director.isSpeaking(1)).toBe(true);
    expect(director.finishTask(1, 1)?.ruleId).toBe('taskDone.light');
    director.askTask(10, 'scan', '刻まれた石');
    expect(director.cancelTask(10.5)?.ruleId).toBe('taskCancelled.default');
  });

  it('打ち切ると、話している途中でも次のセリフを話せる', () => {
    const director = createDirector();
    director.enterPlanet('origin', 'はじまりの星', 2);
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
    director.enterPlanet('origin', 'はじまりの星', 2);
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

  it('出来事で感情が動き、話すときに感情の値と気分が事実に入る', () => {
    const emotion = new Emotion(emotionRules);
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2, emotion);
    expect(director.facts.trust).toBe(emotionRules.baseline.trust);
    director.enterShip(); // 旅の始まりは「帰ってきた」ではない
    expect(emotion.values.anxiety).toBe(emotionRules.baseline.anxiety);
    director.warp(0, 'はじまりの星');
    director.enterPlanet('origin', 'はじまりの星', 1);
    expect(emotion.values.curiosity).toBeGreaterThan(emotionRules.baseline.curiosity + 30);
    director.greet(10);
    expect(director.facts.mood).toBe('curious');
    const anxietyBefore = emotion.values.anxiety;
    director.enterShip();
    expect(emotion.values.anxiety).toBeLessThan(anxietyBefore);
    const trustBefore = emotion.values.trust;
    director.askTask(20, 'scan', '石碑');
    director.finishTask(30, 1);
    expect(emotion.values.trust).toBeGreaterThan(trustBefore);
  });

  it('しばらく放っておかれるとさみしくなり、不安なときは不安なセリフを選ぶ', () => {
    const emotion = new Emotion(emotionRules);
    const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2, emotion);
    director.enterPlanet('origin', 'はじまりの星', 2);
    emotion.feel('leftBehind');
    emotion.feel('leftBehind');
    const joyBefore = emotion.values.joy;
    // 不安なときは、ふつうの放置のセリフ（20 秒）より早く、不安なセリフを話す
    let said = null;
    let t = 0;
    for (; t < 20 && !said; t += 0.5) said = director.update(0.5, false, 100 + t);
    expect(said?.ruleId).toBe('idle.anxious');
    expect(director.facts.idleSeconds).toBeLessThan(11);
    expect(emotion.values.joy).toBe(joyBefore);
    // さらに ignoredAfter 秒まで放っておかれると、さみしくなる（ignored で喜びが下がる）
    for (; t < emotionRules.ignoredAfter + 1; t += 0.5) director.update(0.5, false, 100 + t);
    expect(emotion.values.joy).toBeLessThan(joyBefore);
  });
});
