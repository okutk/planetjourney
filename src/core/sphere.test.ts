import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { alignToUp, toTangent, upAt } from './sphere';

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

describe('toTangent', () => {
  it('up に直交する単位ベクトルへ射影する', () => {
    const up = new Vector3(0, 1, 0);
    const v = toTangent(new Vector3(3, 5, 4), up);
    expect(v.dot(up)).toBeCloseTo(0);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.z).toBeCloseTo(0.8);
  });

  it('up と平行なら変更しない', () => {
    const v = toTangent(new Vector3(0, 2, 0), new Vector3(0, 1, 0));
    expect(v.toArray()).toEqual([0, 2, 0]);
  });
});
