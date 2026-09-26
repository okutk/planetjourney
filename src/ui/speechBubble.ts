/** 読み終えてから吹き出しを消すまでの時間（秒） */
const HOLD = 2.5;

/**
 * ミラの吹き出し。文字を 1 つずつ出し（revealAt の時刻に合わせる）、読み終えたら消す。
 * 位置は毎フレーム、ミラの頭の上の画面座標を受け取って動かす。
 */
export class SpeechBubble {
  private readonly element: HTMLDivElement;
  // 読み上げ用。文字送りの途中を何度も読まないよう、セリフ全文を 1 回だけ入れる（見た目には出さない）
  private readonly liveRegion: HTMLDivElement;
  private chars: string[] = [];
  private revealAt: number[] = [];
  private startedAt = 0;
  private shown = -1;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'speech-bubble';
    this.element.setAttribute('aria-hidden', 'true');
    this.liveRegion = document.createElement('div');
    this.liveRegion.className = 'visually-hidden';
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    parent.append(this.element, this.liveRegion);
  }

  /** セリフを出し始める。revealAt は各文字が現れる時刻（秒）。 */
  show(text: string, revealAt: readonly number[], now: number): void {
    this.chars = [...text];
    this.revealAt = [...revealAt];
    this.startedAt = now;
    this.shown = -1;
    this.visible = true;
    this.element.textContent = '';
    this.element.classList.add('visible');
    this.liveRegion.textContent = text;
  }

  /** 毎フレーム呼ぶ。x・y は吹き出しの下端中央を置く画面座標（CSS px）。onScreen が false なら隠す。 */
  update(now: number, x: number, y: number, onScreen: boolean): void {
    if (!this.visible) return;
    const elapsed = now - this.startedAt;
    const lastAt = this.revealAt.length > 0 ? this.revealAt[this.revealAt.length - 1] : 0;
    if (elapsed > lastAt + HOLD) {
      this.hide();
      return;
    }
    // 現れた文字の数が変わったときだけ DOM を書きかえる
    let count = 0;
    while (count < this.revealAt.length && this.revealAt[count] <= elapsed) count += 1;
    if (count !== this.shown) {
      this.shown = count;
      this.element.textContent = this.chars.slice(0, count).join('');
    }
    this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    this.element.style.opacity = onScreen ? '1' : '0';
  }

  /** 途中でも吹き出しを消す（場所を移るとき）。 */
  hide(): void {
    this.visible = false;
    this.element.classList.remove('visible');
  }

  dispose(): void {
    this.element.remove();
    this.liveRegion.remove();
  }
}
