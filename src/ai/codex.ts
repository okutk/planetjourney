/**
 * 図鑑（データと体験の二段階）。ミラは各項目の事実（データ）を最初から知っていて、
 * 記憶（src/ai/memory.ts）に決まった出来事が残ると「体験」に変わり、感想が加わる。
 * 体験したかどうかは記憶から決まるので、図鑑そのものは保存しない。項目と感想は src/data/codex.json。
 * 描画や DOM には依存しない。
 */

export interface CodexEntry {
  id: string;
  /** 項目の場所（星の id か 'ship'）。図鑑ではこの順にまとめる */
  place: string;
  title: string;
  /** 最初から知っている事実（灰色で並ぶ） */
  data: string;
  /** 体験したあとのミラの感想 */
  impression: string;
  /** 体験に変わる条件。記憶に kind の出来事が place で count 回（省略時 1 回）あれば体験 */
  when: { kind: string; place: string; count?: number };
  /** データにない発見。ミラがいちばん喜ぶ */
  rare?: boolean;
}

/** 記憶のうち、図鑑が使うところ（回数を数えられればよい） */
export interface MemoryCounter {
  count(kind: string, place?: string): number;
}

const ENTRY_KEYS = new Set(['id', 'place', 'title', 'data', 'impression', 'when', 'rare']);

/** JSON から読み込んだ図鑑の項目を確かめて返す。おかしなところがあれば、どの項目かが分かる例外を投げる */
export function parseCodex(data: unknown): CodexEntry[] {
  if (!Array.isArray(data)) throw new Error('図鑑は配列で書く');
  const ids = new Set<string>();
  return data.map((raw, index) => {
    const entry = raw as Partial<CodexEntry>;
    const where = `図鑑 ${index}（${String(entry?.id)}）`;
    for (const key of Object.keys(entry ?? {})) if (!ENTRY_KEYS.has(key)) throw new Error(`${where}: 知らないキー ${key}`);
    for (const key of ['id', 'place', 'title', 'data', 'impression'] as const) {
      if (typeof entry[key] !== 'string' || entry[key] === '') throw new Error(`${where}: ${key} がない`);
    }
    if (ids.has(entry.id!)) throw new Error(`${where}: id が重複している`);
    ids.add(entry.id!);
    const when = entry.when;
    if (typeof when?.kind !== 'string' || typeof when.place !== 'string') throw new Error(`${where}: when の kind か place がない`);
    if (when.count !== undefined && !(Number.isInteger(when.count) && when.count >= 1)) {
      throw new Error(`${where}: when.count は 1 以上の整数`);
    }
    if (entry.rare !== undefined && typeof entry.rare !== 'boolean') throw new Error(`${where}: rare は真偽`);
    return entry as CodexEntry;
  });
}

/** その項目を体験したか */
export function isExperienced(entry: CodexEntry, memory: MemoryCounter): boolean {
  return memory.count(entry.when.kind, entry.when.place) >= (entry.when.count ?? 1);
}

/**
 * 図鑑。新しく体験に変わった項目を見つけ、ミラが「図鑑に書いておくね」と話すために順に取り出す。
 * 起動時に体験済みだったものは、新しい発見として数えない。
 */
export class Codex {
  private readonly experienced = new Set<CodexEntry>();
  private readonly pending: CodexEntry[] = [];

  constructor(
    readonly entries: readonly CodexEntry[],
    private readonly memory: MemoryCounter,
  ) {
    for (const entry of entries) if (isExperienced(entry, memory)) this.experienced.add(entry);
  }

  /** 記憶が増えたあとに呼ぶ。新しく体験に変わった項目を、話す順番待ちに入れる */
  check(): void {
    for (const entry of this.entries) {
      if (this.experienced.has(entry) || !isExperienced(entry, this.memory)) continue;
      this.experienced.add(entry);
      // 珍しい発見は先に話す
      if (entry.rare) this.pending.unshift(entry);
      else this.pending.push(entry);
    }
  }

  /** 話す順番待ちの先頭を取り出す（なければ null） */
  next(): CodexEntry | null {
    return this.pending.shift() ?? null;
  }

  has(entry: CodexEntry): boolean {
    return this.experienced.has(entry);
  }

  /** 体験した項目の数 */
  get count(): number {
    return this.experienced.size;
  }
}
