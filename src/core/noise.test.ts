import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRandom, fbm3, valueNoise3 } from './noise';
import { Terrain, scatterDirections } from './terrain';

describe('createRandom', () => {
  it('同じ種なら同じ列、違う種なら違う列になり、0〜1 に収まる', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const c = createRandom(7);
    const seqA = Array.from({ length: 100 }, a);
    expect(Array.from({ length: 100 }, b)).toEqual(seqA);
    expect(Array.from({ length: 100 }, c)).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('valueNoise3 / fbm3', () => {
  it('決定的で、-1〜1 に収まる', () => {
    const random = createRandom(1);
    for (let i = 0; i < 500; i++) {
      const [x, y, z] = [random() * 20 - 10, random() * 20 - 10, random() * 20 - 10];
      const v = valueNoise3(x, y, z, 3);
      expect(v).toBe(valueNoise3(x, y, z, 3));
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(fbm3(x, y, z, 4, 3))).toBeLessThanOrEqual(1);
    }
  });

  it('なめらかにつながる（近い点は近い値）', () => {
    const a = fbm3(0.5, 1.25, -2.1, 4, 9);
    const b = fbm3(0.5001, 1.25, -2.1, 4, 9);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it('場所によって値が変わる（平らではない）', () => {
    const values = new Set<number>();
    for (let i = 0; i < 20; i++) values.add(Math.round(valueNoise3(i * 0.37, i * 0.11, 0, 5) * 100));
    expect(values.size).toBeGreaterThan(5);
  });
});

describe('Terrain', () => {
  const terrain = new Terrain({ radius: 5, amplitude: 0.4, frequency: 2, octaves: 3, seed: 11 });

  it('地表の半径は radius ± amplitude に収まり、同じ方向なら同じ値', () => {
    const random = createRandom(2);
    const dir = new Vector3();
    for (let i = 0; i < 300; i++) {
      dir.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      const r = terrain.radiusAt(dir);
      expect(r).toBeGreaterThanOrEqual(4.6);
      expect(r).toBeLessThanOrEqual(5.4);
      expect(terrain.radiusAt(dir.clone())).toBe(r);
    }
  });
});

describe('scatterDirections', () => {
  it('単位ベクトルを count 個つくり、avoid の近くには置かない', () => {
    const avoid = new Vector3(0, 1, 0);
    const dirs = scatterDirections(200, createRandom(3), avoid, 0.5, () => new Vector3());
    expect(dirs).toHaveLength(200);
    for (const d of dirs) {
      expect(d.length()).toBeCloseTo(1);
      expect(d.angleTo(avoid)).toBeGreaterThan(0.5);
    }
  });

  it('条件に合う方向がない設定でも止まる', () => {
    const dirs = scatterDirections(5, createRandom(4), new Vector3(0, 1, 0), Math.PI, () => new Vector3());
    expect(dirs.length).toBeLessThan(5);
  });

  it('同じ種なら同じ配置になる', () => {
    const avoid = new Vector3(0, 1, 0);
    const a = scatterDirections(10, createRandom(8), avoid, 0.3, () => new Vector3());
    const b = scatterDirections(10, createRandom(8), avoid, 0.3, () => new Vector3());
    expect(a.map((d) => d.toArray())).toEqual(b.map((d) => d.toArray()));
  });
});
