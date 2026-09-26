import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPOPA_CONFIG, beepsDuration, pipopaBeeps, pipopaTimeline } from './pipopa';

const { charInterval, pause, baseFrequency, semitoneRange, questionRise } = DEFAULT_PIPOPA_CONFIG;

describe('pipopaBeeps', () => {
  it('文字ごとに 1 音、間隔をあけて鳴らす', () => {
    const beeps = pipopaBeeps('ほしめぐり');
    expect(beeps).toHaveLength(5);
    beeps.forEach((b, i) => expect(b.start).toBeCloseTo(i * charInterval));
  });

  it('句読点では音を鳴らさず間を置き、かっこは無視する', () => {
    const beeps = pipopaBeeps('あ、「い」');
    expect(beeps).toHaveLength(2);
    expect(beeps[1].start).toBeCloseTo(charInterval + pause);
  });

  it('同じ文字は同じ高さ、高さは決めた範囲に収まる', () => {
    const [a1, , a2] = pipopaBeeps('あいあ');
    expect(a1.frequency).toBe(a2.frequency);
    const max = baseFrequency * 2 ** (semitoneRange / 12);
    for (const b of pipopaBeeps('データでは知ってた。でも、こんなにふかふかなんだね')) {
      expect(b.frequency).toBeGreaterThanOrEqual(baseFrequency);
      expect(b.frequency).toBeLessThanOrEqual(max + 1e-9);
    }
  });

  it('同じセリフは毎回同じ音になる', () => {
    expect(pipopaBeeps('次はどっちへ行く？')).toEqual(pipopaBeeps('次はどっちへ行く？'));
  });

  it('問いかけ（？で終わる）は、最後の音を上げる', () => {
    const plain = pipopaBeeps('いく');
    const question = pipopaBeeps('いく？');
    expect(question[1].frequency / plain[1].frequency).toBeCloseTo(2 ** (questionRise / 12));
    expect(question[0].frequency).toBe(plain[0].frequency);
  });

  it('空や記号だけのセリフは音なし、長さ 0', () => {
    expect(pipopaBeeps('')).toEqual([]);
    expect(pipopaBeeps('……！')).toEqual([]);
    expect(beepsDuration([])).toBe(0);
  });

  it('beepsDuration は最後の音が鳴り終わるまでの秒数', () => {
    const beeps = pipopaBeeps('あい');
    expect(beepsDuration(beeps)).toBeCloseTo(charInterval + DEFAULT_PIPOPA_CONFIG.beepDuration);
  });
});

describe('pipopaTimeline', () => {
  it('文字が現れる時刻は、その文字の音が鳴る時刻と同じ', () => {
    const { beeps, revealAt } = pipopaTimeline('あ、い');
    expect(revealAt).toHaveLength(3);
    expect(revealAt[0]).toBe(beeps[0].start);
    expect(revealAt[2]).toBe(beeps[1].start);
    expect(revealAt[1]).toBeCloseTo(charInterval); // 「、」は「あ」のすぐあとに出て、そのあと間を置く
  });
});
