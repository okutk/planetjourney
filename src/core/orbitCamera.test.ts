import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORBIT_CAMERA_CONFIG, OrbitCamera } from './orbitCamera';

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

function createCamera(heading = FORWARD): OrbitCamera {
  return new OrbitCamera(DEFAULT_ORBIT_CAMERA_CONFIG, heading, UP);
}

describe('OrbitCamera', () => {
  it('eye は注視点から後ろ上へ distance だけ離れる', () => {
    const camera = createCamera();
    const position = new Vector3(0, 5, 0);
    const target = camera.target(position, UP, new Vector3());
    const eye = camera.eye(position, UP, new Vector3());
    expect(eye.distanceTo(target)).toBeCloseTo(DEFAULT_ORBIT_CAMERA_CONFIG.distance);
    expect(eye.z).toBeLessThan(0); // 後ろ
    expect(eye.y).toBeGreaterThan(target.y); // 上
  });

  it('rotate で右へ回り込み、pitch は範囲内に収まる', () => {
    const camera = createCamera();
    camera.rotate(Math.PI / 2, 0, UP);
    // 右へ回り込むと、カメラは +Z を向いた状態から右（-X）を向く
    expect(camera.heading.distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(1e-9);

    camera.rotate(0, 10, UP);
    expect(camera.pitch).toBe(DEFAULT_ORBIT_CAMERA_CONFIG.maxPitch);
    camera.rotate(0, -10, UP);
    expect(camera.pitch).toBe(DEFAULT_ORBIT_CAMERA_CONFIG.minPitch);
  });

  it('transport で向きをプレイヤーと一緒に運ぶ', () => {
    const camera = createCamera();
    // 北極から +Z 方向へ 90° 進んだ回転（x 軸まわり）
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const up = new Vector3(0, 0, 1);
    camera.transport(rotation, up);
    expect(camera.heading.distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-9);
  });

  it('前へ歩いていて手で回していなければ、プレイヤーの後ろへ回り込む', () => {
    const camera = createCamera(new Vector3(1, 0, 0));
    for (let i = 0; i < 600; i++) camera.update(1 / 60, FORWARD, UP, 0, 1);
    expect(camera.heading.distanceTo(FORWARD)).toBeLessThan(0.01);
  });

  it('止まっているときや、手で回した直後は回り込まない', () => {
    const idle = createCamera(new Vector3(1, 0, 0));
    for (let i = 0; i < 120; i++) idle.update(1 / 60, FORWARD, UP, 0, 0);
    expect(idle.heading.x).toBeCloseTo(1);

    const manual = createCamera(new Vector3(1, 0, 0));
    manual.rotate(0, 0.01, UP);
    manual.update(1, FORWARD, UP, 0, 1); // recenterDelay（1.5 秒）より前
    expect(manual.heading.x).toBeCloseTo(1);
  });

  it('プレイヤーがカメラの方へ歩いてくるときは回り込まない', () => {
    const camera = createCamera(new Vector3(0, 0, -1));
    for (let i = 0; i < 60; i++) camera.update(1 / 60, FORWARD, UP, 0, -1);
    expect(camera.heading.z).toBeCloseTo(-1);
  });

  // ゲームと同じく、プレイヤーの向き（forward）をカメラの向きとスティックから毎フレーム決めて 5 秒歩く
  function walkWithStick(stickX: number, stickY: number): number {
    const camera = createCamera();
    const start = camera.heading.clone();
    const forward = new Vector3();
    const yaw = Math.atan2(stickX, stickY); // 前から右回りの角度
    for (let i = 0; i < 300; i++) {
      forward.copy(camera.heading).applyAxisAngle(UP, -yaw);
      camera.update(1 / 60, forward, UP, stickX, stickY);
    }
    return camera.heading.angleTo(start);
  }

  it('横や斜めへ歩き続けても、カメラは回り続けない（円を描かない）', () => {
    expect(walkWithStick(1, 0)).toBeLessThan(1e-9);
    expect(walkWithStick(-1, 0)).toBeLessThan(1e-9);
    expect(walkWithStick(Math.SQRT1_2, Math.SQRT1_2)).toBeLessThan(1e-9);
  });

  it('ほぼ前へ歩くときの回り込みはゆるやか（5 秒で 60° 未満）', () => {
    // 回り込みがいちばん強いのはコーン（25°）の半分の 12.5° 前後
    for (const degrees of [5, 10, 12.5, 15, 20]) {
      const rad = (degrees * Math.PI) / 180;
      expect(walkWithStick(Math.sin(rad), Math.cos(rad))).toBeLessThan(Math.PI / 3);
    }
  });

  it('zoom で距離が変わり、範囲内に収まる', () => {
    const camera = createCamera();
    const { distance, minDistance, maxDistance } = DEFAULT_ORBIT_CAMERA_CONFIG;
    camera.zoom(1.5);
    expect(camera.distance).toBeCloseTo(distance * 1.5);
    const position = new Vector3(0, 5, 0);
    const target = camera.target(position, UP, new Vector3());
    expect(camera.eye(position, UP, new Vector3()).distanceTo(target)).toBeCloseTo(distance * 1.5);
    camera.zoom(100);
    expect(camera.distance).toBe(maxDistance);
    camera.zoom(0.001);
    expect(camera.distance).toBe(minDistance);
  });
});
