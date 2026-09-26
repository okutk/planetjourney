import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/noise';
import dialogueData from '../data/dialogue.json';
import emotionData from '../data/emotion.json';
import { DialogueSelector, parseRules } from './dialogue';
import { Emotion, parseEmotionRules } from './emotion';
import memoryData from '../data/memory.json';
import { MemoryBook, parseMemoryRules } from './memory';
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

  it('かけらを拾うと初回は特別なセリフ、投影機を強化すると段階ごとのセリフ、足りなければ残りの数を言う', () => {
    const director = createDirector();
    const first = director.collectedFragment(0, 1, 1);
    expect(first?.ruleId).toBe('fragment.first');
    // 段階を上げたあと（手持ち 0）に拾っても、通算の番号で言う
    const second = director.collectedFragment(1, 3, 1);
    expect(second?.ruleId).toBe('fragment.default');
    expect(second?.text).toContain('3');
    director.enterShip();
    const short = director.upgradeShort(10, 1);
    expect(short?.ruleId).toBe('upgradeShort.default');
    expect(short?.text).toContain('1');
    expect(director.upgraded(20, 1)?.ruleId).toBe('upgrade.1');
    expect(director.upgraded(30, 2)?.ruleId).toBe('upgrade.2');
    expect(director.upgraded(40, 3)?.ruleId).toBe('upgrade.3');
  });

  it('段階ごとのセリフは、乱数がどう出ても汎用のセリフと同点にならない', () => {
    for (const random of [() => 0, () => 0.5, () => 0.99]) {
      const director = new TalkDirector(new DialogueSelector(rules, random), () => 0.2);
      director.enterShip();
      expect(director.upgraded(0, 1)?.ruleId).toBe('upgrade.1');
      director.enterPlanet('origin', 'はじまりの星', 1);
      expect(director.collectedFragment(10, 1, 1)?.ruleId).toBe('fragment.first');
    }
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

  describe('現実の時刻', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const T0 = Date.UTC(2026, 8, 1, 12);
    function launch(log: { lastPlayedAt: number } | null, nowMs: number, hour: number) {
      const emotion = new Emotion(emotionRules);
      const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2, emotion);
      director.startVisit(log, nowMs);
      director.setClock(hour);
      director.enterShip();
      return { director, emotion, line: director.greet(0) };
    }

    it('初めての起動は、時刻にかかわらず船の案内', () => {
      expect(launch(null, T0, 2).line?.ruleId).toBe('board.first');
      expect(launch(null, T0, 14).line?.ruleId).toBe('board.first');
    });

    it('前にも遊んでいれば、また会えたあいさつ。深夜なら時刻に触れる', () => {
      expect(launch({ lastPlayedAt: T0 }, T0 + 1000, 14).line?.ruleId).toBe('board.again');
      const night = launch({ lastPlayedAt: T0 }, T0 + 1000, 2).line;
      expect(night?.ruleId).toBe('board.lateNight');
      expect(night?.text).toContain('2時');
    });

    it('久しぶりなら日数を言い、うれしくなる。時計が戻っていたら久しぶりとは言わない', () => {
      const away = launch({ lastPlayedAt: T0 }, T0 + 3 * DAY, 14);
      expect(away.line?.ruleId).toBe('board.away');
      expect(away.line?.text).toContain('3日ぶり');
      expect(away.emotion.values.joy).toBeGreaterThan(emotionRules.baseline.joy);
      const long = launch({ lastPlayedAt: T0 }, T0 + 32 * DAY, 14);
      expect(long.line?.ruleId).toBe('board.longAway');
      expect(long.line?.text).toContain('32日');
      const rewound = launch({ lastPlayedAt: T0 }, T0 - 32 * DAY, 14);
      expect(rewound.line?.ruleId).toBe('board.again');
      expect(rewound.emotion.values.joy).toBe(emotionRules.baseline.joy);
    });

    it('久しぶりの反応は、朝や深夜のあいさつより優先する', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const emotion = new Emotion(emotionRules);
        const director = new TalkDirector(new DialogueSelector(rules, createRandom(seed)), () => 2, emotion);
        director.startVisit({ lastPlayedAt: T0 }, T0 + 32 * DAY);
        director.setClock(8);
        director.enterShip();
        expect(director.greet(0)?.ruleId).toBe('board.longAway');
      }
      const night = launch({ lastPlayedAt: T0 }, T0 + 3 * DAY, 2);
      expect(night.line?.ruleId).toBe('board.away');
    });

    it('再読み込みせずに戻ってきたら、前回と比べ直して話す。すぐ戻っただけなら黙っている', () => {
      const { director } = launch({ lastPlayedAt: T0 }, T0 + 1000, 14);
      expect(director.resume({ lastPlayedAt: T0 + 1000 }, T0 + 60_000, 14, 100)).toBeNull();
      expect(director.facts.daysAway).toBe(0);
      const back = director.resume({ lastPlayedAt: T0 + 1000 }, T0 + 2 * DAY + 5000, 14, 200);
      expect(back?.ruleId).toBe('resume.away');
      expect(back?.text).toContain('2日');
      // 時計が戻っていたら、前の再開の日数は残らず、久しぶりとは言わない
      expect(director.resume({ lastPlayedAt: T0 + 2 * DAY }, T0, 14, 300)).toBeNull();
      expect(director.facts.daysAway).toBeUndefined();
      expect(director.facts.clockRewound).toBe(true);
    });

    it('10 日ぶりに深夜に戻ったら、深夜の反応より久しぶりの反応を選ぶ', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const director = new TalkDirector(new DialogueSelector(rules, createRandom(seed)), () => 2);
        expect(director.resume({ lastPlayedAt: T0 }, T0 + 10 * DAY, 2, 0)?.ruleId).toBe('resume.longAway');
      }
    });

    it('戻ったときに話すことがなければ、話している途中のセリフを打ち切らない', () => {
      const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 5);
      director.enterShip();
      director.greet(0);
      expect(director.resume({ lastPlayedAt: T0 }, T0 + 1000, 14, 1)).toBeNull();
      expect(director.isSpeaking(2)).toBe(true);
    });
  });

  it('自律行動を変えたときは、その行動のセリフを話す（ついていくときは話さない）', () => {
    const director = createDirector();
    expect(director.behave(100, 'follow')).toBeNull();
    const inspect = director.behave(110, 'inspect', '光る石');
    expect(inspect?.ruleId.startsWith('inspect.')).toBe(true);
    expect(inspect?.text).toContain('光る石');
    expect(director.behave(120, 'sit')?.ruleId.startsWith('sit.')).toBe(true);
    expect(director.facts.spot).toBeUndefined();
    expect(director.behave(130, 'hide')?.ruleId).toBe('hide.default');
  });

  describe('記憶', () => {
    const memoryRules = parseMemoryRules(memoryData);
    function withMemory() {
      const book = new MemoryBook(memoryRules);
      let nowMs = Date.UTC(2026, 8, 1, 12);
      const director = new TalkDirector(new DialogueSelector(rules, createRandom(1)), () => 2, null, {
        book,
        reminisceAfter: memoryRules.reminisceAfter,
        nowMs: () => nowMs,
        nameOf: (place) => (place === 'origin' ? 'はじまりの星' : place),
        random: () => 0,
      });
      return { book, director, advance: (ms: number) => (nowMs += ms) };
    }

    it('出来事を場所ごとに覚える', () => {
      const { book, director } = withMemory();
      director.enterPlanet('origin', 'はじまりの星', 1);
      director.jumped(0);
      director.leftBehind();
      director.behave(10, 'sit');
      director.askTask(20, 'scan', '石碑');
      director.finishTask(30, 1);
      director.enterShip();
      director.jumped(40);
      expect(book.count('landed', 'origin')).toBe(1);
      expect(book.count('jump', 'origin')).toBe(1);
      expect(book.count('jump', 'ship')).toBe(1);
      expect(book.count('leftBehind', 'origin')).toBe(1);
      expect(book.count('sit', 'origin')).toBe(1);
      expect(book.toJSON().entries.find((e) => e.kind === 'solve')?.detail).toBe('石碑');
    });

    it('前にはぐれた星に降りると、そのことに触れる', () => {
      const { director } = withMemory();
      director.enterPlanet('origin', 'はじまりの星', 1);
      director.leftBehind();
      director.enterShip();
      director.enterPlanet('origin', 'はじまりの星', 2);
      expect(director.facts.here_leftBehind).toBe(1);
      expect(director.greet(100)?.ruleId).toBe('greet.remember.lost');
    });

    it('しばらく放っておかれると、思い出話をする', () => {
      const { director, advance } = withMemory();
      director.enterPlanet('origin', 'はじまりの星', 1);
      director.greet(0);
      advance(2 * 24 * 60 * 60 * 1000);
      let said = null;
      for (let t = 0; t < memoryRules.reminisceAfter + 1; t += 0.5) {
        const line = director.update(0.5, false, 10 + t);
        if (line?.ruleId.startsWith('reminisce.')) said = line;
      }
      expect(said?.ruleId).toBe('reminisce.landed');
      expect(said?.text).toContain('はじまりの星');
      expect(said?.text).toContain('2日前');
    });
  });
});

