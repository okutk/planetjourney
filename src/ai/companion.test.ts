import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WALKER_CONFIG, SphericalWalker, type WalkInput } from '../core/walker';
import { DEFAULT_FOLLOW_CONFIG, followIntent, type FollowIntent } from './companion';

const RADIUS = 5;
const DT = 1 / 60;
const CENTER = new Vector3();

function createWalker(direction: Vector3, walkSpeed = DEFAULT_WALKER_CONFIG.walkSpeed): SphericalWalker {
  return new SphericalWalker({ ...DEFAULT_WALKER_CONFIG, walkSpeed, center: CENTER, planetRadius: RADIUS }).placeAt(
    direction,
    new Vector3(0, 0, 1),
  );
}

/** ミラをプレイヤーについていかせながら、seconds 秒進める。playerInput でプレイヤーを動かす。 */
function simulate(
  mira: SphericalWalker,
  player: SphericalWalker,
  seconds: number,
  playerInput: WalkInput,
  playerTurn = 0,
  onStep?: () => void,
): void {
  const intent: FollowIntent = { direction: new Vector3(), amount: 0 };
  const miraInput: WalkInput = { forward: 0, right: 0, jump: false };
  for (let t = 0; t < seconds; t += DT) {
    player.turn(playerTurn * DT);
    player.step(playerInput, DT);
    followIntent(mira, player, DEFAULT_FOLLOW_CONFIG, intent);
    if (intent.amount > 0) mira.faceTowards(intent.direction, 12 * DT);
    miraInput.forward = intent.amount;
    mira.step(miraInput, DT);
    onStep?.();
  }
}

const IDLE: WalkInput = { forward: 0, right: 0, jump: false };
const WALK: WalkInput = { forward: 1, right: 0, jump: false };

describe('followIntent', () => {
  it('離れた場所から、プレイヤーの斜め後ろの定位置まで来て止まる', () => {
    const player = createWalker(new Vector3(0, 1, 0));
    const mira = createWalker(new Vector3(1, 0.3, 0), 5.5);
    simulate(mira, player, 10, IDLE);
    const { behind, side, arriveRadius } = DEFAULT_FOLLOW_CONFIG;
    const slot = player.position
      .clone()
      .addScaledVector(player.forward, -behind)
      .addScaledVector(new Vector3().crossVectors(player.forward, player.up), side);
    expect(mira.position.distanceTo(slot)).toBeLessThan(arriveRadius + 0.1);
    expect(mira.grounded).toBe(true);
  });

  it('プレイヤーが歩いても、曲がっても、つかず離れずついてくる', () => {
    const player = createWalker(new Vector3(0, 1, 0));
    const mira = createWalker(new Vector3(0, 1, -0.3), 5.5);
    simulate(mira, player, 2, IDLE); // まず定位置へ
    let nearest = Infinity;
    let farthest = 0;
    simulate(mira, player, 15, WALK, 0.6, () => {
      const d = mira.position.distanceTo(player.position);
      nearest = Math.min(nearest, d);
      farthest = Math.max(farthest, d);
    });
    expect(nearest).toBeGreaterThan(0.5);
    expect(farthest).toBeLessThan(4);
  });

  it('プレイヤーがミラの方へ歩いてきても、重ならずに回り込む', () => {
    const player = createWalker(new Vector3(0, 1, 0));
    const mira = createWalker(new Vector3(0, 1, 0.5), 5.5); // プレイヤーの正面、進路上
    let nearest = Infinity;
    simulate(mira, player, 4, WALK, 0, () => {
      nearest = Math.min(nearest, mira.position.distanceTo(player.position));
    });
    expect(nearest).toBeGreaterThan(0.4);
    // 最後はプレイヤーの後ろ側にいる
    const toMira = mira.position.clone().sub(player.position);
    expect(toMira.dot(player.forward)).toBeLessThan(0);
  });
});
