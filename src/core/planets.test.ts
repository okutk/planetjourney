import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import planetsData from '../data/planets.json';
import { parsePlanets } from './planets';
import { behindOn } from './sphere';
import { Terrain } from './terrain';

const POD_ANGLE = 0.42; // main.ts と同じ（ボタンの出る距離 × 1.5 ÷ 半径 5）
const HEADING = new Vector3(0, 0, 1);

describe('parsePlanets', () => {
  it('同梱の星の一覧は形が正しく、3 つの星に行ける', () => {
    const planets = parsePlanets(planetsData);
    expect(planets.map((planet) => planet.id)).toEqual(['origin', 'crystal', 'ocean']);
    expect(planets.every((planet) => planet.available)).toBe(true);
  });

  it('どの星も、出現位置と着陸ポッドの位置が陸の上にある', () => {
    for (const planet of parsePlanets(planetsData)) {
      const terrain = new Terrain(planet.terrain);
      const spawn = new Vector3(...planet.spawn).normalize();
      const pod = behindOn(spawn, HEADING, POD_ANGLE);
      expect(terrain.isLand(spawn), `${planet.id} の出現位置`).toBe(true);
      expect(terrain.isLand(pod), `${planet.id} のポッド`).toBe(true);
    }
  });

  it('id の重複・知らないキー・行ける星がない一覧・海の設定の片方だけは例外にする', () => {
    const base = {
      id: 'a',
      name: 'A',
      data: 'd',
      available: true,
      terrain: { radius: 5, amplitude: 0.5, frequency: 1, octaves: 2, seed: 1 },
      look: { groundColor: '#7fcf8a', props: [{ kind: 'tree', count: 3, color: '#2f7a4b' }], seed: 1 },
      spawn: [0, 1, 0],
    };
    expect(() => parsePlanets([base, { ...base }])).toThrow('重複');
    expect(() => parsePlanets([{ ...base, seed: 1 }])).toThrow('知らないキー');
    expect(() => parsePlanets([{ ...base, available: false }])).toThrow('行ける星');
    expect(() => parsePlanets([])).toThrow();
    expect(() => parsePlanets([{ ...base, name: '' }])).toThrow('name');
    expect(() => parsePlanets([{ ...base, terrain: { ...base.terrain, seaLevel: 0.1 } }])).toThrow('海のある星');
    expect(() => parsePlanets([{ ...base, look: { ...base.look, props: [{ kind: 'bush', count: 1, color: '#000000' }] } }])).toThrow(
      '知らない配置物',
    );
    expect(() => parsePlanets([{ ...base, look: { ...base.look, groundColor: 'green' } }])).toThrow('#rrggbb');
    expect(() => parsePlanets([{ ...base, spawn: [0, 0, 0] }])).toThrow('spawn');
  });
});
