import type { DialogueLine, DialogueSelector, FactValue } from './dialogue';

/** 話し終えてから、次に話し始めるまでの最低限の間（秒） */
const MIN_GAP = 1.5;

/**
 * ゲームの出来事から事実（facts）を集め、いつミラが話すかを決める。描画や DOM には依存しない。
 * 話している途中は、次のセリフで割り込まない。
 */
export class TalkDirector {
  /** 会話の判断材料。セリフの {名前} にも使う。place は 'ship'（船の部屋）か 'planet'（星の上） */
  readonly facts: Record<string, FactValue> = { place: 'ship', jumps: 0, idleSeconds: 0, affection: 20 };
  private busyUntil = -Infinity;

  constructor(
    private readonly selector: DialogueSelector,
    /** セリフを話し終えるまでの秒数（文字送り・音の長さに合わせる） */
    private readonly durationOf: (text: string) => number,
  ) {}

  /** 星に降りたとき。visits はその星に降りた回数（初めてなら 1）。事実だけを更新し、あいさつは greet() で話す。 */
  enterPlanet(planet: string, visits: number): void {
    this.facts.place = 'planet';
    this.facts.planet = planet;
    this.facts.visits = visits;
    this.facts.idleSeconds = 0;
  }

  /** 船の部屋に入ったとき（旅の始まりと、星から戻ったとき）。planet には最後に降りた星が残る。 */
  enterShip(): void {
    this.facts.place = 'ship';
    this.facts.idleSeconds = 0;
  }

  /** いまいる場所のあいさつ（星なら greet、船なら board）。 */
  greet(now: number): DialogueLine | null {
    return this.say(this.facts.place === 'ship' ? 'board' : 'greet', now);
  }

  /** プレイヤーがジャンプしたとき。 */
  jumped(now: number): DialogueLine | null {
    this.facts.jumps = (this.facts.jumps as number) + 1;
    this.facts.idleSeconds = 0; // 跳んでいるのは遊んでいるということなので、放置の時間は数え直す
    return this.say('jump', now);
  }

  /** 毎フレーム呼ぶ。止まっている時間を数え、しばらく放っておかれたら話しかける。 */
  update(dt: number, moving: boolean, now: number): DialogueLine | null {
    const before = this.facts.idleSeconds as number;
    const after = moving ? 0 : before + dt;
    this.facts.idleSeconds = after;
    // セリフの条件は秒単位なので、判定は 1 秒に 1 回で十分（毎フレーム候補の配列を作らない）
    if (moving || Math.floor(after) === Math.floor(before)) return null;
    return this.say('idle', now);
  }

  /** 話している途中のセリフを打ち切る（場所を移るとき）。すぐ次のセリフを話せるようになる。 */
  interrupt(): void {
    this.busyUntil = -Infinity;
  }

  /** いま話しているか。 */
  isSpeaking(now: number): boolean {
    return now < this.busyUntil;
  }

  private say(concept: string, now: number): DialogueLine | null {
    if (now < this.busyUntil + MIN_GAP) return null;
    const line = this.selector.select(concept, this.facts, now);
    if (line) this.busyUntil = now + this.durationOf(line.text);
    return line;
  }
}
