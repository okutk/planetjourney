import { Vector3 } from 'three';
import { toTangent } from '../core/sphere';
import type { SphericalWalker } from '../core/walker';

/** ミラがプレイヤーについていくときの設定値。距離は地表に沿った直線距離で近似する。 */
export interface FollowConfig {
  /** プレイヤーの後ろ、どれだけ離れた場所を目指すか */
  behind: number;
  /** プレイヤーの横（右が正）に、どれだけずれた場所を目指すか */
  side: number;
  /** 目標からこの距離以内なら止まる */
  arriveRadius: number;
  /** 目標からこの距離より遠いと全力で歩く（間は距離に応じて弱める） */
  slowRadius: number;
  /** プレイヤーにこれ以上近づかない（重ならないため） */
  personalSpace: number;
}

export const DEFAULT_FOLLOW_CONFIG: Readonly<FollowConfig> = {
  behind: 0.6,
  side: 1.3,
  arriveRadius: 0.3,
  slowRadius: 2,
  personalSpace: 0.9,
};

/** 1 フレーム分の、ミラの動き方。direction は地表に沿った単位ベクトル、amount は 0〜1。 */
export interface FollowIntent {
  readonly direction: Vector3;
  amount: number;
}

const tmpSlot = new Vector3();
const tmpRight = new Vector3();
const tmpAway = new Vector3();

/**
 * プレイヤーの斜め後ろの「定位置」へ向かう動きを決める。描画や DOM には依存しない。
 * プレイヤーが向きを変えると定位置も動くので、ミラはプレイヤーのまわりを回り込んでついてくる。
 * プレイヤーに近づきすぎたら、離れる向きへ押し返す。
 */
export function followIntent(
  mira: SphericalWalker,
  player: SphericalWalker,
  config: FollowConfig,
  out: FollowIntent,
): FollowIntent {
  // 定位置: プレイヤーの後ろ behind、右へ side
  tmpRight.crossVectors(player.forward, player.up);
  tmpSlot
    .copy(player.position)
    .addScaledVector(player.forward, -config.behind)
    .addScaledVector(tmpRight, config.side);

  out.direction.subVectors(tmpSlot, mira.position);
  const distance = out.direction.length();
  toTangent(out.direction, mira.up);

  if (distance <= config.arriveRadius) {
    out.amount = 0;
  } else {
    out.amount = Math.min(1, (distance - config.arriveRadius) / (config.slowRadius - config.arriveRadius));
  }

  // 近すぎるときは、プレイヤーから離れる向きを混ぜる
  tmpAway.subVectors(mira.position, player.position);
  const gap = tmpAway.length();
  if (gap < config.personalSpace && gap > 1e-6) {
    toTangent(tmpAway, mira.up);
    const push = 1 - gap / config.personalSpace;
    out.direction.lerp(tmpAway, push);
    toTangent(out.direction, mira.up);
    out.amount = Math.max(out.amount, push);
  }
  return out;
}
