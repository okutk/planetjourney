import { describe, expect, it } from 'vitest';
import { Journey, parseJourneySave } from './journey';
import { MAX_FRAGMENT_STAGE, STAGE_COSTS } from './projector';

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

  it('かけらは仕掛けごとに一度だけ拾え、費用ぶん集めると投影機の段階が上がる', () => {
    const journey = new Journey();
    expect(journey.fragmentsNeeded).toBe(STAGE_COSTS[0]);
    expect(journey.upgradeProjector()).toBe(false);
    expect(journey.collectFragment('origin', 'lantern')).toBe(true);
    expect(journey.collectFragment('origin', 'lantern')).toBe(false);
    expect(journey.isCollected('origin', 'lantern')).toBe(true);
    expect(journey.fragments).toBe(1);
    expect(journey.collectedCount).toBe(1);
    expect(journey.nextCost).toBe(STAGE_COSTS[0]);
    for (let i = 1; i < STAGE_COSTS[0]; i++) journey.collectFragment('origin', `g${i}`);
    expect(journey.fragmentsNeeded).toBe(0);
    expect(journey.upgradeProjector()).toBe(true);
    expect(journey.stage).toBe(1);
    expect(journey.fragments).toBe(0);
    expect(journey.collectedCount).toBe(STAGE_COSTS[0]); // 通算は減らない
    expect(journey.fragmentsNeeded).toBe(STAGE_COSTS[1]);
    // 最大の段階まで上げると、それ以上は上げられない
    let n = 0;
    while (journey.stage < MAX_FRAGMENT_STAGE) {
      journey.collectFragment('x', `f${n++}`);
      journey.upgradeProjector();
    }
    expect(journey.fragmentsNeeded).toBeNull();
    expect(journey.nextCost).toBeNull();
    journey.collectFragment('x', 'extra');
    expect(journey.upgradeProjector()).toBe(false);
  });

  it('保存した値を JSON を通して戻すと、同じ旅になる（手持ちのかけらも求め直す）', () => {
    const journey = new Journey();
    journey.land('origin');
    journey.land('crystal');
    journey.board();
    journey.solve('origin', 'lantern');
    journey.solve('crystal', 'stone');
    journey.collectFragment('origin', 'lantern');
    journey.collectFragment('crystal', 'stone');
    journey.upgradeProjector();
    journey.collectFragment('crystal', 'gap');

    const save = parseJourneySave(JSON.parse(JSON.stringify(journey.snapshot())));
    expect(save).not.toBeNull();
    const restored = new Journey();
    restored.restore(save!);
    expect(restored.place).toBe('ship');
    expect(restored.planet).toBe('crystal');
    expect(restored.visits('origin')).toBe(1);
    expect(restored.visits('crystal')).toBe(1);
    expect(restored.isSolved('origin', 'lantern')).toBe(true);
    expect(restored.isSolved('origin', 'stone')).toBe(false);
    expect(restored.isCollected('crystal', 'gap')).toBe(true);
    expect(restored.collectedCount).toBe(3);
    expect(restored.stage).toBe(1);
    expect(restored.fragments).toBe(3 - STAGE_COSTS[0]);
    expect(restored.snapshot()).toEqual(journey.snapshot());
  });

  it('壊れた保存は受け付けない', () => {
    const good = new Journey();
    good.land('origin');
    const base = good.snapshot();
    expect(parseJourneySave(base)).toEqual(base);
    expect(parseJourneySave(null)).toBeNull();
    expect(parseJourneySave('x')).toBeNull();
    expect(parseJourneySave({ ...base, place: 'moon' })).toBeNull();
    expect(parseJourneySave({ ...base, place: 'planet', planet: null })).toBeNull();
    expect(parseJourneySave({ ...base, landings: { origin: 0 } })).toBeNull();
    expect(parseJourneySave({ ...base, landings: { origin: 1.5 } })).toBeNull();
    expect(parseJourneySave({ ...base, landings: [] })).toBeNull();
    expect(parseJourneySave({ ...base, solved: ['lantern'] })).toBeNull();
    expect(parseJourneySave({ ...base, collected: [1] })).toBeNull();
    expect(parseJourneySave({ ...base, stage: -1 })).toBeNull();
    expect(parseJourneySave({ ...base, stage: MAX_FRAGMENT_STAGE + 1 })).toBeNull();
    // 拾ったかけらが段階に使った数より少ないと、手持ちが負になる
    expect(parseJourneySave({ ...base, stage: 1, collected: ['origin/lantern'] })).toBeNull();
    // 重なった id はひとつにまとめる
    const doubled = parseJourneySave({ ...base, solved: ['origin/lantern', 'origin/lantern'] });
    expect(doubled?.solved).toEqual(['origin/lantern']);
  });
});
