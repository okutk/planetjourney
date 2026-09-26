import type { Vector3 } from 'three';
import { fbm3 } from './noise';

/** 星の地形の設定値。 */
export interface TerrainConfig {
  /** 基準の半径 */
  radius: number;
  /** 起伏の大きさ（基準の半径からの最大のずれ） */
  amplitude: number;
  /** 起伏の細かさ（大きいほど丘が小さく、数が多い） */
  frequency: number;
  /** 重ねるノイズの数 */
  octaves: number;
  seed: number;
}

/**
 * 地形。中心から見た方向ごとに、地表の半径が決まる。
 * 同じ設定なら必ず同じ形になるので、見た目（メッシュ）と歩く処理で同じ地形を共有できる。
 */
export class Terrain {
  constructor(readonly config: TerrainConfig) {}

  /** 単位ベクトル direction の方向の、地表の半径。 */
  radiusAt(direction: Vector3): number {
    const { radius, amplitude, frequency, octaves, seed } = this.config;
    const n = fbm3(direction.x * frequency, direction.y * frequency, direction.z * frequency, octaves, seed);
    return radius + n * amplitude;
  }
}

/**
 * 球面にばらまく方向（単位ベクトル）を count 個つくる。random を使うので種を固定すれば毎回同じ配置になる。
 * avoid（単位ベクトル）の方向から minAngle（ラジアン）以内には置かない（スタート地点をあけておくため）。
 * 条件に合う方向が見つからない設定でも止まるよう、試行回数に上限を設ける（そのときは count より少なくなる）。
 */
export function scatterDirections(
  count: number,
  random: () => number,
  avoid: Vector3,
  minAngle: number,
  create: () => Vector3,
): Vector3[] {
  const result: Vector3[] = [];
  const minDot = Math.cos(minAngle);
  const maxAttempts = count * 100;
  for (let attempt = 0; attempt < maxAttempts && result.length < count; attempt++) {
    // 球面上で一様になるよう、z と経度を一様に選ぶ
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const direction = create().set(r * Math.cos(phi), z, r * Math.sin(phi));
    if (direction.dot(avoid) <= minDot) result.push(direction);
  }
  return result;
}
