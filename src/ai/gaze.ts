import { Vector3 } from 'three';

/**
 * ミラの視線の先の決め方。見たい物（プレイヤーなど）が顔の向きから離れすぎていれば正面を見る。
 * 数学だけで、シーンやボーンには依存しない。
 */
export interface GazeConfig {
  /** 顔の正面からこの角度（ラジアン）より外れた物は見ない（首をひねりすぎないように） */
  maxAngle: number;
  /** 正面を見るときの、目からの距離 */
  frontDistance: number;
  /** 視線が動く速さ（大きいほどすぐ目標を見る） */
  rate: number;
}

export const DEFAULT_GAZE_CONFIG: Readonly<GazeConfig> = {
  maxAngle: (75 * Math.PI) / 180,
  frontDistance: 3,
  rate: 10,
};

const tmpToTarget = new Vector3();

/**
 * 目の位置 eye と顔の正面 front（単位ベクトル）から、target を見るべき点を out に書く。
 * target が maxAngle より外れていれば正面の点を返す。
 */
export function gazePoint(
  eye: Vector3,
  front: Vector3,
  target: Vector3 | null,
  config: GazeConfig,
  out: Vector3,
): Vector3 {
  if (target) {
    tmpToTarget.subVectors(target, eye);
    const distance = tmpToTarget.length();
    if (distance > 1e-6 && tmpToTarget.dot(front) / distance >= Math.cos(config.maxAngle)) {
      return out.copy(target);
    }
  }
  return out.copy(eye).addScaledVector(front, config.frontDistance);
}

/** 視線の先をなめらかに動かす。毎フレーム update() を呼び、point を VRM の lookAt に渡す。 */
export class Gaze {
  /** いま見ている点 */
  readonly point = new Vector3();
  private started = false;
  private readonly goal = new Vector3();

  constructor(private readonly config: GazeConfig = DEFAULT_GAZE_CONFIG) {}

  update(eye: Vector3, front: Vector3, target: Vector3 | null, dt: number): Vector3 {
    gazePoint(eye, front, target, this.config, this.goal);
    if (!this.started) {
      this.started = true;
      return this.point.copy(this.goal);
    }
    return this.point.lerp(this.goal, 1 - Math.exp(-this.config.rate * dt));
  }

  /** 次の update() で目標をすぐ見る（瞬間移動したあとなど）。 */
  reset(): void {
    this.started = false;
  }
}
