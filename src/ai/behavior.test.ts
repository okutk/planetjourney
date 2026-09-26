import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import emotionData from '../data/emotion.json';
import {
  BehaviorSelector,
  Curiosity,
  DEFAULT_BEHAVIOR_CONFIG,
  INSPECT_SECONDS,
  scoreBehaviors,
  type BehaviorScores,
  type Perception,
} from './behavior';
import { parseEmotionRules, type EmotionValues } from './emotion';

const baseline = parseEmotionRules(emotionData).baseline;

function perceive(overrides: Partial<Perception> = {}, emotion: Partial<EmotionValues> = {}): Perception {
  return {
    playerDistance: 1.5,
    idleSeconds: 0,
    interestDistance: null,
    threatDistance: null,
    emotion: { ...baseline, ...emotion },
    ...overrides,
  };
}

function best(p: Perception): string {
  const scores: BehaviorScores = { follow: 0, inspect: 0, sit: 0, hide: 0 };
  scoreBehaviors(p, DEFAULT_BEHAVIOR_CONFIG, scores);
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

describe('scoreBehaviors', () => {
  it('何もなければついていく', () => {
    expect(best(perceive())).toBe('follow');
    expect(best(perceive({ playerDistance: 8 }))).toBe('follow');
  });

  it('プレイヤーが止まっていて、近くに気になる物があれば見に行く。遠い物や、離されているときは行かない', () => {
    expect(best(perceive({ idleSeconds: 3, interestDistance: 3 }))).toBe('inspect');
    expect(best(perceive({ idleSeconds: 3, interestDistance: 10 }))).toBe('follow');
    expect(best(perceive({ idleSeconds: 3, interestDistance: 3, playerDistance: 7 }))).toBe('follow');
  });

  it('好奇心が高いほど見に行きたくなり、低いと見に行かない', () => {
    expect(best(perceive({ idleSeconds: 3, interestDistance: 4 }, { curiosity: 5 }))).toBe('follow');
    const scores: BehaviorScores = { follow: 0, inspect: 0, sit: 0, hide: 0 };
    const low = scoreBehaviors(perceive({ interestDistance: 3 }, { curiosity: 10 }), DEFAULT_BEHAVIOR_CONFIG, scores).inspect;
    const high = scoreBehaviors(perceive({ interestDistance: 3 }, { curiosity: 95 }), DEFAULT_BEHAVIOR_CONFIG, scores).inspect;
    expect(high).toBeGreaterThan(low);
  });

  it('しばらく放っておかれると座る。不安なときは座らず隠れる', () => {
    expect(best(perceive({ idleSeconds: 10 }))).toBe('follow');
    expect(best(perceive({ idleSeconds: 40 }))).toBe('sit');
    expect(best(perceive({ idleSeconds: 40 }, { anxiety: 90 }))).toBe('hide');
  });

  it('怖い物が近いと、不安が平常でも隠れる', () => {
    expect(best(perceive({ threatDistance: 1 }))).toBe('hide');
    expect(best(perceive({ threatDistance: 10 }))).toBe('follow');
  });
});

describe('BehaviorSelector', () => {
  it('選んだ行動は、ほかの点数が上回っても minHold 秒は続ける', () => {
    const selector = new BehaviorSelector();
    const dt = 1 / 30;
    // 座りたくなっても、いまの行動（follow）を選んでから minHold 秒は切り替えない
    expect(selector.update(dt, perceive({ idleSeconds: 40 }))).toBe('follow');
    expect(selector.update(DEFAULT_BEHAVIOR_CONFIG.minHold, perceive({ idleSeconds: 40 }))).toBe('sit');
    // 座ったばかりなら、プレイヤーが離れてもすぐには立たない
    expect(selector.update(dt, perceive({ playerDistance: 5 }))).toBe('sit');
    for (let t = 0; t < DEFAULT_BEHAVIOR_CONFIG.minHold; t += dt) selector.update(dt, perceive({ playerDistance: 5 }));
    expect(selector.current).toBe('follow');
  });

  it('隠れるのは、選んだばかりの行動にも割り込める', () => {
    const selector = new BehaviorSelector();
    selector.update(DEFAULT_BEHAVIOR_CONFIG.minHold, perceive({ idleSeconds: 40 }));
    expect(selector.current).toBe('sit');
    expect(selector.update(0.01, perceive({ threatDistance: 0.5 }))).toBe('hide');
    selector.reset();
    expect(selector.current).toBe('follow');
  });
});

describe('Curiosity', () => {
  const spots = [{ position: new Vector3(3, 0, 0) }, { position: new Vector3(1, 0, 0) }];

  it('まだ見ていない物のうち近いものへ行き、着いてしばらく眺めたら見終える', () => {
    const curiosity = new Curiosity<{ position: Vector3 }>();
    expect(curiosity.nearest(spots, new Vector3())).toBeCloseTo(1);
    expect(curiosity.target()).toBe(spots[1]);
    // 向かっている間に近い物が変わっても、同じ物を見に行き続ける
    curiosity.nearest(spots, new Vector3(4, 0, 0));
    expect(curiosity.target()).toBe(spots[1]);
    expect(curiosity.update(10, false)).toBe(false);
    expect(curiosity.update(INSPECT_SECONDS - 0.1, true)).toBe(false);
    expect(curiosity.update(0.2, true)).toBe(true);
    expect(curiosity.current).toBeNull();
    expect(curiosity.nearest(spots, new Vector3())).toBeCloseTo(3);
    expect(curiosity.candidate).toBe(spots[0]);
  });

  it('途中でやめた物はまた見に行ける。すべて見たら null。reset で忘れる', () => {
    const curiosity = new Curiosity<{ position: Vector3 }>();
    curiosity.nearest(spots, new Vector3());
    curiosity.target();
    curiosity.drop();
    expect(curiosity.nearest(spots, new Vector3())).toBeCloseTo(1);
    for (let i = 0; i < 2; i++) {
      curiosity.nearest(spots, new Vector3());
      curiosity.target();
      curiosity.update(INSPECT_SECONDS, true);
    }
    expect(curiosity.nearest(spots, new Vector3())).toBeNull();
    curiosity.reset();
    expect(curiosity.nearest(spots, new Vector3())).toBeCloseTo(1);
  });
});
