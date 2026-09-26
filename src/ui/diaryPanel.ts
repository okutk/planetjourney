import type { DiaryEntry } from '../ai/diary';

/**
 * ミラの日記を読む画面。船の部屋にいるあいだ、右上の「日記」ボタンで開く。新しいページを上に並べる。
 * 開いている間は画面全体を覆うので、その下の操作（スティック・カメラ）には触れない。
 */
export class DiaryPanel {
  private readonly button: HTMLButtonElement;
  private readonly element: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly onOpen = () => this.open();
  private readonly onClose = () => this.close();

  constructor(
    parent: HTMLElement,
    private readonly pages: readonly DiaryEntry[],
    /** 開いたとき（新しいページを読んだことにする） */
    private readonly onRead: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'codex-button diary-button';
    this.button.textContent = '日記';
    this.button.addEventListener('click', this.onOpen);

    this.element = document.createElement('div');
    this.element.className = 'star-map codex diary';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'ミラの日記');
    const title = document.createElement('h2');
    title.textContent = 'ミラの日記';
    this.list = document.createElement('div');
    this.list.className = 'codex-list';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'star-close';
    this.closeButton.textContent = '閉じる';
    this.closeButton.addEventListener('click', this.onClose);
    this.element.append(title, this.list, this.closeButton);
    parent.append(this.button, this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** ボタンを出すか（船の部屋にいて、ほかの画面を開いていないときだけ） */
  setButtonVisible(visible: boolean): void {
    if (this.button.hidden === visible) this.button.hidden = !visible; // 変わったときだけ DOM に書く
  }

  /** 開く。開くたびに作り直す（ページは多くても DIARY_LIMIT 枚） */
  open(): void {
    this.list.replaceChildren();
    if (this.pages.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'まだ何も書いていない。星から帰ってきたら書くね。';
      this.list.append(empty);
    }
    for (let i = this.pages.length - 1; i >= 0; i--) {
      const page = this.pages[i];
      const date = new Date(page.at);
      const card = document.createElement('article');
      card.className = 'codex-card experienced diary-page';
      const heading = document.createElement('strong');
      heading.textContent = `${date.getMonth() + 1}月${date.getDate()}日　${page.place}`;
      const text = document.createElement('p');
      text.textContent = page.text;
      card.append(heading, text);
      this.list.append(card);
    }
    this.element.hidden = false;
    this.closeButton.focus();
    this.onRead();
  }

  close(): void {
    if (this.element.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.element.hidden = true;
  }

  dispose(): void {
    this.button.removeEventListener('click', this.onOpen);
    this.closeButton.removeEventListener('click', this.onClose);
    this.button.remove();
    this.element.remove();
  }
}
