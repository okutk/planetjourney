import { describe, expect, it } from 'vitest';
import planetsData from '../data/planets.json';
import { parsePlanets } from './planets';

describe('parsePlanets', () => {
  it('同梱の星の一覧は形が正しく、最初の星に行ける', () => {
    const planets = parsePlanets(planetsData);
    expect(planets.length).toBeGreaterThanOrEqual(1);
    expect(planets[0]).toMatchObject({ id: 'origin', name: 'はじまりの星', available: true });
  });

  it('id の重複・知らないキー・行ける星がない一覧は例外にする', () => {
    const base = { id: 'a', name: 'A', data: 'd', available: true };
    expect(() => parsePlanets([base, { ...base }])).toThrow('重複');
    expect(() => parsePlanets([{ ...base, seed: 1 }])).toThrow('知らないキー');
    expect(() => parsePlanets([{ ...base, available: false }])).toThrow('行ける星');
    expect(() => parsePlanets([])).toThrow();
    expect(() => parsePlanets([{ ...base, name: '' }])).toThrow('name');
  });
});
