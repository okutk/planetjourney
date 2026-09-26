import { canUpgrade, nextStageCost } from './projector';

/** いまいる場所。船の部屋か、どれかの星。 */
export type Place = 'ship' | 'planet';

/**
 * 旅の状態。いま船にいるか星にいるかと、それぞれの星に何回降りたかを数える。
 * 描画や DOM には依存しない。あとでセーブデータの元になる。
 */
export class Journey {
  place: Place = 'ship';
  /** いまいる星の id（船にいるときは、最後に降りた星。まだどこにも降りていなければ null） */
  planet: string | null = null;
  private readonly landings = new Map<string, number>();
  private readonly solved = new Set<string>();
  private readonly collected = new Set<string>();
  /** 手持ちの星のかけら（拾った数から、投影機に使った数を引いたもの） */
  fragments = 0;
  /** 投影機の段階（0 から。上がるほどミラは物に触れられる） */
  stage = 0;

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
    this.fragments += 1;
    return true;
  }

  /** 次の段階に上げるのに足りないかけらの数（上げられる段階がなければ null）。 */
  get fragmentsNeeded(): number | null {
    const cost = nextStageCost(this.stage);
    return cost === null ? null : Math.max(0, cost - this.fragments);
  }

  /** かけらを使って投影機の段階を 1 つ上げる。足りなければ何もせず false。 */
  upgradeProjector(): boolean {
    if (!canUpgrade(this.stage, this.fragments)) return false;
    this.fragments -= nextStageCost(this.stage)!;
    this.stage += 1;
    return true;
  }
}
