import type { Vector3 } from 'three';
import type { EmotionValues } from './emotion';

/**
 * ミラの自律行動（ユーティリティAI）。行動ごとに「いまそれをしたい度合い」を 0〜1 の点数にし、いちばん高いものを選ぶ。
 * 点数は、プレイヤーとの距離・放っておかれた時間・気になる物・怖い物・感情から計算する。
 * どう歩くかは決めない（main.ts が既存の追従の上で動かす）。描画や DOM には依存しない。
 */

export const BEHAVIORS = ['follow', 'inspect', 'sit', 'hide'] as const;
/** follow: ついていく、inspect: 気になる物を見に行く、sit: 放っておかれたら座る、hide: 怖い物からプレイヤーの陰に隠れる */
export type Behavior = (typeof BEHAVIORS)[number];
export type BehaviorScores = Record<Behavior, number>;

/** 行動を選ぶ材料。距離はワールドの単位 */
export interface Perception {
  /** ミラとプレイヤーの距離 */
  playerDistance: number;
  /** プレイヤーが動かずにいる秒数 */
  idleSeconds: number;
  /** プレイヤーから、まだ見ていない気になる物までの距離。なければ null */
  interestDistance: number | null;
  /** ミラから、いちばん近い怖い物までの距離。なければ null */
  threatDistance: number | null;
  emotion: Readonly<EmotionValues>;
}

export interface BehaviorConfig {
  /** 選んでいる行動に足す点（すぐ別の行動へ移ってふらつかないように） */
  stickiness: number;
  /** 一度選んだら、この秒数は続ける（ただし hide は割り込める） */
  minHold: number;
  /** 気になる物は、プレイヤーからこの距離までのものだけ見に行く（投影が届く範囲） */
  interestReach: number;
  /** この秒数放っておかれると座りはじめ、sitFull 秒でいちばん座りたくなる */
  sitAfter: number;
  sitFull: number;
}

export const DEFAULT_BEHAVIOR_CONFIG: Readonly<BehaviorConfig> = {
  stickiness: 0.1,
  minHold: 1.5,
  interestReach: 6,
  sitAfter: 15,
  sitFull: 30,
};

/** 0〜1 に収めた、from から to までの進み具合（from > to なら逆向き） */
function ramp(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

/** 各行動の点数を out に書く（毎フレーム呼ぶので new しない） */
export function scoreBehaviors(p: Perception, config: BehaviorConfig, out: BehaviorScores): BehaviorScores {
  const { joy, curiosity, anxiety, trust } = p.emotion;
  // ついていく: いつでもそこそこしたい。離れるほど強くなる
  out.follow = 0.4 + 0.6 * ramp(p.playerDistance, 2, 6);
  // 見に行く: 好奇心が高く、気になる物がプレイヤーの近くにあるほど。プレイヤーが動いているあいだは控えめ
  out.inspect =
    p.interestDistance === null || p.interestDistance > config.interestReach
      ? 0
      : (0.4 + 0.6 * ramp(curiosity, 30, 90)) *
        (1 - 0.3 * ramp(p.interestDistance, 3, config.interestReach)) *
        (p.idleSeconds >= 1 ? 1 : 0.6);
  // 座る: 放っておかれるほど。信頼していると座りやすく、不安だと座らない
  out.sit =
    ramp(p.idleSeconds, config.sitAfter, config.sitFull) *
    (0.75 + 0.25 * ramp(trust, 20, 60) + 0.1 * ramp(joy, 40, 80)) *
    (1 - ramp(anxiety, 45, 80));
  // 隠れる: 怖い物が近いほど（不安が強いと、より隠れたい）。怖い物がなくても、不安が強ければプレイヤーのそばに寄る
  out.hide =
    p.threatDistance === null
      ? 0.95 * ramp(anxiety, 55, 90)
      : (1 - ramp(p.threatDistance, 2, 6)) * (0.7 + 0.3 * ramp(anxiety, 20, 80));
  return out;
}

/**
 * 行動を選ぶ。いまの行動には stickiness を足し、選んでから minHold 秒は続ける（hide だけは割り込める）。
 */
export class BehaviorSelector {
  current: Behavior = 'follow';
  readonly scores: BehaviorScores = { follow: 0, inspect: 0, sit: 0, hide: 0 };
  private held = 0;

  constructor(private readonly config: BehaviorConfig = DEFAULT_BEHAVIOR_CONFIG) {}

  /** dt 秒だけ進め、この瞬間の行動を返す */
  update(dt: number, perception: Perception): Behavior {
    this.held += dt;
    scoreBehaviors(perception, this.config, this.scores);
    let best: Behavior = this.current;
    let bestScore = this.scores[this.current] + this.config.stickiness;
    for (const name of BEHAVIORS) {
      if (this.scores[name] > bestScore) {
        best = name;
        bestScore = this.scores[name];
      }
    }
    const canSwitch = this.held >= this.config.minHold || best === 'hide';
    if (best !== this.current && canSwitch) {
      this.current = best;
      this.held = 0;
    }
    return this.current;
  }

  /** 場所を移ったとき。ついていくところから始める */
  reset(): void {
    this.current = 'follow';
    this.held = 0;
  }
}

/** 気になる物（位置を持つもの） */
export interface Spot {
  readonly position: Vector3;
}

/** 着いてから、気になる物を眺める秒数 */
export const INSPECT_SECONDS = 3;

/**
 * 気になる物のうち、どれをまだ見ていないかを覚えておく。場所を移ったら reset() で忘れる。
 * 見に行く物は、行動が inspect になったときに target() で決め、着いてから INSPECT_SECONDS 経ったら見終える。
 */
export class Curiosity<T extends Spot> {
  private readonly seen = new Set<T>();
  private looking = 0;
  /** いま見に行っている物 */
  current: T | null = null;

  /** nearest() で見つけた、まだ見ていない物のうちいちばん近いもの */
  candidate: T | null = null;

  /** from（プレイヤーの位置）から、まだ見ていない物のうちいちばん近いものを candidate に入れ、その距離を返す（なければ null） */
  nearest(spots: readonly T[], from: Vector3): number | null {
    this.candidate = null;
    let distance: number | null = null;
    for (const spot of spots) {
      if (this.seen.has(spot)) continue;
      const d = spot.position.distanceTo(from);
      if (distance === null || d < distance) {
        this.candidate = spot;
        distance = d;
      }
    }
    return distance;
  }

  /** 見に行く物を決める（すでに向かっている物があれば、それを続ける。なければ candidate） */
  target(): T | null {
    if (this.current === null) {
      this.current = this.candidate;
      this.looking = 0;
    }
    return this.current;
  }

  /** dt 秒だけ進める。arrived は着いているか。見終えた瞬間に true を返す */
  update(dt: number, arrived: boolean): boolean {
    if (this.current === null || !arrived) return false;
    this.looking += dt;
    if (this.looking < INSPECT_SECONDS) return false;
    this.seen.add(this.current);
    this.current = null;
    return true;
  }

  /** 見に行くのをやめる（ほかの行動に移ったとき）。見終えていない物は、また見に行ける */
  drop(): void {
    this.current = null;
  }

  reset(): void {
    this.seen.clear();
    this.current = null;
    this.candidate = null;
  }
}
