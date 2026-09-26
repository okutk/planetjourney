import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { alignToUp, upAt } from './sphere';

describe('upAt', () => {
  it('中心から位置へ向かう単位ベクトルを返す', () => {
    const up = upAt(new Vector3(0, 0, 10), new Vector3(0, 0, 0));
    expect(up.toArray()).toEqual([0, 0, 1]);
  });

  it('中心がずれていても正規化される', () => {
    const up = upAt(new Vector3(3, 4, 0), new Vector3(0, 0, 0));
    expect(up.length()).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0.6);
    expect(up.y).toBeCloseTo(0.8);
  });
});

describe('alignToUp', () => {
  it('ローカルの Y 軸を up 方向へ回転させる', () => {
    const up = new Vector3(1, 1, 0).normalize();
    const rotated = new Vector3(0, 1, 0).applyQuaternion(alignToUp(up));
    expect(rotated.distanceTo(up)).toBeCloseTo(0);
  });
});
