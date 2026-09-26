import { describe, expect, it } from 'vitest';
import { FrameRateMeter } from './frameRate';

describe('FrameRateMeter', () => {
  it('区間ごとに平均 fps を確定する', () => {
    const meter = new FrameRateMeter(0.5);
    let frames = 0;
    while (!meter.tick(1 / 60)) frames += 1;
    // 0.5 秒 ≒ 30 フレーム（浮動小数の誤差で 1 フレームずれることがある）
    expect(frames).toBeGreaterThanOrEqual(29);
    expect(frames).toBeLessThanOrEqual(30);
    expect(meter.fps).toBeCloseTo(60);
    expect(meter.worstFrameMs).toBeCloseTo(1000 / 60);
  });

  it('区間の途中では値を変えず、いちばん長いフレームを記録する', () => {
    const meter = new FrameRateMeter(1);
    expect(meter.tick(0.1)).toBe(false);
    expect(meter.fps).toBe(0);
    for (let i = 0; i < 8; i++) meter.tick(0.05);
    expect(meter.tick(0.5)).toBe(true);
    expect(meter.fps).toBeCloseTo(10 / 1.0);
    expect(meter.worstFrameMs).toBeCloseTo(500);
  });
});
