/**
 * フレームレートの計測。interval 秒ごとに、その間の平均 fps と、いちばん長かったフレームの時間を確定する。
 * 実機で「60fps 前後で動くか」を確かめるためのもの。
 */
export class FrameRateMeter {
  /** 直前の区間の平均 fps（まだ 1 区間たっていなければ 0） */
  fps = 0;
  /** 直前の区間でいちばん長かったフレームの時間（ミリ秒）。カクつきの目安 */
  worstFrameMs = 0;
  private elapsed = 0;
  private frames = 0;
  private worst = 0;

  constructor(readonly interval = 0.5) {}

  /** 1 フレームごとに、経過時間（秒）を渡す。区間が確定したら true を返す。 */
  tick(dt: number): boolean {
    this.elapsed += dt;
    this.frames += 1;
    this.worst = Math.max(this.worst, dt);
    if (this.elapsed < this.interval) return false;
    this.fps = this.frames / this.elapsed;
    this.worstFrameMs = this.worst * 1000;
    this.elapsed = 0;
    this.frames = 0;
    this.worst = 0;
    return true;
  }
}
