import { describe, expect, it } from 'vitest';
import { stickFromDrag } from './stick';

describe('stickFromDrag', () => {
  it('上へのドラッグは前（y が正）になる', () => {
    const v = stickFromDrag(0, -50, 50, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('右へのドラッグは x が正になる', () => {
    const v = stickFromDrag(25, 0, 50, 0);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(0);
  });

  it('半径より遠くても長さは 1 に丸める', () => {
    const v = stickFromDrag(300, 400, 50, 0.1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(-0.8);
  });

  it('遊びの範囲内は 0、端まで倒すと 1 になる', () => {
    expect(stickFromDrag(4, 0, 50, 0.1)).toEqual({ x: 0, y: 0 });
    expect(stickFromDrag(50, 0, 50, 0.1).x).toBeCloseTo(1);
    // 遊びの外側から線形に増える
    expect(stickFromDrag(27.5, 0, 50, 0.1).x).toBeCloseTo(0.5);
  });

  it('out を渡すとそのオブジェクトに書き込む', () => {
    const out = { x: 9, y: 9 };
    expect(stickFromDrag(0, 10, 10, 0, out)).toBe(out);
    expect(out.y).toBeCloseTo(-1);
  });
});
