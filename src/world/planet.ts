import {
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { createRandom } from '../core/noise';
import { alignToUp } from '../core/sphere';
import { scatterDirections, type Terrain } from '../core/terrain';

/** 星の見た目の設定値。 */
export interface PlanetLookConfig {
  /** 地表メッシュの細かさ（IcosahedronGeometry の detail） */
  detail: number;
  groundColor: string;
  treeCount: number;
  rockCount: number;
  /** 配置物の並びを決める種 */
  seed: number;
  /** この方向のまわり（spawnClearance ラジアン以内）には何も置かない */
  spawn: Vector3;
  spawnClearance: number;
}

/** 星の見た目（起伏のある地表・木・岩）。不要になったら dispose() する。 */
export class PlanetView {
  readonly group = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly instanced: InstancedMesh[] = [];

  constructor(terrain: Terrain, look: PlanetLookConfig) {
    this.group.add(this.createGround(terrain, look));
    this.scatterProps(terrain, look);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const mesh of this.instanced) mesh.dispose();
    this.group.removeFromParent();
  }

  private createGround(terrain: Terrain, look: PlanetLookConfig): Mesh {
    const geometry = this.track(new IcosahedronGeometry(1, look.detail));
    // 単位球の各頂点を、その方向の地表の半径まで押し出す
    const positions = geometry.getAttribute('position');
    const v = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i).normalize();
      v.multiplyScalar(terrain.radiusAt(v));
      positions.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const material = this.track(new MeshStandardMaterial({ color: look.groundColor, flatShading: true }));
    return new Mesh(geometry, material);
  }

  private scatterProps(terrain: Terrain, look: PlanetLookConfig): void {
    const random = createRandom(look.seed);
    const create = () => new Vector3();
    // 同じ形の配置物は InstancedMesh にまとめ、1 回の描画（ドローコール）で描く
    const dummy = new Object3D();
    const place = (direction: Vector3, sink: number) => {
      dummy.position.copy(direction).multiplyScalar(terrain.radiusAt(direction) - sink);
      dummy.quaternion.copy(alignToUp(direction));
    };

    // 木（円すい）。高さに少しばらつきを持たせる
    const treeGeometry = this.track(new ConeGeometry(0.35, 1.2, 6));
    treeGeometry.translate(0, 0.6, 0);
    const treeMaterial = this.track(new MeshStandardMaterial({ color: '#2f7a4b', flatShading: true }));
    const treeDirections = scatterDirections(look.treeCount, random, look.spawn, look.spawnClearance, create);
    const trees = new InstancedMesh(treeGeometry, treeMaterial, treeDirections.length);
    treeDirections.forEach((direction, i) => {
      dummy.scale.setScalar(0.7 + random() * 0.6);
      place(direction, 0.05);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(trees);

    // 岩（つぶした十二面体）。地面に少し埋めて置く
    const rockGeometry = this.track(new DodecahedronGeometry(0.3, 0));
    const rockMaterial = this.track(new MeshStandardMaterial({ color: '#8a8fa3', flatShading: true }));
    const rockDirections = scatterDirections(look.rockCount, random, look.spawn, look.spawnClearance, create);
    const rocks = new InstancedMesh(rockGeometry, rockMaterial, rockDirections.length);
    rockDirections.forEach((direction, i) => {
      dummy.scale.set(0.8 + random() * 0.8, 0.5 + random() * 0.4, 0.8 + random() * 0.8);
      place(direction, 0.08);
      dummy.rotateY(random() * Math.PI * 2);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(rocks);
    this.instanced.push(trees, rocks);
  }

  private track<T extends BufferGeometry | Material>(resource: T): T {
    if ('isMaterial' in resource) this.materials.push(resource as Material);
    else this.geometries.push(resource as BufferGeometry);
    return resource;
  }
}
