/**
 * おみやげ。星ごとに 1 つ持ち帰り、ミラが船の部屋の置き場所を決める。置いたものは、ときどき思い出として話す。
 * おみやげと置き場所の定義は src/data/souvenirs.json。持ち帰った記録はプレーンなオブジェクトでセーブに残す。
 * 描画や DOM には依存しない。
 */

export interface SouvenirDef {
  id: string;
  /** どの星のおみやげか（星の id） */
  planet: string;
  name: string;
  /** 見た目の形（stone・crystal・shell） */
  shape: string;
  color: string;
  /** 置きたい場所の特徴。置き場所の tags と多く重なるところを選ぶ */
  prefers: string[];
}

export interface SlotDef {
  id: string;
  /** セリフに入る置き場所の名前 */
  name: string;
  /** 船の部屋の中の位置（床の中心が原点） */
  position: [number, number, number];
  tags: string[];
}

export interface SouvenirRules {
  /** 船の部屋でこの秒数放っておかれると、おみやげの話をする */
  chatAfter: number;
  slots: SlotDef[];
  souvenirs: SouvenirDef[];
}

/** 持ち帰ったおみやげ（保存用）。slot は置き場所の id（置き場所がなければ null） */
export interface PlacedSouvenir {
  id: string;
  slot: string | null;
  at: number;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** JSON から読み込んだおみやげの定義を確かめて返す */
export function parseSouvenirRules(data: unknown): SouvenirRules {
  const raw = data as Partial<SouvenirRules> | null;
  if (typeof raw !== 'object' || raw === null) throw new Error('おみやげの定義はオブジェクトで書く');
  if (!(typeof raw.chatAfter === 'number' && raw.chatAfter > 0)) throw new Error('chatAfter は正の数');
  if (!Array.isArray(raw.slots) || !Array.isArray(raw.souvenirs)) throw new Error('slots と souvenirs は配列');
  const slotIds = new Set<string>();
  for (const slot of raw.slots) {
    if (typeof slot?.id !== 'string' || typeof slot.name !== 'string' || !isStrings(slot.tags)) throw new Error(`置き場所 ${String(slot?.id)} の形がおかしい`);
    if (!Array.isArray(slot.position) || slot.position.length !== 3 || slot.position.some((n) => typeof n !== 'number')) {
      throw new Error(`置き場所 ${slot.id} の position は数 3 つ`);
    }
    if (slotIds.has(slot.id)) throw new Error(`置き場所 ${slot.id} が重複している`);
    slotIds.add(slot.id);
  }
  const planets = new Set<string>();
  for (const s of raw.souvenirs) {
    for (const key of ['id', 'planet', 'name', 'shape', 'color'] as const) {
      if (typeof s?.[key] !== 'string' || s[key] === '') throw new Error(`おみやげ ${String(s?.id)} の ${key} がない`);
    }
    if (!isStrings(s.prefers)) throw new Error(`おみやげ ${s.id} の prefers は文字列の配列`);
    if (planets.has(s.planet)) throw new Error(`星 ${s.planet} のおみやげが 2 つある`);
    planets.add(s.planet);
  }
  return raw as SouvenirRules;
}

/** 保存から読んだおみやげの記録を確かめる。壊れた記録と、定義にないおみやげは捨てる */
export function parseSouvenirs(data: unknown, rules: SouvenirRules): PlacedSouvenir[] {
  if (!Array.isArray(data)) return [];
  const known = new Set(rules.souvenirs.map((s) => s.id));
  const slots = new Set(rules.slots.map((s) => s.id));
  const seen = new Set<string>();
  const result: PlacedSouvenir[] = [];
  for (const raw of data) {
    const p = raw as Partial<PlacedSouvenir> | null;
    if (typeof p?.id !== 'string' || !known.has(p.id) || seen.has(p.id)) continue;
    if (typeof p.at !== 'number' || !Number.isFinite(p.at)) continue;
    const slot = typeof p.slot === 'string' && slots.has(p.slot) ? p.slot : null;
    seen.add(p.id);
    result.push({ id: p.id, slot, at: p.at });
  }
  return result;
}

/**
 * ミラが置き場所を決める。空いている置き場所のうち、おみやげの prefers と tags がいちばん多く重なるところ
 * （同じなら定義の順で先のもの）。空きがなければ null。
 */
export function chooseSlot(souvenir: SouvenirDef, rules: SouvenirRules, placed: readonly PlacedSouvenir[]): SlotDef | null {
  const taken = new Set(placed.map((p) => p.slot));
  let best: SlotDef | null = null;
  let bestScore = -1;
  for (const slot of rules.slots) {
    if (taken.has(slot.id)) continue;
    const score = slot.tags.filter((tag) => souvenir.prefers.includes(tag)).length;
    if (score > bestScore) {
      best = slot;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 星 planet を出るときに、その星のおみやげをまだ持っていなければ持ち帰り、置き場所を決めて placed に足す。
 * 持ち帰ったらそのおみやげと置き場所を返す（おみやげがない星や、もう持っている星なら null）。
 */
export function collectSouvenir(
  planet: string,
  rules: SouvenirRules,
  placed: PlacedSouvenir[],
  nowMs: number,
): { souvenir: SouvenirDef; slot: SlotDef | null } | null {
  const souvenir = rules.souvenirs.find((s) => s.planet === planet);
  if (!souvenir || placed.some((p) => p.id === souvenir.id)) return null;
  const slot = chooseSlot(souvenir, rules, placed);
  placed.push({ id: souvenir.id, slot: slot?.id ?? null, at: nowMs });
  return { souvenir, slot };
}
