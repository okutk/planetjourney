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
import { Emotion, emotionalStride, emotionVoice, moodFace, parseEmotionRules } from './ai/emotion';
import { TalkDirector } from './ai/talk';
import { pipopaTimeline, DEFAULT_PIPOPA_CONFIG } from './audio/pipopa';
import { VoicePlayer } from './audio/voicePlayer';
import { createRandom } from './core/noise';
import dialogueData from './data/dialogue.json';
import emotionData from './data/emotion.json';
import { SpeechBubble } from './ui/speechBubble';
import { DEFAULT_FOLLOW_CONFIG, followIntent, followSlot, seekIntent, type FollowIntent } from './ai/companion';
import { Projector, TASK_RANGE } from './ai/projection';
import { MiraView } from './character/mira';
import { Journey } from './core/journey';
import { ACTION_RADIUS, parsePlanets, POD_ANGLE, type PlanetInfo } from './core/planets';
import { ARRIVE_RADIUS, MiraTask, REQUEST_RADIUS, SLOW_RADIUS } from './core/gimmick';
import { DEFAULT_ORBIT_CAMERA_CONFIG, OrbitCamera } from './core/orbitCamera';
import { RoomWalker } from './core/roomWalker';
import { behindOn } from './core/sphere';
import { Terrain } from './core/terrain';
import { DEFAULT_WALKER_CONFIG, SphericalWalker, type Walker, type WalkInput } from './core/walker';
import { DEFAULT_WARP_CONFIG, WarpSequence } from './core/warp';
import planetsData from './data/planets.json';
import { FADE_SECONDS, Fader } from './ui/fade';
import { PerfOverlay } from './ui/perfOverlay';
import { StarMapPanel } from './ui/starMap';
import { TouchControls } from './ui/touchControls';
import { GimmickView } from './world/gimmickView';
import { LandingPod } from './world/landingPod';
import { PlanetView } from './world/planet';
import { SHIP_ROOM, ShipRoomView } from './world/shipRoom';
import { WarpStreaks } from './world/warpStreaks';

// M3: 船の部屋（拠点）と 3 つの星を行き来する。星の定義（地形・見た目・出現位置）は src/data/planets.json。
// 船の部屋は最後に降りた星のそばに浮かんでいて、窓から星が見える。星図の台に近づいて「星図」を開き、
// 星を選ぶとワープして降りる（星の見た目は降りるたびに作り、前の星は捨てる）。
// 星の上では着陸ポッドのそばで「船に戻る」と部屋へ戻る。
// 星には仕掛け（灯り・刻まれた石・岩のすきま）があり、近づいて「ミラに頼む」とミラが歩いていって解く。
// ミラは腕輪の投影なので、作業のあいだプレイヤーがそばにいないと止まる（役割分担）。
// 操作（移動はカメラから見た向き。プレイヤーは進む方向へ向き直る）
//   タッチ: 左半分に仮想スティック、右半分のドラッグでカメラを回す（上下で見下ろす角度）、右下のボタンでジャンプ、
//   調べられる物の近くではその上に「星図」「船に戻る」のボタン
//   キーボード・マウス（補助）: WASD で移動、Space でジャンプ、E か Enter で調べる、矢印キーかマウスのドラッグで
//   カメラを回す、ホイールでズーム
// シーンはページと同じ寿命なので、後片付けはページの破棄（開発時はフルリロード）に任せる。

const PLANETS = parsePlanets(planetsData);
const PLANET_DETAIL = 16; // 地表メッシュの細かさ
const SHIP_POSITION = new Vector3(0, -1.5, 20); // 船の部屋の床の中心。窓（-Z 側）から星が見える距離
const MAX_PIXEL_RATIO = 2; // スマホで描画負荷が跳ね上がらないよう上限を設ける
const MAX_DT = 1 / 30; // タブ復帰などで dt が跳ねても地面を突き抜けないよう上限を設ける
const TURN_SPEED = 12; // プレイヤーが進む方向へ向き直る速さ（ラジアン/秒）
const MIRA_WALK_SPEED = 5.5; // プレイヤーより少し速く、離されても追いつける
const CAMERA_DAMPING = 6; // 大きいほどカメラがすぐ追いつく
const KEY_CAMERA_SPEED = 2; // 矢印キーでカメラを回す速さ（ラジアン/秒）
const BODY_RADIUS = 0.3; // プレイヤーの体の太さ（壁や台にめり込まない距離）
const ARRIVE_TALK_DELAY = 1; // 場所に入ってから話し始めるまで（秒）
const WARP_LINE_MARGIN = 0.6; // ワープのセリフを言い切ってから暗転するまでの間（秒）

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

const scene = new Scene();
scene.background = new Color('#0b1026');

const camera = new PerspectiveCamera(50, 1, 0.1, 500);

scene.add(new HemisphereLight('#bcd4ff', '#2a1f3d', 0.9));
const sun = new DirectionalLight('#fff2d6', 2.2);
sun.position.set(8, 10, 6);
scene.add(sun);

// 星はいつも原点に置く（船の部屋はそのそばに浮かぶ）
const planetCenter = new Vector3();
const SPAWN_HEADING = new Vector3(0, 0, 1); // 降りたときに向く方向（地表に沿うよう補正する）

// 船の部屋。星のそばに浮かべ、星の上にいるあいだは隠す
const shipRoom = new ShipRoomView();
shipRoom.group.position.copy(SHIP_POSITION);
scene.add(shipRoom.group);

// プレイヤー（仮の見た目）。足元が原点、+Z が正面。向きが分かるよう正面に目印を付ける
const player = new Group();
const bodyGeometry = new CapsuleGeometry(BODY_RADIUS, 0.6, 4, 8);
bodyGeometry.translate(0, 0.6, 0);
player.add(new Mesh(bodyGeometry, new MeshStandardMaterial({ color: '#f4c7d8' })));
const noseGeometry = new BoxGeometry(0.2, 0.12, 0.2);
noseGeometry.translate(0, 0.9, 0.3);
player.add(new Mesh(noseGeometry, new MeshStandardMaterial({ color: '#40325c' })));
scene.add(player);

// ミラの感情（src/data/emotion.json）。出来事で動き、時間とともに落ち着く。表情・歩く速さ・声・セリフ選びに反映する
const emotion = new Emotion(parseEmotionRules(emotionData));
const voiceConfig = { ...DEFAULT_PIPOPA_CONFIG };
/** いまの感情に合わせた声の設定（文字送りと音で同じものを使う） */
function currentVoice(): typeof voiceConfig {
  return emotionVoice(emotion.values, DEFAULT_PIPOPA_CONFIG, voiceConfig);
}

// ミラの会話。セリフは src/data/dialogue.json から条件で選び、吹き出しとピポパ音声で話す
/** セリフを話し終えるまでの秒数（文字送り・音の長さに合わせる） */
function speechDuration(text: string): number {
  const config = currentVoice();
  const { revealAt } = pipopaTimeline(text, config);
  return (revealAt.at(-1) ?? 0) + config.charInterval;
}
const talk = new TalkDirector(
  new DialogueSelector(parseRules(dialogueData), createRandom(Date.now())),
  speechDuration,
  emotion,
);

// ミラ。VRM を読み込むまでは仮の見た目。プレイヤーの斜め後ろの定位置を目指して、プレイヤーと同じ歩き方でついてくる
const mira = new MiraView();
scene.add(mira.group);
const miraIntent: FollowIntent = { direction: new Vector3(), amount: 0 };
const miraInput: WalkInput = { forward: 0, right: 0, jump: false };

// 場所ごとの歩き手。星は球面重力（星ごとに作る）、船の部屋は平らな床
const roomConfig = {
  ...DEFAULT_WALKER_CONFIG,
  origin: SHIP_POSITION,
  halfWidth: SHIP_ROOM.halfWidth - BODY_RADIUS,
  halfDepth: SHIP_ROOM.halfDepth - BODY_RADIUS,
  obstacles: [SHIP_ROOM.console],
};

/** 調べられる物。近づくとボタンが出て、押すと act() が呼ばれる */
interface Interactable {
  /** 位置（ワールド座標） */
  readonly position: Vector3;
  /** ボタンの文言 */
  readonly label: string;
  /** この距離まで近づくとボタンが出る */
  readonly radius: number;
  /** いま調べられるか（解き終えた仕掛けなどは false） */
  available(): boolean;
  act(): void;
}

/** 場所（船の部屋・星）。それぞれの歩き手と、調べられる物を持つ */
interface Stage {
  readonly walker: Walker;
  readonly mira: Walker;
  readonly interactables: readonly Interactable[];
  /** この場所に入ったとき。プレイヤーとミラを出現位置に置き、会話の事実（いる場所）を更新する */
  enter(): void;
  /** 毎フレーム呼ぶ。ミラの動き（miraIntent）を自分で決めたら true（そのフレームはついてこない） */
  update(dt: number): boolean;
  /** ミラをプレイヤーの斜め後ろの定位置に置き直す（投影範囲から離れすぎたとき） */
  reprojectMira(): void;
}

const journey = new Journey();
const tmpSlot = new Vector3();
// ミラの投影範囲。プレイヤー（腕輪）から離れすぎるとノイズが走り、しばらく経つと定位置に映し直す
const projector = new Projector();

const shipWalker = new RoomWalker(roomConfig);
const shipMira = new RoomWalker({ ...roomConfig, walkSpeed: MIRA_WALK_SPEED });
const shipStage: Stage = {
  walker: shipWalker,
  mira: shipMira,
  interactables: [
    {
      position: new Vector3(SHIP_ROOM.console.x, 0, SHIP_ROOM.console.z).add(SHIP_POSITION),
      label: '星図',
      radius: ACTION_RADIUS,
      available: () => true,
      act() {
        starMap.open(journey.planet);
        touch.release();
        say(talk.openedStarMap(now), now);
      },
    },
  ],
  update: () => false,
  enter() {
    hud.textContent = '船の部屋';
    shipRoom.group.visible = true;
    journey.board();
    talk.enterShip();
    // 窓（-Z 側）の方を向いて、部屋の奥に立つ
    shipWalker.placeAt(0, 1.5, new Vector3(0, 0, -1));
    this.reprojectMira();
  },
  reprojectMira() {
    const slot = followSlot(shipWalker, DEFAULT_FOLLOW_CONFIG, tmpSlot).sub(SHIP_POSITION);
    shipMira.placeAt(slot.x, slot.z, shipWalker.forward);
  },
};

/** 星の場所。見た目・地形・歩き手をひとまとめにし、次の星へ移るときに dispose() する */
interface PlanetStage extends Stage {
  readonly info: PlanetInfo;
  dispose(): void;
}

/** 星を作る。地形は歩く処理と見た目で同じものを使う */
function createPlanetStage(info: PlanetInfo): PlanetStage {
  const terrain = new Terrain(info.terrain);
  const spawn = new Vector3(...info.spawn).normalize();
  const view = new PlanetView(terrain, {
    ...info.look,
    detail: PLANET_DETAIL,
    spawn,
    spawnClearance: POD_ANGLE + 0.2, // ポッドのまわりにも配置物を置かない
  });
  const pod = new LandingPod(terrain, behindOn(spawn, SPAWN_HEADING, POD_ANGLE));
  scene.add(view.group, pod.group);
  const gimmicks = info.gimmicks.map((def) => {
    const gimmickView = new GimmickView(terrain, def);
    gimmickView.setSolved(journey.isSolved(info.id, def.id));
    scene.add(gimmickView.group);
    return { def, view: gimmickView };
  });
  const config = {
    ...DEFAULT_WALKER_CONFIG,
    center: planetCenter,
    planetRadius: info.terrain.radius,
    surfaceRadius: (up: Vector3) => terrain.radiusAt(up),
  };
  const walker = new SphericalWalker(config);
  const mira = new SphericalWalker({ ...config, walkSpeed: MIRA_WALK_SPEED });
  // ミラに頼んでいる作業。仕掛けごとに 1 つずつで、同時には 1 つだけ
  let task: { run: MiraTask; view: GimmickView } | null = null;
  const stage: PlanetStage = {
    info,
    walker,
    mira,
    interactables: [
      {
        position: pod.position,
        label: '船に戻る',
        radius: ACTION_RADIUS,
        available: () => task === null, // ミラが作業しているあいだは戻れない（作業を置き去りにしないように）
        act: () => switchTo(shipStage),
      },
      ...gimmicks.map(({ def, view: gimmickView }) => ({
        position: gimmickView.position,
        label: 'ミラに頼む',
        radius: REQUEST_RADIUS,
        available: () => task === null && !journey.isSolved(info.id, def.id),
        act: () => {
          task = { run: new MiraTask(def, TASK_RANGE), view: gimmickView };
          talk.interrupt();
          voice.stop();
          say(talk.askTask(now, def.kind, def.name), now);
        },
      })),
    ],
    enter() {
      hud.textContent = info.name;
      shipRoom.group.visible = false;
      talk.enterPlanet(info.id, info.name, journey.land(info.id));
      walker.placeAt(spawn, SPAWN_HEADING);
      this.reprojectMira();
    },
    reprojectMira() {
      mira.placeAt(followSlot(walker, DEFAULT_FOLLOW_CONFIG, tmpSlot).sub(planetCenter), walker.forward);
    },
    update(dt) {
      if (!task) return false;
      const { run, view: gimmickView } = task;
      // 作業中のミラは仕掛けへ歩いていき、着いたら仕掛けの方を向いて作業する
      const distance = seekIntent(mira, gimmickView.position, ARRIVE_RADIUS, SLOW_RADIUS, miraIntent);
      if (miraIntent.amount === 0) mira.faceTowards(miraIntent.direction, TURN_SPEED * dt);
      const event = run.update(dt, distance <= ARRIVE_RADIUS, walker.position.distanceTo(gimmickView.position));
      gimmickView.setWorking(run.phase === 'work' ? run.progress : null);
      // 結果のセリフは、頼んだセリフの途中でも打ち切って必ず話す（TalkDirector 側で打ち切る。音もここで止める）
      if (event === 'done') {
        journey.solve(info.id, run.gimmick.id);
        gimmickView.setSolved(true);
        voice.stop();
        say(talk.finishTask(now, journey.solvedCount), now);
      } else if (event === 'cancelled') {
        gimmickView.setSolved(false);
        voice.stop();
        say(talk.cancelTask(now), now);
      }
      if (!run.active) task = null;
      return true;
    },
    dispose() {
      task = null;
      view.dispose();
      pod.dispose();
      for (const { view: gimmickView } of gimmicks) gimmickView.dispose();
    },
  };
  return stage;
}

// 船の窓から見える星。最初は一覧の先頭の星で、ワープするたびに行き先の星に入れ替える
let planetStage = createPlanetStage(PLANETS[0]);
let destination: PlanetInfo | null = null; // ワープ中の行き先

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
let actionRequested = false;
function onKeyDown(event: KeyboardEvent): void {
  pressed.add(event.code);
  if (event.code === 'Space') {
    if (!event.repeat) jumpRequested = true;
    event.preventDefault();
  } else if (event.code === 'KeyE' || event.code === 'Enter') {
    // 星図の中の操作はボタン自身の click に任せる（Enter で「閉じる」を押した直後に開き直さないように）
    if (!event.repeat && !starMap.isOpen) actionRequested = true;
  } else if (event.code === 'Escape') {
    starMap.close();
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
const orbit = new OrbitCamera(DEFAULT_ORBIT_CAMERA_CONFIG, new Vector3(0, 0, 1), new Vector3(0, 1, 0));
const cameraRight = new Vector3();
const cameraGoal = new Vector3();
const cameraTarget = new Vector3();
const moveDirection = new Vector3();
function updateCamera(walker: Walker, dt: number): void {
  orbit.eye(walker.position, walker.up, cameraGoal);
  const t = 1 - Math.exp(-CAMERA_DAMPING * dt);
  camera.position.lerp(cameraGoal, t);
  camera.up.lerp(walker.up, t).normalize();
  camera.lookAt(orbit.target(walker.position, walker.up, cameraTarget));
}

// URL に ?debug を付けると、性能（fps・ドローコール数など）を表示する
const perf = new URLSearchParams(window.location.search).has('debug')
  ? new PerfOverlay(document.body, renderer)
  : null;

const voice = new VoicePlayer();
const bubble = new SpeechBubble(document.body);
// 音はユーザーが画面に触れる（キーを押す）まで鳴らせないので、最初の操作で準備する。
// タッチの pointerdown はユーザー操作として数えられないブラウザがあるので、pointerup・touchend でも呼ぶ
const unlockVoice = () => voice.unlock();
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
  window.addEventListener(type, unlockVoice);
}
function say(line: { text: string; expression?: string } | null, now: number): void {
  if (!line) return;
  const { beeps, revealAt } = pipopaTimeline(line.text, currentVoice());
  voice.play(beeps);
  bubble.show(line.text, revealAt, now);
  // セリフに表情が付いていれば、話し終えるまで（＋少し）その顔をする
  mira.express(line.expression, speechDuration(line.text) + 1);
}
const bubbleAnchor = new Vector3();
const playerHead = new Vector3();
const PLAYER_EYE_HEIGHT = 1.0; // プレイヤー（仮の見た目）の目の高さ。ミラが見る位置

// 場所の切り替え。暗転の途中で入れ替え、カメラは新しい場所の後ろへ飛ばす（ズームと見下ろす角度は引き継ぐ）
const fader = new Fader(document.body);
let stage: Stage;
let greetAt = Infinity; // この時刻になったら、入った場所のあいさつをする
// ループの時刻（秒）。会話と吹き出しはすべてこの時計で動く（時計を混ぜると吹き出しが消える）。
// 起点は requestAnimationFrame の時刻と同じにする（読み込みに時間がかかっても、最初のあいさつまでの間が保たれる）
let now = performance.now() / 1000;
function enterStage(next: Stage): void {
  stage = next;
  stage.enter();
  touch.release();
  // 話している途中のセリフは打ち切る（新しい場所のあいさつを言えるように）
  talk.interrupt();
  voice.stop();
  bubble.hide();
  orbit.reset(stage.walker.forward, stage.walker.up);
  camera.position.copy(orbit.eye(stage.walker.position, stage.walker.up, cameraGoal));
  camera.up.copy(stage.walker.up);
  // ミラは新しい場所に置いてから、髪などの揺れを落ち着かせる（移動前の位置から振り回されないように）
  projector.reset();
  placeMira();
  mira.settle();
  greetAt = now + ARRIVE_TALK_DELAY;
}
function placeMira(): void {
  mira.group.position.copy(stage.mira.position);
  stage.mira.orientation(mira.group.quaternion);
}
/** 暗転して next へ移る。すでに暗転中なら移れず false。 */
function switchTo(next: Stage): boolean {
  return fader.run(() => enterStage(next));
}
/** 暗転の先で星を作り直して降りる。前の星の見た目は捨てる（同じ星でも、降り直すので作り直す）。 */
function warpTo(info: PlanetInfo | null): boolean {
  if (!info) return false;
  return fader.run(() => {
    planetStage.dispose();
    planetStage = createPlanetStage(info);
    enterStage(planetStage);
  });
}

// 星図とワープ。星図で星を選ぶと、流れる星が強まり、暗転の先で星に降りる
const warp = new WarpSequence({ ...DEFAULT_WARP_CONFIG, jump: FADE_SECONDS });
const streaks = new WarpStreaks();
camera.add(streaks.object);
scene.add(camera);
const starMap = new StarMapPanel(
  document.body,
  PLANETS,
  (planet) => {
    starMap.close();
    destination = planet;
    // ワープはプレイヤーが決めた行動なので、星図のセリフの途中でも打ち切って話す。
    // セリフを言い切ってから暗転するよう、流れる星の時間をセリフの長さまで延ばす
    talk.interrupt();
    voice.stop();
    const line = talk.warp(now, planet.name);
    say(line, now);
    warp.start(line ? speechDuration(line.text) + WARP_LINE_MARGIN - FADE_SECONDS : 0);
  },
  () => starMap.close(),
);
enterStage(shipStage);

const input: WalkInput = { forward: 0, right: 0, jump: false };
let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  // 性能表示には上限で切る前の経過時間を渡す（30fps を下回ったことも表示できるように）
  const rawDt = lastTime === undefined ? 0 : (time - lastTime) / 1000;
  const dt = Math.min(rawDt, MAX_DT);
  lastTime = time;
  now = time / 1000;
  const { walker, mira: miraWalker } = stage;

  orbit.rotate(
    touch.consumeYaw() + axis('ArrowRight', 'ArrowLeft') * KEY_CAMERA_SPEED * dt,
    touch.consumePitch() + axis('ArrowUp', 'ArrowDown') * KEY_CAMERA_SPEED * dt,
    walker.up,
  );
  orbit.zoom(touch.consumeZoom());

  // スティック（なければキーボード）の入力を、カメラから見た地表の向きに直す。
  // 星図を開いている間とワープ中は、動かさない
  const paused = starMap.isOpen || warp.active;
  let stickX = paused ? 0 : touch.stick.x;
  let stickY = paused ? 0 : touch.stick.y;
  if (!paused && stickX === 0 && stickY === 0) {
    stickX = axis('KeyD', 'KeyA');
    stickY = axis('KeyW', 'KeyS');
  }
  const amount = Math.min(1, Math.hypot(stickX, stickY));
  cameraRight.crossVectors(orbit.heading, walker.up);
  moveDirection.copy(orbit.heading).multiplyScalar(stickY).addScaledVector(cameraRight, stickX);
  if (amount > 0) walker.faceTowards(moveDirection, TURN_SPEED * dt);

  input.forward = amount;
  input.jump = (jumpRequested || touch.consumeJump()) && !paused;
  jumpRequested = false;
  const wasGrounded = walker.grounded;
  walker.step(input, dt);
  orbit.transport(walker.lastRotation, walker.up);
  orbit.update(dt, walker.forward, walker.up, stickX, stickY);

  // ミラ: 仕掛けの作業中は仕掛けへ歩いていき、そうでなければプレイヤーについていく
  if (!stage.update(dt)) followIntent(miraWalker, walker, DEFAULT_FOLLOW_CONFIG, miraIntent);
  if (miraIntent.amount > 0) miraWalker.faceTowards(miraIntent.direction, TURN_SPEED * dt);
  // 感情で足取りが変わる（喜んでいると軽く、沈んでいると遅い）。全力で追いかけるときは変えない
  miraInput.forward = emotionalStride(miraIntent.amount, emotion.values);
  miraWalker.step(miraInput, dt);
  // 投影範囲。消え切った瞬間に、腕輪のそば（定位置）へ映し直す
  if (projector.update(walker.position.distanceTo(miraWalker.position), dt)) {
    emotion.feel('leftBehind'); // 置いていかれて、少し不安になる
    stage.reprojectMira();
    placeMira();
    mira.settle();
  }

  // 調べられる物（星図の台・着陸ポッド・仕掛け）のいちばん近くにあるものにボタンを出し、押されたら act() を呼ぶ。
  // あいさつを待っている間は出さない（あいさつが星図のセリフに押されて抜けないように）
  let near: Interactable | null = null;
  if (!fader.busy && !paused && greetAt === Infinity) {
    let nearest = Infinity;
    for (const item of stage.interactables) {
      const distance = walker.position.distanceTo(item.position);
      if (distance < item.radius && distance < nearest && item.available()) {
        nearest = distance;
        near = item;
      }
    }
  }
  touch.setAction(near?.label ?? null);
  const action = touch.consumeAction() || actionRequested;
  actionRequested = false;
  if (near && action) near.act();

  // ワープ: 流れる星を進め、暗転に入る瞬間に行き先の星へ降りる（暗転中は移れないが、星図は暗転中に開けないので起きないはず）
  if (warp.update(dt) && !warpTo(destination)) console.warn('ワープ先へ移れなかった（暗転中）');
  streaks.update(dt, warp.intensity);

  // 会話: 場所に入ったとき・ジャンプしたとき・しばらく放っておかれたとき。
  // 入ってからあいさつまでの間は、ジャンプなどのセリフで割り込ませない（あいさつが消えないように）
  if (now >= greetAt) {
    greetAt = Infinity;
    say(talk.greet(now), now);
  } else if (greetAt !== Infinity) {
    // あいさつ待ち
  } else if (wasGrounded && !walker.grounded && input.jump) {
    say(talk.jumped(now), now);
  } else if (!paused) {
    // 星図を見ている間とワープ中は「放っておかれている」わけではないので、放置の時間を進めない
    say(talk.update(dt, amount > 0, now), now);
  }

  player.position.copy(walker.position);
  walker.orientation(player.quaternion);
  placeMira();
  // ミラはプレイヤーの顔のあたりを見る（正面から離れすぎていれば前を見る）
  mira.gazeTarget = playerHead.copy(walker.position).addScaledVector(walker.up, PLAYER_EYE_HEIGHT);
  emotion.update(dt);
  moodFace(emotion.values, mira.mood);
  mira.update(dt, miraInput.forward, projector.noise, projector.visibility);
  updateCamera(walker, dt);
  renderer.render(scene, camera);

  // 吹き出しはミラの頭の上に出す（画面の外やカメラの後ろなら隠す）
  bubbleAnchor.copy(miraWalker.position).addScaledVector(miraWalker.up, mira.height).project(camera);
  bubble.update(
    now,
    ((bubbleAnchor.x + 1) / 2) * canvas.clientWidth,
    ((1 - bubbleAnchor.y) / 2) * canvas.clientHeight,
    bubbleAnchor.z < 1 && Math.abs(bubbleAnchor.x) < 1 && Math.abs(bubbleAnchor.y) < 1,
  );
  perf?.update(rawDt);
});
