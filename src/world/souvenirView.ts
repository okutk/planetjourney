import {
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import type { SlotDef, SouvenirDef } from '../ai/souvenir';

/** 形ごとのジオメトリ（おみやげは小さいので、ポリゴンは少なめ） */
function shapeGeometry(shape: string): BufferGeometry {
  switch (shape) {
    case 'crystal':
      return new OctahedronGeometry(0.11).scale(0.7, 1.4, 0.7);
    case 'shell':
      return new SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.2);
    default:
      return new DodecahedronGeometry(0.08).scale(1.2, 0.7, 1);
  }
}

/**
 * 船の部屋に飾ったおみやげの見た目。置き場所ごとに、淡く光る台座とおみやげを置く。
 * group は船の部屋（ShipRoomView.group）に入れる（部屋の座標で置き、部屋と一緒に表示が切り替わる）。
 * 不要になったら dispose() する。
 */
export class SouvenirView {
  readonly group = new Group();
  private readonly pedestal = new CylinderGeometry(0.13, 0.15, 0.03, 16);
  private readonly pedestalMaterial = new MeshStandardMaterial({ color: '#9fe8ff', emissive: '#3aa8d0', emissiveIntensity: 0.6 });
  private readonly owned: { geometry: BufferGeometry; material: MeshStandardMaterial }[] = [];

  /** おみやげを置き場所に置く */
  place(souvenir: SouvenirDef, slot: SlotDef): void {
    const [x, y, z] = slot.position;
    const base = new Mesh(this.pedestal, this.pedestalMaterial);
    base.position.set(x, y + 0.015, z);
    const geometry = shapeGeometry(souvenir.shape);
    geometry.computeBoundingBox();
    const lift = -(geometry.boundingBox?.min.y ?? 0); // 底を台座の上にそろえる
    const material = new MeshStandardMaterial({ color: souvenir.color, emissive: souvenir.color, emissiveIntensity: 0.25, roughness: 0.4 });
    const item = new Mesh(geometry, material);
    item.position.set(x, y + 0.03 + lift, z);
    item.rotation.y = x * 1.7 + z; // 置き場所ごとに少し向きを変える
    this.owned.push({ geometry, material });
    this.group.add(base, item);
  }

  dispose(): void {
    for (const { geometry, material } of this.owned) {
      geometry.dispose();
      material.dispose();
    }
    this.owned.length = 0;
    this.pedestal.dispose();
    this.pedestalMaterial.dispose();
    this.group.removeFromParent();
  }
}
