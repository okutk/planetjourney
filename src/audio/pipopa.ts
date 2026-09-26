/**
 * 「ピポパ音声」の音の並びを決める。文字に合わせて短い電子音を鳴らす（音声合成は使わない）。
 * 同じ文字は同じ高さで鳴るので、同じセリフは毎回同じ「声」になる。描画・DOM・Web Audio には依存しない。
 */

/** 1 つの音。start と duration は秒、frequency は Hz。 */
export interface Beep {
  start: number;
  duration: number;
  frequency: number;
}

export interface PipopaConfig {
  /** 1 文字あたりの間隔（秒） */
  charInterval: number;
  /** 音の長さ（秒）。charInterval より短くして、粒を立たせる */
  beepDuration: number;
  /** 声の高さの中心（Hz） */
  baseFrequency: number;
  /** 高さのばらつき（半音の数）。この範囲で文字ごとに決まる */
  semitoneRange: number;
  /** 句読点のあとの間（秒） */
  pause: number;
  /** 文末が「？」のとき、最後の音を何半音上げるか */
  questionRise: number;
}

export const DEFAULT_PIPOPA_CONFIG: Readonly<PipopaConfig> = {
  charInterval: 0.06,
  beepDuration: 0.045,
  baseFrequency: 880,
  semitoneRange: 7,
  pause: 0.18,
  questionRise: 5,
};

// 間を置く文字（音は鳴らさない）
const PAUSE_CHARS = new Set(['、', '。', '，', '．', ',', '.', '！', '!', '？', '?', '…', '・', '　', ' ', '\n']);
// 音も間も入れない文字（かっこなど）
const SILENT_CHARS = new Set(['「', '」', '『', '』', '（', '）', '(', ')', '〜', 'ー']);

/** 文字から、0 以上 semitoneRange 以下の半音の数を決める（同じ文字なら同じ値）。 */
function semitoneOf(char: string, range: number): number {
  const code = char.codePointAt(0) ?? 0;
  const hash = Math.imul(code ^ (code >>> 7), 2654435761) >>> 0;
  return hash % (range + 1);
}

/** セリフの音の並びと、各文字が吹き出しに現れる時刻（秒）。 */
export interface PipopaTimeline {
  beeps: Beep[];
  /** revealAt[i] は、text を文字（コードポイント）に分けた i 番目の文字が現れる時刻 */
  revealAt: number[];
}

/** セリフから、音の並びと文字が現れる時刻をつくる。文字送りと音がずれないよう、同じ計算で決める。 */
export function pipopaTimeline(text: string, config: PipopaConfig = DEFAULT_PIPOPA_CONFIG): PipopaTimeline {
  const beeps: Beep[] = [];
  const revealAt: number[] = [];
  let time = 0;
  for (const char of text) {
    revealAt.push(time);
    if (SILENT_CHARS.has(char)) continue;
    if (PAUSE_CHARS.has(char)) {
      time += config.pause;
      continue;
    }
    const semitone = semitoneOf(char, config.semitoneRange);
    beeps.push({
      start: time,
      duration: config.beepDuration,
      frequency: config.baseFrequency * 2 ** (semitone / 12),
    });
    time += config.charInterval;
  }
  // 問いかけは語尾を上げる
  const trimmed = text.trimEnd();
  if ((trimmed.endsWith('？') || trimmed.endsWith('?')) && beeps.length > 0) {
    beeps[beeps.length - 1].frequency *= 2 ** (config.questionRise / 12);
  }
  return { beeps, revealAt };
}

/** セリフから音の並びをつくる。 */
export function pipopaBeeps(text: string, config: PipopaConfig = DEFAULT_PIPOPA_CONFIG): Beep[] {
  return pipopaTimeline(text, config).beeps;
}

/** 音の並び全体の長さ（秒）。吹き出しの文字送りと合わせるのに使う。 */
export function beepsDuration(beeps: readonly Beep[]): number {
  return beeps.reduce((end, b) => Math.max(end, b.start + b.duration), 0);
}
