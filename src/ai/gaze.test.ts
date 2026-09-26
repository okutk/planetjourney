import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAZE_CONFIG, Gaze, gazePoint } from './gaze';

const EYE = new Vector3(0, 1.3, 0);
const FRONT = new Vector3(0, 0, 1);
const DT = 1 / 60;

describe('gazePoint', () => {
  it('正面の範囲にある物はそのまま見る', () => {
    const target = new Vector3(1, 1, 2);
    const out = gazePoint(EYE, FRONT, target, DEFAULT_GAZE_CONFIG, new Vector3());
    expect(out.toArray()).toEqual(target.toArray());
  });

  it('後ろにある物や、見る物がないときは正面を見る', () => {
    const behind = new Vector3(0, 1, -2);
    const front = new Vector3(0, 1.3, DEFAULT_GAZE_CONFIG.frontDistance);
    expect(gazePoint(EYE, FRONT, behind, DEFAULT_GAZE_CONFIG, new Vector3()).toArray()).toEqual(front.toArray());
    expect(gazePoint(EYE, FRONT, null, DEFAULT_GAZE_CONFIG, new Vector3()).toArray()).toEqual(front.toArray());
    // 目と同じ位置にある物も、向きが決まらないので正面
    expect(gazePoint(EYE, FRONT, EYE.clone(), DEFAULT_GAZE_CONFIG, new Vector3()).toArray()).toEqual(front.toArray());
  });

  it('角度の境目では maxAngle の内側だけを見る', () => {
    const inside = new Vector3(Math.sin(1.2), 1.3, Math.cos(1.2)); // 約 69°
    const outside = new Vector3(Math.sin(1.4), 1.3, Math.cos(1.4)); // 約 80°
    expect(gazePoint(EYE, FRONT, inside, DEFAULT_GAZE_CONFIG, new Vector3()).toArray()).toEqual(inside.toArray());
    expect(gazePoint(EYE, FRONT, outside, DEFAULT_GAZE_CONFIG, new Vector3()).z).toBe(
      DEFAULT_GAZE_CONFIG.frontDistance + EYE.z,
    );
  });
});

describe('Gaze', () => {
  it('最初は目標をすぐ見て、そのあとはなめらかに追う', () => {
    const gaze = new Gaze();
    const a = new Vector3(0, 1, 2);
    const b = new Vector3(1, 1, 2);
    expect(gaze.update(EYE, FRONT, a, DT).toArray()).toEqual(a.toArray());
    gaze.update(EYE, FRONT, b, DT);
    expect(gaze.point.x).toBeGreaterThan(0);
    expect(gaze.point.x).toBeLessThan(1);
    for (let t = 0; t < 2; t += DT) gaze.update(EYE, FRONT, b, DT);
    expect(gaze.point.x).toBeCloseTo(1, 3);
  });

  it('reset() のあとは次の目標をすぐ見る', () => {
    const gaze = new Gaze();
    gaze.update(EYE, FRONT, new Vector3(0, 1, 2), DT);
    gaze.reset();
    const far = new Vector3(2, 1, 1);
    expect(gaze.update(EYE, FRONT, far, DT).toArray()).toEqual(far.toArray());
  });
});
