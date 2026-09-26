import { canUpgrade, MAX_FRAGMENT_STAGE, nextStageCost, spentFragments } from './projector';

/** いまいる場所。船の部屋か、どれかの星。 */
export type Place = 'ship' | 'planet';

/**
 * 旅の保存の形（JSON にそのまま書けるプレーンなオブジェクト）。
 * 手持ちのかけらは保存せず、拾った数と段階から求める（食い違った保存を作らないため）。
 */
export interface JourneySave {
  place: Place;
  planet: string | null;
  /** 星の id → 降りた回数 */
  landings: Record<string, number>;
  /** 解いた仕掛け（"星の id/仕掛けの id"） */
  solved: string[];
  /** かけらを拾った仕掛け（"星の id/仕掛けの id"） */
  collected: string[];
  stage: number;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isKeyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((key) => typeof key === 'string' && key.includes('/'));
}

/**
 * 保存から読んだ値を確かめて返す。形がおかしければ null（旅を初めからにする）。
 * 段階に使った数より拾ったかけらが少ない保存は、手持ちが負になるので受け付けない。
 */
export function parseJourneySave(data: unknown): JourneySave | null {
  if (typeof data !== 'object' || data === null) return null;
  const { place, planet, landings, solved, collected, stage } = data as Record<string, unknown>;
  if (place !== 'ship' && place !== 'planet') return null;
  if (planet !== null && typeof planet !== 'string') return null;
  if (place === 'planet' && planet === null) return null;
  if (typeof landings !== 'object' || landings === null || Array.isArray(landings)) return null;
  const counts = Object.entries(landings as Record<string, unknown>);
  if (!counts.every(([, count]) => isCount(count) && count > 0)) return null;
  if (!isKeyList(solved) || !isKeyList(collected)) return null;
  // 段階の上限はかけらで上げられる最大。段階 4（機械の廃墟星の物語）を足すときは、ここの上限も上げること
  if (!isCount(stage) || stage > MAX_FRAGMENT_STAGE) return null;
  if (new Set(collected).size < spentFragments(stage)) return null;
  return {
    place,
    planet,
    landings: Object.fromEntries(counts) as Record<string, number>,
    solved: [...new Set(solved)],
    collected: [...new Set(collected)],
    stage,
  };
}

/**
 * 旅の状態。いま船にいるか星にいるかと、それぞれの星に何回降りたかを数える。
 * 描画や DOM には依存しない。セーブデータの元（snapshot() / restore()）。
 */
export class Journey {
  place: Place = 'ship';
  /** いまいる星の id（船にいるときは、最後に降りた星。まだどこにも降りていなければ null） */
  planet: string | null = null;
  private readonly landings = new Map<string, number>();
  private readonly solved = new Set<string>();
  private readonly collected = new Set<string>();
  private _fragments = 0;
  private _stage = 0;

  /** 手持ちの星のかけら（拾った数から、投影機に使った数を引いたもの）。減るのは upgradeProjector() だけ */
  get fragments(): number {
    return this._fragments;
  }

  /** 投影機の段階（0 から。上がるほどミラは物に触れられる）。上がるのは upgradeProjector() だけ */
  get stage(): number {
    return this._stage;
  }

  /** 星（id）に降りる。その星に降りた回数（初めてなら 1）を返す。 */
  land(planet: string): number {
    const count = this.visits(planet) + 1;
    this.landings.set(planet, count);
    this.place = 'planet';
    this.planet = planet;
    return count;
  }

  /** 船の部屋に戻る。 */
  board(): void {
    this.place = 'ship';
  }

  /** その星（id）に降りた回数。 */
  visits(planet: string): number {
    return this.landings.get(planet) ?? 0;
  }

  /** 星の仕掛けを解いたことを記録する。 */
  solve(planet: string, gimmick: string): void {
    this.solved.add(`${planet}/${gimmick}`);
  }

  /** その仕掛けを解いたことがあるか。 */
  isSolved(planet: string, gimmick: string): boolean {
    return this.solved.has(`${planet}/${gimmick}`);
  }

  /** 解いた仕掛けの数。 */
  get solvedCount(): number {
    return this.solved.size;
  }

  /** その仕掛けのかけらを拾ったことがあるか。 */
  isCollected(planet: string, gimmick: string): boolean {
    return this.collected.has(`${planet}/${gimmick}`);
  }

  /** 仕掛けのかけらを拾う。すでに拾っていれば何もせず false。 */
  collectFragment(planet: string, gimmick: string): boolean {
    const key = `${planet}/${gimmick}`;
    if (this.collected.has(key)) return false;
    this.collected.add(key);
    this._fragments += 1;
    return true;
  }

  /** 拾ったかけらの通算（使った分を含む）。 */
  get collectedCount(): number {
    return this.collected.size;
  }

  /** 次の段階に上げるのに必要なかけらの数（上げられる段階がなければ null）。 */
  get nextCost(): number | null {
    return nextStageCost(this.stage);
  }

  /** 次の段階に上げるのに足りないかけらの数（上げられる段階がなければ null）。 */
  get fragmentsNeeded(): number | null {
    const cost = nextStageCost(this.stage);
    return cost === null ? null : Math.max(0, cost - this.fragments);
  }

  /** 保存用の値（コピー）。parseJourneySave() で確かめてから restore() で戻せる */
  snapshot(): JourneySave {
    return {
      place: this.place,
      planet: this.planet,
      landings: Object.fromEntries(this.landings),
      solved: [...this.solved],
      collected: [...this.collected],
      stage: this._stage,
    };
  }

  /** 確かめた保存の値で旅を置き換える。手持ちのかけらは、拾った数から段階に使った数を引いて求める */
  restore(save: JourneySave): void {
    this.place = save.place;
    this.planet = save.planet;
    this.landings.clear();
    for (const [planet, count] of Object.entries(save.landings)) this.landings.set(planet, count);
    this.solved.clear();
    for (const key of save.solved) this.solved.add(key);
    this.collected.clear();
    for (const key of save.collected) this.collected.add(key);
    this._stage = save.stage;
    this._fragments = this.collected.size - spentFragments(save.stage);
  }

  /** かけらを使って投影機の段階を 1 つ上げる。足りなければ何もせず false。 */
  upgradeProjector(): boolean {
    if (!canUpgrade(this._stage, this._fragments)) return false;
    this._fragments -= nextStageCost(this._stage)!;
    this._stage += 1;
    return true;
  }
}
