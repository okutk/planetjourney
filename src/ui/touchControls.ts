import { stickFromDrag, type StickValue } from '../core/stick';

const STICK_RADIUS = 56; // スティックを倒しきる距離（CSS ピクセル）
const STICK_DEAD_ZONE = 0.15;
const CAMERA_DRAG_SPEED = 0.008; // ドラッグ 1px あたりのカメラの回転（ラジアン）

/**
 * タッチ操作。画面の左半分は押した場所に出る仮想スティック、右半分のドラッグはカメラの回転（上下で見下ろす角度）、
 * 右下のボタンでジャンプ。Pointer Events なのでマウスでも同じように動く。
 */
export class TouchControls {
  /** 仮想スティックの値（触れていなければ 0） */
  readonly stick: StickValue = { x: 0, y: 0 };

  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly jumpButton: HTMLButtonElement;
  private stickPointer: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private cameraPointer: number | null = null;
  private cameraLastX = 0;
  private cameraLastY = 0;
  private yaw = 0;
  private pitch = 0;
  private jump = false;

  constructor(
    private readonly surface: HTMLElement,
    private readonly layer: HTMLElement,
  ) {
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'stick-knob';
    this.stickBase.append(this.stickKnob);
    this.jumpButton = document.createElement('button');
    this.jumpButton.className = 'jump-button';
    this.jumpButton.type = 'button';
    this.jumpButton.textContent = 'ジャンプ';
    this.jumpButton.setAttribute('aria-label', 'ジャンプ');
    layer.append(this.stickBase, this.jumpButton);

    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('contextmenu', this.onContextMenu);
    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
  }

  /** 前回呼んでからのカメラの回転量（ラジアン。右へのドラッグで正）を取り出す。 */
  consumeYaw(): number {
    const yaw = this.yaw;
    this.yaw = 0;
    return yaw;
  }

  /** 前回呼んでからの見下ろす角度の変化（ラジアン。下へのドラッグで正）を取り出す。 */
  consumePitch(): number {
    const pitch = this.pitch;
    this.pitch = 0;
    return pitch;
  }

  /** ジャンプボタンが押されたかを取り出す（1 回押すと 1 回だけ true）。 */
  consumeJump(): boolean {
    const jump = this.jump;
    this.jump = false;
    return jump;
  }

  /** 画面から離れたとき（タブ切り替えなど）に入力を離す。 */
  release(): void {
    this.stickPointer = null;
    this.cameraPointer = null;
    this.stick.x = 0;
    this.stick.y = 0;
    this.stickBase.classList.remove('active');
  }

  dispose(): void {
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
    this.jumpButton.removeEventListener('pointerdown', this.onJumpDown);
    this.stickBase.remove();
    this.jumpButton.remove();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    // マウスは主ボタンだけ使う（右クリックのメニューに pointerup を取られて押しっぱなしになるのを防ぐ）
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const onLeft = event.clientX < this.layer.clientWidth / 2;
    if (onLeft && this.stickPointer === null) {
      this.stickPointer = event.pointerId;
      this.stickOriginX = event.clientX;
      this.stickOriginY = event.clientY;
      this.stickBase.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      this.stickBase.classList.add('active');
      this.updateStick(event);
    } else if (!onLeft && this.cameraPointer === null) {
      this.cameraPointer = event.pointerId;
      this.cameraLastX = event.clientX;
      this.cameraLastY = event.clientY;
    } else {
      return;
    }
    // 指が要素の外へ出ても move / up を受け取れるようにする
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointer) {
      this.updateStick(event);
    } else if (event.pointerId === this.cameraPointer) {
      this.yaw += (event.clientX - this.cameraLastX) * CAMERA_DRAG_SPEED;
      this.pitch += (event.clientY - this.cameraLastY) * CAMERA_DRAG_SPEED;
      this.cameraLastX = event.clientX;
      this.cameraLastY = event.clientY;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.stick.x = 0;
      this.stick.y = 0;
      this.stickBase.classList.remove('active');
    } else if (event.pointerId === this.cameraPointer) {
      this.cameraPointer = null;
    }
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onJumpDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.jump = true;
  };

  private updateStick(event: PointerEvent): void {
    const dx = event.clientX - this.stickOriginX;
    const dy = event.clientY - this.stickOriginY;
    stickFromDrag(dx, dy, STICK_RADIUS, STICK_DEAD_ZONE, this.stick);
    // つまみは倒した方向に、最大で半径まで動かす
    const scale = Math.min(1, STICK_RADIUS / Math.max(Math.hypot(dx, dy), 1e-6));
    this.stickKnob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
}
