import { describe, expect, it } from 'vitest';
import { Journey } from './journey';

describe('Journey', () => {
  it('旅は船の部屋から始まり、まだどの星にも降りていない', () => {
    const journey = new Journey();
    expect(journey.place).toBe('ship');
    expect(journey.planet).toBeNull();
    expect(journey.visits('origin')).toBe(0);
  });

  it('星に降りるたびに回数を数え、船に戻っても最後の星を覚えている', () => {
    const journey = new Journey();
    expect(journey.land('origin')).toBe(1);
    expect(journey.place).toBe('planet');
    journey.board();
    expect(journey.place).toBe('ship');
    expect(journey.planet).toBe('origin');
    expect(journey.land('origin')).toBe(2);
    expect(journey.land('crystal')).toBe(1);
    expect(journey.visits('origin')).toBe(2);
  });

  it('解いた仕掛けを星ごとに覚え、同じ仕掛けは二重に数えない', () => {
    const journey = new Journey();
    expect(journey.isSolved('origin', 'lantern')).toBe(false);
    journey.solve('origin', 'lantern');
    journey.solve('origin', 'lantern');
    journey.solve('crystal', 'lantern');
    expect(journey.isSolved('origin', 'lantern')).toBe(true);
    expect(journey.isSolved('origin', 'stone')).toBe(false);
    expect(journey.solvedCount).toBe(2);
  });
});
