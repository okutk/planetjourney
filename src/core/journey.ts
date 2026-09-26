/** いまいる場所。船の部屋か、どれかの星。 */
export type Place = 'ship' | 'planet';

/**
 * 旅の状態。いま船にいるか星にいるかと、それぞれの星に何回降りたかを数える。
 * 描画や DOM には依存しない。あとでセーブデータの元になる。
 */
export class Journey {
  place: Place = 'ship';
  /** いまいる星（船にいるときは、最後に降りた星。まだどこにも降りていなければ null） */
  planet: string | null = null;
  private readonly landings = new Map<string, number>();

  /** 星に降りる。その星に降りた回数（初めてなら 1）を返す。 */
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

  /** その星に降りた回数。 */
  visits(planet: string): number {
    return this.landings.get(planet) ?? 0;
  }
}
