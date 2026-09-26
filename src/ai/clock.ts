import type { FactValue } from './dialogue';

/**
 * 現実の時刻への反応。端末の時計と、前回のプレイ日時から、会話の事実（「深夜」「N 日ぶり」など）を作る。
 * 時刻は外から数（時・ミリ秒）で渡し、Date の取得や保存はしない（テストで決められるように）。描画や DOM には依存しない。
 */

/** 時間帯。lateNight は 0〜4 時、morning は 5〜10 時、day は 11〜16 時、evening は 17〜20 時、night は 21〜23 時 */
export type TimeOfDay = 'lateNight' | 'morning' | 'day' | 'evening' | 'night';

/** 端末の時計の「時」（0〜23）から時間帯を決める */
export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 5) return 'lateNight';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  if (hour < 21) return 'evening';
  return 'night';
}

/** 時計の事実（hour・timeOfDay）を facts に書く */
export function writeClockFacts(hour: number, facts: Record<string, FactValue>): void {
  facts.hour = hour;
  facts.timeOfDay = timeOfDay(hour);
}

/** 前回のプレイの記録。保存用のプレーンなオブジェクト（ミリ秒の時刻） */
export interface PlayLog {
  lastPlayedAt: number;
}

/** 保存から読んだ値を確かめて返す。形がおかしければ null（初めての起動として扱う） */
export function parsePlayLog(data: unknown): PlayLog | null {
  if (typeof data !== 'object' || data === null) return null;
  const { lastPlayedAt } = data as { lastPlayedAt?: unknown };
  if (typeof lastPlayedAt !== 'number' || !Number.isFinite(lastPlayedAt) || lastPlayedAt < 0) return null;
  return { lastPlayedAt };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 起動したときの事実。前回の記録がなければ何も入れない（初めての起動）。
 * - playedBefore: 前にも遊んだことがある
 * - daysAway: 前回から何日（24 時間単位）経ったか
 * - clockRewound: 時計が前回より過去に戻っている。このときは daysAway を入れない（「久しぶり」の反応をしない）
 */
export function visitFacts(log: PlayLog | null, nowMs: number): Record<string, FactValue> {
  if (!log) return {};
  if (nowMs < log.lastPlayedAt) return { playedBefore: true, clockRewound: true };
  return { playedBefore: true, daysAway: Math.floor((nowMs - log.lastPlayedAt) / DAY_MS) };
}

/**
 * 次に保存する記録。時計が過去に戻っていても前回の時刻より戻さない
 * （戻したあとで時計を直したときに、「久しぶり」と勘違いしないように）。
 */
export function nextPlayLog(log: PlayLog | null, nowMs: number): PlayLog {
  return { lastPlayedAt: Math.max(log?.lastPlayedAt ?? 0, nowMs) };
}
