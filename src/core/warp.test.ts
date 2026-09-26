import { describe, expect, it } from 'vitest';
import { WarpSequence } from './warp';

const DT = 0.05;

describe('WarpSequence', () => {
  it('charge → jump → settle の順に進み、暗転に入る瞬間に一度だけ合図する', () => {
    const warp = new WarpSequence({ charge: 1, jump: 0.5, settle: 0.5 });
    expect(warp.active).toBe(false);
    expect(warp.phase).toBe('idle');
    warp.start();
    const phases: string[] = [];
    let signals = 0;
    for (let i = 0; i < 50; i++) {
      if (warp.update(DT)) {
        signals += 1;
        expect(warp.phase).toBe('jump');
      }
      if (phases.at(-1) !== warp.phase) phases.push(warp.phase);
    }
    expect(phases).toEqual(['charge', 'jump', 'settle', 'idle']);
    expect(signals).toBe(1);
    expect(warp.active).toBe(false);
  });

  it('強さは charge で 0 から 1 へ増え、settle で 0 へ戻る', () => {
    const warp = new WarpSequence({ charge: 1, jump: 0.5, settle: 0.5 });
    warp.start();
    expect(warp.intensity).toBe(0);
    let previous = 0;
    for (let t = 0; t < 1; t += DT) {
      warp.update(DT);
      expect(warp.intensity).toBeGreaterThanOrEqual(previous);
      previous = warp.intensity;
    }
    expect(warp.intensity).toBeCloseTo(1);
    for (let t = 0; t < 0.5; t += DT) warp.update(DT);
    expect(warp.phase).toBe('settle');
    for (let t = 0; t < 0.5; t += DT) {
      warp.update(DT);
      expect(warp.intensity).toBeLessThanOrEqual(previous + 1e-9);
      previous = warp.intensity;
    }
    expect(warp.intensity).toBe(0);
  });

  it('start に長さを渡すと charge を延ばせる（設定より短くはならない）', () => {
    const warp = new WarpSequence({ charge: 1, jump: 0.5, settle: 0.5 });
    warp.start(2);
    for (let t = 0; t < 1.5; t += DT) expect(warp.update(DT)).toBe(false);
    expect(warp.phase).toBe('charge');
    let signalled = false;
    for (let t = 1.5; t < 2.5; t += DT) signalled ||= warp.update(DT);
    expect(signalled).toBe(true);
    // 次の start では設定の長さに戻る
    for (let t = 0; t < 2; t += DT) warp.update(DT);
    warp.start(0.2);
    for (let t = 0; t < 0.9; t += DT) warp.update(DT);
    expect(warp.phase).toBe('charge');
  });

  it('動いている途中の start は無視する', () => {
    const warp = new WarpSequence({ charge: 1, jump: 0.5, settle: 0.5 });
    warp.start();
    warp.update(0.5);
    warp.start();
    expect(warp.intensity).toBeCloseTo(0.25);
  });
});
