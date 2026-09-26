import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPOPA_CONFIG, type PipopaConfig } from '../audio/pipopa';
import emotionData from '../data/emotion.json';
import {
  EMOTION_EVENTS,
  EMOTION_NAMES,
  Emotion,
  emotionalStride,
  emotionVoice,
  moodFace,
  parseEmotionRules,
  parseEmotionValues,
  walkPace,
  type EmotionValues,
} from './emotion';

const rules = parseEmotionRules(emotionData);

function values(overrides: Partial<EmotionValues> = {}): EmotionValues {
  return { ...rules.baseline, ...overrides };
}

describe('parseEmotionRules', () => {
  it('同梱の JSON は正しく読め、コードで使う出来事がすべて書かれている', () => {
    for (const event of EMOTION_EVENTS) expect(rules.events[event]).toBeDefined();
  });

  it('知らない出来事・知らない感情・範囲外の平常値は例外にする', () => {
    const base = JSON.parse(JSON.stringify(emotionData));
    expect(() => parseEmotionRules({ ...base, events: { ...base.events, dance: { joy: 1 } } })).toThrow('dance');
    expect(() => parseEmotionRules({ ...base, events: { ...base.events, jump: { happiness: 1 } } })).toThrow(
      'happiness',
    );
    expect(() => parseEmotionRules({ ...base, baseline: { ...base.baseline, joy: 120 } })).toThrow('joy');
    expect(() => parseEmotionRules({ ...base, halfLife: { ...base.halfLife, anxiety: 0 } })).toThrow('anxiety');
    expect(() => parseEmotionRules({ ...base, ignoredAfter: -1 })).toThrow('ignoredAfter');
    const { jump: _jump, ...withoutJump } = base.events;
    expect(() => parseEmotionRules({ ...base, events: withoutJump })).toThrow('jump');
  });
});

describe('Emotion', () => {
  it('平常値から始まり、出来事で増減し、0〜100 に収まる', () => {
    const emotion = new Emotion(rules);
    expect(emotion.values).toEqual(rules.baseline);
    emotion.feel('discover');
    expect(emotion.values.curiosity).toBe(rules.baseline.curiosity + 30);
    for (let i = 0; i < 20; i++) emotion.feel('leftBehind');
    expect(emotion.values.anxiety).toBe(100);
    expect(emotion.values.joy).toBe(0);
  });

  it('時間とともに平常値へ戻る（半減期で差が半分）。信頼は戻らない', () => {
    const emotion = new Emotion(rules);
    emotion.feel('warp');
    emotion.feel('discover');
    const rise = emotion.values.anxiety - rules.baseline.anxiety;
    const trust = emotion.values.trust;
    const half = rules.halfLife.anxiety as number;
    for (let t = 0; t < half - 1e-9; t += 1 / 60) emotion.update(1 / 60);
    expect(emotion.values.anxiety - rules.baseline.anxiety).toBeCloseTo(rise / 2, 1);
    for (let i = 0; i < 100; i++) emotion.update(10);
    for (const name of EMOTION_NAMES) {
      if (name === 'trust') expect(emotion.values.trust).toBe(trust);
      else expect(emotion.values[name]).toBeCloseTo(rules.baseline[name], 3);
    }
  });

  it('気分は平常値からいちばん上がった感情で、どれも少ししか上がっていなければ calm', () => {
    const emotion = new Emotion(rules);
    expect(emotion.mood()).toBe('calm');
    emotion.feel('jump');
    expect(emotion.mood()).toBe('calm');
    emotion.feel('discover');
    expect(emotion.mood()).toBe('curious');
    emotion.feel('leftBehind');
    emotion.feel('leftBehind');
    expect(emotion.mood()).toBe('anxious');
  });

  it('会話の事実に整数の値と気分を書き込む', () => {
    const emotion = new Emotion(rules);
    emotion.feel('discover');
    emotion.update(0.5);
    const facts: Record<string, number | string | boolean> = {};
    emotion.writeFacts(facts);
    for (const name of EMOTION_NAMES) expect(Number.isInteger(facts[name])).toBe(true);
    expect(facts.mood).toBe('curious');
  });

  it('snapshot の値を restore で戻せ、壊れた値は無視する', () => {
    const emotion = new Emotion(rules);
    emotion.feel('discover');
    const saved = JSON.parse(JSON.stringify(emotion.snapshot()));
    const restored = new Emotion(rules);
    expect(restored.restore(saved)).toBe(true);
    expect(restored.values).toEqual(emotion.values);

    const broken = new Emotion(rules);
    expect(broken.restore(null)).toBe(false);
    expect(broken.restore('abc')).toBe(false);
    expect(broken.restore({ joy: 'x', trust: Infinity, anxiety: 250 })).toBe(true);
    expect(broken.values.joy).toBe(rules.baseline.joy);
    expect(broken.values.trust).toBe(rules.baseline.trust);
    expect(broken.values.anxiety).toBe(100);
  });

  it('parseEmotionValues は 4 つの感情がそろった値だけを受け付け、範囲に収める', () => {
    expect(parseEmotionValues(values({ joy: 70 }))).toEqual(values({ joy: 70 }));
    expect(parseEmotionValues(values({ anxiety: 250 }))?.anxiety).toBe(100);
    expect(parseEmotionValues(null)).toBeNull();
    expect(parseEmotionValues({ joy: 1, curiosity: 2, anxiety: 3 })).toBeNull();
    expect(parseEmotionValues(values({ trust: Infinity }))).toBeNull();
  });
});

describe('感情の反映', () => {
  it('平常ではいつもの顔はほぼ無表情、喜びで笑顔、不安で悲しい顔', () => {
    const face = { happy: 0, sad: 0, relaxed: 0 };
    moodFace(values(), face);
    expect(face.happy + face.sad + face.relaxed).toBe(0);
    expect(moodFace(values({ joy: 100 }), face).happy).toBeGreaterThan(0.3);
    expect(moodFace(values({ anxiety: 100 }), face).sad).toBeGreaterThan(0.3);
    // 表情は薄め（話すときの表情を邪魔しない）
    moodFace({ joy: 100, curiosity: 100, anxiety: 100, trust: 100 }, face);
    for (const weight of Object.values(face)) expect(weight).toBeLessThanOrEqual(0.5);
    // 信頼が高く、ほかが平常なら穏やかな顔
    expect(moodFace(values({ trust: 100 }), face).relaxed).toBeGreaterThan(0.2);
  });

  it('歩く速さは喜びで速く、沈むと遅く、0.75〜1 に収まる', () => {
    expect(walkPace(values({ joy: 90 }))).toBeGreaterThan(walkPace(values()));
    expect(walkPace(values({ joy: 5 }))).toBeLessThan(walkPace(values()));
    expect(walkPace({ joy: 100, curiosity: 100, anxiety: 0, trust: 0 })).toBe(1);
    expect(walkPace({ joy: 0, curiosity: 0, anxiety: 0, trust: 0 })).toBe(0.75);
  });

  it('追従の歩く量は、近くでは感情で遅くなるが、全力で追いかけるときは変わらない', () => {
    const low = { joy: 0, curiosity: 0, anxiety: 0, trust: 0 };
    expect(emotionalStride(1, low)).toBe(1);
    expect(emotionalStride(0, low)).toBe(0);
    expect(emotionalStride(0.3, low)).toBeLessThan(0.3);
    expect(emotionalStride(0.3, values({ joy: 100, curiosity: 100 }))).toBeCloseTo(0.3);
    // 歩く量が増えるほど、足取りも単調に増える
    let previous = 0;
    for (let a = 0.05; a <= 1; a += 0.05) {
      const stride = emotionalStride(a, low);
      expect(stride).toBeGreaterThan(previous);
      previous = stride;
    }
  });

  it('声は平常ならもとの設定のまま、喜びで高く速く、不安で遅く間が長い', () => {
    const out: PipopaConfig = { ...DEFAULT_PIPOPA_CONFIG };
    const calm = { ...emotionVoice(values(), DEFAULT_PIPOPA_CONFIG, out) };
    expect(calm.baseFrequency).toBeCloseTo(DEFAULT_PIPOPA_CONFIG.baseFrequency);
    expect(calm.charInterval).toBeCloseTo(DEFAULT_PIPOPA_CONFIG.charInterval);
    expect(calm.semitoneRange).toBe(DEFAULT_PIPOPA_CONFIG.semitoneRange);

    const happy = { ...emotionVoice(values({ joy: 100 }), DEFAULT_PIPOPA_CONFIG, out) };
    expect(happy.baseFrequency).toBeGreaterThan(calm.baseFrequency);
    expect(happy.charInterval).toBeLessThan(calm.charInterval);

    const anxious = { ...emotionVoice(values({ anxiety: 100 }), DEFAULT_PIPOPA_CONFIG, out) };
    expect(anxious.charInterval).toBeGreaterThan(calm.charInterval);
    expect(anxious.pause).toBeGreaterThan(calm.pause);
    expect(anxious.semitoneRange).toBeLessThan(calm.semitoneRange);

    // 音の長さは文字の間隔より短く保つ（粒が重ならない）
    for (const config of [calm, happy, anxious]) expect(config.beepDuration).toBeLessThan(config.charInterval);
  });
});
