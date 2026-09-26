import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { GimmickDef } from '../core/gimmick';
import { alignToUp } from '../core/sphere';
import type { Terrain } from '../core/terrain';

/** 作業の効果（広がる輪）の色 */
const EFFECT_COLOR = '#9fe8ff';
/** 星のかけらの色と、浮かぶ位置（仕掛けの横。ランプなどと重ならないように）・回る速さ */
const FRAGMENT_COLOR = '#ffe9a8';
const FRAGMENT_OFFSET = new Vector3(0.6, 0.9, 0);
const FRAGMENT_SPIN = 1.6;
/** プレイヤーがこの距離まで近づくと、かけらを拾う */
export const PICKUP_RADIUS = 1;

/**
 * 星の仕掛けの見た目。種類ごとに形が違い、ミラが解くと光る。
 * 作業中は輪が広がって、何かをしていることが分かる。不要になったら dispose() する。
 */
export class GimmickView {
  readonly group = new Group();
  /** 地表に置いた位置（ワールド座標。星の中心が原点） */
  readonly position = new Vector3();
  private readonly geometries: BufferGeometry[] = [];
  /** 解けたときに光る部分 */
  private readonly lit: MeshStandardMaterial;
  private readonly effect: Mesh;
  private readonly effectMaterial = new MeshStandardMaterial({
    color: EFFECT_COLOR,
    emissive: EFFECT_COLOR,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0,
  });
  private readonly litColor: string;
  /** 解けたあとに現れる星のかけら。拾うまで浮いて回る */
  private readonly fragment: Mesh;
  private readonly fragmentMaterial = new MeshStandardMaterial({
    color: FRAGMENT_COLOR,
    emissive: FRAGMENT_COLOR,
    emissiveIntensity: 0.9,
  });
  /** かけらの位置（ワールド座標）。拾える距離の判定に使う */
  readonly fragmentPosition = new Vector3();
  private spin = 0;
  /** 拾える状態か。かけらが出た瞬間にそばにいても拾わず、一度離れてから近づいたときに拾う */
  private armed = false;

  constructor(terrain: Terrain, def: GimmickDef) {
    const direction = new Vector3(...def.direction).normalize();
    this.position.copy(direction).multiplyScalar(terrain.radiusAt(direction) - 0.05);
    this.group.position.copy(this.position);
    this.group.quaternion.copy(alignToUp(direction));

    const stone = new MeshStandardMaterial({ color: '#6f6a80', flatShading: true });
    switch (def.kind) {
      case 'light': {
        // 灯り: 柱の上に丸いランプ。解くとランプが灯る
        this.litColor = '#ffd27a';
        this.lit = new MeshStandardMaterial({ color: '#4a4030', emissive: this.litColor, emissiveIntensity: 0 });
        const post = this.track(new CylinderGeometry(0.08, 0.12, 1.2, 6));
        post.translate(0, 0.6, 0);
        const lamp = this.track(new SphereGeometry(0.22, 10, 8));
        lamp.translate(0, 1.35, 0);
        this.group.add(new Mesh(post, stone), new Mesh(lamp, this.lit));
        break;
      }
      case 'scan': {
        // 刻まれた石: 斜めに立つ石板。解くと刻みが光る
        this.litColor = '#7fe0ff';
        this.lit = new MeshStandardMaterial({ color: '#5a5a78', emissive: this.litColor, emissiveIntensity: 0 });
        const slab = this.track(new BoxGeometry(0.8, 1.2, 0.25));
        slab.translate(0, 0.55, 0);
        slab.rotateX(-0.2);
        const base = this.track(new DodecahedronGeometry(0.4, 0));
        base.scale(1.3, 0.5, 1.3);
        this.group.add(new Mesh(base, stone), new Mesh(slab, this.lit));
        break;
      }
      case 'crawl': {
        // 岩のすきま: 2 つの岩の間の狭い所。解くと奥に光る印が出る
        this.litColor = '#d9c8ff';
        this.lit = new MeshStandardMaterial({ color: '#8a7ab8', emissive: this.litColor, emissiveIntensity: 0 });
        const rock = this.track(new DodecahedronGeometry(0.55, 0));
        rock.scale(1, 1.4, 1);
        for (const x of [-0.6, 0.6]) {
          const mesh = new Mesh(rock, stone);
          mesh.position.set(x, 0.5, 0);
          this.group.add(mesh);
        }
        const mark = this.track(new OctahedronGeometry(0.15, 0));
        mark.translate(0, 0.3, 0);
        this.group.add(new Mesh(mark, this.lit));
        break;
      }
    }
    // 作業中に広がる輪。地面に寝かせて置く
    const ring = this.track(new TorusGeometry(0.5, 0.04, 6, 24));
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.08, 0);
    this.effect = new Mesh(ring, this.effectMaterial);
    this.effect.visible = false;
    this.group.add(this.effect);

    const gem = this.track(new OctahedronGeometry(0.14, 0));
    gem.scale(1, 1.6, 1);
    this.fragment = new Mesh(gem, this.fragmentMaterial);
    this.fragment.position.copy(FRAGMENT_OFFSET);
    this.fragment.visible = false;
    this.group.add(this.fragment);
    // ワールド座標でのかけらの位置（仕掛けの向きに合わせて、横のずれを回す）
    this.fragmentPosition.copy(FRAGMENT_OFFSET).applyQuaternion(this.group.quaternion).add(this.position);
  }

  /**
   * かけらを出す（解けたあと、まだ拾っていないとき）か、しまう（拾ったとき）。
   * 出した直後は拾えない（作業完了のセリフを、その場で拾って打ち切らないように）
   */
  setFragment(visible: boolean): void {
    this.fragment.visible = visible;
    this.armed = false;
  }

  /**
   * かけらまでの距離 distance から、いま拾うかを返す。
   * 出したときにそばにいたら、一度 radius の外へ出てから入り直したときに拾う。
   */
  shouldPickUp(distance: number, radius: number): boolean {
    if (!this.fragment.visible) return false;
    if (distance >= radius) {
      this.armed = true;
      return false;
    }
    return this.armed;
  }

  get hasFragment(): boolean {
    return this.fragment.visible;
  }

  /** 毎フレーム呼ぶ。かけらが出ていれば、回りながら上下に揺れる。 */
  update(dt: number): void {
    if (!this.fragment.visible) return;
    this.spin += dt * FRAGMENT_SPIN;
    this.fragment.rotation.y = this.spin;
    this.fragment.position.y = FRAGMENT_OFFSET.y + Math.sin(this.spin * 1.5) * 0.06;
  }

  /** 解けているか（光っているか）を設定する。 */
  setSolved(solved: boolean): void {
    this.lit.emissiveIntensity = solved ? 1 : 0;
  }

  /** 作業の効果。progress は 0〜1、作業していないときは null。 */
  setWorking(progress: number | null): void {
    if (progress === null) {
      this.effect.visible = false;
      return;
    }
    // 輪は繰り返し広がりながら薄くなる。解けていく途中は光る部分も少しずつ明るくする
    const cycle = (progress * 3) % 1;
    this.effect.visible = true;
    this.effect.scale.setScalar(0.6 + cycle * 2.4);
    this.effectMaterial.opacity = 1 - cycle;
    this.lit.emissiveIntensity = progress * 0.6;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.lit.dispose();
    this.effectMaterial.dispose();
    this.fragmentMaterial.dispose();
    this.group.traverse((object) => {
      const material = (object as Mesh).material;
      if (
        material instanceof MeshStandardMaterial &&
        material !== this.lit &&
        material !== this.effectMaterial &&
        material !== this.fragmentMaterial
      ) {
        material.dispose();
      }
    });
    this.group.removeFromParent();
  }

  private track<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}
