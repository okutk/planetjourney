import {
  Color,
  ConeGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { createRandom } from '../core/noise';
import type { PlanetLook, PropKind } from '../core/planets';
import { alignToUp } from '../core/sphere';
import { scatterDirections, type Terrain } from '../core/terrain';

/** 星の見た目の設定値。JSON の look に、出現位置まわりの値を足したもの。 */
export interface PlanetLookConfig extends PlanetLook {
  /** 地表メッシュの細かさ（IcosahedronGeometry の detail） */
  detail: number;
  /** この方向のまわり（spawnClearance ラジアン以内）には何も置かない */
  spawn: Vector3;
  spawnClearance: number;
}

/** 配置物の種類ごとの形と置き方。 */
interface PropShape {
  geometry: () => BufferGeometry;
  /** 地面に埋める深さ */
  sink: number;
  emissive?: boolean;
  scale: (random: () => number, dummy: Object3D) => void;
}

const PROP_SHAPES: Record<PropKind, PropShape> = {
  // 木（円すい）。高さに少しばらつきを持たせる
  tree: {
    geometry: () => new ConeGeometry(0.35, 1.2, 6).translate(0, 0.6, 0),
    sink: 0.05,
    scale: (random, dummy) => dummy.scale.setScalar(0.7 + random() * 0.6),
  },
  // 岩（つぶした十二面体）
  rock: {
    geometry: () => new DodecahedronGeometry(0.3, 0),
    sink: 0.08,
    scale: (random, dummy) => {
      dummy.scale.set(0.8 + random() * 0.8, 0.5 + random() * 0.4, 0.8 + random() * 0.8);
      dummy.rotateY(random() * Math.PI * 2);
    },
  },
  // 結晶（細長い八面体）。うっすら光る
  crystal: {
    geometry: () => new OctahedronGeometry(0.22, 0).translate(0, 0.22, 0),
    sink: 0.12,
    emissive: true,
    scale: (random, dummy) => {
      dummy.scale.set(0.8 + random() * 0.5, 1.6 + random() * 1.6, 0.8 + random() * 0.5);
      dummy.rotateY(random() * Math.PI * 2);
      dummy.rotateX((random() - 0.5) * 0.5);
    },
  },
};

/** 星の見た目（起伏のある地表・配置物）。不要になったら dispose() する。 */
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
    // 単位球の各頂点を、その方向の地表の半径まで押し出す。海のある星は、陸と海で頂点の色を変える
    const positions = geometry.getAttribute('position');
    const v = new Vector3();
    const ground = new Color(look.groundColor);
    const sea = look.seaColor === undefined ? null : new Color(look.seaColor);
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i).normalize();
      if (sea) {
        const c = terrain.isLand(v) ? ground : sea;
        colors.push(c.r, c.g, c.b);
      }
      v.multiplyScalar(terrain.radiusAt(v));
      positions.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    if (sea) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const material = this.track(
      new MeshStandardMaterial({ color: sea ? '#ffffff' : look.groundColor, vertexColors: sea !== null, flatShading: true }),
    );
    return new Mesh(geometry, material);
  }

  private scatterProps(terrain: Terrain, look: PlanetLookConfig): void {
    const random = createRandom(look.seed);
    const create = () => new Vector3();
    // 同じ形の配置物は InstancedMesh にまとめ、1 回の描画（ドローコール）で描く
    const dummy = new Object3D();
    for (const prop of look.props) {
      const shape = PROP_SHAPES[prop.kind];
      const geometry = this.track(shape.geometry());
      const material = this.track(
        new MeshStandardMaterial({
          color: prop.color,
          flatShading: true,
          ...(shape.emissive ? { emissive: prop.color, emissiveIntensity: 0.35 } : {}),
        }),
      );
      // 海のある星では、陸の上にだけ置く（海の上に置きたい方向は捨てる）
      const directions = scatterDirections(prop.count, random, look.spawn, look.spawnClearance, create).filter((d) =>
        terrain.isLand(d),
      );
      const mesh = new InstancedMesh(geometry, material, directions.length);
      directions.forEach((direction, i) => {
        dummy.scale.setScalar(1);
        dummy.quaternion.copy(alignToUp(direction));
        dummy.position.copy(direction).multiplyScalar(terrain.radiusAt(direction) - shape.sink);
        shape.scale(random, dummy);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(mesh);
      this.instanced.push(mesh);
    }
  }

  private track<T extends BufferGeometry | Material>(resource: T): T {
    if ('isMaterial' in resource) this.materials.push(resource as Material);
    else this.geometries.push(resource as BufferGeometry);
    return resource;
  }
}
