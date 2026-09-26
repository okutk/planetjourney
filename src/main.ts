import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DialogueSelector, parseRules } from './ai/dialogue';
import { TalkDirector } from './ai/talk';
import { pipopaTimeline, DEFAULT_PIPOPA_CONFIG } from './audio/pipopa';
import { VoicePlayer } from './audio/voicePlayer';
import { createRandom } from './core/noise';
import dialogueData from './data/dialogue.json';
import { SpeechBubble } from './ui/speechBubble';
import { DEFAULT_FOLLOW_CONFIG, followIntent, followSlot, type FollowIntent } from './ai/companion';
import { MiraPlaceholder } from './character/miraPlaceholder';
import { DEFAULT_ORBIT_CAMERA_CONFIG, OrbitCamera } from './core/orbitCamera';
import { Terrain } from './core/terrain';
import { DEFAULT_WALKER_CONFIG, SphericalWalker, type WalkInput } from './core/walker';
import { PerfOverlay } from './ui/perfOverlay';
import { TouchControls } from './ui/touchControls';
import { PlanetView } from './world/planet';

// M1: 「はじまりの星」の上を、球面重力で歩いてジャンプできるシーン。
// 操作（移動はカメラから見た向き。プレイヤーは進む方向へ向き直る）
//   タッチ: 左半分に仮想スティック、右半分のドラッグでカメラを回す（上下で見下ろす角度）、右下のボタンでジャンプ
//   キーボード・マウス（補助）: WASD で移動、Space でジャンプ、矢印キーかマウスのドラッグでカメラを回す、
//   ホイールでズーム
// シーンはページと同じ寿命なので、後片付けはページの破棄（開発時はフルリロード）に任せる。

const PLANET_RADIUS = 5;
const MAX_PIXEL_RATIO = 2; // スマホで描画負荷が跳ね上がらないよう上限を設ける
const MAX_DT = 1 / 30; // タブ復帰などで dt が跳ねても地面を突き抜けないよう上限を設ける
const TURN_SPEED = 12; // プレイヤーが進む方向へ向き直る速さ（ラジアン/秒）
const MIRA_WALK_SPEED = 5.5; // プレイヤーより少し速く、離されても追いつける
const CAMERA_DAMPING = 6; // 大きいほどカメラがすぐ追いつく
const KEY_CAMERA_SPEED = 2; // 矢印キーでカメラを回す速さ（ラジアン/秒）

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

// 「はじまりの星」。地形は歩く処理と見た目で同じものを使う
const planetCenter = new Vector3();
const SPAWN_DIRECTION = new Vector3(0, 1, 0);
const terrain = new Terrain({ radius: PLANET_RADIUS, amplitude: 0.5, frequency: 1.3, octaves: 3, seed: 1 });
const planet = new PlanetView(terrain, {
  detail: 16,
  groundColor: '#7fcf8a',
  treeCount: 28,
  rockCount: 18,
  seed: 2,
  spawn: SPAWN_DIRECTION,
  spawnClearance: 0.25,
});
scene.add(planet.group);

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
  surfaceRadius: (up) => terrain.radiusAt(up),
});
// 出現位置は、配置物をあけておく方向と同じにする
walker.placeAt(SPAWN_DIRECTION, new Vector3(0, 0, 1));

// ミラ（仮の見た目）。プレイヤーの斜め後ろの定位置を目指して、同じ球面重力で歩く
const mira = new MiraPlaceholder();
scene.add(mira.group);
const miraWalker = new SphericalWalker({
  ...DEFAULT_WALKER_CONFIG,
  walkSpeed: MIRA_WALK_SPEED,
  center: planetCenter,
  planetRadius: PLANET_RADIUS,
  surfaceRadius: (up) => terrain.radiusAt(up),
});
// 最初からプレイヤーの斜め後ろの定位置に立たせる（出現方向を変えても一緒に動く）
miraWalker.placeAt(
  followSlot(walker, DEFAULT_FOLLOW_CONFIG, new Vector3()).sub(planetCenter),
  walker.forward,
);
const miraIntent: FollowIntent = { direction: new Vector3(), amount: 0 };
const miraInput: WalkInput = { forward: 0, right: 0, jump: false };

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

// キーボード入力（補助）
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
  touch.release();
}
function axis(positive: string, negative: string): number {
  return (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0);
}
const touch = new TouchControls(canvas, document.querySelector<HTMLElement>('#controls')!);
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

// 三人称カメラ。向きはプレイヤーと一緒に運び、歩いているとしばらくして後ろへ回り込む。
// 実際のカメラは目標の位置へ減衰付きで追いかける（毎フレーム new しないよう使い回す）
const orbit = new OrbitCamera(DEFAULT_ORBIT_CAMERA_CONFIG, walker.forward, walker.up);
const cameraRight = new Vector3();
const cameraGoal = new Vector3();
const cameraTarget = new Vector3();
const moveDirection = new Vector3();
function updateCamera(dt: number): void {
  orbit.eye(walker.position, walker.up, cameraGoal);
  const t = 1 - Math.exp(-CAMERA_DAMPING * dt);
  camera.position.lerp(cameraGoal, t);
  camera.up.lerp(walker.up, t).normalize();
  camera.lookAt(orbit.target(walker.position, walker.up, cameraTarget));
}
camera.position.copy(orbit.eye(walker.position, walker.up, cameraGoal));
camera.up.copy(walker.up);

// URL に ?debug を付けると、性能（fps・ドローコール数など）を表示する
const perf = new URLSearchParams(window.location.search).has('debug')
  ? new PerfOverlay(document.body, renderer)
  : null;

// ミラの会話。セリフは src/data/dialogue.json から条件で選び、吹き出しとピポパ音声で話す
const ARRIVE_TALK_DELAY = 1; // 着いてから話し始めるまで（秒）
const talk = new TalkDirector(
  new DialogueSelector(parseRules(dialogueData), createRandom(Date.now())),
  (text) => {
    const { revealAt } = pipopaTimeline(text);
    return (revealAt.at(-1) ?? 0) + DEFAULT_PIPOPA_CONFIG.charInterval;
  },
  'はじまりの星',
);
const voice = new VoicePlayer();
const bubble = new SpeechBubble(document.body);
// 音はユーザーが画面に触れる（キーを押す）まで鳴らせないので、最初の操作で準備する。
// タッチの pointerdown はユーザー操作として数えられないブラウザがあるので、pointerup・touchend でも呼ぶ
const unlockVoice = () => voice.unlock();
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
  window.addEventListener(type, unlockVoice);
}
function speak(text: string, now: number): void {
  const { beeps, revealAt } = pipopaTimeline(text);
  voice.play(beeps);
  bubble.show(text, revealAt, now);
}
let arrived = false;
const bubbleAnchor = new Vector3();

const input: WalkInput = { forward: 0, right: 0, jump: false };
let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  // 性能表示には上限で切る前の経過時間を渡す（30fps を下回ったことも表示できるように）
  const rawDt = lastTime === undefined ? 0 : (time - lastTime) / 1000;
  const dt = Math.min(rawDt, MAX_DT);
  lastTime = time;

  orbit.rotate(
    touch.consumeYaw() + axis('ArrowRight', 'ArrowLeft') * KEY_CAMERA_SPEED * dt,
    touch.consumePitch() + axis('ArrowUp', 'ArrowDown') * KEY_CAMERA_SPEED * dt,
    walker.up,
  );
  orbit.zoom(touch.consumeZoom());

  // スティック（なければキーボード）の入力を、カメラから見た地表の向きに直す
  let stickX = touch.stick.x;
  let stickY = touch.stick.y;
  if (stickX === 0 && stickY === 0) {
    stickX = axis('KeyD', 'KeyA');
    stickY = axis('KeyW', 'KeyS');
  }
  const amount = Math.min(1, Math.hypot(stickX, stickY));
  cameraRight.crossVectors(orbit.heading, walker.up);
  moveDirection.copy(orbit.heading).multiplyScalar(stickY).addScaledVector(cameraRight, stickX);
  if (amount > 0) walker.faceTowards(moveDirection, TURN_SPEED * dt);

  input.forward = amount;
  input.jump = jumpRequested || touch.consumeJump();
  jumpRequested = false;
  const wasGrounded = walker.grounded;
  walker.step(input, dt);
  orbit.transport(walker.lastRotation, walker.up);
  orbit.update(dt, walker.forward, walker.up, stickX, stickY);

  followIntent(miraWalker, walker, DEFAULT_FOLLOW_CONFIG, miraIntent);
  if (miraIntent.amount > 0) miraWalker.faceTowards(miraIntent.direction, TURN_SPEED * dt);
  miraInput.forward = miraIntent.amount;
  miraWalker.step(miraInput, dt);

  // 会話: 着いたとき・ジャンプしたとき・しばらく放っておかれたとき
  const now = time / 1000;
  const line =
    !arrived && now > ARRIVE_TALK_DELAY
      ? ((arrived = true), talk.arrive(now))
      : wasGrounded && !walker.grounded && input.jump
        ? talk.jumped(now)
        : talk.update(dt, amount > 0, now);
  if (line) speak(line.text, now);

  player.position.copy(walker.position);
  walker.orientation(player.quaternion);
  mira.group.position.copy(miraWalker.position);
  miraWalker.orientation(mira.group.quaternion);
  updateCamera(dt);
  renderer.render(scene, camera);

  // 吹き出しはミラの頭の上に出す（画面の外やカメラの後ろなら隠す）
  bubbleAnchor.copy(miraWalker.position).addScaledVector(miraWalker.up, 1.1).project(camera);
  bubble.update(
    now,
    ((bubbleAnchor.x + 1) / 2) * canvas.clientWidth,
    ((1 - bubbleAnchor.y) / 2) * canvas.clientHeight,
    bubbleAnchor.z < 1 && Math.abs(bubbleAnchor.x) < 1 && Math.abs(bubbleAnchor.y) < 1,
  );
  perf?.update(rawDt);
});
