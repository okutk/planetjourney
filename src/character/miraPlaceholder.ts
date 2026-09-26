import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

/**
 * ミラの仮の見た目（VRM モデルが決まるまでのもの）。ホログラムらしく、水色でうっすら光る。
 * 足元が原点、+Z が正面。不要になったら dispose() する。
 */
export class MiraPlaceholder {
  readonly group = new Group();
  private readonly body = new CapsuleGeometry(0.22, 0.45, 4, 8);
  private readonly eye = new SphereGeometry(0.05, 8, 6);
  private readonly bodyMaterial = new MeshStandardMaterial({
    color: '#9fe8ff',
    emissive: '#3fb8e0',
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.85,
  });
  private readonly eyeMaterial = new MeshStandardMaterial({ color: '#1d2a4d' });

  constructor() {
    this.body.translate(0, 0.45, 0);
    this.group.add(new Mesh(this.body, this.bodyMaterial));
    // 正面が分かるよう、目を 2 つ付ける
    for (const x of [-0.08, 0.08]) {
      const eye = new Mesh(this.eye, this.eyeMaterial);
      eye.position.set(x, 0.7, 0.2);
      this.group.add(eye);
    }
  }

  dispose(): void {
    this.body.dispose();
    this.eye.dispose();
    this.bodyMaterial.dispose();
    this.eyeMaterial.dispose();
    this.group.removeFromParent();
  }
}
