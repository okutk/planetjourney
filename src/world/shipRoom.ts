import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RoomObstacle } from '../core/roomWalker';

/** 船の部屋の寸法。床の中心が原点で、窓と星図の台は -Z 側。 */
export const SHIP_ROOM = {
  halfWidth: 3,
  halfDepth: 3,
  height: 2.8,
  /** 星図の台（歩き手が近づけない範囲。体の太さぶんを含む） */
  console: { x: 0, z: -1.9, radius: 0.75 } satisfies RoomObstacle,
  /** 星図の台の天板の高さ */
  consoleHeight: 0.9,
} as const;

/**
 * 船の部屋の見た目。床・壁・天井は内側を向いた板だけで作り、1 つのメッシュにまとめる（部屋全体でメッシュは 3 つ）。
 * 板は表しか描かないので、カメラが部屋の外に出ても手前の壁は透けて、中が見える（ドールハウスのように）。
 * -Z の壁には窓をあけ、外の星が見える。不要になったら dispose() する。
 */
export class ShipRoomView {
  readonly group = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  constructor() {
    const { halfWidth: w, halfDepth: d, height: h, console: c, consoleHeight } = SHIP_ROOM;
    // 窓は幅 3.6・高さ 1.4 で、床から 0.7 の高さにあける
    const windowWidth = 3.6;
    const sillHeight = 0.7;
    const windowTop = sillHeight + 1.4;
    const sideWidth = w - windowWidth / 2;
    const shell = this.track(
      mergeGeometries([
        wall(w * 2, d * 2, 0, 0, 0, -Math.PI / 2, 0), // 床（上を向く）
        wall(w * 2, d * 2, 0, h, 0, Math.PI / 2, 0), // 天井（下を向く）
        wall(w * 2, h, 0, h / 2, d, 0, Math.PI), // 奥の壁（-Z を向く）
        wall(d * 2, h, -w, h / 2, 0, 0, Math.PI / 2), // 左の壁（+X を向く）
        wall(d * 2, h, w, h / 2, 0, 0, -Math.PI / 2), // 右の壁（-X を向く）
        // 窓のある壁（+Z を向く）。窓の左右・下・上の 4 枚
        wall(sideWidth, h, -w + sideWidth / 2, h / 2, -d, 0, 0),
        wall(sideWidth, h, w - sideWidth / 2, h / 2, -d, 0, 0),
        wall(windowWidth, sillHeight, 0, sillHeight / 2, -d, 0, 0),
        wall(windowWidth, h - windowTop, 0, (h + windowTop) / 2, -d, 0, 0),
      ]),
    );
    const shellMaterial = this.track(new MeshStandardMaterial({ color: '#3a3f66', roughness: 0.9 }));
    this.group.add(new Mesh(shell, shellMaterial));

    // 光る部品（窓の縁・壁ぎわの帯・星図の台の円盤）は同じ材質なので、1 つのメッシュにまとめる
    const frame = 0.08;
    const disc = new CylinderGeometry(0.5, 0.5, 0.06, 24);
    disc.translate(c.x, consoleHeight + 0.03, c.z);
    const glowParts = this.track(
      mergeGeometries([
        box(windowWidth + frame * 2, frame, frame, 0, sillHeight - frame / 2, -d + frame / 2),
        box(windowWidth + frame * 2, frame, frame, 0, windowTop + frame / 2, -d + frame / 2),
        box(frame, windowTop - sillHeight, frame, -windowWidth / 2 - frame / 2, (sillHeight + windowTop) / 2, -d + frame / 2),
        box(frame, windowTop - sillHeight, frame, windowWidth / 2 + frame / 2, (sillHeight + windowTop) / 2, -d + frame / 2),
        box(w * 2, 0.06, 0.06, 0, 0.03, d - 0.03),
        box(0.06, 0.06, d * 2, -w + 0.03, 0.03, 0),
        box(0.06, 0.06, d * 2, w - 0.03, 0.03, 0),
        box(w * 2, 0.06, 0.06, 0, 0.03, -d + 0.03),
        disc,
      ]),
    );
    const glow = this.track(new MeshStandardMaterial({ color: '#9fe8ff', emissive: '#6fd6ff', emissiveIntensity: 1.2 }));
    this.group.add(new Mesh(glowParts, glow));

    // 星図の台の脚（八角柱）
    const pedestal = this.track(new CylinderGeometry(0.35, 0.45, consoleHeight, 8));
    pedestal.translate(c.x, consoleHeight / 2, c.z);
    this.group.add(new Mesh(pedestal, this.track(new MeshStandardMaterial({ color: '#4a4f7a', flatShading: true }))));

    // 天井の明かり。窓から入る光だけでは暗いので、1 つだけ置く
    const light = new PointLight('#ffe9c4', 12, 9, 2);
    light.position.set(0, h - 0.3, 0.5);
    this.group.add(light);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.removeFromParent();
  }

  private track<T extends BufferGeometry | Material>(resource: T): T {
    if ('isMaterial' in resource) this.materials.push(resource as Material);
    else this.geometries.push(resource as BufferGeometry);
    return resource;
  }
}

/** 内側を向いた壁の板。中心を (x, y, z) に置き、X 軸・Y 軸まわりに回して向きを決める */
function wall(width: number, height: number, x: number, y: number, z: number, rx: number, ry: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height);
  geometry.rotateX(rx);
  geometry.rotateY(ry);
  geometry.translate(x, y, z);
  return geometry;
}

/** 中心を (x, y, z) に置いた直方体。まとめて 1 つのジオメトリにするための部品 */
function box(width: number, height: number, depth: number, x: number, y: number, z: number): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}
