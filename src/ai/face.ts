/**
 * ミラの顔の動き（まばたき・表情）の決め方。重みを計算するだけで、VRM やシーンには依存しない。
 * 感情の数値（M4）が入るまでは、会話の出来事に応じた一時的な表情を出す。
 */

/** まばたきの設定値 */
export interface BlinkConfig {
  /** 次のまばたきまでの間隔（秒）の最小と最大。この範囲で毎回ばらつかせる */
  minInterval: number;
  maxInterval: number;
  /** まぶたを閉じるのにかかる秒数と、開くのにかかる秒数（閉じるほうが速い） */
  closeDuration: number;
  openDuration: number;
}

export const DEFAULT_BLINK_CONFIG: Readonly<BlinkConfig> = {
  minInterval: 2,
  maxInterval: 6,
  closeDuration: 0.06,
  openDuration: 0.14,
};

/** 自然な間隔でまばたきをする。update() が返す重みを、VRM の blink 表情に渡す。 */
export class Blinker {
  /** まぶたの閉じ具合（0 で開いている、1 で閉じている） */
  weight = 0;
  private untilNext: number;
  private closing = 0; // まばたきの途中なら、始めてからの秒数

  constructor(
    private readonly config: BlinkConfig = DEFAULT_BLINK_CONFIG,
    private readonly random: () => number = Math.random,
  ) {
    this.untilNext = this.nextInterval();
  }

  /** dt 秒だけ進め、まぶたの閉じ具合を返す。 */
  update(dt: number): number {
    const { closeDuration, openDuration } = this.config;
    if (this.untilNext > 0) {
      this.untilNext -= dt;
      if (this.untilNext > 0) return (this.weight = 0);
      this.closing = 0;
    }
    this.closing += dt;
    if (this.closing < closeDuration) {
      this.weight = this.closing / closeDuration;
    } else if (this.closing < closeDuration + openDuration) {
      this.weight = 1 - (this.closing - closeDuration) / openDuration;
    } else {
      this.weight = 0;
      this.untilNext = this.nextInterval();
    }
    return this.weight;
  }

  private nextInterval(): number {
    const { minInterval, maxInterval } = this.config;
    return minInterval + (maxInterval - minInterval) * this.random();
  }
}

/** 表情の設定値 */
export interface ExpressionConfig {
  /** 表情が出るまでの秒数 */
  fadeIn: number;
  /** 表情が消えるまでの秒数 */
  fadeOut: number;
  /** 出しっぱなしにする上限（秒）。話し終えたあとも、これだけ経てば戻る */
  maxHold: number;
}

export const DEFAULT_EXPRESSION_CONFIG: Readonly<ExpressionConfig> = {
  fadeIn: 0.15,
  fadeOut: 0.5,
  maxHold: 6,
};

/**
 * 一時的な表情。show() で出し、hold 秒経つか、別の表情を出すと消えていく。
 * 同時に出す表情は 1 つだけで、切り替えるときは前のものが消えながら次が出る。
 */
export class ExpressionFader {
  /** いま出している表情の名前と重み。消えていく途中の表情は previous に残る */
  current: string | null = null;
  currentWeight = 0;
  previous: string | null = null;
  previousWeight = 0;
  private holdLeft = 0;

  constructor(private readonly config: ExpressionConfig = DEFAULT_EXPRESSION_CONFIG) {}

  /** 表情 name を出す。hold 秒（上限 maxHold）で戻る。null や同じ表情なら、時間だけ延ばす */
  show(name: string | null, hold = this.config.maxHold): void {
    this.holdLeft = Math.min(hold, this.config.maxHold);
    if (name === null || name === this.current) return;
    // 前の表情は、いまの重みから消えていく（消えかけの表情がもう 1 つあれば、もともと消えていく途中のそちらを捨てる）
    if (this.current !== null) {
      this.previous = this.current;
      this.previousWeight = this.currentWeight;
    }
    this.current = name;
    this.currentWeight = 0;
  }

  /** dt 秒だけ進める。 */
  update(dt: number): void {
    const { fadeIn, fadeOut } = this.config;
    if (this.previous !== null) {
      this.previousWeight = Math.max(0, this.previousWeight - dt / fadeOut);
      if (this.previousWeight === 0) this.previous = null;
    }
    if (this.current === null) return;
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      this.currentWeight = Math.min(1, this.currentWeight + dt / fadeIn);
    } else {
      this.currentWeight = Math.max(0, this.currentWeight - dt / fadeOut);
      if (this.currentWeight === 0) this.current = null;
    }
  }

  /** 表情が出ている強さの合計（0〜1）。まばたきを弱めるのに使う */
  get strength(): number {
    return Math.min(1, this.currentWeight + this.previousWeight);
  }
}
