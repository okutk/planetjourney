import { describe, expect, it } from 'vitest';
import { canUpgrade, MAX_FRAGMENT_STAGE, nextStageCost, STAGE_COSTS } from './projector';

describe('projector', () => {
  it('段階ごとの費用を返し、かけらで上げられる最大の段階より上は null', () => {
    expect(STAGE_COSTS.length).toBe(MAX_FRAGMENT_STAGE);
    expect(nextStageCost(0)).toBe(STAGE_COSTS[0]);
    expect(nextStageCost(MAX_FRAGMENT_STAGE - 1)).toBe(STAGE_COSTS[MAX_FRAGMENT_STAGE - 1]);
    expect(nextStageCost(MAX_FRAGMENT_STAGE)).toBeNull();
    expect(nextStageCost(-1)).toBeNull();
  });

  it('費用ぶんのかけらがあるときだけ上げられる', () => {
    expect(canUpgrade(0, STAGE_COSTS[0] - 1)).toBe(false);
    expect(canUpgrade(0, STAGE_COSTS[0])).toBe(true);
    expect(canUpgrade(MAX_FRAGMENT_STAGE, 100)).toBe(false);
  });
});
