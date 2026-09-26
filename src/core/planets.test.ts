import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import planetsData from '../data/planets.json';
import { parsePlanets, POD_ANGLE } from './planets';
import { behindOn } from './sphere';
import { Terrain } from './terrain';

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

  it('どの星にも仕掛けがあり、陸の上で、出現位置から離れている', () => {
    for (const planet of parsePlanets(planetsData)) {
      const terrain = new Terrain(planet.terrain);
      const spawn = new Vector3(...planet.spawn).normalize();
      expect(planet.gimmicks.length, planet.id).toBeGreaterThanOrEqual(1);
      for (const gimmick of planet.gimmicks) {
        const direction = new Vector3(...gimmick.direction).normalize();
        expect(terrain.isLand(direction), `${planet.id} の ${gimmick.id}`).toBe(true);
        expect(direction.angleTo(spawn), `${planet.id} の ${gimmick.id} は出現位置から離す`).toBeGreaterThan(POD_ANGLE + 0.3);
      }
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
      gimmicks: [{ id: 'g', kind: 'light', name: 'G', direction: [1, 0, 0] }],
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
    expect(() => parsePlanets([{ ...base, gimmicks: [{ ...base.gimmicks[0], kind: 'push' }] }])).toThrow('知らない種類');
    expect(() => parsePlanets([{ ...base, gimmicks: [base.gimmicks[0], base.gimmicks[0]] }])).toThrow('重複');
  });
});
