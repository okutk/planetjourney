import { Quaternion, Vector3 } from 'three';
import { toTangent } from './sphere';

/** 三人称カメラの設定値。角度はラジアン。 */
export interface OrbitCameraConfig {
  /** 注視点からカメラまでの距離 */
  distance: number;
  /** 注視点の、足元からの高さ */
  lookHeight: number;
  /** 見下ろす角度の範囲（地表に沿った向きから上へ） */
  minPitch: number;
  maxPitch: number;
  /** 手で回してから、自動で後ろへ回り込み始めるまでの秒数 */
  recenterDelay: number;
  /** 後ろへ回り込む速さ（大きいほど速い。1/秒） */
  recenterRate: number;
}

export const DEFAULT_ORBIT_CAMERA_CONFIG: Readonly<OrbitCameraConfig> = {
  distance: 7.6,
  lookHeight: 1,
  minPitch: 0.05,
  maxPitch: 1.2,
  recenterDelay: 1.5,
  recenterRate: 1.5,
};

// スティックがほぼ前（この角度以内）に倒されているときだけ回り込む。
// 移動はカメラ基準なので、横や斜めへ歩いているときに回り込むと、進む向きも一緒に回って円を描いてしまう
const RECENTER_CONE = (25 * Math.PI) / 180;

const tmpCross = new Vector3();

/**
 * 球面の上でプレイヤーを追う三人称カメラの計算。描画には依存しない。
 * カメラの向き（heading）は地表に沿った単位ベクトルで持ち、プレイヤーと一緒に運ぶ。
 */
export class OrbitCamera {
  /** カメラが向いている方向（地表に沿った単位ベクトル。プレイヤーの後ろからこの向きに見る） */
  readonly heading = new Vector3();
  /** 見下ろす角度 */
  pitch = 0.4;
  private sinceManual = Infinity;

  constructor(
    readonly config: OrbitCameraConfig,
    heading: Vector3,
    up: Vector3,
  ) {
    toTangent(this.heading.copy(heading), up);
  }

  /** 手で回す。yaw は正で右へ回り込む（上から見て時計回り）、pitch は正で上から見下ろす。 */
  rotate(yaw: number, pitch: number, up: Vector3): void {
    if (yaw === 0 && pitch === 0) return;
    this.heading.applyAxisAngle(up, -yaw);
    toTangent(this.heading, up);
    const { minPitch, maxPitch } = this.config;
    this.pitch = Math.max(minPitch, Math.min(maxPitch, this.pitch + pitch));
    this.sinceManual = 0;
  }

  /** プレイヤーが地表に沿って動いた分の回転で、カメラの向きを一緒に運ぶ。 */
  transport(rotation: Quaternion, up: Vector3): void {
    toTangent(this.heading.applyQuaternion(rotation), up);
  }

  /**
   * 前へ歩いているあいだ、しばらく手で回していなければ、プレイヤーの後ろへ少しずつ回り込む。
   * stickX・stickY はカメラ基準の移動入力（前が +y）。前からずれるほど弱め、RECENTER_CONE の外では回り込まない。
   */
  update(dt: number, forward: Vector3, up: Vector3, stickX: number, stickY: number): void {
    this.sinceManual += dt;
    const amount = Math.min(1, Math.hypot(stickX, stickY));
    if (amount === 0 || this.sinceManual < this.config.recenterDelay) return;
    const weight = amount * Math.max(0, 1 - Math.atan2(Math.abs(stickX), stickY) / RECENTER_CONE);
    if (weight === 0) return;
    tmpCross.crossVectors(this.heading, forward);
    const angle = Math.atan2(tmpCross.dot(up), this.heading.dot(forward));
    this.heading.applyAxisAngle(up, angle * (1 - Math.exp(-this.config.recenterRate * weight * dt)));
    toTangent(this.heading, up);
  }

  /** 注視点（足元から lookHeight 上）を out に書き込む。 */
  target(position: Vector3, up: Vector3, out: Vector3): Vector3 {
    return out.copy(position).addScaledVector(up, this.config.lookHeight);
  }

  /** カメラの位置を out に書き込む。注視点から、後ろ上へ distance だけ離れた場所。 */
  eye(position: Vector3, up: Vector3, out: Vector3): Vector3 {
    const { distance } = this.config;
    return this.target(position, up, out)
      .addScaledVector(this.heading, -Math.cos(this.pitch) * distance)
      .addScaledVector(up, Math.sin(this.pitch) * distance);
  }
}
