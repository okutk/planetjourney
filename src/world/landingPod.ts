import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { alignToUp } from '../core/sphere';
import type { Terrain } from '../core/terrain';

/**
 * 着陸ポッド。星の上で船に戻るための目印で、地表の direction の方向に立てる。
 * 不要になったら dispose() する。
 */
export class LandingPod {
  readonly group = new Group();
  /** 地表に置いた位置（ワールド座標。星の中心が原点） */
  readonly position = new Vector3();
  private readonly body = new CylinderGeometry(0.4, 0.55, 1, 8);
  private readonly roof = new ConeGeometry(0.42, 0.5, 8);
  private readonly bodyMaterial = new MeshStandardMaterial({ color: '#d5dbf2', flatShading: true });
  private readonly roofMaterial = new MeshStandardMaterial({ color: '#f4c7d8', flatShading: true });

  constructor(terrain: Terrain, direction: Vector3) {
    this.body.translate(0, 0.45, 0);
    this.roof.translate(0, 1.2, 0);
    this.group.add(new Mesh(this.body, this.bodyMaterial), new Mesh(this.roof, this.roofMaterial));
    this.position.copy(direction).multiplyScalar(terrain.radiusAt(direction) - 0.05);
    this.group.position.copy(this.position);
    this.group.quaternion.copy(alignToUp(direction));
  }

  dispose(): void {
    this.body.dispose();
    this.roof.dispose();
    this.bodyMaterial.dispose();
    this.roofMaterial.dispose();
    this.group.removeFromParent();
  }
}
