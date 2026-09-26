import { Box3, Group, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMMetaLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { HologramLook } from './hologram';
import { buildProceduralClips, MiraMotion, type MotionClips } from './miraMotion';
import { MiraPlaceholder } from './miraPlaceholder';

/** ミラのモデル。同一オリジンの public/models から読む（Vite の base が './' でも動くよう相対パス） */
const MODEL_URL = `${import.meta.env.BASE_URL}models/mira.vrm`;
/** 吹き出しなどを出す高さ。頭のてっぺんからこれだけ上 */
const HEAD_MARGIN = 0.15;
/** 仮表示（カプセル）のときの、頭の上の高さ */
const PLACEHOLDER_HEIGHT = 1.1;

const tmpBox = new Box3();

/**
 * ミラの見た目。足元が原点、+Z が正面（VRM 1.0 の向きと同じ）。
 * 最初は仮表示（カプセル）を出し、VRM の読み込みが終わったら入れ替える。読み込みに失敗したら仮表示のまま。
 * 毎フレーム update(dt, walkAmount) を呼ぶと、モーション（待機・歩き）と揺れもの（SpringBone）が動く。
 * 不要になったら dispose() する。
 */
export class MiraView {
  readonly group = new Group();
  /** 頭の上の高さ（吹き出しの位置に使う）。モデルが入ると、その身長に合わせて更新される */
  height = PLACEHOLDER_HEIGHT;
  /** 読み込んだ VRM。仮表示のあいだは null */
  vrm: VRM | null = null;
  private placeholder: MiraPlaceholder | null;
  private motion: MiraMotion | null = null;
  private hologram: HologramLook | null = null;
  /** 差し替え用のモーション。null なら手続きのモーションを使う */
  private clips: MotionClips | null = null;
  private disposed = false;

  constructor() {
    const placeholder = new MiraPlaceholder();
    this.placeholder = placeholder;
    this.group.add(placeholder.group);
    void this.load();
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          // サムネイル（2048px の画像）はゲームでは使わないので、読み込まない
          metaPlugin: new VRMMetaLoaderPlugin(parser, { needThumbnailImage: false }),
        }),
    );
    let vrm: VRM;
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      vrm = gltf.userData.vrm as VRM;
    } catch (error) {
      console.warn('ミラのモデルを読み込めなかったので、仮表示のままにします:', error);
      return;
    }
    if (this.disposed) {
      VRMUtils.deepDispose(vrm.scene);
      return;
    }
    this.install(vrm);
  }

  /** 読み込んだ VRM を、three-vrm の推奨する最適化をかけてから仮表示と入れ替える。 */
  private install(vrm: VRM): void {
    // 描画負荷を下げる: 使われていない頂点を捨て、スキンをまとめる（ドローコールと行列の転送を減らす）
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.combineMorphs(vrm);
    // スキンメッシュの境界はポーズで変わり、画面の端で消えることがあるので、視錐台カリングは切る
    vrm.scene.traverse((object: Object3D) => {
      object.frustumCulled = false;
    });
    // 頭の上の高さは、実際のモデルの大きさから決める（group に入れる前なので、モデルの座標系で測れる）
    vrm.scene.updateWorldMatrix(true, true);
    tmpBox.setFromObject(vrm.scene);
    this.height = tmpBox.max.y + HEAD_MARGIN;

    this.placeholder?.dispose();
    this.placeholder = null;
    this.vrm = vrm;
    this.group.add(vrm.scene);
    this.motion = new MiraMotion(vrm.scene, this.clips ?? buildProceduralClips(vrm));
    this.hologram = new HologramLook(vrm);
    this.hologram.update(0, 1);
    // T ポーズのまま 1 フレームも見せないよう、最初の姿勢をすぐ反映する
    this.motion.update(0, 0);
    vrm.update(0);
    this.settle();
  }

  /**
   * モーションを差し替える（Mixamo などからリターゲットした AnimationClip）。
   * クリップは VRM の正規化ボーンを対象にしたもの。モデルの読み込み前に呼んでもよい
   */
  setClips(clips: MotionClips): void {
    this.clips = clips;
    if (this.vrm) {
      this.motion?.dispose();
      // 前のクリップが動かしていたボーンの姿勢が残らないよう、休止姿勢に戻してから差し替える
      this.vrm.humanoid.resetNormalizedPose();
      this.motion = new MiraMotion(this.vrm.scene, clips);
    }
  }

  /**
   * 毎フレーム呼ぶ。位置と向きを group に入れたあと、描画の前に呼ぶこと。
   * walkAmount は歩く量（0〜1）、noise は投影範囲の端のノイズ（0〜1）、visibility は見え方（0 で消えている）
   */
  update(dt: number, walkAmount: number, noise = 0, visibility = 1): void {
    this.motion?.update(dt, walkAmount);
    this.hologram?.update(noise, visibility);
    this.vrm?.update(dt);
  }

  /**
   * 瞬間移動したあとに呼ぶ。揺れもの（髪など）を今の位置で落ち着かせ、移動前の位置から振り回されないようにする。
   * group の位置と向きを入れたあとに呼ぶこと。
   */
  settle(): void {
    if (!this.vrm) return;
    this.group.updateWorldMatrix(true, true);
    this.vrm.springBoneManager?.reset();
  }

  dispose(): void {
    this.disposed = true;
    this.placeholder?.dispose();
    this.placeholder = null;
    this.motion?.dispose();
    this.motion = null;
    this.hologram = null;
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm.scene.removeFromParent();
      this.vrm = null;
    }
    this.group.removeFromParent();
  }
}
