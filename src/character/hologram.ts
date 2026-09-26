import { Color, Mesh, type Object3D } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { MToonMaterial } from '@pixiv/three-vrm';

/**
 * ミラのホログラムらしい見た目（GDD「ミラの体（ホログラム）」）。
 * VRM の MToon マテリアルを、半透明で縁が水色に光るように調整する。シェーダーは変えず、
 * MToon にもともとあるリムライトと発光の設定だけを使うので、スマホでも重くならない。
 * 投影範囲の端では、ちらつき（不透明度の揺れ）と体の横ずれでノイズを表す。
 */

/** 普段の不透明度 */
const BASE_OPACITY = 0.78;
/** 縁の光の色と、体全体にかける淡い発光 */
const RIM_COLOR = new Color('#7fe6ff');
const GLOW_COLOR = new Color('#16384f');
const BASE_GLOW = 0.3;
/** ノイズが最大のときの、ちらつきの深さ・発光の強まり・横ずれの幅（モデルの単位） */
const FLICKER_DEPTH = 0.7;
const NOISE_GLOW = 1.2;
const JITTER_WIDTH = 0.12;

/**
 * MToon の輪郭線を外す。three-vrm は輪郭線を、同じメッシュの 2 つ目のマテリアル（裏面を太らせて描く）として
 * 描画グループごと足しているので、その分を取り除く。光る縁で輪郭の代わりにし、輪郭線の描画パスをなくす
 * （ドローコールと三角形数が半分になる）。
 */
function stripOutline(object: Object3D): void {
  if (!(object instanceof Mesh) || !Array.isArray(object.material)) return;
  const surface = object.material.find((m) => !(m instanceof MToonMaterial && m.isOutline));
  if (!surface) return;
  for (const material of object.material) {
    if (material !== surface) material.dispose();
  }
  object.material = surface;
  object.geometry.clearGroups();
}

export class HologramLook {
  private readonly materials: MToonMaterial[] = [];

  constructor(private readonly vrm: VRM) {
    vrm.scene.traverse((object: Object3D) => stripOutline(object));
    // 外した輪郭線マテリアルは vrm.materials からも取り除く（vrm.update() が毎フレーム回す対象に残さない）
    if (vrm.materials) {
      for (let i = vrm.materials.length - 1; i >= 0; i--) {
        const material = vrm.materials[i];
        if (material instanceof MToonMaterial && material.isOutline) vrm.materials.splice(i, 1);
      }
    }
    for (const material of vrm.materials ?? []) {
      if (!(material instanceof MToonMaterial)) continue;
      this.materials.push(material);
      material.transparent = true;
      // 半透明でも深度を書き、体の奥の面が手前に透けて見えないようにする
      material.depthWrite = true;
      material.opacity = BASE_OPACITY;
      material.rimLightingMixFactor = 1;
      material.parametricRimColorFactor.copy(RIM_COLOR);
      material.parametricRimFresnelPowerFactor = 2.5;
      material.parametricRimLiftFactor = 0.05;
      material.emissive.copy(GLOW_COLOR);
      material.emissiveIntensity = BASE_GLOW;
    }
  }

  /**
   * 毎フレーム呼ぶ。noise はノイズの強さ（0〜1）、visibility は見え方（0 で消えている）。
   * ノイズがあるときだけ乱数でちらつかせる（毎フレームの new はしない）。
   */
  update(noise: number, visibility: number): void {
    let flicker = 0;
    let jitter = 0;
    if (noise > 0) {
      // ノイズが強いほど、ちらつく確率も深さも上がる
      if (Math.random() < 0.3 + 0.6 * noise) flicker = Math.random() * FLICKER_DEPTH * noise;
      if (Math.random() < noise * 0.8) jitter = (Math.random() - 0.5) * 2 * JITTER_WIDTH * noise;
    }
    const opacity = BASE_OPACITY * visibility * (1 - flicker);
    const glow = BASE_GLOW + NOISE_GLOW * noise * (0.5 + flicker);
    for (const material of this.materials) {
      material.opacity = opacity;
      material.emissiveIntensity = glow;
    }
    this.vrm.scene.position.x = jitter;
    this.vrm.scene.visible = visibility > 0;
  }
}
