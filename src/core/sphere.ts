import { Quaternion, Vector3 } from 'three';

const Y_UP = new Vector3(0, 1, 0);

/** 惑星の中心から見た「上」方向（単位ベクトル）を返す。球面重力の基本。 */
export function upAt(position: Vector3, center: Vector3, out = new Vector3()): Vector3 {
  return out.subVectors(position, center).normalize();
}

/** ローカルの Y 軸が up を向く回転を返す。地表に物やキャラクターを立てるときに使う。 */
export function alignToUp(up: Vector3, out = new Quaternion()): Quaternion {
  return out.setFromUnitVectors(Y_UP, up);
}

/** v を up に直交する平面（地表の接平面）へ射影し、長さ 1 にする。v が up と平行なら変更しない。 */
export function toTangent(v: Vector3, up: Vector3): Vector3 {
  const x = v.x - up.x * v.dot(up);
  const y = v.y - up.y * v.dot(up);
  const z = v.z - up.z * v.dot(up);
  const length = Math.hypot(x, y, z);
  if (length < 1e-9) return v;
  return v.set(x / length, y / length, z / length);
}

/** up の地表で、heading にいちばん近い接線方向（単位ベクトル）を out に書く。heading が up と平行なら適当な接線を選ぶ。 */
export function headingOn(up: Vector3, heading: Vector3, out = new Vector3()): Vector3 {
  toTangent(out.copy(heading), up);
  if (Math.abs(out.dot(up)) > 0.999) toTangent(out.set(1, 0, 0), up);
  return out;
}

/** up の地表から、向き heading の後ろへ angle（ラジアン）だけ回った方向（単位ベクトル）を out に書く。 */
export function behindOn(up: Vector3, heading: Vector3, angle: number, out = new Vector3()): Vector3 {
  const tangent = headingOn(up, heading, tmpTangent);
  return out.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(tangent, -Math.sin(angle)).normalize();
}

const tmpTangent = new Vector3();
