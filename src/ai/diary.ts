import { fillLine, matches, type Criterion, type Facts, type FactValue } from './dialogue';

/**
 * ミラの日記。星を出るときに、その星での出来事（VisitLog）から文章を組み立てる。
 * 組み立て方は Tracery 方式の文法展開：記号 #名前# を、その記号の候補から 1 つ選んだ文に置き換えることを繰り返す。
 * どの段落を書くかは、会話と同じ条件（criteria）で選ぶ。部品と文法は src/data/diary.json。描画や DOM には依存しない。
 */

export interface DiaryParagraph {
  /** この段落を書く条件（すべて成り立てば書く） */
  when: Criterion[];
  /** 展開する記号の名前 */
  symbol: string;
}

export interface DiaryGrammar {
  /** 上から順に、条件に合う段落を書く */
  paragraphs: DiaryParagraph[];
  /** 記号ごとの候補。候補の中の #名前# はさらに展開し、{名前} は事実の値に置き換える */
  symbols: Record<string, string[]>;
}

/** 展開の深さの上限（記号どうしが互いを呼び合っても止まるように） */
const MAX_DEPTH = 8;
const SYMBOL = /#(\w+)#/g;

/** JSON から読み込んだ文法を確かめて返す。存在しない記号を使っていたら例外にする */
export function parseDiaryGrammar(data: unknown): DiaryGrammar {
  const raw = data as Partial<DiaryGrammar> | null;
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.paragraphs)) throw new Error('日記の文法には paragraphs が要る');
  const symbols = raw.symbols;
  if (typeof symbols !== 'object' || symbols === null) throw new Error('日記の文法には symbols が要る');
  for (const [name, options] of Object.entries(symbols)) {
    if (!Array.isArray(options) || options.length === 0 || options.some((o) => typeof o !== 'string')) {
      throw new Error(`記号 ${name} の候補は 1 つ以上の文字列`);
    }
    for (const option of options) {
      for (const [, ref] of option.matchAll(SYMBOL)) if (!(ref in symbols)) throw new Error(`記号 ${name} が知らない記号 ${ref} を使っている`);
    }
  }
  for (const paragraph of raw.paragraphs) {
    if (!(paragraph?.symbol in symbols)) throw new Error(`段落の記号 ${String(paragraph?.symbol)} がない`);
    if (!Array.isArray(paragraph.when)) throw new Error(`段落 ${paragraph.symbol} の when は配列`);
  }
  return raw as DiaryGrammar;
}

/** 記号 symbol を展開する。{名前} は facts の値に置き換える */
export function expand(symbol: string, grammar: DiaryGrammar, facts: Facts, random: () => number, depth = 0): string {
  const options = grammar.symbols[symbol];
  if (!options) return symbol;
  const chosen = options[Math.floor(random() * options.length)];
  const text =
    depth >= MAX_DEPTH ? chosen.replace(SYMBOL, '') : chosen.replace(SYMBOL, (_, name: string) => expand(name, grammar, facts, random, depth + 1));
  return fillLine(text, facts);
}

/** 条件に合う段落をすべて展開して、日記の本文にする（段落は改行でつなぐ） */
export function writeDiary(grammar: DiaryGrammar, facts: Facts, random: () => number): string {
  return grammar.paragraphs
    .filter((p) => p.when.every((c) => matches(c, facts)))
    .map((p) => expand(p.symbol, grammar, facts, random))
    .join('\n');
}

/**
 * 1 回の星の訪問で起きたことを数える（降りたら start、出るときに facts() で日記の材料にする）。
 * 数える出来事は記憶と同じ種類（jump・leftBehind・solve・sit・inspect/〇〇）と、図鑑の発見（codex）。
 */
export class VisitLog {
  private readonly counts = new Map<string, number>();
  private readonly last = new Map<string, string>();
  private startedAt = 0;
  private longestIdle = 0;

  start(nowMs: number): void {
    this.counts.clear();
    this.last.clear();
    this.startedAt = nowMs;
    this.longestIdle = 0;
  }

  /** 出来事を数える。inspect/〇〇 は inspect として数え、〇〇を最後に見た物として覚える */
  note(kind: string, detail?: string): void {
    const slash = kind.indexOf('/');
    const key = slash < 0 ? kind : kind.slice(0, slash);
    const what = slash < 0 ? detail : kind.slice(slash + 1);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (what !== undefined) this.last.set(key, what);
  }

  /** 放っておかれた秒数を知らせる（いちばん長かったものを覚える） */
  idle(seconds: number): void {
    if (seconds > this.longestIdle) this.longestIdle = seconds;
  }

  /**
   * 日記の材料になる事実。回数は 0 でも入れる（条件で「0 回なら書かない」とできるように）。
   * 最後の中身は lastSolve・lastInspect・lastCodex として入る
   */
  facts(nowMs: number): Record<string, FactValue> {
    const facts: Record<string, FactValue> = {
      jumps: this.counts.get('jump') ?? 0,
      leftBehind: this.counts.get('leftBehind') ?? 0,
      solved: this.counts.get('solve') ?? 0,
      inspected: this.counts.get('inspect') ?? 0,
      sat: this.counts.get('sit') ?? 0,
      discoveries: this.counts.get('codex') ?? 0,
      idleMinutes: Math.floor(this.longestIdle / 60),
      stayMinutes: Math.max(0, Math.floor((nowMs - this.startedAt) / 60000)),
    };
    for (const [key, what] of this.last) facts[`last${key[0].toUpperCase()}${key.slice(1)}`] = what;
    return facts;
  }
}

/** 日記の 1 ページ。保存用のプレーンなオブジェクト */
export interface DiaryEntry {
  /** 書いた日時（ミリ秒） */
  at: number;
  /** 星の表示名 */
  place: string;
  text: string;
}

/** 残しておく日記のページ数（古いものから消す） */
export const DIARY_LIMIT = 60;

/** 保存から読んだ日記を確かめる。壊れたページは捨て、多すぎれば新しいほうを残す */
export function parseDiary(data: unknown): DiaryEntry[] {
  if (!Array.isArray(data)) return [];
  const entries = data.filter(
    (e): e is DiaryEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.at === 'number' &&
      Number.isFinite(e.at) &&
      typeof e.place === 'string' &&
      typeof e.text === 'string',
  );
  return entries.slice(-DIARY_LIMIT).map((e) => ({ at: e.at, place: e.place, text: e.text }));
}
