import type { WebGLRenderer } from 'three';
import { FrameRateMeter } from '../core/frameRate';

/**
 * 性能の表示（URL に ?debug を付けたときだけ出す）。fps・いちばん長いフレーム・ドローコール数・三角形数・解像度。
 * 実機で 60fps 前後を保てているかを確かめるのに使う。
 */
export class PerfOverlay {
  private readonly meter = new FrameRateMeter();
  private readonly element: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly renderer: WebGLRenderer,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'perf-overlay';
    parent.append(this.element);
  }

  /** 描画のあとに毎フレーム呼ぶ。表示の更新は区間ごと（0.5 秒）にだけ行う。 */
  update(dt: number): void {
    if (!this.meter.tick(dt)) return;
    const { calls, triangles } = this.renderer.info.render;
    const canvas = this.renderer.domElement;
    this.element.textContent =
      `${this.meter.fps.toFixed(0)} fps（最長 ${this.meter.worstFrameMs.toFixed(0)} ms）` +
      ` / 描画 ${calls} 回 / ${triangles} 三角形 / ${canvas.width}×${canvas.height}`;
  }

  dispose(): void {
    this.element.remove();
  }
}
