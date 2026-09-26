import type { DialogueLine, DialogueSelector, FactValue } from './dialogue';

/** 話し終えてから、次に話し始めるまでの最低限の間（秒） */
const MIN_GAP = 1.5;

/**
 * ゲームの出来事から事実（facts）を集め、いつミラが話すかを決める。描画や DOM には依存しない。
 * 話している途中は、次のセリフで割り込まない。
 */
export class TalkDirector {
  /** 会話の判断材料。セリフの {名前} にも使う */
  readonly facts: Record<string, FactValue> = { visits: 1, jumps: 0, idleSeconds: 0, affection: 20 };
  private busyUntil = -Infinity;

  constructor(
    private readonly selector: DialogueSelector,
    /** セリフを話し終えるまでの秒数（文字送り・音の長さに合わせる） */
    private readonly durationOf: (text: string) => number,
    planet: string,
  ) {
    this.facts.planet = planet;
  }

  /** 星に着いたとき。 */
  arrive(now: number): DialogueLine | null {
    return this.say('greet', now);
  }

  /** プレイヤーがジャンプしたとき。 */
  jumped(now: number): DialogueLine | null {
    this.facts.jumps = (this.facts.jumps as number) + 1;
    return this.say('jump', now);
  }

  /** 毎フレーム呼ぶ。止まっている時間を数え、しばらく放っておかれたら話しかける。 */
  update(dt: number, moving: boolean, now: number): DialogueLine | null {
    this.facts.idleSeconds = moving ? 0 : (this.facts.idleSeconds as number) + dt;
    if (moving) return null;
    return this.say('idle', now);
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
