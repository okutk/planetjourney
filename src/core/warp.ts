/** ワープ演出の各段階の長さ（秒）。 */
export interface WarpConfig {
  /** 流れる星が強まっていく時間 */
  charge: number;
  /** 暗転に入ってから場所が入れ替わるまで（暗転の長さと合わせる） */
  jump: number;
  /** 着いたあと、流れる星が消えていく時間 */
  settle: number;
}

export const DEFAULT_WARP_CONFIG: Readonly<WarpConfig> = { charge: 1.4, jump: 0.45, settle: 0.6 };

export type WarpPhase = 'idle' | 'charge' | 'jump' | 'settle';

/**
 * 流れる星 1 本の奥行き z を distance だけ手前（near の向き）へ進め、near を過ぎたら far の側へ折り返す。
 * near と far はカメラ座標の z（前が負なので far < near < 0）。distance は 1 回で区間の長さを超えない前提。
 */
export function advanceStreak(z: number, distance: number, near: number, far: number): number {
  const next = z + distance;
  return next > near ? next - (near - far) : next;
}

/**
 * ワープ演出の進行。描画には依存せず、時間だけを数える。
 * charge（星が流れ始める）→ jump（暗転。ここで場所を入れ替える）→ settle（星が消える）→ idle。
 */
export class WarpSequence {
  private elapsed = 0;
  private running = false;
  private jumpSignalled = false;
  /** 今回の charge の長さ（start で延ばせる） */
  private charge: number;

  constructor(readonly config: WarpConfig = DEFAULT_WARP_CONFIG) {
    this.charge = config.charge;
  }

  get active(): boolean {
    return this.running;
  }

  get phase(): WarpPhase {
    const { jump, settle } = this.config;
    const { charge } = this;
    if (!this.running) return 'idle';
    if (this.elapsed < charge) return 'charge';
    if (this.elapsed < charge + jump) return 'jump';
    if (this.elapsed < charge + jump + settle) return 'settle';
    return 'idle';
  }

  /** 流れる星の強さ（0〜1）。charge で 0 から 1 へ加速し、settle で 1 から 0 へ戻る。 */
  get intensity(): number {
    const { jump, settle } = this.config;
    const { charge } = this;
    switch (this.phase) {
      case 'charge': {
        const t = this.elapsed / charge;
        return t * t; // ゆっくり始まって一気に速くなる
      }
      case 'jump':
        return 1;
      case 'settle':
        return 1 - (this.elapsed - charge - jump) / settle;
      default:
        return 0;
    }
  }

  /**
   * 演出を始める。すでに動いていれば何もしない。
   * minCharge を渡すと、charge をその長さまで延ばす（ワープのセリフを言い切ってから暗転するため）。
   */
  start(minCharge = 0): void {
    if (this.running) return;
    this.running = true;
    this.elapsed = 0;
    this.jumpSignalled = false;
    this.charge = Math.max(this.config.charge, minCharge);
  }

  /** dt 秒だけ進める。charge が終わって暗転に入る瞬間に一度だけ true を返す（ここで場所を入れ替える）。 */
  update(dt: number): boolean {
    if (!this.running) return false;
    this.elapsed += dt;
    const { jump, settle } = this.config;
    const { charge } = this;
    if (this.elapsed >= charge + jump + settle) this.running = false;
    if (!this.jumpSignalled && this.elapsed >= charge) {
      this.jumpSignalled = true;
      return true;
    }
    return false;
  }
}
