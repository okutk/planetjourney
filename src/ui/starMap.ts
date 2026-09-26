import type { PlanetInfo } from '../core/planets';

/**
 * 星図。船の部屋で開き、行き先の星を選ぶ画面。タッチで押せる大きなカードを並べる。
 * 開いている間は画面全体を覆うので、その下の操作（スティック・カメラ）には触れない。
 */
export class StarMapPanel {
  private readonly element: HTMLDivElement;
  private readonly cards = new Map<string, HTMLButtonElement>();
  private readonly closeButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    planets: readonly PlanetInfo[],
    private readonly onSelect: (planet: PlanetInfo) => void,
    private readonly onClose: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'star-map';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', '星図');

    const title = document.createElement('h2');
    title.textContent = '星図';
    const list = document.createElement('div');
    list.className = 'star-list';
    for (const planet of planets) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'star-card';
      card.disabled = !planet.available;
      const name = document.createElement('strong');
      name.textContent = planet.name;
      const data = document.createElement('span');
      data.textContent = planet.data;
      const status = document.createElement('em');
      status.className = 'star-status';
      card.append(name, data, status);
      card.addEventListener('click', () => this.onSelect(planet));
      this.cards.set(planet.id, card);
      list.append(card);
    }
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'star-close';
    this.closeButton.textContent = '閉じる';
    this.closeButton.addEventListener('click', this.onClose);
    this.element.append(title, list, this.closeButton);
    parent.append(this.element);

    // カードの状態の文言。行けない星は「データのみ」
    for (const planet of planets) this.setStatus(planet.id, planet.available ? '' : 'まだ行けない（データのみ）');
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** 開く。currentId はいまいる（最後にいた）星で、カードに「いまここ」と出す。 */
  open(currentId: string | null): void {
    for (const [id, card] of this.cards) {
      if (!card.disabled) this.setStatus(id, id === currentId ? 'いまここ' : '');
    }
    this.element.hidden = false;
    // キーボードや読み上げでも扱えるよう、最初に押せるカード（なければ「閉じる」）へフォーカスを移す
    const first = [...this.cards.values()].find((card) => !card.disabled) ?? this.closeButton;
    first.focus();
  }

  close(): void {
    if (this.element.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.element.hidden = true;
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.onClose);
    this.element.remove();
  }

  private setStatus(id: string, text: string): void {
    const status = this.cards.get(id)?.querySelector('.star-status');
    if (status && status.textContent !== text) status.textContent = text;
  }
}
