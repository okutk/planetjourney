/**
 * 星の「仕掛け」と、ミラがそれに取り組む作業（段階 0 の遊び）。描画や DOM には依存しない。
 * 仕掛けはプレイヤーには解けず、ミラにお願いして解いてもらう。ただしミラの体は腕輪の投影なので、
 * 作業のあいだプレイヤーがそばにいないと投影が届かず、作業は途中で止まる（役割分担）。
 */

/** 仕掛けの種類。照らす・スキャンする・狭い所に入る */
export type GimmickKind = 'light' | 'scan' | 'crawl';
export const GIMMICK_KINDS: readonly GimmickKind[] = ['light', 'scan', 'crawl'];

/** 仕掛けの定義（星ごとに JSON に置く） */
export interface GimmickDef {
  id: string;
  kind: GimmickKind;
  /** 表示名（セリフの {target} に入る） */
  name: string;
  /** 星の中心から見た方向（長さは 1 でなくてよい）。海のある星では陸を指すこと */
  direction: [number, number, number];
}

/** 種類ごとの作業にかかる秒数 */
export const WORK_SECONDS: Readonly<Record<GimmickKind, number>> = { light: 1.6, scan: 2.4, crawl: 3 };
/** 仕掛けからこの距離までプレイヤーが近づくと、ミラに頼めるようになる */
export const REQUEST_RADIUS = 2.4;
/** 投影が届く距離。作業中にプレイヤーが仕掛けからこれより離れると、作業は止まる */
export const PROJECTION_RANGE = 5;
/** ミラが仕掛けに着いたとみなす距離 */
export const ARRIVE_RADIUS = 0.9;

export type TaskPhase = 'approach' | 'work' | 'done' | 'cancelled';
/** update() が返す出来事。started は作業を始めた瞬間、done は終えた瞬間、cancelled は投影が届かなくなった瞬間 */
export type TaskEvent = 'started' | 'done' | 'cancelled';

/** ミラが 1 つの仕掛けに取り組む作業。approach（歩いて向かう）→ work（作業）→ done、途中で離れると cancelled。 */
export class MiraTask {
  phase: TaskPhase = 'approach';
  private elapsed = 0;

  constructor(
    readonly gimmick: GimmickDef,
    readonly workSeconds = WORK_SECONDS[gimmick.kind],
    readonly range = PROJECTION_RANGE,
  ) {}

  /** 作業の進み具合（0〜1）。作業前は 0、終えたら 1 */
  get progress(): number {
    if (this.phase === 'done') return 1;
    if (this.phase !== 'work') return 0;
    return Math.min(1, this.elapsed / this.workSeconds);
  }

  /** 続いているか（終えた・止まったら false） */
  get active(): boolean {
    return this.phase === 'approach' || this.phase === 'work';
  }

  /**
   * 毎フレーム呼ぶ。arrived はミラが仕掛けに着いているか、playerDistance はプレイヤーと仕掛けの距離。
   * 節目の出来事があれば返す（1 フレームに 1 つ）。
   */
  update(dt: number, arrived: boolean, playerDistance: number): TaskEvent | null {
    if (!this.active) return null;
    if (playerDistance > this.range) {
      this.phase = 'cancelled';
      return 'cancelled';
    }
    if (this.phase === 'approach') {
      if (!arrived) return null;
      this.phase = 'work';
      this.elapsed = 0;
      return 'started';
    }
    this.elapsed += dt;
    if (this.elapsed < this.workSeconds) return null;
    this.phase = 'done';
    return 'done';
  }
}
