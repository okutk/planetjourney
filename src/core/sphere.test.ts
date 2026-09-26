import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { alignToUp, behindOn, headingOn, toTangent, upAt } from './sphere';

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

describe('headingOn / behindOn', () => {
  it('heading を地表に沿わせ、up と平行なら適当な接線を選ぶ', () => {
    const up = new Vector3(0, 1, 0);
    expect(headingOn(up, new Vector3(0, 0.5, 1)).toArray()).toEqual([0, 0, 1]);
    const fallback = headingOn(up, new Vector3(0, 1, 0));
    expect(fallback.length()).toBeCloseTo(1);
    expect(fallback.dot(up)).toBeCloseTo(0);
  });

  it('向きの後ろへ angle だけ回った地表の方向を返す', () => {
    const up = new Vector3(0, 1, 0);
    const behind = behindOn(up, new Vector3(0, 0, 1), Math.PI / 2);
    expect(behind.x).toBeCloseTo(0);
    expect(behind.y).toBeCloseTo(0);
    expect(behind.z).toBeCloseTo(-1);
    const tilted = behindOn(new Vector3(1, 1, 0).normalize(), new Vector3(0, 0, 1), 0.3);
    expect(tilted.length()).toBeCloseTo(1);
    expect(tilted.dot(new Vector3(1, 1, 0).normalize())).toBeCloseTo(Math.cos(0.3));
  });
});
