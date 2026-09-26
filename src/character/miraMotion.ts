import {
  AnimationClip,
  AnimationMixer,
  Euler,
  LoopRepeat,
  type Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type AnimationAction,
} from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  DEFAULT_IDLE_CONFIG,
  DEFAULT_SIT_CONFIG,
  DEFAULT_WALK_CONFIG,
  createPose,
  idlePose,
  sitPose,
  walkPose,
  type Pose,
} from '../core/gait';

/**
 * ミラのモーション（待機・歩き）。AnimationClip を受け取って再生し、歩く量で 2 つを混ぜる。
 * クリップは VRM の正規化ボーン（`Normalized_` で始まる名前のノード）を対象にしたもの。
 * Mixamo の FBX を用意できたら、three-vrm の手順でリターゲットした AnimationClip を同じ形で渡せば差し替わる。
 * それまでは buildProceduralClips() で作る、手続きの待機（呼吸）と歩き（腕と脚の振り）を使う。
 */
export interface MotionClips {
  idle: AnimationClip;
  walk: AnimationClip;
  /** 座る（なければ座らず、待機のまま） */
  sit?: AnimationClip;
}

/** 待機と歩きの混ざり方が切り替わる速さ（大きいほどすぐ切り替わる） */
const BLEND_RATE = 8;
/** 歩きクリップの再生速度の下限（歩く量 0 のとき）。全力で 1 倍 */
const MIN_WALK_TIME_SCALE = 0.5;
/** 座る・立つの切り替えの速さ（歩きとの比） */
const SIT_BLEND_SCALE = 0.35;

export class MiraMotion {
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly walk: AnimationAction;
  private readonly sit: AnimationAction | null;
  private walkWeight = 0;
  private sitWeight = 0;

  constructor(
    private readonly root: Object3D,
    clips: MotionClips,
  ) {
    this.mixer = new AnimationMixer(root);
    this.idle = this.mixer.clipAction(clips.idle).setLoop(LoopRepeat, Infinity);
    this.walk = this.mixer.clipAction(clips.walk).setLoop(LoopRepeat, Infinity);
    this.sit = clips.sit ? this.mixer.clipAction(clips.sit).setLoop(LoopRepeat, Infinity) : null;
    this.idle.play();
    this.walk.play();
    this.sit?.play();
    this.apply();
  }

  /** 毎フレーム呼ぶ。walkAmount は歩く量（0 で止まっている、1 で全力）、sitting は座っているか */
  update(dt: number, walkAmount: number, sitting = false): void {
    const target = Math.min(1, Math.max(0, walkAmount));
    const blend = 1 - Math.exp(-BLEND_RATE * dt);
    this.walkWeight += (target - this.walkWeight) * blend;
    // 座る・立つは歩きより遅く切り替える（腰がゆっくり沈む）
    this.sitWeight += ((sitting && this.sit ? 1 : 0) - this.sitWeight) * blend * SIT_BLEND_SCALE;
    // 脚の周期を移動の速さに合わせる（足が床を滑って見えないように）。ゆっくりでも止まって見えない下限を置く
    this.walk.setEffectiveTimeScale(MIN_WALK_TIME_SCALE + (1 - MIN_WALK_TIME_SCALE) * target);
    this.apply();
    this.mixer.update(dt);
  }

  private apply(): void {
    const standing = 1 - this.sitWeight;
    this.walk.setEffectiveWeight(this.walkWeight * standing);
    this.idle.setEffectiveWeight((1 - this.walkWeight) * standing);
    this.sit?.setEffectiveWeight(this.sitWeight);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

/** 手続きの姿勢から作るクリップの、1 周期あたりの標本数 */
const SAMPLES = 24;

/** 姿勢の各関節を、どの正規化ボーンにどう回転として書くか */
type BoneWriter = (pose: Pose, out: Euler) => void;
const BONE_WRITERS: Partial<Record<VRMHumanBoneName, BoneWriter>> = {
  // 正規化ボーンの基準は T ポーズで、軸はモデルの座標系と同じ（+Y が上、+Z が正面）。
  // 上を向くボーン（背骨・頭）は X 回転が正で前へ倒れ、下を向くボーン（脚・下ろした腕）は X 回転が負で前へ出る
  spine: (p, e) => e.set(p.spinePitch, 0, 0),
  chest: (p, e) => e.set(p.chestPitch, 0, 0),
  head: (p, e) => e.set(p.headPitch, 0, 0),
  leftUpperLeg: (p, e) => e.set(-p.leftUpperLegPitch, 0, 0),
  rightUpperLeg: (p, e) => e.set(-p.rightUpperLegPitch, 0, 0),
  leftLowerLeg: (p, e) => e.set(p.leftKnee, 0, 0),
  rightLowerLeg: (p, e) => e.set(p.rightKnee, 0, 0),
  // 腕はまず Z 回転で体の横へ下ろし（XYZ 順なので Z が先に効く）、それから X 回転で前後に振る
  leftUpperArm: (p, e) => e.set(-p.leftUpperArmPitch, 0, -p.armDown),
  rightUpperArm: (p, e) => e.set(-p.rightUpperArmPitch, 0, p.armDown),
  // 肘は上腕に対する Y 回転で前へ曲がる（左右で向きが逆）
  leftLowerArm: (p, e) => e.set(0, -p.leftElbow, 0),
  rightLowerArm: (p, e) => e.set(0, p.rightElbow, 0),
};

/**
 * 姿勢の関数 poseAt（0〜1 の位相を受け取る）を標本化して、VRM の正規化ボーンを動かすクリップを作る。
 * 腰の上下は位置のトラックとして、正規化ボーンの基準の位置に足す。
 */
function buildClip(
  name: string,
  duration: number,
  vrm: VRM,
  poseAt: (phase: number, out: Pose) => Pose,
): AnimationClip {
  const times = new Float32Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) times[i] = (duration * i) / SAMPLES;
  const poses: Pose[] = [];
  for (let i = 0; i <= SAMPLES; i++) poses.push(poseAt((i % SAMPLES) / SAMPLES, createPose()));

  const tracks = [];
  const euler = new Euler();
  const quaternion = new Quaternion();
  for (const [bone, write] of Object.entries(BONE_WRITERS) as [VRMHumanBoneName, BoneWriter][]) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);
    if (!node) continue;
    const values = new Float32Array((SAMPLES + 1) * 4);
    poses.forEach((pose, i) => {
      write(pose, euler);
      quaternion.setFromEuler(euler).toArray(values, i * 4);
    });
    tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
  }
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');
  // 腰の基準は休止姿勢（three-vrm が構築時に記録したもの）。再生中に呼んでも弾んだ高さが焼き込まれない
  const rest = vrm.humanoid.normalizedRestPose.hips?.position;
  if (hips && rest) {
    const values = new Float32Array((SAMPLES + 1) * 3);
    poses.forEach((pose, i) => {
      values[i * 3] = rest[0];
      values[i * 3 + 1] = rest[1] * (1 - pose.hipsDrop) + pose.hipsBob;
      values[i * 3 + 2] = rest[2];
    });
    tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, values));
  }
  return new AnimationClip(name, duration, tracks);
}

/** 手続きの待機（呼吸）と歩き（腕と脚の振り）のクリップを、この VRM 向けに作る。 */
export function buildProceduralClips(vrm: VRM): MotionClips {
  return {
    idle: buildClip('idle', DEFAULT_IDLE_CONFIG.period, vrm, (phase, out) =>
      idlePose(phase * DEFAULT_IDLE_CONFIG.period, DEFAULT_IDLE_CONFIG, out),
    ),
    walk: buildClip('walk', DEFAULT_WALK_CONFIG.period, vrm, (phase, out) =>
      walkPose(phase, DEFAULT_WALK_CONFIG, out),
    ),
    sit: buildClip('sit', DEFAULT_SIT_CONFIG.period, vrm, (phase, out) =>
      sitPose(phase * DEFAULT_SIT_CONFIG.period, DEFAULT_SIT_CONFIG, out),
    ),
  };
}
