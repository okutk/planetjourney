import { GIMMICK_KINDS, type GimmickDef, type GimmickKind } from './gimmick';
import type { TerrainConfig } from './terrain';

/** 調べられる物から、この距離まで近づくとボタンが出る */
export const ACTION_RADIUS = 1.4;
/**
 * 着陸ポッドを出現位置の後ろに置く角度（ラジアン）。降りた瞬間に「船に戻る」が出ないよう、
 * ボタンの出る距離より確実に離す（半径 5 の星を基準にした角度なので、大きい星ではもう少し離れる）
 */
export const POD_ANGLE = (ACTION_RADIUS * 1.5) / 5;

export type PropKind = 'tree' | 'rock' | 'crystal';
const PROP_KINDS: readonly PropKind[] = ['tree', 'rock', 'crystal'];

/** 星に散らばる配置物（木・岩・結晶）の種類と数。 */
export interface PropConfig {
  kind: PropKind;
  count: number;
  color: string;
}

/** 星の見た目の設定（JSON に置く分。出現位置まわりの値はコードで足す）。 */
export interface PlanetLook {
  groundColor: string;
  /** 海のある星では、海の色。省略すると全体が陸 */
  seaColor?: string;
  props: PropConfig[];
  /** 配置物の並びを決める種 */
  seed: number;
}

/** 星図に載せる星の情報と、その星を作るための設定。 */
export interface PlanetInfo {
  id: string;
  name: string;
  /** ミラが最初から知っている「データ」。星図に出す 1 行 */
  data: string;
  /** false なら、星図に載るがまだ行けない */
  available: boolean;
  terrain: TerrainConfig;
  look: PlanetLook;
  /** 出現位置（星の中心から見た方向。長さは 1 でなくてよい）。海のある星では陸を指すこと */
  spawn: [number, number, number];
  /** ミラに頼んで解く仕掛け */
  gimmicks: GimmickDef[];
}

const KEYS = new Set(['id', 'name', 'data', 'available', 'terrain', 'look', 'spawn', 'gimmicks']);
const GIMMICK_KEYS = new Set(['id', 'kind', 'name', 'direction']);
const TERRAIN_KEYS = new Set(['radius', 'amplitude', 'frequency', 'octaves', 'seed', 'seaLevel']);
const LOOK_KEYS = new Set(['groundColor', 'seaColor', 'props', 'seed']);
const COLOR = /^#[0-9a-f]{6}$/i;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

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
    checkKeys(planet, KEYS, where);
    if (typeof planet?.id !== 'string' || planet.id === '') throw new Error(`${where}: id がない`);
    if (ids.has(planet.id)) throw new Error(`${where}: id が重複している`);
    ids.add(planet.id);
    if (typeof planet.name !== 'string' || planet.name === '') throw new Error(`${where}: name がない`);
    if (typeof planet.data !== 'string' || planet.data === '') throw new Error(`${where}: data がない`);
    if (typeof planet.available !== 'boolean') throw new Error(`${where}: available は真偽`);

    const terrain = planet.terrain as Partial<TerrainConfig> | undefined;
    checkKeys(terrain, TERRAIN_KEYS, `${where} の terrain`);
    for (const key of ['radius', 'amplitude', 'frequency', 'octaves', 'seed'] as const) {
      if (!isNumber(terrain?.[key])) throw new Error(`${where}: terrain.${key} は数`);
    }
    if (terrain!.radius! <= 0) throw new Error(`${where}: terrain.radius は正の数`);
    if (terrain!.seaLevel !== undefined && !isNumber(terrain!.seaLevel)) {
      throw new Error(`${where}: terrain.seaLevel は数`);
    }

    const look = planet.look as Partial<PlanetLook> | undefined;
    checkKeys(look, LOOK_KEYS, `${where} の look`);
    if (typeof look?.groundColor !== 'string' || !COLOR.test(look.groundColor)) {
      throw new Error(`${where}: look.groundColor は #rrggbb`);
    }
    if (look.seaColor !== undefined && !COLOR.test(look.seaColor)) throw new Error(`${where}: look.seaColor は #rrggbb`);
    if ((look.seaColor === undefined) !== (terrain!.seaLevel === undefined)) {
      throw new Error(`${where}: 海のある星は terrain.seaLevel と look.seaColor の両方を書く`);
    }
    if (!isNumber(look.seed)) throw new Error(`${where}: look.seed は数`);
    if (!Array.isArray(look.props)) throw new Error(`${where}: look.props は配列`);
    for (const prop of look.props as Partial<PropConfig>[]) {
      if (!PROP_KINDS.includes(prop?.kind as PropKind)) throw new Error(`${where}: 知らない配置物 ${String(prop?.kind)}`);
      if (!isNumber(prop.count) || prop.count < 0) throw new Error(`${where}: ${prop.kind} の count は 0 以上の数`);
      if (typeof prop.color !== 'string' || !COLOR.test(prop.color)) throw new Error(`${where}: ${prop.kind} の color は #rrggbb`);
    }

    if (!isDirection(planet.spawn)) throw new Error(`${where}: spawn は長さ 0 でない [x, y, z]`);

    if (!Array.isArray(planet.gimmicks)) throw new Error(`${where}: gimmicks は配列`);
    const gimmickIds = new Set<string>();
    for (const gimmick of planet.gimmicks as Partial<GimmickDef>[]) {
      const gw = `${where} の仕掛け ${String(gimmick?.id)}`;
      checkKeys(gimmick, GIMMICK_KEYS, gw);
      if (typeof gimmick.id !== 'string' || gimmick.id === '') throw new Error(`${gw}: id がない`);
      if (gimmickIds.has(gimmick.id)) throw new Error(`${gw}: id が重複している`);
      gimmickIds.add(gimmick.id);
      if (!GIMMICK_KINDS.includes(gimmick.kind as GimmickKind)) throw new Error(`${gw}: 知らない種類 ${String(gimmick.kind)}`);
      if (typeof gimmick.name !== 'string' || gimmick.name === '') throw new Error(`${gw}: name がない`);
      if (!isDirection(gimmick.direction)) throw new Error(`${gw}: direction は長さ 0 でない [x, y, z]`);
    }
    return planet as PlanetInfo;
  });
  if (!planets.some((planet) => planet.available)) throw new Error('行ける星が 1 つもない');
  return planets;
}

function isDirection(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isNumber) && Math.hypot(...(value as number[])) > 0;
}

function checkKeys(object: object | undefined, allowed: Set<string>, where: string): void {
  if (object === undefined || object === null || typeof object !== 'object') throw new Error(`${where} がない`);
  // キーの打ち間違いは、指定が黙って効かなくなるので例外にする
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${where}: 知らないキー ${key}`);
  }
}
