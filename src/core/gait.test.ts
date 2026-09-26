import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IDLE_CONFIG,
  DEFAULT_SIT_CONFIG,
  DEFAULT_WALK_CONFIG,
  createPose,
  idlePose,
  sitPose,
  walkPose,
  type Pose,
} from './gait';

const KEYS = Object.keys(createPose()) as (keyof Pose)[];

function expectSamePose(a: Pose, b: Pose): void {
  for (const key of KEYS) expect(a[key]).toBeCloseTo(b[key], 9);
}

describe('walkPose', () => {
  it('1 周期で元の姿勢に戻る（位相が 1 を超えても、負でも同じ）', () => {
    const a = walkPose(0.3, DEFAULT_WALK_CONFIG, createPose());
    expectSamePose(walkPose(1.3, DEFAULT_WALK_CONFIG, createPose()), a);
    expectSamePose(walkPose(-0.7, DEFAULT_WALK_CONFIG, createPose()), a);
  });

  it('右脚と右腕は、左と半周期ずれて同じ動きをする', () => {
    for (const phase of [0, 0.1, 0.37, 0.5, 0.8]) {
      const now = walkPose(phase, DEFAULT_WALK_CONFIG, createPose());
      const half = walkPose(phase + 0.5, DEFAULT_WALK_CONFIG, createPose());
      expect(now.rightUpperLegPitch).toBeCloseTo(half.leftUpperLegPitch, 9);
      expect(now.rightKnee).toBeCloseTo(half.leftKnee, 9);
      expect(now.rightUpperArmPitch).toBeCloseTo(half.leftUpperArmPitch, 9);
      expect(now.rightElbow).toBeCloseTo(half.leftElbow, 9);
    }
  });

  it('腕は同じ側の脚と反対に振る', () => {
    for (const phase of [0.05, 0.25, 0.6, 0.9]) {
      const pose = walkPose(phase, DEFAULT_WALK_CONFIG, createPose());
      expect(Math.sign(pose.leftUpperArmPitch)).toBe(-Math.sign(pose.leftUpperLegPitch));
      expect(Math.sign(pose.rightUpperArmPitch)).toBe(-Math.sign(pose.rightUpperLegPitch));
    }
  });

  it('膝は逆に曲がらず、脚を前へ振り出す途中でいちばん曲がる', () => {
    let deepest = -1;
    let deepestPhase = 0;
    for (let i = 0; i < 100; i++) {
      const phase = i / 100;
      const pose = walkPose(phase, DEFAULT_WALK_CONFIG, createPose());
      expect(pose.leftKnee).toBeGreaterThanOrEqual(0);
      expect(pose.leftKnee).toBeLessThanOrEqual(DEFAULT_WALK_CONFIG.kneeBend);
      if (pose.leftKnee > deepest) {
        deepest = pose.leftKnee;
        deepestPhase = phase;
      }
    }
    expect(deepest).toBeCloseTo(DEFAULT_WALK_CONFIG.kneeBend, 6);
    // 位相 0 は脚が真下を通って前へ向かう瞬間
    expect(deepestPhase).toBe(0);
    // 脚が後ろへ戻るあいだ（位相 0.25〜0.75）は伸びている
    expect(walkPose(0.5, DEFAULT_WALK_CONFIG, createPose()).leftKnee).toBeCloseTo(0, 9);
  });

  it('脚の振りと腰の弾みは設定値の範囲に収まる', () => {
    for (let i = 0; i < 100; i++) {
      const pose = walkPose(i / 100, DEFAULT_WALK_CONFIG, createPose());
      expect(Math.abs(pose.leftUpperLegPitch)).toBeLessThanOrEqual(DEFAULT_WALK_CONFIG.stride + 1e-9);
      expect(pose.hipsBob).toBeLessThanOrEqual(0);
      expect(pose.hipsBob).toBeGreaterThanOrEqual(-DEFAULT_WALK_CONFIG.bob - 1e-9);
    }
  });
});

describe('idlePose', () => {
  it('呼吸の周期で元の姿勢に戻り、脚は動かさない', () => {
    const a = idlePose(1.1, DEFAULT_IDLE_CONFIG, createPose());
    expectSamePose(idlePose(1.1 + DEFAULT_IDLE_CONFIG.period, DEFAULT_IDLE_CONFIG, createPose()), a);
    expect(a.leftUpperLegPitch).toBe(0);
    expect(a.rightKnee).toBe(0);
    expect(a.hipsBob).toBe(0);
  });

  it('吐き切ったときは胸がもとの位置、吸い切ったときにいちばん反る', () => {
    const exhaled = idlePose(0, DEFAULT_IDLE_CONFIG, createPose());
    const inhaled = idlePose(DEFAULT_IDLE_CONFIG.period / 2, DEFAULT_IDLE_CONFIG, createPose());
    expect(exhaled.chestPitch).toBeCloseTo(0, 9);
    expect(inhaled.chestPitch).toBeCloseTo(-DEFAULT_IDLE_CONFIG.breath, 9);
    expect(exhaled.armDown).toBeGreaterThan(inhaled.armDown);
  });

  it('待機と歩きで腕を下ろす角度が近く、切り替えても腕が跳ねない', () => {
    const idle = idlePose(0, DEFAULT_IDLE_CONFIG, createPose());
    const walk = walkPose(0, DEFAULT_WALK_CONFIG, createPose());
    expect(Math.abs(idle.armDown - walk.armDown)).toBeLessThan(0.2);
  });
});

describe('sitPose', () => {
  it('腰を落として膝を曲げ、呼吸の周期で元の姿勢に戻る', () => {
    const a = sitPose(0.7, DEFAULT_SIT_CONFIG, createPose());
    expectSamePose(sitPose(0.7 + DEFAULT_SIT_CONFIG.period, DEFAULT_SIT_CONFIG, createPose()), a);
    expect(a.hipsDrop).toBeGreaterThan(0.5);
    expect(a.leftKnee).toBeGreaterThan(1.5);
    expect(a.leftUpperLegPitch).toBe(a.rightUpperLegPitch);
  });

  it('待機・歩きの姿勢は腰を落とさない（座った姿勢から切り替えても前の値が残らない）', () => {
    const pose = sitPose(0, DEFAULT_SIT_CONFIG, createPose());
    expect(idlePose(0, DEFAULT_IDLE_CONFIG, pose).hipsDrop).toBe(0);
    expect(sitPose(0, DEFAULT_SIT_CONFIG, pose).hipsDrop).toBe(DEFAULT_SIT_CONFIG.hipsDrop);
    expect(walkPose(0, DEFAULT_WALK_CONFIG, pose).hipsDrop).toBe(0);
  });
});

