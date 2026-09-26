/**
 * 手続きで作る待機・歩きの姿勢（Mixamo などのモーションが用意されるまでの代わり）。
 * 関節の角度だけを計算し、Three.js のシーンやボーンには依存しない。
 * 角度はラジアン。回す向きはモデルの座標系（+Z が正面、+Y が上）で決める:
 *   pitch は「前へ振る」と正（脚や腕を前に出す）、knee・elbow は「曲げる」と正（0 で伸ばした状態）。
 */

/** 姿勢を表す関節の角度。左右は名前で分ける */
export interface Pose {
  /** 上半身（背骨）の前傾。正で前かがみ */
  spinePitch: number;
  /** 胸の反り。呼吸で上下する */
  chestPitch: number;
  /** 頭のうなずき。正で下を向く */
  headPitch: number;
  /** 腰の上下（モデルの単位。歩くときの弾み） */
  hipsBob: number;
  leftUpperLegPitch: number;
  rightUpperLegPitch: number;
  leftKnee: number;
  rightKnee: number;
  leftUpperArmPitch: number;
  rightUpperArmPitch: number;
  /** 腕を体の横まで下ろす角度（T ポーズからの回転。0 で真横、π/2 で真下） */
  armDown: number;
  leftElbow: number;
  rightElbow: number;
}

export function createPose(): Pose {
  return {
    spinePitch: 0,
    chestPitch: 0,
    headPitch: 0,
    hipsBob: 0,
    leftUpperLegPitch: 0,
    rightUpperLegPitch: 0,
    leftKnee: 0,
    rightKnee: 0,
    leftUpperArmPitch: 0,
    rightUpperArmPitch: 0,
    armDown: 0,
    leftElbow: 0,
    rightElbow: 0,
  };
}

/** 歩き方の設定値 */
export interface WalkConfig {
  /** 1 歩行周期（左右 1 歩ずつ）にかかる秒数 */
  period: number;
  /** 脚を前後に振る最大角度 */
  stride: number;
  /** 脚を前へ振り出すときの膝の曲げ */
  kneeBend: number;
  /** 腕を前後に振る最大角度 */
  armSwing: number;
  /** 腕を下ろす角度（体の横。T ポーズから） */
  armDown: number;
  /** 肘の曲げ（歩いているあいだ一定） */
  elbowBend: number;
  /** 腰の上下の幅（1 周期に 2 回弾む） */
  bob: number;
  /** 上半身の前傾 */
  lean: number;
}

export const DEFAULT_WALK_CONFIG: Readonly<WalkConfig> = {
  period: 0.8,
  stride: 0.5,
  kneeBend: 0.9,
  armSwing: 0.4,
  armDown: 1.2,
  elbowBend: 0.35,
  bob: 0.02,
  lean: 0.06,
};

/** 待機（呼吸）の設定値 */
export interface IdleConfig {
  /** 1 呼吸にかかる秒数 */
  period: number;
  /** 胸の反りの幅 */
  breath: number;
  /** 腕を下ろす角度（体の横。T ポーズから） */
  armDown: number;
  /** 呼吸で腕がわずかに開く幅 */
  armSway: number;
  /** 肘の曲げ */
  elbowBend: number;
  /** 頭がわずかに揺れる幅 */
  headNod: number;
}

export const DEFAULT_IDLE_CONFIG: Readonly<IdleConfig> = {
  period: 3.6,
  breath: 0.035,
  armDown: 1.25,
  armSway: 0.03,
  elbowBend: 0.2,
  headNod: 0.02,
};

const TWO_PI = Math.PI * 2;

/**
 * 歩行周期の位相 phase（0〜1。1 で 1 周期）の姿勢を out に書く。
 * 左脚が phase 0 で前に振り出されるあいだ、右脚は半周期ずれて動く。腕は反対側の脚と一緒に振る。
 */
export function walkPose(phase: number, config: WalkConfig, out: Pose): Pose {
  const left = phase - Math.floor(phase);
  const right = left + 0.5 - Math.floor(left + 0.5);
  out.leftUpperLegPitch = config.stride * Math.sin(TWO_PI * left);
  out.rightUpperLegPitch = config.stride * Math.sin(TWO_PI * right);
  // 膝は、脚を前へ振り出している（脚が後ろから前へ動く）あいだだけ曲げ、振り出しの真ん中で最大にする
  out.leftKnee = config.kneeBend * Math.max(0, Math.cos(TWO_PI * left));
  out.rightKnee = config.kneeBend * Math.max(0, Math.cos(TWO_PI * right));
  out.leftUpperArmPitch = -config.armSwing * Math.sin(TWO_PI * left);
  out.rightUpperArmPitch = -config.armSwing * Math.sin(TWO_PI * right);
  out.armDown = config.armDown;
  out.leftElbow = config.elbowBend;
  out.rightElbow = config.elbowBend;
  // 腰は足が着くたび（1 周期に 2 回）に沈む
  out.hipsBob = -config.bob * (1 - Math.cos(2 * TWO_PI * left)) / 2;
  out.spinePitch = config.lean;
  out.chestPitch = 0;
  out.headPitch = 0;
  return out;
}

/** 時刻 time（秒）の待機の姿勢（呼吸の揺れ）を out に書く。 */
export function idlePose(time: number, config: IdleConfig, out: Pose): Pose {
  const breath = (1 - Math.cos((TWO_PI * time) / config.period)) / 2; // 0（吐き切り）〜1（吸い切り）
  out.chestPitch = -config.breath * breath;
  out.headPitch = config.headNod * breath;
  out.armDown = config.armDown - config.armSway * breath;
  out.leftElbow = config.elbowBend;
  out.rightElbow = config.elbowBend;
  out.leftUpperLegPitch = 0;
  out.rightUpperLegPitch = 0;
  out.leftKnee = 0;
  out.rightKnee = 0;
  out.leftUpperArmPitch = 0;
  out.rightUpperArmPitch = 0;
  out.hipsBob = 0;
  out.spinePitch = 0;
  return out;
}
