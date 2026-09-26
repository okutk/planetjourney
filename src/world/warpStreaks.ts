import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import { createRandom } from '../core/noise';

const COUNT = 160; // 流れる星の本数
const NEAR = -2; // カメラからいちばん近い z（カメラ座標。前が -Z）
const FAR = -24;
const SPREAD = 10; // 左右・上下の広がり
const LENGTH = 5; // 強さ 1 のときの線の長さ
const SPEED = 40; // 強さ 1 のときに手前へ流れる速さ（単位/秒）

/**
 * ワープ中に流れる星。カメラの子にして、カメラの前の空間に線を並べ、強さに応じて長く・速くする。
 * 位置の配列は使い回し、強さが 0 のときは描かない。不要になったら dispose() する。
 */
export class WarpStreaks {
  readonly object: LineSegments;
  private readonly geometry = new BufferGeometry();
  private readonly material = new LineBasicMaterial({ color: '#c8f0ff', transparent: true, depthTest: false });
  private readonly positions = new Float32Array(COUNT * 6);
  /** 各線の位置（x, y, z）。z は毎フレーム手前へ動かす */
  private readonly points = new Float32Array(COUNT * 3);

  constructor(seed = 7) {
    const random = createRandom(seed);
    for (let i = 0; i < COUNT; i++) {
      this.points[i * 3] = (random() * 2 - 1) * SPREAD;
      this.points[i * 3 + 1] = (random() * 2 - 1) * SPREAD;
      this.points[i * 3 + 2] = NEAR + random() * (FAR - NEAR);
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.object = new LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1; // 壁や星より最後に描く（深度は見ない）
    this.object.visible = false;
  }

  /** 毎フレーム呼ぶ。intensity は 0〜1。 */
  update(dt: number, intensity: number): void {
    if (intensity <= 0) {
      this.object.visible = false;
      return;
    }
    this.object.visible = true;
    this.material.opacity = intensity;
    const { points, positions } = this;
    for (let i = 0; i < COUNT; i++) {
      let z = points[i * 3 + 2] + SPEED * intensity * dt;
      if (z > NEAR) z -= FAR - NEAR; // 手前を過ぎたら奥へ戻す
      points[i * 3 + 2] = z;
      const x = points[i * 3];
      const y = points[i * 3 + 1];
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z - LENGTH * intensity;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
