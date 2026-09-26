import { Matrix4, Quaternion, Vector3 } from 'three';

/** 球面重力で歩くキャラクターの設定値。 */
export interface WalkerConfig {
  /** 惑星の中心 */
  center: Vector3;
  /** 惑星の半径（地表の高さ） */
  planetRadius: number;
  /** 重力加速度（中心へ向かう。単位/秒²） */
  gravity: number;
  /** 歩く速さ（地表に沿った速さ。単位/秒） */
  walkSpeed: number;
  /** ジャンプの初速（単位/秒） */
  jumpSpeed: number;
}

/** 1 フレーム分の入力。forward・right は -1〜1、斜め入力は長さ 1 に丸める。 */
export interface WalkInput {
  forward: number;
  right: number;
  jump: boolean;
}

export const DEFAULT_WALKER_CONFIG: Readonly<Omit<WalkerConfig, 'center' | 'planetRadius'>> = {
  gravity: 18,
  walkSpeed: 4,
  jumpSpeed: 7,
};

// 毎フレーム new しないための作業用
const tmpMove = new Vector3();
const tmpRight = new Vector3();
const tmpAxis = new Vector3();
const tmpOffset = new Vector3();
const tmpRotation = new Quaternion();
const tmpBasis = new Matrix4();

/**
 * 球面重力の上を歩き、ジャンプするキャラクターの物理。描画には依存しない。
 * 水平移動は中心まわりの回転として扱うので、どれだけ歩いても高さがずれない。
 */
export class SphericalWalker {
  /** ワールド座標での位置 */
  readonly position = new Vector3();
  /** 足元から頭へ向かう単位ベクトル（中心から見た外向き） */
  readonly up = new Vector3();
  /** 向いている方向（地表に接する単位ベクトル） */
  readonly forward = new Vector3();
  /** 上方向の速さ（正で上昇、負で落下） */
  verticalSpeed = 0;
  /** 地面に立っているか */
  grounded = false;

  constructor(readonly config: WalkerConfig) {
    this.placeAt(new Vector3(0, 1, 0), new Vector3(0, 0, 1));
  }

  /** 地表からの高さ（地面に立っていれば 0）。 */
  get altitude(): number {
    return this.position.distanceTo(this.config.center) - this.config.planetRadius;
  }

  /** 中心から見た direction の地表に立たせる。heading は向きの目安で、地表に沿うよう補正する。 */
  placeAt(direction: Vector3, heading: Vector3, altitude = 0): this {
    this.up.copy(direction).normalize();
    this.position
      .copy(this.up)
      .multiplyScalar(this.config.planetRadius + altitude)
      .add(this.config.center);
    this.forward.copy(heading);
    this.orthonormalizeForward();
    this.verticalSpeed = 0;
    this.grounded = altitude <= 0;
    return this;
  }

  /** up を軸に向きを回す（正で左回り＝上から見て反時計回り）。 */
  turn(angle: number): void {
    tmpRotation.setFromAxisAngle(this.up, angle);
    this.forward.applyQuaternion(tmpRotation);
    this.orthonormalizeForward();
  }

  /** dt 秒だけ進める。 */
  step(input: WalkInput, dt: number): void {
    const { center, planetRadius, gravity, walkSpeed, jumpSpeed } = this.config;

    // ジャンプ（接地しているときだけ。空中ジャンプはしない）
    if (input.jump && this.grounded) {
      this.verticalSpeed = jumpSpeed;
      this.grounded = false;
    }

    // 水平移動: 地表に沿った移動を、中心まわりの回転に置き換える
    // 右は後ろから見たときの右（forward × up）
    tmpRight.crossVectors(this.forward, this.up);
    tmpMove.copy(this.forward).multiplyScalar(input.forward).addScaledVector(tmpRight, input.right);
    const inputLength = tmpMove.length();
    if (inputLength > 1e-6) {
      const distance = walkSpeed * Math.min(inputLength, 1) * dt;
      const radius = this.position.distanceTo(center);
      tmpAxis.crossVectors(this.up, tmpMove).normalize();
      tmpRotation.setFromAxisAngle(tmpAxis, distance / radius);
      tmpOffset.subVectors(this.position, center).applyQuaternion(tmpRotation);
      this.position.addVectors(center, tmpOffset);
      // 向きも同じ回転で運ぶ（平行移動）ので、歩いても向きが勝手に変わらない
      this.forward.applyQuaternion(tmpRotation);
    }

    // 重力と上下の移動
    if (!this.grounded) {
      this.verticalSpeed -= gravity * dt;
    }
    this.up.subVectors(this.position, center).normalize();
    let height = this.position.distanceTo(center) + this.verticalSpeed * dt;

    // 接地判定: 地表より下に行ったら地表に戻して着地
    if (height <= planetRadius) {
      height = planetRadius;
      this.verticalSpeed = 0;
      this.grounded = true;
    }
    this.position.copy(this.up).multiplyScalar(height).add(center);
    this.orthonormalizeForward();
  }

  /** ローカルの +Y が up、+Z が forward を向く回転を返す。見た目の向きに使う。 */
  orientation(out = new Quaternion()): Quaternion {
    // 回転行列は右手系である必要があるので、ローカル +X は up × forward（見た目の左手側）
    tmpRight.crossVectors(this.up, this.forward);
    tmpBasis.makeBasis(tmpRight, this.up, this.forward);
    return out.setFromRotationMatrix(tmpBasis);
  }

  /** 誤差の蓄積を防ぐため、forward を up に直交する単位ベクトルへ戻す。 */
  private orthonormalizeForward(): void {
    this.forward.addScaledVector(this.up, -this.forward.dot(this.up));
    if (this.forward.lengthSq() < 1e-10) {
      // 真上・真下を向いていた場合は、up に直交する適当な向きを選ぶ
      this.forward.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
      if (this.forward.lengthSq() < 1e-10) this.forward.set(0, 0, 1).addScaledVector(this.up, -this.up.z);
    }
    this.forward.normalize();
  }
}
