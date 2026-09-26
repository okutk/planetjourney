import type { Beep } from './pipopa';

const VOLUME = 0.08;
const ATTACK = 0.005; // 音の立ち上がり（秒）。プチッというノイズを防ぐ

/**
 * ピポパ音声を Web Audio で鳴らす。音声ファイルも音声合成も使わず、その場で電子音を作る。
 * ブラウザの自動再生の制限があるので、AudioContext はユーザーが画面に触れたあと（unlock）に作る。
 */
export class VoicePlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private readonly active = new Set<OscillatorNode>();

  /** ユーザーの操作（pointerdown・keydown）の中で呼ぶ。2 回目以降は何もしない。 */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.output = this.context.createGain();
    this.output.gain.value = VOLUME;
    this.output.connect(this.context.destination);
  }

  /** 音の並びを鳴らす。前のセリフが鳴っていたら止めてから鳴らす。まだ unlock されていなければ何もしない。 */
  play(beeps: readonly Beep[]): void {
    const { context, output } = this;
    // 準備前や、まだ止まっている（suspended）間は鳴らさない（再開した瞬間にまとめて鳴るのを防ぐ）
    if (!context || !output || context.state !== 'running') return;
    this.stop();
    const now = context.currentTime + 0.02;
    for (const beep of beeps) {
      // OscillatorNode は使い捨てなので、音ごとに作る（毎フレームではなく、文字ごと）
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = beep.frequency;
      const start = now + beep.start;
      const end = start + beep.duration;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(1, start + ATTACK);
      envelope.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(envelope).connect(output);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        this.active.delete(oscillator);
      };
      oscillator.start(start);
      oscillator.stop(end);
      this.active.add(oscillator);
    }
  }

  /** 鳴っている音を止める。 */
  stop(): void {
    for (const oscillator of this.active) oscillator.stop();
    this.active.clear();
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.output = null;
  }
}
