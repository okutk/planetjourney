/**
 * ミラの投影範囲（GDD「ミラの体（ホログラム）」）。
 * ミラの体はプレイヤーの腕輪から映し出されていて、一定の距離までしか出せない。
 * 範囲の端に近づくと体にノイズが走り、離れすぎたまましばらく経つと、消えて腕輪のそばに映し直される。
 * 距離と時間だけから状態を決め、描画や DOM には依存しない。
 */
export interface ProjectionConfig {
  /** 腕輪からこの距離までしか体を出せない */
  range: number;
  /** この距離からノイズが走り始め、range で最大になる */
  noiseFrom: number;
  /** 範囲の外にこの秒数いたら、映し直しを始める（一瞬はみ出しただけでは消えない） */
  outsideGrace: number;
  /** 消える・現れるのにかかる秒数 */
  fadeDuration: number;
}

export const DEFAULT_PROJECTION_CONFIG: Readonly<ProjectionConfig> = {
  range: 6,
  noiseFrom: 4.2,
  outsideGrace: 0.6,
  fadeDuration: 0.35,
};

/** 腕輪からの距離に応じたノイズの強さ（0〜1）。 */
export function projectionNoise(distance: number, config: ProjectionConfig): number {
  const t = (distance - config.noiseFrom) / (config.range - config.noiseFrom);
  return Math.min(1, Math.max(0, t));
}

type Phase = 'shown' | 'fadingOut' | 'fadingIn';

/** 投影の状態。毎フレーム update() を呼び、true が返ったらミラを腕輪のそばへ置き直す。 */
export class Projector {
  /** 体の見え方（0 で消えている、1 で普通に見える） */
  visibility = 1;
  /** 体に走るノイズの強さ（0〜1） */
  noise = 0;
  private phase: Phase = 'shown';
  private outsideFor = 0;

  constructor(private readonly config: ProjectionConfig = DEFAULT_PROJECTION_CONFIG) {}

  /** 消えている途中か、現れている途中か（この間はセリフなどを控えるのに使える）。 */
  get reprojecting(): boolean {
    return this.phase !== 'shown';
  }

  /**
   * distance は腕輪（プレイヤー）からミラまでの距離。dt 秒だけ進める。
   * 映し直すべき瞬間（消え切ったとき）に 1 回だけ true を返す。
   */
  update(distance: number, dt: number): boolean {
    const { config } = this;
    switch (this.phase) {
      case 'shown':
        this.noise = projectionNoise(distance, config);
        this.outsideFor = distance > config.range ? this.outsideFor + dt : 0;
        if (this.outsideFor >= config.outsideGrace) {
          this.phase = 'fadingOut';
          this.outsideFor = 0;
        }
        return false;
      case 'fadingOut':
        this.noise = 1;
        this.visibility = Math.max(0, this.visibility - dt / config.fadeDuration);
        if (this.visibility > 0) return false;
        this.phase = 'fadingIn';
        return true;
      case 'fadingIn':
        this.visibility = Math.min(1, this.visibility + dt / config.fadeDuration);
        this.noise = 1 - this.visibility;
        if (this.visibility >= 1) this.phase = 'shown';
        return false;
    }
  }

  /** 状態を最初に戻す（場所を移ったときなど、ミラを置き直したあとに呼ぶ）。 */
  reset(): void {
    this.phase = 'shown';
    this.visibility = 1;
    this.noise = 0;
    this.outsideFor = 0;
  }
}
