import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTION_CONFIG, Projector, projectionNoise } from './projection';

const DT = 1 / 60;
const { range, noiseFrom, outsideGrace, fadeDuration } = DEFAULT_PROJECTION_CONFIG;

/** distance の場所にミラを置いたまま seconds 秒進め、映し直しが起きた回数を返す。 */
function run(projector: Projector, distance: number, seconds: number): number {
  let count = 0;
  for (let t = 0; t < seconds; t += DT) if (projector.update(distance, DT)) count += 1;
  return count;
}

describe('projectionNoise', () => {
  it('範囲の内側ではノイズがなく、端に近づくほど強くなり、範囲で最大になる', () => {
    expect(projectionNoise(0, DEFAULT_PROJECTION_CONFIG)).toBe(0);
    expect(projectionNoise(noiseFrom, DEFAULT_PROJECTION_CONFIG)).toBe(0);
    expect(projectionNoise((noiseFrom + range) / 2, DEFAULT_PROJECTION_CONFIG)).toBeCloseTo(0.5);
    expect(projectionNoise(range, DEFAULT_PROJECTION_CONFIG)).toBe(1);
    expect(projectionNoise(range * 3, DEFAULT_PROJECTION_CONFIG)).toBe(1);
  });

  it('noiseFrom が range 以上の設定でも NaN にならず、範囲の内外で 0 か 1 になる', () => {
    const config = { ...DEFAULT_PROJECTION_CONFIG, noiseFrom: range };
    expect(projectionNoise(range - 0.1, config)).toBe(0);
    expect(projectionNoise(range, config)).toBe(1);
    expect(projectionNoise(range + 1, { ...config, noiseFrom: range + 2 })).toBe(1);
  });
});

describe('Projector', () => {
  it('範囲の中にいるあいだは、映し直さず普通に見える', () => {
    const projector = new Projector();
    expect(run(projector, range * 0.5, 10)).toBe(0);
    expect(projector.visibility).toBe(1);
    expect(projector.noise).toBe(0);
    expect(projector.reprojecting).toBe(false);
  });

  it('一瞬はみ出しただけでは消えない', () => {
    const projector = new Projector();
    expect(run(projector, range + 1, outsideGrace * 0.5)).toBe(0);
    expect(run(projector, range * 0.5, 1)).toBe(0);
    expect(projector.reprojecting).toBe(false);
  });

  it('範囲の外に居続けると、消えてから 1 回だけ映し直し、また現れる', () => {
    const projector = new Projector();
    // 猶予のあいだはノイズ最大のまま見えている
    expect(run(projector, range + 1, outsideGrace + DT)).toBe(0);
    expect(projector.reprojecting).toBe(true);
    expect(projector.noise).toBe(1);
    // 消え切ったときに 1 回だけ true
    const seen: number[] = [];
    let count = 0;
    for (let t = 0; t < fadeDuration + DT * 2; t += DT) {
      if (projector.update(range + 1, DT)) count += 1;
      seen.push(projector.visibility);
    }
    expect(count).toBe(1);
    expect(Math.min(...seen)).toBe(0);
    // 置き直されて距離が縮まったあと、現れ切ると普通の状態に戻る
    expect(run(projector, 1, fadeDuration + DT * 2)).toBe(0);
    expect(projector.visibility).toBe(1);
    expect(projector.noise).toBe(0);
    expect(projector.reprojecting).toBe(false);
    // 範囲の外に居続けなければ、それきり映し直さない
    expect(run(projector, 1, 5)).toBe(0);
  });

  it('reset() で最初の状態に戻る', () => {
    const projector = new Projector();
    run(projector, range + 1, outsideGrace + fadeDuration / 2);
    expect(projector.reprojecting).toBe(true);
    projector.reset();
    expect(projector.visibility).toBe(1);
    expect(projector.noise).toBe(0);
    expect(projector.reprojecting).toBe(false);
    expect(run(projector, range + 1, outsideGrace * 0.5)).toBe(0);
  });
});
