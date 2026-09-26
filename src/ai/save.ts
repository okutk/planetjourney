import { parseJourneySave, type JourneySave } from '../core/journey';
import { parsePlayLog, type PlayLog } from './clock';
import { parseEmotionValues, type EmotionValues } from './emotion';

/**
 * セーブデータ。旅の進み（Journey）・ミラの感情・前回のプレイ日時をひとつのプレーンなオブジェクトにまとめる。
 * 端末内への読み書き（localStorage）は src/ui/localStore.ts の役目で、ここは形を確かめるだけ。描画や DOM には依存しない。
 * 形を変えるときは SAVE_VERSION を上げる（古い保存は読まずに初めからにする）。
 */

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  journey: JourneySave;
  /** ミラの感情。null なら平常値から */
  emotion: EmotionValues | null;
  /** 前回のプレイ日時。null なら初めての起動として扱う */
  playLog: PlayLog | null;
}

/**
 * 保存から読んだ値を確かめて返す。版が違う、または旅の部分が壊れていれば null（初めてから）。
 * 感情や前回の日時が壊れているだけなら、その部分だけ null にして旅は続ける。
 */
export function parseSaveData(data: unknown): SaveData | null {
  if (typeof data !== 'object' || data === null) return null;
  const { version, journey, emotion, playLog } = data as Record<string, unknown>;
  if (version !== SAVE_VERSION) return null;
  const parsedJourney = parseJourneySave(journey);
  if (!parsedJourney) return null;
  return {
    version: SAVE_VERSION,
    journey: parsedJourney,
    emotion: parseEmotionValues(emotion),
    playLog: parsePlayLog(playLog),
  };
}
