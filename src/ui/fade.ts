/** 暗転にかける時間（秒）。CSS の transition と合わせる */
export const FADE_SECONDS = 0.45;
const FADE_MS = FADE_SECONDS * 1000;

/**
 * 場所を切り替えるときの暗転。画面を暗くし、真っ暗になったところで swap を呼び、また明るくする。
 * 暗転の途中は、次の暗転を受け付けない。
 */
export class Fader {
  private readonly element: HTMLDivElement;
  private timer: number | null = null;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'fade';
    parent.append(this.element);
  }

  /** 暗転中か。 */
  get busy(): boolean {
    return this.timer !== null;
  }

  /** 暗転を始める。すでに暗転中なら何もせず false を返す。 */
  run(swap: () => void): boolean {
    if (this.busy) return false;
    this.element.classList.add('dark');
    this.timer = window.setTimeout(() => {
      swap();
      this.element.classList.remove('dark');
      this.timer = window.setTimeout(() => {
        this.timer = null;
      }, FADE_MS);
    }, FADE_MS);
    return true;
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.element.remove();
  }
}
