import { describe, expect, it } from 'vitest';
import { nextPlayLog, parsePlayLog, timeOfDay, visitFacts, writeClockFacts } from './clock';
import type { FactValue } from './dialogue';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 12);

describe('timeOfDay', () => {
  it('時の区切りどおりに時間帯を返す', () => {
    const expected = [
      [0, 'lateNight'],
      [4, 'lateNight'],
      [5, 'morning'],
      [10, 'morning'],
      [11, 'day'],
      [16, 'day'],
      [17, 'evening'],
      [20, 'evening'],
      [21, 'night'],
      [23, 'night'],
    ] as const;
    for (const [hour, name] of expected) expect(timeOfDay(hour), `${hour} 時`).toBe(name);
  });

  it('時計の事実を書き込む', () => {
    const facts: Record<string, FactValue> = {};
    writeClockFacts(2, facts);
    expect(facts).toEqual({ hour: 2, timeOfDay: 'lateNight' });
  });
});

describe('前回のプレイの記録', () => {
  it('壊れた記録は null（初めての起動）として扱う', () => {
    expect(parsePlayLog(null)).toBeNull();
    expect(parsePlayLog('abc')).toBeNull();
    expect(parsePlayLog({})).toBeNull();
    expect(parsePlayLog({ lastPlayedAt: 'x' })).toBeNull();
    expect(parsePlayLog({ lastPlayedAt: Number.NaN })).toBeNull();
    expect(parsePlayLog({ lastPlayedAt: -1 })).toBeNull();
    expect(parsePlayLog(JSON.parse(JSON.stringify({ lastPlayedAt: T0 })))).toEqual({ lastPlayedAt: T0 });
  });

  it('初めての起動では何も入れず、前回があれば何日ぶりかを 24 時間単位で入れる', () => {
    expect(visitFacts(null, T0)).toEqual({});
    const log = { lastPlayedAt: T0 };
    expect(visitFacts(log, T0 + 1000)).toEqual({ playedBefore: true, daysAway: 0 });
    expect(visitFacts(log, T0 + DAY - 1)).toEqual({ playedBefore: true, daysAway: 0 });
    expect(visitFacts(log, T0 + DAY)).toEqual({ playedBefore: true, daysAway: 1 });
    expect(visitFacts(log, T0 + 32 * DAY + 5000)).toEqual({ playedBefore: true, daysAway: 32 });
  });

  it('時計が前回より過去に戻っていたら、何日ぶりかを入れない', () => {
    expect(visitFacts({ lastPlayedAt: T0 }, T0 - 3 * DAY)).toEqual({ playedBefore: true, clockRewound: true });
  });

  it('次に保存する時刻は、時計が戻っていても前回より戻さない（直したあとに「久しぶり」と勘違いしない）', () => {
    expect(nextPlayLog(null, T0)).toEqual({ lastPlayedAt: T0 });
    expect(nextPlayLog({ lastPlayedAt: T0 }, T0 + 5000)).toEqual({ lastPlayedAt: T0 + 5000 });
    const rewound = nextPlayLog({ lastPlayedAt: T0 }, T0 - 30 * DAY);
    expect(rewound).toEqual({ lastPlayedAt: T0 });
    // 時計を直して翌日に遊んでも、戻す前の時刻から数えるので 1 日ぶり
    expect(visitFacts(rewound, T0 + DAY).daysAway).toBe(1);
  });
});
