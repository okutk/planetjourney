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
