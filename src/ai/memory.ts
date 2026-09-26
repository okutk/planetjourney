import type { FactValue } from './dialogue';

/**
 * ミラの記憶。「初めて〇〇に降りた」「〇〇ではぐれた」などの出来事を、場所ごとに回数と日時で覚え、
 * あとの会話の条件（ここで起きたこと）と話題（思い出話）にする。
 * 中身はプレーンなオブジェクト（toJSON / parseMemory）で、そのまま保存できる。描画や DOM には依存しない。
 */

/** 覚えている出来事 1 つ（種類 × 場所ごとに 1 つ）。日時はミリ秒 */
export interface MemoryEntry {
  /** 出来事の種類（landed・solve・leftBehind・jump・sit など。話題にする条件は src/data/memory.json） */
  kind: string;
  /** 起きた場所（星の id か 'ship'） */
  place: string;
  count: number;
  first: number;
  last: number;
  /** 最後の出来事の中身（解いた仕掛けの名前など） */
  detail?: string;
}

/** 保存用の形 */
export interface MemoryData {
  version: 1;
  entries: MemoryEntry[];
}

/** 思い出話の決まり（src/data/memory.json） */
export interface MemoryRules {
  /** プレイヤーがこの秒数動かずにいると、思い出話をする */
  reminisceAfter: number;
  /** 一度話した思い出は、この秒数は話さない（ゲーム内の時計） */
  repeatAfter: number;
  /** 初めて起きてからこの秒数（現実の時刻）が経っていない出来事は、まだ思い出として話さない */
  minAge: number;
  /** 話題にする出来事の種類と、話題にするのに要る回数 */
  topics: Record<string, { minCount: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isEntry(value: unknown): value is MemoryEntry {
  const e = value as Partial<MemoryEntry> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.kind === 'string' &&
    typeof e.place === 'string' &&
    typeof e.count === 'number' &&
    Number.isInteger(e.count) &&
    e.count > 0 &&
    typeof e.first === 'number' &&
    Number.isFinite(e.first) &&
    typeof e.last === 'number' &&
    Number.isFinite(e.last) &&
    (e.detail === undefined || typeof e.detail === 'string')
  );
}

/** 保存から読んだ値を確かめる。壊れた項目は捨て、形がおかしければ空の記憶にする */
export function parseMemory(data: unknown): MemoryData {
  const raw = data as Partial<MemoryData> | null;
  if (typeof raw !== 'object' || raw === null || raw.version !== 1 || !Array.isArray(raw.entries)) {
    return { version: 1, entries: [] };
  }
  return { version: 1, entries: raw.entries.filter(isEntry).map((e) => ({ ...e })) };
}

/** JSON から読み込んだ思い出話の決まりを確かめて返す */
export function parseMemoryRules(data: unknown): MemoryRules {
  const raw = data as Partial<MemoryRules> | null;
  if (typeof raw !== 'object' || raw === null) throw new Error('記憶の決まりはオブジェクトで書く');
  if (!(typeof raw.reminisceAfter === 'number' && raw.reminisceAfter > 0)) throw new Error('reminisceAfter は正の数');
  if (!(typeof raw.repeatAfter === 'number' && raw.repeatAfter >= 0)) throw new Error('repeatAfter は 0 以上の数');
  if (!(typeof raw.minAge === 'number' && raw.minAge >= 0)) throw new Error('minAge は 0 以上の数');
  if (typeof raw.topics !== 'object' || raw.topics === null) throw new Error('topics がない');
  for (const [kind, topic] of Object.entries(raw.topics)) {
    if (!(typeof topic?.minCount === 'number' && topic.minCount >= 1)) throw new Error(`topics.${kind}.minCount は 1 以上`);
  }
  return raw as MemoryRules;
}

/** 記憶。record() で覚え、pick() で思い出話にする物を選ぶ */
export class MemoryBook {
  private readonly entries: MemoryEntry[];
  /** 思い出話にした時刻（ゲーム内の秒）。保存しない（起動しなおせば、また話してよい） */
  private readonly talkedAt = new Map<MemoryEntry, number>();
  /** 保存していない変更があるか */
  dirty = false;

  constructor(
    private readonly rules: MemoryRules,
    data: MemoryData = { version: 1, entries: [] },
  ) {
    this.entries = data.entries.map((e) => ({ ...e }));
  }

  /** 出来事を覚える。nowMs は現実の時刻 */
  record(kind: string, place: string, nowMs: number, detail?: string): void {
    let entry = this.find(kind, place);
    if (!entry) {
      entry = { kind, place, count: 0, first: nowMs, last: nowMs };
      this.entries.push(entry);
    }
    entry.count += 1;
    entry.last = nowMs;
    if (detail !== undefined) entry.detail = detail;
    this.dirty = true;
  }

  /** 種類 kind の出来事の回数。place を省くと、すべての場所の合計 */
  count(kind: string, place?: string): number {
    let total = 0;
    for (const e of this.entries) if (e.kind === kind && (place === undefined || e.place === place)) total += e.count;
    return total;
  }

  /** 場所 place で起きたことを、事実 here_<種類>（回数）として facts に書く（前の場所の分は消す） */
  writePlaceFacts(place: string, facts: Record<string, FactValue>): void {
    for (const key of Object.keys(facts)) if (key.startsWith('here_')) delete facts[key];
    for (const e of this.entries) if (e.place === place) facts[`here_${e.kind}`] = e.count;
  }

  /**
   * 思い出話にする物を選ぶ。話題にできる種類で回数が足り、初めて起きてから minAge 秒経ち、
   * 最近（repeatAfter 秒以内）話していないもの。now はゲーム内の秒、nowMs は現実の時刻。
   * いまいる場所の思い出を先にし、その中ではいちばん長く話していないもの（同じなら random で選ぶ）。
   */
  pick(place: string, now: number, nowMs: number, random: () => number): MemoryEntry | null {
    let best: MemoryEntry[] = [];
    let bestKey = -Infinity;
    for (const e of this.entries) {
      const topic = this.rules.topics[e.kind];
      if (!topic || e.count < topic.minCount) continue;
      if (nowMs - e.first < this.rules.minAge * 1000) continue;
      const talked = this.talkedAt.get(e);
      if (talked !== undefined && now - talked < this.rules.repeatAfter) continue;
      // いまいる場所なら大きく優先し、話したことがないものを、話したのが古いものより先にする
      const key = (e.place === place ? 1e9 : 0) - (talked ?? -1e8);
      if (key > bestKey) {
        best = [e];
        bestKey = key;
      } else if (key === bestKey) {
        best.push(e);
      }
    }
    if (best.length === 0) return null;
    const entry = best[Math.floor(random() * best.length)];
    this.talkedAt.set(entry, now);
    return entry;
  }

  /**
   * 思い出話の事実を facts に書く（memoryKind・memoryPlace・memoryCount・memoryDaysAgo・memoryDetail）。
   * nameOf は場所の id から表示名を返す。日数は「初めて〇〇した」話なので first から数える
   */
  writeMemoryFacts(
    entry: MemoryEntry,
    nowMs: number,
    nameOf: (place: string) => string,
    facts: Record<string, FactValue>,
  ): void {
    facts.memoryKind = entry.kind;
    facts.memoryPlace = nameOf(entry.place);
    facts.memoryCount = entry.count;
    facts.memoryDaysAgo = Math.max(0, Math.floor((nowMs - entry.first) / DAY_MS));
    if (entry.detail === undefined) delete facts.memoryDetail;
    else facts.memoryDetail = entry.detail;
  }

  /** 保存用の形（コピー） */
  toJSON(): MemoryData {
    return { version: 1, entries: this.entries.map((e) => ({ ...e })) };
  }

  private find(kind: string, place: string): MemoryEntry | undefined {
    return this.entries.find((e) => e.kind === kind && e.place === place);
  }
}
