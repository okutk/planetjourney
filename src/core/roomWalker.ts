import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Walker, WalkInput } from './walker';

/** 部屋の中の円い障害物（星図の台など）。床の中心から見た x・z と、歩き手が近づけない半径。 */
export interface RoomObstacle {
  x: number;
  z: number;
  radius: number;
}

/** 平らな床の上を歩くキャラクターの設定値。 */
export interface RoomWalkerConfig {
  /** 床の中心（ワールド座標）。床の高さもここで決まる */
  origin: Vector3;
  /** 歩ける範囲。床の中心から x 方向・z 方向へそれぞれ何単位まで行けるか（体の太さぶんは引いておく） */
  halfWidth: number;
  halfDepth: number;
  obstacles: readonly RoomObstacle[];
  /** 重力加速度（単位/秒²） */
  gravity: number;
  /** 歩く速さ（単位/秒） */
  walkSpeed: number;
  /** ジャンプの初速（単位/秒） */
  jumpSpeed: number;
}

// 毎フレーム new しないための作業用
const tmpMove = new Vector3();
const tmpRight = new Vector3();
const tmpRotation = new Quaternion();
const tmpBasis = new Matrix4();

/**
 * 船の部屋のように、平らな床の上を歩いてジャンプするキャラクターの物理。描画には依存しない。
 * 上は常に +Y。壁（歩ける範囲の端）と障害物にはめり込まず、ぶつかると滑るように止まる。
 */
export class RoomWalker implements Walker {
  readonly position = new Vector3();
  readonly up = new Vector3(0, 1, 0);
  readonly forward = new Vector3(0, 0, 1);
  verticalSpeed = 0;
  grounded = true;
  /** 床は平らなので、地面に沿って動いても向きは変わらない（常に単位回転） */
  readonly lastRotation = new Quaternion();

  constructor(readonly config: RoomWalkerConfig) {
    this.placeAt(0, 0, this.forward);
  }

  /** 床からの高さ（床に立っていれば 0）。 */
  get altitude(): number {
    return this.position.y - this.config.origin.y;
  }

  /** 床の中心から見た x・z の位置に立たせる。範囲の外や障害物の中なら、いちばん近い歩ける場所へ寄せる。 */
  placeAt(x: number, z: number, heading: Vector3): this {
    this.position.copy(this.config.origin).add(tmpMove.set(x, 0, z));
    this.confine();
    this.forward.copy(heading);
    this.orthonormalizeForward();
    this.verticalSpeed = 0;
    this.grounded = true;
    return this;
  }

  /** 上から見て反時計回りに向きを回す。 */
  turn(angle: number): void {
    tmpRotation.setFromAxisAngle(this.up, angle);
    this.forward.applyQuaternion(tmpRotation);
    this.orthonormalizeForward();
  }

  faceTowards(direction: Vector3, maxAngle: number): void {
    tmpMove.copy(direction).setY(0);
    if (tmpMove.lengthSq() < 1e-12) return;
    // 上を軸にした、forward から direction までの符号付きの角度
    const angle = Math.atan2(this.forward.z * tmpMove.x - this.forward.x * tmpMove.z, this.forward.dot(tmpMove));
    this.turn(Math.max(-maxAngle, Math.min(maxAngle, angle)));
  }

  step(input: WalkInput, dt: number): void {
    const { origin, gravity, walkSpeed, jumpSpeed } = this.config;

    if (input.jump && this.grounded) {
      this.verticalSpeed = jumpSpeed;
      this.grounded = false;
    }

    // 水平移動（右は後ろから見たときの右 = forward × up）
    tmpRight.crossVectors(this.forward, this.up);
    tmpMove.copy(this.forward).multiplyScalar(input.forward).addScaledVector(tmpRight, input.right);
    const inputLength = tmpMove.length();
    if (inputLength > 1e-6) {
      this.position.addScaledVector(tmpMove, (walkSpeed * Math.min(inputLength, 1) * dt) / inputLength);
      this.confine();
    }

    // 重力と上下の移動。床より下には行かない
    if (!this.grounded) {
      this.verticalSpeed -= gravity * dt;
      this.position.y += this.verticalSpeed * dt;
      if (this.position.y <= origin.y) {
        this.position.y = origin.y;
        this.verticalSpeed = 0;
        this.grounded = true;
      }
    }
  }

  orientation(out = new Quaternion()): Quaternion {
    // 回転行列は右手系である必要があるので、ローカル +X は up × forward（見た目の左手側）
    tmpRight.crossVectors(this.up, this.forward);
    tmpBasis.makeBasis(tmpRight, this.up, this.forward);
    return out.setFromRotationMatrix(tmpBasis);
  }

  /** 歩ける範囲の中へ押し戻し、障害物からは外へ押し出す。 */
  private confine(): void {
    const { origin, halfWidth, halfDepth, obstacles } = this.config;
    let x = Math.max(-halfWidth, Math.min(halfWidth, this.position.x - origin.x));
    let z = Math.max(-halfDepth, Math.min(halfDepth, this.position.z - origin.z));
    for (const obstacle of obstacles) {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= obstacle.radius) continue;
      // 障害物の真ん中にいるときは、向きが決められないので +Z 側へ出す
      const nx = distance > 1e-6 ? dx / distance : 0;
      const nz = distance > 1e-6 ? dz / distance : 1;
      x = obstacle.x + nx * obstacle.radius;
      z = obstacle.z + nz * obstacle.radius;
    }
    this.position.x = origin.x + x;
    this.position.z = origin.z + z;
  }

  /** 誤差の蓄積を防ぐため、forward を床に沿った単位ベクトルへ戻す。 */
  private orthonormalizeForward(): void {
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-10) this.forward.set(0, 0, 1);
    this.forward.normalize();
  }
}
