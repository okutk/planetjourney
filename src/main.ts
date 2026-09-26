import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { alignToUp, upAt } from './core/sphere';

// M0: デプロイ確認用の最小シーン。小さな星がゆっくり回るだけ。
// 本格的な実装は docs/ROADMAP.md の M1 以降で行う。

const PLANET_RADIUS = 5;
const MAX_PIXEL_RATIO = 2; // スマホで描画負荷が跳ね上がらないよう上限を設ける

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

const scene = new Scene();
scene.background = new Color('#0b1026');

const camera = new PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(0, 4, 16);
camera.lookAt(0, 0, 0);

scene.add(new HemisphereLight('#bcd4ff', '#2a1f3d', 0.9));
const sun = new DirectionalLight('#fff2d6', 2.2);
sun.position.set(8, 10, 6);
scene.add(sun);

const planet = new Group();
scene.add(planet);

planet.add(
  new Mesh(
    new IcosahedronGeometry(PLANET_RADIUS, 3),
    new MeshStandardMaterial({ color: '#7fcf8a', flatShading: true }),
  ),
);

// 地表に木を立てて、球面に沿った配置（upAt / alignToUp）の動作確認を兼ねる
const treeGeometry = new ConeGeometry(0.35, 1.2, 6);
treeGeometry.translate(0, 0.6, 0);
const treeMaterial = new MeshStandardMaterial({ color: '#2f7a4b', flatShading: true });
const center = new Vector3();
for (let i = 0; i < 24; i++) {
  const direction = new Vector3().randomDirection();
  const tree = new Mesh(treeGeometry, treeMaterial);
  tree.position.copy(direction).multiplyScalar(PLANET_RADIUS * 0.97);
  tree.quaternion.copy(alignToUp(upAt(tree.position, center)));
  planet.add(tree);
}

scene.add(createStarField(800, 120));

function createStarField(count: number, radius: number): Points {
  const positions: number[] = [];
  const p = new Vector3();
  for (let i = 0; i < count; i++) {
    p.randomDirection().multiplyScalar(radius);
    positions.push(p.x, p.y, p.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ color: '#ffffff', size: 0.6 }));
}

function resize(): void {
  const { clientWidth: width, clientHeight: height } = canvas;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((time) => {
  planet.rotation.y = time * 0.0001;
  planet.rotation.x = Math.sin(time * 0.00005) * 0.2;
  renderer.render(scene, camera);
});
