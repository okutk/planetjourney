import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
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
import { DEFAULT_WALKER_CONFIG, SphericalWalker, type WalkInput } from './core/walker';

// M1: 球面重力で星の上を歩き、ジャンプできるシーン。
// 操作は動作確認用の最小限のもの。
//   キーボード: W/S で前後、A/D で向きを変える、Space でジャンプ
//   タッチ: 画面の左半分を押しているあいだ前進、右半分をタップでジャンプ
// 本格的なタッチ操作（仮想スティック）・三人称カメラ・地形は別のテーマで入れる。
// シーンはページと同じ寿命なので、後片付けはページの破棄（開発時はフルリロード）に任せる。

const PLANET_RADIUS = 5;
const MAX_PIXEL_RATIO = 2; // スマホで描画負荷が跳ね上がらないよう上限を設ける
const MAX_DT = 1 / 30; // タブ復帰などで dt が跳ねても地面を突き抜けないよう上限を設ける
const TURN_SPEED = 2.5; // 向きを変える速さ（ラジアン/秒）
const CAMERA_DISTANCE = 7;
const CAMERA_HEIGHT = 4;
const CAMERA_DAMPING = 6; // 大きいほどカメラがすぐ追いつく

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

const scene = new Scene();
scene.background = new Color('#0b1026');

const camera = new PerspectiveCamera(50, 1, 0.1, 500);

scene.add(new HemisphereLight('#bcd4ff', '#2a1f3d', 0.9));
const sun = new DirectionalLight('#fff2d6', 2.2);
sun.position.set(8, 10, 6);
scene.add(sun);

const planetCenter = new Vector3();
scene.add(
  new Mesh(
    new IcosahedronGeometry(PLANET_RADIUS, 3),
    new MeshStandardMaterial({ color: '#7fcf8a', flatShading: true }),
  ),
);

// 地表の木。歩いたときに進んでいることが分かる目印を兼ねる
const treeGeometry = new ConeGeometry(0.35, 1.2, 6);
treeGeometry.translate(0, 0.6, 0);
const treeMaterial = new MeshStandardMaterial({ color: '#2f7a4b', flatShading: true });
for (let i = 0; i < 24; i++) {
  const direction = new Vector3().randomDirection();
  const tree = new Mesh(treeGeometry, treeMaterial);
  tree.position.copy(direction).multiplyScalar(PLANET_RADIUS * 0.97);
  tree.quaternion.copy(alignToUp(upAt(tree.position, planetCenter)));
  scene.add(tree);
}

// プレイヤー（仮の見た目）。足元が原点、+Z が正面。向きが分かるよう正面に目印を付ける
const player = new Group();
const bodyGeometry = new CapsuleGeometry(0.3, 0.6, 4, 8);
bodyGeometry.translate(0, 0.6, 0);
player.add(new Mesh(bodyGeometry, new MeshStandardMaterial({ color: '#f4c7d8' })));
const noseGeometry = new BoxGeometry(0.2, 0.12, 0.2);
noseGeometry.translate(0, 0.9, 0.3);
player.add(new Mesh(noseGeometry, new MeshStandardMaterial({ color: '#40325c' })));
scene.add(player);

const walker = new SphericalWalker({
  ...DEFAULT_WALKER_CONFIG,
  center: planetCenter,
  planetRadius: PLANET_RADIUS,
});

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

// キーボード入力（動作確認用）
const pressed = new Set<string>();
let jumpRequested = false;
function onKeyDown(event: KeyboardEvent): void {
  pressed.add(event.code);
  if (event.code === 'Space') {
    if (!event.repeat) jumpRequested = true;
    event.preventDefault();
  }
}
function onKeyUp(event: KeyboardEvent): void {
  pressed.delete(event.code);
}
function onBlur(): void {
  pressed.clear();
  walkPointers.clear();
}
function axis(positive: string, negative: string): number {
  return (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0);
}
// 最小限のタッチ入力（仮想スティックが入るまでのつなぎ）
const walkPointers = new Set<number>();
function onPointerDown(event: PointerEvent): void {
  if (event.clientX < window.innerWidth / 2) walkPointers.add(event.pointerId);
  else jumpRequested = true;
}
function onPointerUp(event: PointerEvent): void {
  walkPointers.delete(event.pointerId);
}
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', onBlur);

function resize(): void {
  const { clientWidth: width, clientHeight: height } = canvas;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// カメラはプレイヤーの後ろ上から追う（毎フレーム new しないよう使い回す）
const cameraGoal = new Vector3();
const cameraTarget = new Vector3();
function cameraGoalFor(out: Vector3): Vector3 {
  return out
    .copy(walker.position)
    .addScaledVector(walker.up, CAMERA_HEIGHT)
    .addScaledVector(walker.forward, -CAMERA_DISTANCE);
}
function updateCamera(dt: number): void {
  cameraGoalFor(cameraGoal);
  const t = 1 - Math.exp(-CAMERA_DAMPING * dt);
  camera.position.lerp(cameraGoal, t);
  camera.up.lerp(walker.up, t).normalize();
  cameraTarget.copy(walker.position).addScaledVector(walker.up, 1);
  camera.lookAt(cameraTarget);
}
camera.position.copy(cameraGoalFor(cameraGoal));
camera.up.copy(walker.up);

const input: WalkInput = { forward: 0, right: 0, jump: false };
let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_DT);
  lastTime = time;

  walker.turn(axis('KeyA', 'KeyD') * TURN_SPEED * dt);
  input.forward = walkPointers.size > 0 ? 1 : axis('KeyW', 'KeyS');
  input.jump = jumpRequested;
  jumpRequested = false;
  walker.step(input, dt);

  player.position.copy(walker.position);
  walker.orientation(player.quaternion);
  updateCamera(dt);
  renderer.render(scene, camera);
});
