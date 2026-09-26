import type { PipopaConfig } from '../audio/pipopa';
import type { FactValue } from './dialogue';

/**
 * ミラの感情。喜び・好奇心・不安・信頼の 4 つの数値（0〜100）を持ち、出来事で増減し、時間とともに平常値へ戻る。
 * 増減の量と平常値は src/data/emotion.json に置き、ここには仕組みと、表情・歩く速さ・声への反映の計算だけを書く。
 * 描画・DOM・Web Audio には依存しない。
 */

export const EMOTION_NAMES = ['joy', 'curiosity', 'anxiety', 'trust'] as const;
export type EmotionName = (typeof EMOTION_NAMES)[number];
export type EmotionValues = Record<EmotionName, number>;

/** 感情を動かす出来事。コードから feel() に渡すものは、ここに並べ、JSON にも同じ名前で書く */
export const EMOTION_EVENTS = ['discover', 'arrive', 'home', 'warp', 'jump', 'ignored', 'leftBehind'] as const;
export type EmotionEvent = (typeof EMOTION_EVENTS)[number];

export interface EmotionRules {
  /** 平常値。時間が経つとここへ戻る */
  baseline: EmotionValues;
  /** 平常値との差が半分になるまでの秒数。null なら戻らない（信頼は積み重なるもの） */
  halfLife: Record<EmotionName, number | null>;
  /** 出来事ごとの増減 */
  events: Record<EmotionEvent, Partial<EmotionValues>>;
}

const MIN = 0;
const MAX = 100;

function clamp(value: number, min = MIN, max = MAX): number {
  return Math.min(max, Math.max(min, value));
}

function isEmotionName(key: string): key is EmotionName {
  return (EMOTION_NAMES as readonly string[]).includes(key);
}

/** JSON から読み込んだ感情のルールを確かめて返す。おかしなところがあれば例外を投げる（書き足しのミスをテストで見つける）。 */
export function parseEmotionRules(data: unknown): EmotionRules {
  const raw = data as Partial<Record<keyof EmotionRules, Record<string, unknown>>>;
  if (typeof raw !== 'object' || raw === null) throw new Error('感情のルールはオブジェクトで書く');
  const { baseline, halfLife, events } = raw;
  if (!baseline || !halfLife || !events) throw new Error('感情のルールには baseline・halfLife・events が要る');
  for (const name of EMOTION_NAMES) {
    const base = baseline[name];
    if (typeof base !== 'number' || base < MIN || base > MAX) throw new Error(`baseline.${name} は 0〜100 の数`);
    const half = halfLife[name];
    if (half !== null && !(typeof half === 'number' && half > 0)) throw new Error(`halfLife.${name} は正の数か null`);
  }
  for (const key of Object.keys(events)) {
    if (!(EMOTION_EVENTS as readonly string[]).includes(key)) throw new Error(`知らない出来事 ${key}`);
  }
  for (const event of EMOTION_EVENTS) {
    const deltas = events[event] as Record<string, unknown> | undefined;
    if (typeof deltas !== 'object' || deltas === null) throw new Error(`出来事 ${event} の増減がない`);
    for (const [name, delta] of Object.entries(deltas)) {
      if (!isEmotionName(name)) throw new Error(`出来事 ${event}: 知らない感情 ${name}`);
      if (typeof delta !== 'number' || !Number.isFinite(delta)) throw new Error(`出来事 ${event}: ${name} の増減は数`);
    }
  }
  return raw as unknown as EmotionRules;
}

/** 感情の気分。平常値からいちばん大きく上がっている感情（信頼は除く）。どれも上がっていなければ calm */
export type Mood = 'joyful' | 'curious' | 'anxious' | 'calm';

/** 平常値からこれだけ上がっていれば、その気分とみなす */
const MOOD_THRESHOLD = 15;
const MOOD_OF: Record<Exclude<EmotionName, 'trust'>, Mood> = { joy: 'joyful', curiosity: 'curious', anxiety: 'anxious' };

/**
 * 感情の数値。値はプレーンなオブジェクト（values）に持ち、snapshot() / restore() でそのまま保存できる。
 */
export class Emotion {
  readonly values: EmotionValues;
  private readonly rates: Record<EmotionName, number>;

  constructor(private readonly rules: EmotionRules) {
    this.values = { ...rules.baseline };
    this.rates = { joy: 0, curiosity: 0, anxiety: 0, trust: 0 };
    for (const name of EMOTION_NAMES) {
      const half = rules.halfLife[name];
      this.rates[name] = half === null ? 0 : Math.LN2 / half;
    }
  }

  /** 出来事を感じる。増減は 0〜100 に収める */
  feel(event: EmotionEvent): void {
    const deltas = this.rules.events[event];
    for (const name of EMOTION_NAMES) {
      const delta = deltas[name];
      if (delta !== undefined) this.values[name] = clamp(this.values[name] + delta);
    }
  }

  /** dt 秒だけ進め、平常値へ近づける（指数的に落ち着く） */
  update(dt: number): void {
    if (dt <= 0) return;
    for (const name of EMOTION_NAMES) {
      const rate = this.rates[name];
      if (rate === 0) continue;
      const base = this.rules.baseline[name];
      this.values[name] = base + (this.values[name] - base) * Math.exp(-rate * dt);
    }
  }

  /** いまの気分 */
  mood(): Mood {
    let best: Mood = 'calm';
    let bestRise = MOOD_THRESHOLD;
    for (const name of ['joy', 'curiosity', 'anxiety'] as const) {
      const rise = this.values[name] - this.rules.baseline[name];
      if (rise >= bestRise) {
        best = MOOD_OF[name];
        bestRise = rise;
      }
    }
    return best;
  }

  /** 会話の事実に書き込む（joy・curiosity・anxiety・trust は整数、mood は気分の名前） */
  writeFacts(facts: Record<string, FactValue>): void {
    for (const name of EMOTION_NAMES) facts[name] = Math.round(this.values[name]);
    facts.mood = this.mood();
  }

  /** 保存用の値（コピー） */
  snapshot(): EmotionValues {
    return { ...this.values };
  }

  /** 保存した値を戻す。形がおかしい値は無視し、平常値のままにする。戻せたら true */
  restore(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const saved = data as Record<string, unknown>;
    let restored = false;
    for (const name of EMOTION_NAMES) {
      const value = saved[name];
      if (typeof value === 'number' && Number.isFinite(value)) {
        this.values[name] = clamp(value);
        restored = true;
      }
    }
    return restored;
  }
}

/** 0〜1 に収めた、from から to までの進み具合 */
function ramp(value: number, from: number, to: number): number {
  return clamp((value - from) / (to - from), 0, 1);
}

/** 感情による、いつもの顔（VRM の表情の重み）。話すときの表情が出ているあいだは、そちらが勝つ */
export interface MoodFace {
  happy: number;
  sad: number;
  relaxed: number;
}

/** 感情から、いつもの顔の重みを out に書く（毎フレーム呼ぶので new しない） */
export function moodFace(values: EmotionValues, out: MoodFace): MoodFace {
  out.happy = 0.4 * ramp(values.joy, 55, 95);
  out.sad = 0.45 * ramp(values.anxiety, 45, 90);
  // 信頼しているときは、ほかの表情が出ていなければ穏やかな顔
  out.relaxed = 0.3 * ramp(values.trust, 40, 90) * (1 - ramp(out.happy + out.sad, 0, 0.2));
  return out;
}

/** 感情による歩く速さの倍率（0.75〜1）。喜びや好奇心が高いと足取りが軽く、沈んでいると遅い */
export function walkPace(values: EmotionValues): number {
  return clamp(0.85 + (0.2 * (values.joy - 40)) / 60 + (0.1 * (values.curiosity - 50)) / 50, 0.75, 1);
}

/**
 * 感情による声（ピポパ音声）の設定を out に書く。
 * 喜びで高く・速く・抑揚が大きく、不安で少し高く・遅く・抑揚が小さく、間が長くなる。
 */
export function emotionVoice(values: EmotionValues, base: Readonly<PipopaConfig>, out: PipopaConfig): PipopaConfig {
  const joy = clamp((values.joy - 40) / 60, -1, 1); // 平常で 0、最大で 1
  const anxiety = ramp(values.anxiety, 20, 100);
  const semitones = 2.5 * joy + 1.5 * anxiety;
  out.baseFrequency = base.baseFrequency * 2 ** (semitones / 12);
  out.charInterval = base.charInterval * (1 - 0.15 * joy + 0.25 * anxiety);
  out.beepDuration = Math.min(base.beepDuration, out.charInterval * 0.75);
  out.semitoneRange = Math.max(2, Math.round(base.semitoneRange * (1 + 0.3 * joy - 0.4 * anxiety)));
  out.pause = base.pause * (1 + 0.5 * anxiety);
  out.questionRise = base.questionRise;
  return out;
}
