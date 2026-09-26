/**
 * 条件で選ぶ会話（Valve『Left 4 Dead』の会話システム方式）。
 * 「今いる星」「好感度」などの事実（facts）を集め、条件がすべて成り立つルールのうち、
 * 条件の数がいちばん多い（＝いちばん状況に細かく合う）ものを選ぶ。
 * セリフとルールは src/data の JSON に置き、ここには選び方だけを書く。描画や DOM には依存しない。
 */

/** 会話の判断材料になる事実。値は数・文字列・真偽のいずれか。 */
export type FactValue = number | string | boolean;
export type Facts = Readonly<Record<string, FactValue | undefined>>;

export type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'missing';

/** 1 つの条件。例: { fact: 'affection', op: 'gte', value: 50 } */
export interface Criterion {
  fact: string;
  op: Operator;
  value?: FactValue;
}

/** 1 つのルール。concept（話すきっかけ）ごとに複数あり、条件に合うものから選ばれる。 */
export interface DialogueRule {
  id: string;
  /** 話すきっかけ（例: 'greet'、'jump'） */
  concept: string;
  criteria: Criterion[];
  /** 候補のセリフ。この中から 1 つを選ぶ */
  lines: string[];
  /** 一度使ったら、この秒数のあいだは選ばない */
  cooldown?: number;
  /** true なら一度しか使わない（「初めての〜」など） */
  once?: boolean;
  /** 話すときの表情（VRM の preset 名。happy / sad / surprised / relaxed / angry など）。なければ表情を変えない */
  expression?: string;
}

/** 選ばれたセリフ。 */
export interface DialogueLine {
  ruleId: string;
  text: string;
  /** 話すときの表情（ルールの expression） */
  expression?: string;
}

const OPERATORS: readonly Operator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing'];
const RULE_KEYS = new Set(['id', 'concept', 'criteria', 'lines', 'cooldown', 'once', 'expression']);

function isFactValue(value: unknown): value is FactValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

/** 条件が成り立つか。 */
export function matches(criterion: Criterion, facts: Facts): boolean {
  const actual = facts[criterion.fact];
  const expected = criterion.value;
  switch (criterion.op) {
    case 'exists':
      return actual !== undefined;
    case 'missing':
      return actual === undefined;
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
  }
  // 大小の比較は、どちらも数のときだけ成り立つ
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  switch (criterion.op) {
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
  }
}

/**
 * JSON から読み込んだルールの形を確かめて返す。おかしなところがあれば、どのルールかが分かる例外を投げる
 * （セリフを書き足したときのミスをテストで見つけるため）。
 */
export function parseRules(data: unknown): DialogueRule[] {
  if (!Array.isArray(data)) throw new Error('会話ルールは配列で書く');
  const ids = new Set<string>();
  return data.map((raw, index) => {
    const rule = raw as Partial<DialogueRule>;
    const where = `会話ルール ${index}（${String(rule?.id)}）`;
    // キーの打ち間違い（cooldwon など）は、指定が黙って効かなくなるので例外にする
    for (const key of Object.keys(rule ?? {})) {
      if (!RULE_KEYS.has(key)) throw new Error(`${where}: 知らないキー ${key}`);
    }
    if (typeof rule?.id !== 'string' || rule.id === '') throw new Error(`${where}: id がない`);
    if (ids.has(rule.id)) throw new Error(`${where}: id が重複している`);
    ids.add(rule.id);
    if (typeof rule.concept !== 'string' || rule.concept === '') throw new Error(`${where}: concept がない`);
    if (!Array.isArray(rule.lines) || rule.lines.length === 0 || rule.lines.some((l) => typeof l !== 'string')) {
      throw new Error(`${where}: lines は 1 つ以上の文字列`);
    }
    if (new Set(rule.lines).size !== rule.lines.length) throw new Error(`${where}: lines に同じセリフが重複している`);
    if (!Array.isArray(rule.criteria)) throw new Error(`${where}: criteria は配列`);
    for (const c of rule.criteria) {
      if (typeof c?.fact !== 'string' || !OPERATORS.includes(c.op)) {
        throw new Error(`${where}: 条件の fact か op がおかしい`);
      }
      const needsValue = c.op !== 'exists' && c.op !== 'missing';
      if (needsValue && !isFactValue(c.value)) {
        throw new Error(`${where}: ${c.fact} の条件の value は数・文字列・真偽のどれか`);
      }
    }
    if (rule.cooldown !== undefined && !(typeof rule.cooldown === 'number' && rule.cooldown >= 0)) {
      throw new Error(`${where}: cooldown は 0 以上の数`);
    }
    if (rule.once !== undefined && typeof rule.once !== 'boolean') throw new Error(`${where}: once は真偽`);
    if (rule.expression !== undefined && (typeof rule.expression !== 'string' || rule.expression === '')) {
      throw new Error(`${where}: expression は表情の名前`);
    }
    return rule as DialogueRule;
  });
}

/** セリフの中の {名前} を、同じ名前の事実の値に置き換える。事実がなければそのまま残す。 */
export function fillLine(line: string, facts: Facts): string {
  return line.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = facts[name];
    return value === undefined ? whole : String(value);
  });
}

/** セリフに出てくる {名前} の一覧。 */
export function placeholdersOf(line: string): string[] {
  return [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/**
 * 会話の選び手。どのルールをいつ使ったかを覚えておき、同じセリフが続かないようにする。
 * 時刻（秒）と乱数は外から渡す（テストで結果を決められるように）。
 */
export class DialogueSelector {
  private readonly byConcept = new Map<string, DialogueRule[]>();
  private readonly lastUsedAt = new Map<string, number>();
  private readonly usedOnce = new Set<string>();
  private readonly lastLineOf = new Map<string, string>();

  constructor(
    rules: readonly DialogueRule[],
    private readonly random: () => number,
  ) {
    for (const rule of rules) {
      const list = this.byConcept.get(rule.concept) ?? [];
      list.push(rule);
      this.byConcept.set(rule.concept, list);
    }
  }

  /** concept について、facts にいちばん細かく合うセリフを選ぶ。合うものがなければ null。 */
  select(concept: string, facts: Facts, now: number): DialogueLine | null {
    const candidates = (this.byConcept.get(concept) ?? []).filter(
      (rule) => this.isAvailable(rule, now) && rule.criteria.every((c) => matches(c, facts)),
    );
    if (candidates.length === 0) return null;

    // 条件の数がいちばん多いものに絞り、同点なら乱数で選ぶ
    const best = Math.max(...candidates.map((rule) => rule.criteria.length));
    const top = candidates.filter((rule) => rule.criteria.length === best);
    const rule = top[Math.floor(this.random() * top.length)];

    const line = this.pickLine(rule);
    this.lastUsedAt.set(rule.id, now);
    if (rule.once) this.usedOnce.add(rule.id);
    this.lastLineOf.set(rule.id, line);
    const selected: DialogueLine = { ruleId: rule.id, text: fillLine(line, facts) };
    if (rule.expression !== undefined) selected.expression = rule.expression;
    return selected;
  }

  private isAvailable(rule: DialogueRule, now: number): boolean {
    if (rule.once && this.usedOnce.has(rule.id)) return false;
    const last = this.lastUsedAt.get(rule.id);
    return last === undefined || rule.cooldown === undefined || now - last >= rule.cooldown;
  }

  /** 候補のセリフから 1 つ選ぶ。候補が 2 つ以上あれば、前回と同じセリフは避ける。 */
  private pickLine(rule: DialogueRule): string {
    const previous = this.lastLineOf.get(rule.id);
    const filtered = rule.lines.filter((line) => line !== previous);
    const choices = filtered.length > 0 ? filtered : rule.lines;
    return choices[Math.floor(this.random() * choices.length)];
  }
}
