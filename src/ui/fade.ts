/** 暗転にかける時間（ミリ秒）。CSS の transition と合わせる */
const FADE_MS = 450;

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
