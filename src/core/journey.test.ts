import { describe, expect, it } from 'vitest';
import { Journey } from './journey';

describe('Journey', () => {
  it('旅は船の部屋から始まり、まだどの星にも降りていない', () => {
    const journey = new Journey();
    expect(journey.place).toBe('ship');
    expect(journey.planet).toBeNull();
    expect(journey.visits('はじまりの星')).toBe(0);
  });

  it('星に降りるたびに回数を数え、船に戻っても最後の星を覚えている', () => {
    const journey = new Journey();
    expect(journey.land('はじまりの星')).toBe(1);
    expect(journey.place).toBe('planet');
    journey.board();
    expect(journey.place).toBe('ship');
    expect(journey.planet).toBe('はじまりの星');
    expect(journey.land('はじまりの星')).toBe(2);
    expect(journey.land('水晶の星')).toBe(1);
    expect(journey.visits('はじまりの星')).toBe(2);
  });
});
