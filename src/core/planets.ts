/** 星図に載せる星の情報。地形や配置は別（星を増やすときに足す）。 */
export interface PlanetInfo {
  id: string;
  name: string;
  /** ミラが最初から知っている「データ」。星図に出す 1 行 */
  data: string;
  /** false なら、星図に載るがまだ行けない */
  available: boolean;
}

const KEYS = new Set(['id', 'name', 'data', 'available']);

/**
 * JSON から読み込んだ星の一覧の形を確かめて返す。おかしなところがあれば、どの星かが分かる例外を投げる
 * （星を書き足したときのミスをテストで見つけるため）。
 */
export function parsePlanets(raw: unknown): PlanetInfo[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('星の一覧は 1 つ以上の配列で書く');
  const ids = new Set<string>();
  const planets = raw.map((item, index) => {
    const planet = item as Partial<PlanetInfo>;
    const where = `星 ${index}（${String(planet?.id)}）`;
    for (const key of Object.keys(planet ?? {})) {
      if (!KEYS.has(key)) throw new Error(`${where}: 知らないキー ${key}`);
    }
    if (typeof planet?.id !== 'string' || planet.id === '') throw new Error(`${where}: id がない`);
    if (ids.has(planet.id)) throw new Error(`${where}: id が重複している`);
    ids.add(planet.id);
    if (typeof planet.name !== 'string' || planet.name === '') throw new Error(`${where}: name がない`);
    if (typeof planet.data !== 'string' || planet.data === '') throw new Error(`${where}: data がない`);
    if (typeof planet.available !== 'boolean') throw new Error(`${where}: available は真偽`);
    return planet as PlanetInfo;
  });
  if (!planets.some((planet) => planet.available)) throw new Error('行ける星が 1 つもない');
  return planets;
}
