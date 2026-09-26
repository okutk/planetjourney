import { visitFacts, writeClockFacts, type PlayLog } from './clock';
import type { DialogueLine, DialogueSelector, FactValue } from './dialogue';
import type { Emotion } from './emotion';

/** 話し終えてから、次に話し始めるまでの最低限の間（秒） */
const MIN_GAP = 1.5;

/**
 * ゲームの出来事から事実（facts）を集め、いつミラが話すかを決める。描画や DOM には依存しない。
 * 話している途中は、次のセリフで割り込まない。
 * emotion を渡すと、出来事で感情を動かし、話すときに感情の値を事実（joy・curiosity・anxiety・trust・mood）に入れる。
 */
export class TalkDirector {
  /** 会話の判断材料。セリフの {名前} にも使う。place は 'ship'（船の部屋）か 'planet'（星の上） */
  readonly facts: Record<string, FactValue> = { place: 'ship', jumps: 0, warps: 0, idleSeconds: 0 };
  private busyUntil = -Infinity;

  constructor(
    private readonly selector: DialogueSelector,
    /** セリフを話し終えるまでの秒数（文字送り・音の長さに合わせる） */
    private readonly durationOf: (text: string) => number,
    private readonly emotion: Emotion | null = null,
  ) {
    emotion?.writeFacts(this.facts);
  }

  /** 端末の時計の「時」（0〜23）を事実に入れる（hour・timeOfDay）。起動時と、ときどき呼ぶ */
  setClock(hour: number): void {
    writeClockFacts(hour, this.facts);
  }

  /**
   * 起動したとき。前回のプレイの記録から「N 日ぶり」などの事実を入れる（時計が戻っていたら入れない）。
   * 1 日以上ぶりなら、また会えたのがうれしい（感情の reunion）。
   */
  startVisit(log: PlayLog | null, nowMs: number): void {
    // 前の起動（や再開）の事実が残らないよう、入れ直す
    delete this.facts.playedBefore;
    delete this.facts.daysAway;
    delete this.facts.clockRewound;
    const facts = visitFacts(log, nowMs);
    Object.assign(this.facts, facts);
    if (typeof facts.daysAway === 'number' && facts.daysAway >= 1) this.emotion?.feel('reunion');
  }

  /**
   * 再読み込みせずに画面へ戻ってきたとき（スマホでアプリを切り替えて戻ったときなど）。
   * 前回の記録と比べ直し、「N 日ぶり」や深夜なら話しかける（合うセリフがなければ黙っている）。
   */
  resume(log: PlayLog | null, nowMs: number, hour: number, now: number): DialogueLine | null {
    this.setClock(hour);
    this.startVisit(log, nowMs);
    this.facts.idleSeconds = 0;
    // 話すセリフがあるときだけ、話している途中のセリフを打ち切る（なければ続きをそのまま話す）
    const busyUntil = this.busyUntil;
    this.interrupt();
    const line = this.say('resume', now);
    if (!line) this.busyUntil = busyUntil;
    return line;
  }

  /**
   * 星に降りたとき。planetId は星の id（セリフの条件に使う）、planet は表示名（セリフの {planet} に入る）、
   * visits はその星に降りた回数（初めてなら 1）。事実だけを更新し、あいさつは greet() で話す。
   */
  enterPlanet(planetId: string, planet: string, visits: number): void {
    this.facts.place = 'planet';
    this.facts.planetId = planetId;
    this.facts.planet = planet;
    this.facts.visits = visits;
    this.facts.idleSeconds = 0;
    this.emotion?.feel(visits === 1 ? 'discover' : 'arrive');
  }

  /** 仕掛けをミラに頼んだとき。task は仕掛けの種類、target は表示名（セリフの {target} に入る）。 */
  askTask(now: number, task: string, target: string): DialogueLine | null {
    this.facts.task = task;
    this.facts.target = target;
    this.facts.idleSeconds = 0;
    return this.say('ask', now);
  }

  /**
   * 仕掛けの作業を終えたとき。solved は解いた仕掛けの合計。種類ごとの回数（scanDone など）も数える。
   * 結果はプレイヤーが待っているものなので、頼んだセリフの途中でも打ち切って必ず話す。
   */
  finishTask(now: number, solved: number): DialogueLine | null {
    this.facts.solved = solved;
    const key = `${String(this.facts.task)}Done`;
    this.facts[key] = ((this.facts[key] as number | undefined) ?? 0) + 1;
    this.emotion?.feel('solve'); // いっしょに解けたのがうれしい
    this.interrupt();
    return this.say('taskDone', now);
  }

  /** 星のかけらを拾ったとき。collected は拾った通算の数（セリフの「n 個目」）、fragments は手持ちの数。 */
  collectedFragment(now: number, collected: number, fragments: number): DialogueLine | null {
    this.facts.collected = collected;
    this.facts.fragments = fragments;
    this.interrupt();
    return this.say('fragment', now);
  }

  /** 投影機の段階が上がったとき。stage は上がったあとの段階。 */
  upgraded(now: number, stage: number): DialogueLine | null {
    this.facts.stage = stage;
    this.interrupt();
    return this.say('upgrade', now);
  }

  /** 投影機を強化しようとしたが、かけらが足りないとき。need は足りない数。 */
  upgradeShort(now: number, need: number): DialogueLine | null {
    this.facts.need = need;
    this.interrupt();
    return this.say('upgradeShort', now);
  }

  /** プレイヤーが離れて投影が届かず、作業が止まったとき。頼んだ直後でも打ち切って話す。 */
  cancelTask(now: number): DialogueLine | null {
    this.emotion?.feel('cancel');
    this.interrupt();
    return this.say('taskCancelled', now);
  }

  /** 船の部屋に入ったとき（旅の始まりと、星から戻ったとき）。planet には最後に降りた星が残る。 */
  enterShip(): void {
    // 星から戻ってきたら、ほっとする（旅の始まりは除く）
    if (this.facts.place === 'planet') this.emotion?.feel('home');
    this.facts.place = 'ship';
    this.facts.idleSeconds = 0;
  }

  /** いまいる場所のあいさつ（星なら greet、船なら board）。 */
  greet(now: number): DialogueLine | null {
    return this.say(this.facts.place === 'ship' ? 'board' : 'greet', now);
  }

  /** 星図を開いたとき。 */
  openedStarMap(now: number): DialogueLine | null {
    return this.say('starmap', now);
  }

  /** 行き先を決めてワープを始めたとき。destination は行き先の星の名前。 */
  warp(now: number, destination: string): DialogueLine | null {
    this.facts.warps = (this.facts.warps as number) + 1;
    this.facts.destination = destination;
    this.facts.idleSeconds = 0;
    this.emotion?.feel('warp');
    return this.say('warp', now);
  }

  /** プレイヤーがジャンプしたとき。 */
  jumped(now: number): DialogueLine | null {
    this.facts.jumps = (this.facts.jumps as number) + 1;
    this.facts.idleSeconds = 0; // 跳んでいるのは遊んでいるということなので、放置の時間は数え直す
    this.emotion?.feel('jump');
    return this.say('jump', now);
  }

  /** 毎フレーム呼ぶ。止まっている時間を数え、しばらく放っておかれたら話しかける。 */
  update(dt: number, moving: boolean, now: number): DialogueLine | null {
    const before = this.facts.idleSeconds as number;
    const after = moving ? 0 : before + dt;
    this.facts.idleSeconds = after;
    // セリフの条件は秒単位なので、判定は 1 秒に 1 回で十分（毎フレーム候補の配列を作らない）
    if (moving || Math.floor(after) === Math.floor(before)) return null;
    const ignoredAfter = this.emotion?.rules.ignoredAfter ?? Infinity;
    if (before < ignoredAfter && after >= ignoredAfter) this.emotion?.feel('ignored');
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
    this.emotion?.writeFacts(this.facts);
    const line = this.selector.select(concept, this.facts, now);
    if (line) this.busyUntil = now + this.durationOf(line.text);
    return line;
  }
}
