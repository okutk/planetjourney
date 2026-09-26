import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WALKER_CONFIG, SphericalWalker, type WalkInput } from './walker';

const RADIUS = 5;
const DT = 1 / 60;
const IDLE: WalkInput = { forward: 0, right: 0, jump: false };
const WALK: WalkInput = { forward: 1, right: 0, jump: false };
const JUMP: WalkInput = { forward: 0, right: 0, jump: true };

function createWalker(center = new Vector3()): SphericalWalker {
  return new SphericalWalker({ ...DEFAULT_WALKER_CONFIG, center, planetRadius: RADIUS });
}

function run(walker: SphericalWalker, input: WalkInput, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) walker.step(input, DT);
}

describe('SphericalWalker', () => {
  it('初期状態では北極の地表に立っている', () => {
    const walker = createWalker();
    expect(walker.grounded).toBe(true);
    expect(walker.altitude).toBeCloseTo(0);
    expect(walker.up.toArray()).toEqual([0, 1, 0]);
  });

  it('歩いても地表からの高さと向きの直交性が保たれる', () => {
    const walker = createWalker(new Vector3(10, -3, 2));
    walker.placeAt(new Vector3(1, 2, 3), new Vector3(0, 0, 1));
    for (let i = 0; i < 600; i++) {
      walker.step({ forward: 1, right: 0.3, jump: false }, DT);
      expect(walker.grounded).toBe(true);
      expect(walker.altitude).toBeCloseTo(0, 6);
      expect(walker.forward.length()).toBeCloseTo(1, 6);
      expect(walker.forward.dot(walker.up)).toBeCloseTo(0, 6);
    }
  });

  it('まっすぐ歩き続けると星を一周して元の場所に戻る', () => {
    const walker = createWalker();
    const start = walker.position.clone();
    const lap = (2 * Math.PI * RADIUS) / DEFAULT_WALKER_CONFIG.walkSpeed;
    const steps = Math.round(lap / DT);
    let farthest = 0;
    for (let i = 0; i < steps; i++) {
      walker.step(WALK, DT);
      farthest = Math.max(farthest, walker.position.distanceTo(start));
    }
    expect(farthest).toBeCloseTo(RADIUS * 2, 1); // 反対側（南極）を通る
    expect(walker.position.distanceTo(start)).toBeLessThan(0.05);
  });

  it('入力の向きに進む（前・右）', () => {
    const forward = createWalker();
    forward.step(WALK, DT);
    expect(forward.position.z).toBeGreaterThan(0);

    // 北極で +Z を向いているとき、後ろから見た右は -X
    const right = createWalker();
    right.step({ forward: 0, right: 1, jump: false }, DT);
    expect(right.position.x).toBeLessThan(0);
    expect(Math.abs(right.position.z)).toBeLessThan(1e-9);
  });

  it('斜め入力でも速さは walkSpeed を超えない', () => {
    const walker = createWalker();
    const start = walker.position.clone();
    walker.step({ forward: 1, right: 1, jump: false }, DT);
    const moved = walker.position.distanceTo(start);
    expect(moved).toBeLessThanOrEqual(DEFAULT_WALKER_CONFIG.walkSpeed * DT + 1e-9);
    expect(moved).toBeGreaterThan(DEFAULT_WALKER_CONFIG.walkSpeed * DT * 0.99);
  });

  it('ジャンプすると上がってから着地し、接地に戻る', () => {
    const walker = createWalker();
    walker.step(JUMP, DT);
    expect(walker.grounded).toBe(false);

    const { gravity, jumpSpeed } = DEFAULT_WALKER_CONFIG;
    const expectedPeak = (jumpSpeed * jumpSpeed) / (2 * gravity);
    let peak = 0;
    let airTime = DT;
    while (!walker.grounded && airTime < 5) {
      walker.step(IDLE, DT);
      peak = Math.max(peak, walker.altitude);
      airTime += DT;
    }
    expect(walker.grounded).toBe(true);
    expect(walker.altitude).toBeCloseTo(0);
    expect(peak).toBeGreaterThan(expectedPeak * 0.95);
    expect(peak).toBeLessThan(expectedPeak * 1.05);
    expect(airTime).toBeCloseTo((2 * jumpSpeed) / gravity, 1);
  });

  it('空中ではもう一度ジャンプできない', () => {
    const walker = createWalker();
    walker.step(JUMP, DT);
    run(walker, IDLE, 0.1);
    const speed = walker.verticalSpeed;
    walker.step(JUMP, DT);
    expect(walker.verticalSpeed).toBeLessThan(speed);
  });

  it('星のどこにいても中心に向かって落ちる', () => {
    const center = new Vector3(0, 0, 0);
    for (const dir of [new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(-1, -1, 1)]) {
      const walker = createWalker(center);
      walker.placeAt(dir, new Vector3(0, 0, 1), 3);
      expect(walker.grounded).toBe(false);
      run(walker, IDLE, 2);
      expect(walker.grounded).toBe(true);
      expect(walker.altitude).toBeCloseTo(0);
      expect(walker.up.distanceTo(dir.clone().normalize())).toBeLessThan(1e-9);
    }
  });

  it('turn で up を軸に向きが変わる', () => {
    const walker = createWalker();
    walker.turn(Math.PI / 2);
    expect(walker.forward.x).toBeCloseTo(1);
    expect(walker.forward.z).toBeCloseTo(0);
    expect(walker.up.toArray()).toEqual([0, 1, 0]);
  });

  it('orientation はローカル +Y を up、+Z を forward に向ける', () => {
    const walker = createWalker();
    walker.placeAt(new Vector3(1, 1, 0), new Vector3(0, 0, -1));
    const q = walker.orientation();
    expect(new Vector3(0, 1, 0).applyQuaternion(q).distanceTo(walker.up)).toBeCloseTo(0);
    expect(new Vector3(0, 0, 1).applyQuaternion(q).distanceTo(walker.forward)).toBeCloseTo(0);
  });
});

describe('SphericalWalker の向きの制御', () => {
  it('faceTowards は目標の向きへ最大 maxAngle だけ回る', () => {
    const walker = createWalker();
    // 北極で +Z を向いている。+X は左手側（上から見て反時計回りに 90°）
    walker.faceTowards(new Vector3(1, 0, 0), 0.1);
    const angle = Math.atan2(walker.forward.x, walker.forward.z);
    expect(angle).toBeCloseTo(0.1);

    walker.faceTowards(new Vector3(1, 5, 0), Math.PI);
    expect(walker.forward.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);

    walker.faceTowards(new Vector3(0, 0, -1), 0.2); // 近いほう（左回り）へ回る
    expect(Math.atan2(walker.forward.x, walker.forward.z)).toBeCloseTo(Math.PI / 2 + 0.2);
  });

  it('lastRotation は動いた分の回転で、止まっていれば回転なし', () => {
    const walker = createWalker();
    const heading = walker.forward.clone();
    const before = walker.position.clone();
    walker.step(WALK, DT);
    expect(before.applyQuaternion(walker.lastRotation).distanceTo(walker.position)).toBeLessThan(1e-9);
    expect(heading.applyQuaternion(walker.lastRotation).distanceTo(walker.forward)).toBeLessThan(1e-9);

    walker.step(IDLE, DT);
    expect(walker.lastRotation.w).toBe(1);
  });
});

describe('SphericalWalker と起伏のある地形', () => {
  // 北極側（y が大きい）ほど高い、なだらかな地形
  const surfaceRadius = (up: Vector3) => RADIUS + up.y;

  it('歩くと地表の高さに沿って上り下りする', () => {
    const walker = new SphericalWalker({
      ...DEFAULT_WALKER_CONFIG,
      center: new Vector3(),
      planetRadius: RADIUS,
      surfaceRadius,
    });
    expect(walker.position.length()).toBeCloseTo(RADIUS + 1);
    run(walker, WALK, 1);
    expect(walker.grounded).toBe(true);
    expect(walker.altitude).toBeCloseTo(0);
    expect(walker.position.length()).toBeCloseTo(RADIUS + walker.up.y);
    expect(walker.position.length()).toBeLessThan(RADIUS + 1);
  });

  it('ジャンプすると、その場所の地表に着地する', () => {
    const walker = new SphericalWalker({
      ...DEFAULT_WALKER_CONFIG,
      center: new Vector3(),
      planetRadius: RADIUS,
      surfaceRadius,
    });
    walker.placeAt(new Vector3(1, 1, 0), new Vector3(0, 0, 1));
    walker.step(JUMP, DT);
    let t = 0;
    while (!walker.grounded && t < 5) {
      walker.step(WALK, DT);
      t += DT;
    }
    expect(walker.grounded).toBe(true);
    expect(walker.position.length()).toBeCloseTo(RADIUS + walker.up.y);
  });
});
