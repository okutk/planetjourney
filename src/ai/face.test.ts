import { describe, expect, it } from 'vitest';
import { Blinker, DEFAULT_BLINK_CONFIG, DEFAULT_EXPRESSION_CONFIG, ExpressionFader } from './face';

const DT = 1 / 60;

describe('Blinker', () => {
  it('間隔のあいだは目を開けていて、時間が来たら閉じてから開く', () => {
    const blinker = new Blinker(DEFAULT_BLINK_CONFIG, () => 0); // 間隔は最小値
    const weights: number[] = [];
    for (let t = 0; t < DEFAULT_BLINK_CONFIG.minInterval + 0.5; t += DT) weights.push(blinker.update(DT));
    const firstClosed = weights.findIndex((w) => w > 0);
    expect(firstClosed * DT).toBeGreaterThanOrEqual(DEFAULT_BLINK_CONFIG.minInterval - DT);
    expect(weights.slice(0, firstClosed).every((w) => w === 0)).toBe(true);
    expect(Math.max(...weights)).toBeGreaterThan(0.8);
    expect(Math.max(...weights)).toBeLessThanOrEqual(1);
    expect(weights.at(-1)).toBe(0);
  });

  it('1 回のまばたきは閉じる時間と開く時間の合計で終わり、そのあとまた間隔が空く', () => {
    const blinker = new Blinker(DEFAULT_BLINK_CONFIG, () => 1); // 間隔は最大値
    const { maxInterval, closeDuration, openDuration } = DEFAULT_BLINK_CONFIG;
    let closedFrames = 0;
    for (let t = 0; t < maxInterval * 2 + 1; t += DT) {
      if (blinker.update(DT) > 0) closedFrames += 1;
    }
    // 2 回のまばたき分だけ目が閉じているフレームがある（端の丸めで ±2 フレーム）
    const perBlink = (closeDuration + openDuration) / DT;
    expect(closedFrames).toBeGreaterThanOrEqual(2 * perBlink - 3);
    expect(closedFrames).toBeLessThanOrEqual(2 * perBlink + 3);
  });

  it('乱数で間隔がばらつく', () => {
    const early = new Blinker(DEFAULT_BLINK_CONFIG, () => 0);
    const late = new Blinker(DEFAULT_BLINK_CONFIG, () => 1);
    const t = DEFAULT_BLINK_CONFIG.minInterval + 0.02;
    for (let s = 0; s < t; s += DT) {
      early.update(DT);
      late.update(DT);
    }
    expect(early.weight).toBeGreaterThan(0);
    expect(late.weight).toBe(0);
  });
});

describe('ExpressionFader', () => {
  const { fadeIn, fadeOut } = DEFAULT_EXPRESSION_CONFIG;

  function run(fader: ExpressionFader, seconds: number): void {
    for (let t = 0; t < seconds; t += DT) fader.update(DT);
  }

  it('出した表情は徐々に強まり、hold が過ぎると徐々に消える', () => {
    const fader = new ExpressionFader();
    fader.show('happy', 1);
    run(fader, fadeIn / 2);
    expect(fader.current).toBe('happy');
    expect(fader.currentWeight).toBeGreaterThan(0.3);
    expect(fader.currentWeight).toBeLessThan(0.8);
    run(fader, 0.5);
    expect(fader.currentWeight).toBe(1);
    run(fader, 0.5 + fadeOut + 0.1);
    expect(fader.current).toBeNull();
    expect(fader.currentWeight).toBe(0);
  });

  it('別の表情に切り替えると、前の表情が消えながら次が出る', () => {
    const fader = new ExpressionFader();
    fader.show('happy');
    run(fader, 1);
    fader.show('surprised');
    run(fader, DT * 3);
    expect(fader.previous).toBe('happy');
    expect(fader.previousWeight).toBeLessThan(1);
    expect(fader.previousWeight).toBeGreaterThan(0.5);
    expect(fader.current).toBe('surprised');
    expect(fader.currentWeight).toBeGreaterThan(0);
    expect(fader.strength).toBeLessThanOrEqual(1);
    run(fader, fadeOut + 0.1);
    expect(fader.previous).toBeNull();
    expect(fader.currentWeight).toBe(1);
  });

  it('同じ表情をもう一度出すと時間が延び、null なら何も変えない', () => {
    const fader = new ExpressionFader();
    fader.show('sad', 0.5);
    run(fader, 0.4);
    fader.show('sad', 0.5);
    run(fader, 0.4);
    expect(fader.currentWeight).toBe(1);
    fader.show(null, 1);
    expect(fader.current).toBe('sad');
    run(fader, DEFAULT_EXPRESSION_CONFIG.maxHold + fadeOut + 0.1);
    expect(fader.current).toBeNull();
  });

  it('hold は上限を超えない', () => {
    const fader = new ExpressionFader();
    fader.show('happy', 999);
    run(fader, DEFAULT_EXPRESSION_CONFIG.maxHold + fadeOut + 0.1);
    expect(fader.current).toBeNull();
  });
});
