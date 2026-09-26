/**
 * 星のかけらで投影機を強化する段階（GDD「ミラの体」の「硬い光」）。描画や DOM には依存しない。
 * 段階 1〜3 はかけらで進む。段階 4 は機械の廃墟星の物語でしか進まないので、ここでは扱わない。
 */

/** かけらで上げられる最大の段階 */
export const MAX_FRAGMENT_STAGE = 3;
/** 段階 1・2・3 に上げるのに必要なかけらの数 */
export const STAGE_COSTS: readonly number[] = [2, 3, 4];

/** いまの段階から次の段階に上げるのに必要なかけらの数。かけらでは上げられない段階なら null。 */
export function nextStageCost(stage: number): number | null {
  return stage >= 0 && stage < MAX_FRAGMENT_STAGE ? STAGE_COSTS[stage] : null;
}

/** いまの段階と手持ちのかけらで、次の段階に上げられるか。 */
export function canUpgrade(stage: number, fragments: number): boolean {
  const cost = nextStageCost(stage);
  return cost !== null && fragments >= cost;
}
