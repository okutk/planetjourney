/** 種（seed）から決まる疑似乱数（mulberry32）。0 以上 1 未満を返す関数を作る。 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 格子点 (x, y, z) の値（-1〜1）。seed ごとに決まり、同じ入力なら必ず同じ値になる。 */
function lattice(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 3 次元のバリューノイズ（-1〜1）。なめらかにつながる。 */
export function valueNoise3(x: number, y: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  // 8 つの格子点の値を補間する（毎フレーム呼ばれるので、クロージャなどは作らない）
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  return lerp(
    lerp(
      lerp(lattice(x0, y0, z0, seed), lattice(x1, y0, z0, seed), tx),
      lerp(lattice(x0, y1, z0, seed), lattice(x1, y1, z0, seed), tx),
      ty,
    ),
    lerp(
      lerp(lattice(x0, y0, z1, seed), lattice(x1, y0, z1, seed), tx),
      lerp(lattice(x0, y1, z1, seed), lattice(x1, y1, z1, seed), tx),
      ty,
    ),
    tz,
  );
}

/** 周波数を倍々にしたノイズを重ねたもの（fBm）。-1〜1 に収まるよう正規化する。 */
export function fbm3(x: number, y: number, z: number, octaves: number, seed = 0): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}
