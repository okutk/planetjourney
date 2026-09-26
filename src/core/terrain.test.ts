import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Terrain } from './terrain';

describe('Terrain', () => {
  it('海面を指定すると、海は基準の半径で平らになり、陸だけが盛り上がる', () => {
    const land = new Terrain({ radius: 6, amplitude: 1, frequency: 1.1, octaves: 3, seed: 21 });
    const sea = new Terrain({ radius: 6, amplitude: 1, frequency: 1.1, octaves: 3, seed: 21, seaLevel: 0.12 });
    const direction = new Vector3();
    let seaCount = 0;
    for (let i = 0; i < 500; i++) {
      direction.set(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 0.3)).normalize();
      const height = sea.radiusAt(direction) - 6;
      expect(height).toBeGreaterThanOrEqual(0);
      if (sea.isLand(direction)) {
        expect(height).toBeGreaterThan(0);
        expect(height).toBeLessThan(land.radiusAt(direction) - 6);
      } else {
        expect(height).toBe(0);
        seaCount += 1;
      }
    }
    expect(seaCount).toBeGreaterThan(0);
    expect(land.isLand(direction)).toBe(true); // 海のない星はどこでも陸
  });
});
