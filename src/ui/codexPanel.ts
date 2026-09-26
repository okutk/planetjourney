import type { Codex } from '../ai/codex';

/**
 * 図鑑の画面。右上の「図鑑」ボタンで開く。場所ごとに項目のカードを並べ、
 * まだ体験していない項目は灰色の「データ」、体験した項目は色つきでミラの感想を出す。
 * 開いている間は画面全体を覆うので、その下の操作（スティック・カメラ）には触れない。
 */
export class CodexPanel {
  private readonly button: HTMLButtonElement;
  private readonly element: HTMLDivElement;
  private readonly summary: HTMLParagraphElement;
  private readonly list: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly onOpen = () => this.open();
  private readonly onClose = () => this.close();

  constructor(
    parent: HTMLElement,
    private readonly codex: Codex,
    /** 場所の id から表示名 */
    private readonly nameOf: (place: string) => string,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'codex-button';
    this.button.textContent = '図鑑';
    this.button.addEventListener('click', this.onOpen);

    this.element = document.createElement('div');
    this.element.className = 'star-map codex';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', '図鑑');
    const title = document.createElement('h2');
    title.textContent = '図鑑';
    this.summary = document.createElement('p');
    this.summary.className = 'codex-summary';
    this.list = document.createElement('div');
    this.list.className = 'codex-list';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'star-close';
    this.closeButton.textContent = '閉じる';
    this.closeButton.addEventListener('click', this.onClose);
    this.element.append(title, this.summary, this.list, this.closeButton);
    parent.append(this.button, this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** ボタンを出すか（星図やワープの間は隠す） */
  setButtonVisible(visible: boolean): void {
    if (this.button.hidden === visible) this.button.hidden = !visible; // 変わったときだけ DOM に書く
  }

  /** 開く。開くたびに、いまの体験の状態で作り直す（項目は少ないので十分軽い） */
  open(): void {
    // データにない発見は、体験するまで並べず、数にも入れない
    const entries = this.codex.visibleEntries();
    this.summary.textContent = `体験 ${this.codex.count} / ${entries.length}`;
    this.list.replaceChildren();
    let section: HTMLElement | null = null;
    let place: string | null = null;
    for (const entry of entries) {
      if (entry.place !== place) {
        place = entry.place;
        section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = this.nameOf(place);
        section.append(heading);
        this.list.append(section);
      }
      const experienced = this.codex.has(entry);
      const card = document.createElement('article');
      card.className = experienced ? 'codex-card experienced' : 'codex-card';
      if (experienced && entry.rare) card.classList.add('rare');
      const name = document.createElement('strong');
      name.textContent = experienced && entry.rare ? `★ ${entry.title}` : entry.title;
      const data = document.createElement('span');
      data.textContent = entry.data;
      card.append(name, data);
      if (experienced) {
        const impression = document.createElement('em');
        impression.textContent = `ミラ「${entry.impression}」`;
        card.append(impression);
      }
      section!.append(card);
    }
    this.element.hidden = false;
    this.closeButton.focus();
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
