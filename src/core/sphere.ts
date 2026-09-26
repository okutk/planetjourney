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
