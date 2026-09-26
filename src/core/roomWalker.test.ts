import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RoomWalker, type RoomWalkerConfig } from './roomWalker';
import { DEFAULT_WALKER_CONFIG, type WalkInput } from './walker';

const DT = 1 / 60;
const IDLE: WalkInput = { forward: 0, right: 0, jump: false };
const WALK: WalkInput = { forward: 1, right: 0, jump: false };
const JUMP: WalkInput = { forward: 0, right: 0, jump: true };

function createWalker(overrides: Partial<RoomWalkerConfig> = {}): RoomWalker {
  return new RoomWalker({
    ...DEFAULT_WALKER_CONFIG,
    origin: new Vector3(10, -2, 30),
    halfWidth: 3,
    halfDepth: 2,
    obstacles: [{ x: 0, z: -1.5, radius: 0.6 }],
    ...overrides,
  });
}

function run(walker: RoomWalker, input: WalkInput, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) walker.step(input, DT);
}

describe('RoomWalker', () => {
  it('床の中心に立ち、床の高さは origin で決まる', () => {
    const walker = createWalker();
    expect(walker.position.toArray()).toEqual([10, -2, 30]);
    expect(walker.grounded).toBe(true);
    expect(walker.altitude).toBe(0);
  });

  it('向いている方へ歩き、壁でめり込まずに止まる', () => {
    const walker = createWalker();
    walker.placeAt(0, 0, new Vector3(1, 0, 0));
    run(walker, WALK, 0.5);
    expect(walker.position.x).toBeCloseTo(10 + DEFAULT_WALKER_CONFIG.walkSpeed * 0.5, 1);
    run(walker, WALK, 5);
    expect(walker.position.x).toBeCloseTo(13);
    expect(walker.position.z).toBeCloseTo(30);
    expect(walker.altitude).toBe(0);
  });

  it('障害物には入れず、まわりを滑って避ける', () => {
    const walker = createWalker();
    walker.placeAt(0.2, 0, new Vector3(0, 0, -1));
    run(walker, WALK, 3);
    const dx = walker.position.x - 10;
    const dz = walker.position.z - 30 + 1.5;
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(0.6 - 1e-6);
    // 障害物の横を抜けて、奥の壁まで進めている
    expect(walker.position.z).toBeCloseTo(28);
  });

  it('障害物の中に置かれたら、外へ押し出される', () => {
    const walker = createWalker();
    walker.placeAt(0, -1.5, new Vector3(0, 0, 1));
    expect(Math.hypot(walker.position.x - 10, walker.position.z - 28.5)).toBeCloseTo(0.6);
  });

  it('ジャンプすると浮き上がり、床に戻る。空中では再ジャンプしない', () => {
    const walker = createWalker();
    walker.step(JUMP, DT);
    expect(walker.grounded).toBe(false);
    run(walker, JUMP, 0.3);
    expect(walker.altitude).toBeGreaterThan(0.5);
    run(walker, IDLE, 2);
    expect(walker.grounded).toBe(true);
    expect(walker.altitude).toBe(0);
  });

  it('faceTowards は上限の角度ずつ向きを変え、床に沿った向きだけを使う', () => {
    const walker = createWalker();
    walker.faceTowards(new Vector3(1, 5, 0), 0.5);
    expect(walker.forward.length()).toBeCloseTo(1);
    expect(walker.forward.y).toBe(0);
    expect(Math.acos(walker.forward.dot(new Vector3(0, 0, 1)))).toBeCloseTo(0.5);
    walker.faceTowards(new Vector3(1, 0, 0), 10);
    expect(walker.forward.toArray().map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0]);
  });

  it('見た目の向きは、+Y が上、+Z が forward を向く', () => {
    const walker = createWalker();
    walker.faceTowards(new Vector3(-1, 0, 0), 10);
    const z = new Vector3(0, 0, 1).applyQuaternion(walker.orientation());
    expect(z.x).toBeCloseTo(-1);
    expect(z.y).toBeCloseTo(0);
    const y = new Vector3(0, 1, 0).applyQuaternion(walker.orientation());
    expect(y.y).toBeCloseTo(1);
  });
});
