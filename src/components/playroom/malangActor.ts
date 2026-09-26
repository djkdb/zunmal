/**
 * 놀이방 말랑이 한 마리의 "속마음" — 손짓 해석과 반응 (몸 안쪽 출렁임·얼굴·눈길·졸음·소리·입자·진동·애정).
 * 예전 만지기 화면의 한 마리 코드를 그대로 옮겨 몸마다 하나씩 만든다 (중복 없이 N 마리).
 *
 * - 몸 전체 위치는 world.ts(페이지가 돌림), 몸 안쪽 출렁임은 이 객체의 physics.ts·softbody.ts 상태.
 * - 그리기는 하지 않는다: 페이지가 frame() 뒤 pose() 를 읽어 2D 스프라이트나 3D 몸에 반영한다.
 * - 촉감(`data/materials.ts`): 물리 상태에 feel 을 넣고(슬로우 라이징·젤리·쭉쭉이·찐득이), 소리는 촉감 맛(flavor),
 *   찐득이는 손을 떼도 잠깐 붙어 있다가 "쩍" 떨어진다(`peelPlan`). 전설 이상은 몸속 특별한 속(filling)이 눌림에 반응.
 * - 말랑이끼리 반응(볼 비비기·끙·깜짝·흘끔·같이 졸기)은 페이지가 `touch/interactions.ts` 로 골라 여기 메서드를 부른다.
 */
import * as squish from '../../audio/squish';
import type { Character } from '../../data/characters';
import type { FillingSpec, MaterialSpec } from '../../data/materials';
import { createFill, isFillAtRest, stepFill, type FillState } from '../../touch/filling';
import type { TouchFxSpec } from '../../data/rarity';
import { haptic } from '../../lib/haptics';
import { VIEWBOX } from '../malang/helpers';
import type { ShapeSpec } from '../malang/shapes';
import type { JellyBodyView } from '../touch3d/jellyScene';
import type { FxSource } from '../touch3d/fxLayer';
import type { TouchFace } from '../../touch/faceExtras';
import {
  BLUSH_COOL_PER_S,
  BLUSH_FACE_AT,
  approach,
  bumpBlush,
  classifyPoke,
  coolBlush,
  createRub,
  gazeToward,
  idlePhase,
  isDizzyFlick,
  isUnlocked,
  meltAmount,
  registerPat,
  rubStep,
  touchZone,
  type RubState,
  type TouchZone,
} from '../../touch/reactions';
import {
  createTouchState,
  drag,
  hop,
  impact,
  isAtRest,
  melt,
  peelPlan,
  poke,
  press,
  recoverMs,
  release,
  setReducedMotion,
  snapToTargets,
  squashAmount,
  step,
  stretchAmount,
  stretchLength,
  stretchUp,
  tickle,
  toTransform,
  wobbleEnergy,
  wobbleHz,
  type TouchState,
  type Transform,
} from '../../touch/physics';
import {
  composePose,
  createSoftState,
  isSoftAtRest,
  setSoftDoze,
  setSoftReducedMotion,
  snapSoft,
  softPoke,
  softPress,
  softPull,
  softRelease,
  softTickle,
  softTouch,
  stepSoft,
  SOFT_TUNING,
  type Pose,
  type SoftHit,
  type SoftState,
} from '../../touch/softbody';

/** 애정이 오르는 최소 간격 (ms) */
const PET_INTERVAL_MS = 400;
/** 이 시간 안에 떼고 거의 안 움직였으면 "콕 찌르기" */
export const TAP_MS = 220;
/** 이만큼 움직이면 끌기로 본다 (px) */
export const DRAG_START_PX = 10;
/** 이만큼 오래 누르고 있으면 졸린 눈 (ms) */
const SLEEPY_MS = 2600;
/** 손을 뗀 뒤 이만큼 지나면 다시 앞(화면)을 본다 */
const GAZE_RETURN_MS = 700;
/** 화살표 키로 당기는 양 (몸 반지름 단위) */
const KEY_DRAG_STEP = 0.3;
/** physics 정규화 단위(말랑이 상자 반폭)를 3D 몸 좌표로 */
export const BODY_UNIT = VIEWBOX.w / 2;
const BOX_CX = VIEWBOX.x + VIEWBOX.w / 2;
const BOX_CY = VIEWBOX.y + VIEWBOX.h / 2;

/** 말랑이 그림 상자 (client px, 흔들림 전 자리) */
export interface ActorGeom {
  left: number;
  top: number;
  size: number;
}

export interface ActorEnv {
  character: Character;
  shape: ShapeSpec;
  fxSpec: TouchFxSpec;
  /** 촉감 */
  material: MaterialSpec;
  /** 몸속 특별한 속 (전설 이상, 없으면 null) */
  filling: FillingSpec | null;
  shiny: boolean;
  reduced(): boolean;
  level(): number;
  geom(): ActorGeom | null;
  /** 준비된 3D 몸 (없으면 2D) */
  view(): JellyBodyView | null;
  fx(): FxSource | null;
  /** 그리기 루프를 깨운다 */
  requestFrame(): void;
  /** 애정 +1 (store.petMalang) */
  pet(): void;
  /** 얼굴·졸음이 바뀌었다 (React 가 다시 그린다) */
  onChange(): void;
}

interface Gesture {
  source: 'pointer' | 'key';
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastY: number;
  lastT: number;
  point: { x: number; y: number };
  zone: TouchZone;
  radius: number;
  moved: boolean;
  squishCount: number;
  stretch: squish.StretchHandle | null;
  lastDirX: number;
  reversals: number[];
  keyDisp: { x: number; y: number };
  hit: SoftHit | null;
  vx: number;
  vy: number;
  rub: RubState;
  melted: boolean;
  /** 들어서 옮기는 중 (world 가 몸을 옮긴다) */
  carrying: boolean;
}

export interface EndResult {
  /** 손가락 속도 (px/ms) — 튕기듯 놓았으면 0 이 아니다 */
  vx: number;
  vy: number;
  flick: boolean;
  tap: boolean;
}

function vibrate(ms: number, reduced: boolean) {
  if (reduced) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 지원하지 않는 기기
  }
}

export class MalangActor {
  readonly env: ActorEnv;
  touch: TouchState;
  soft: SoftState;
  face: TouchFace = 'default';
  dozing = false;
  private g: Gesture | null = null;
  private gaze = { x: 0, y: 0 };
  private gazeTarget = { x: 0, y: 0 };
  private gazeReturn: number | null = null;
  private faceTimer: number | null = null;
  private blush = { level: 0, at: 0 };
  private pokeTimes: number[] = [];
  private patTimes: number[] = [];
  private lastTickle = 0;
  private lastPet = 0;
  lastActive = performance.now();
  private yawned = false;
  private timers: number[] = [];
  private disposed = false;
  /** 찐득이: 손가락을 뗐지만 아직 붙어 있다 */
  private peeling = false;
  /** 몸속 특별한 속의 밝기·소용돌이 */
  fill: FillState = createFill();

  constructor(env: ActorEnv) {
    this.env = env;
    const reduced = env.reduced();
    const feel = env.material.feel;
    this.touch = createTouchState({ reducedMotion: reduced, feel });
    this.soft = createSoftState({ reducedMotion: reduced, feel });
  }

  /** 소리 맛 = 촉감 */
  get flavor(): squish.SquishFlavor {
    return this.env.material.id;
  }

  get held(): boolean {
    return this.g !== null;
  }

  /** 손가락이 잡고 있거나 아직 붙어 있다 (말랑이끼리 판정용) */
  get touched(): boolean {
    return this.g !== null || this.peeling;
  }

  get carrying(): boolean {
    return this.g?.carrying ?? false;
  }

  setReduced(reduced: boolean) {
    this.touch = setReducedMotion(this.touch, reduced);
    this.soft = setSoftReducedMotion(this.soft, reduced);
  }

  private later(fn: () => void, ms: number) {
    const t = window.setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.push(t);
  }

  // ── 얼굴 ──

  showFace(f: TouchFace, holdMs?: number) {
    if (this.faceTimer !== null) window.clearTimeout(this.faceTimer);
    this.faceTimer = null;
    if (this.face !== f) {
      this.face = f;
      this.env.onChange();
    }
    if (holdMs !== undefined) {
      this.faceTimer = window.setTimeout(() => {
        this.faceTimer = null;
        this.face = this.dozing ? 'sleepy' : 'default';
        this.env.onChange();
      }, holdMs);
    }
  }

  private petNow(now: number) {
    if (now - this.lastPet < PET_INTERVAL_MS) return;
    this.lastPet = now;
    this.env.pet();
  }

  // ── 눈길 ──

  /** client 좌표 쪽을 본다 */
  lookAt(clientX: number, clientY: number) {
    const geo = this.env.geom();
    if (!geo || this.env.reduced()) return;
    const unit = VIEWBOX.w / Math.max(1, geo.size);
    const fx = geo.left + (60 - VIEWBOX.x) / unit;
    const fy = geo.top + (this.env.shape.faceY - VIEWBOX.y) / unit;
    this.gazeTarget = gazeToward((clientX - fx) * unit, (clientY - fy) * unit);
    if (this.gazeReturn !== null) window.clearTimeout(this.gazeReturn);
    this.gazeReturn = null;
    this.env.requestFrame();
  }

  lookBack(delay = GAZE_RETURN_MS) {
    if (this.gazeReturn !== null) window.clearTimeout(this.gazeReturn);
    this.gazeReturn = window.setTimeout(() => {
      this.gazeReturn = null;
      this.gazeTarget = { x: 0, y: 0 };
      this.env.requestFrame();
    }, delay);
  }

  gazeNow(): { x: number; y: number } {
    return this.gaze;
  }

  // ── 졸기 ──

  private startDoze() {
    if (this.dozing) return;
    this.dozing = true;
    this.soft = setSoftDoze(this.soft, true);
    this.showFace('sleepy');
    this.env.onChange();
    this.env.requestFrame();
  }

  /** 졸다가 깼으면 true (깜짝 놀라 폴짝) */
  wake(): boolean {
    if (!this.dozing) return false;
    this.dozing = false;
    this.soft = setSoftDoze(this.soft, false);
    this.touch = hop(this.touch, 0.55);
    squish.surprised();
    this.showFace('wide', 800);
    this.env.onChange();
    return true;
  }

  /** 옆 말랑이를 따라 졸기 시작. breathMs 를 주면 숨 위상을 그 말랑이와 맞춘다 */
  dozeOff(breathMs?: number) {
    if (this.dozing || this.g) return;
    if (breathMs !== undefined && Number.isFinite(breathMs)) this.soft = { ...this.soft, timeMs: breathMs };
    this.yawned = true;
    this.startDoze();
  }

  /** 1초마다: 가만히 두면 하품(8초) → 졸기(20초) */
  idleTick(now: number, hidden: boolean) {
    if (hidden || this.g) {
      this.lastActive = now;
      return;
    }
    const phase = idlePhase(now - this.lastActive);
    if (phase === 'yawn' && !this.yawned) {
      this.yawned = true;
      squish.yawn();
      this.showFace('yawn', 1600);
      this.touch = stretchUp(this.touch, 0.8);
      this.env.requestFrame();
    } else if (phase === 'doze') {
      this.startDoze();
    }
  }

  // ── 말랑이끼리 ──

  /** 볼 비비기: 상대 쪽(dirX)으로 볼을 비비며 좌우로 살랑, 하트 */
  cheekRub(dirX: number) {
    const dir = dirX < 0 ? -1 : 1;
    this.wake();
    this.showFace('blush', 1500);
    this.env.fx()?.react('hearts', 3);
    this.lastActive = performance.now();
    this.yawned = false;
    // 움직임 줄이기: 비비는 흔들림은 없이 얼굴·하트만
    if (!this.env.reduced()) {
      [0, 150, 300, 450].forEach((ms, i) =>
        this.later(() => {
          const d = i % 2 === 0 ? dir : -dir;
          this.touch = tickle(this.touch, d * 0.7);
          this.soft = softTickle(this.soft, d);
          this.env.requestFrame();
        }, ms),
      );
    }
    this.env.requestFrame();
  }

  /** 위에 누가 올라탔다: "끙" */
  squishedUnder() {
    this.wake();
    this.showFace('strain', 1600);
    this.touch = impact(this.touch, 0, 0.35);
    this.lastActive = performance.now();
    this.env.requestFrame();
  }

  /** 다른 말랑이 위에 올라탔다: 신난다 */
  onTop() {
    this.showFace('happy', 1400);
    this.env.fx()?.react('hearts', 1);
    this.lastActive = performance.now();
  }

  /** 세게 부딪혀 깜짝 + 머리 위 작은 별 (몸 출렁임은 세계 부딪힘 사건이 이미 bumped 로 준다) */
  startled() {
    this.wake();
    this.showFace('wide', 900);

    this.env.fx()?.react('dizzy', 3);
    this.env.requestFrame();
  }


  /** 옆 말랑이 쪽을 잠깐 본다 (client 좌표) */
  glanceAt(clientX: number, clientY: number, ms = 1300) {
    if (this.g || this.dozing) return;
    this.lookAt(clientX, clientY);
    this.lookBack(ms);
  }

  /** 가만히 있은 시간 (ms) */
  idleFor(now: number): number {
    return this.g ? 0 : Math.max(0, now - this.lastActive);
  }

  /** 다른 말랑이가 부딪히거나 매트에 떨어졌다. dirX: 밀려나는 옆 방향 */
  bumped(dirX: number, strength: number) {
    this.touch = impact(this.touch, dirX, strength);
    if (Math.abs(dirX) > 0.2) this.soft = softTickle(this.soft, dirX);
    this.lastActive = performance.now();
    this.yawned = false;
    if (strength > 0.45) this.wake();
    this.env.requestFrame();
  }

  // ── 반응 ──

  private patHead(clientX?: number, clientY?: number) {
    const now = performance.now();
    this.showFace('happy', 1000);
    squish.purr();
    this.env.fx()?.react('hearts', 2, clientX, clientY);
    const r = registerPat(this.patTimes, now, this.env.level());
    this.patTimes = r.pats;
    if (r.jump) {
      this.touch = hop(this.touch, 1);
      squish.jump();
      this.env.fx()?.react('hearts', 6);
      this.showFace('happy', 1300);
      if (!this.env.reduced()) haptic('success');
    }
    this.env.requestFrame();
  }

  private laughWiggle() {
    squish.laugh();
    this.showFace('happy', 1400);
    this.env.fx()?.react('hearts', 3);
    [0, 130, 260, 390].forEach((ms, i) =>
      this.later(() => {
        const dir = i % 2 === 0 ? 1 : -1;
        this.touch = tickle(this.touch, dir);
        this.soft = softTickle(this.soft, dir);
        this.env.requestFrame();
      }, ms),
    );
  }

  private goDizzy(dir: number) {
    squish.dizzy();
    this.showFace('dizzy', 1500);
    this.env.fx()?.react('dizzy', 5);
    [0, 160, 320].forEach((ms) =>
      this.later(() => {
        this.touch = tickle(this.touch, dir);
        this.soft = softTickle(this.soft, dir);
        this.env.requestFrame();
      }, ms),
    );
  }

  /** 애정 단계가 올랐다 */
  celebrate(hearts: number) {
    const spec = this.env.fxSpec;
    squish.happy();
    squish.chime(spec.chime, 0, { fanfare: true, shiny: this.env.shiny });
    this.env.fx()?.react('hearts', hearts);
    this.env.fx()?.emit('milestone');
    this.env.view()?.pulse(1);
    if (!this.env.reduced()) haptic(spec.milestoneHaptic);
    this.showFace('happy', 1400);
    this.env.requestFrame();
  }

  /** 캡슐에서 막 나왔다: 반짝이 + 기쁜 얼굴 */
  hello() {
    this.env.fx()?.emit('milestone');
    this.env.fx()?.react('hearts', 3);
    this.env.view()?.pulse(1);
    this.showFace('happy', 1600);
    this.lastActive = performance.now();
  }

  // ── 손짓 ──

  /** 누른 곳 (client) → 몸 정규화 좌표 + 부위 */
  private locate(clientX: number, clientY: number, pointer: boolean) {
    const geo = this.env.geom();
    const radius = geo ? Math.max(1, geo.size / 2) : 100;
    let point = { x: 0, y: 0 };
    if (geo && pointer) {
      point = { x: (clientX - (geo.left + radius)) / radius, y: (clientY - (geo.top + radius)) / radius };
    }
    const svg = { x: BOX_CX + point.x * BODY_UNIT, y: BOX_CY + point.y * BODY_UNIT };
    return { point, radius, zone: pointer ? touchZone(svg, this.env.shape) : ('belly' as TouchZone) };
  }

  begin(source: 'pointer' | 'key', clientX: number, clientY: number, hit: SoftHit | null) {
    const { point, radius, zone } = this.locate(clientX, clientY, source === 'pointer');
    const now = performance.now();
    this.peeling = false;
    this.lastActive = now;
    this.yawned = false;
    const woke = this.wake();
    const view = this.env.view();
    const h = hit ?? (view && source === 'key' ? view.frontHit() : null);
    if (h) this.soft = softTouch(this.soft, h);
    this.g = {
      source,
      hit: h,
      vx: 0,
      vy: 0,
      startX: clientX,
      startY: clientY,
      startT: now,
      lastX: clientX,
      lastY: clientY,
      lastT: now,
      point,
      zone,
      radius,
      moved: false,
      squishCount: 0,
      stretch: null,
      lastDirX: 0,
      reversals: [],
      keyDisp: { x: 0, y: 0 },
      rub: createRub(),
      melted: false,
      carrying: false,
    };
    this.touch = press(this.touch, point, 0.1);
    vibrate(8, this.env.reduced());
    if (!woke) this.showFace('happy');
    if (source === 'pointer') this.lookAt(clientX, clientY);
    this.lastPet = Math.min(this.lastPet, now - PET_INTERVAL_MS);
    this.env.requestFrame();
  }

  /** 누른 지점에서 떨어진 거리 (px) */
  travel(clientX: number, clientY: number): number {
    const g = this.g;
    return g ? Math.hypot(clientX - g.startX, clientY - g.startY) : 0;
  }

  /** 들어서 옮기기 시작 (페이지가 world.grabBody 와 함께 부른다) */
  startCarry() {
    const g = this.g;
    if (!g || g.carrying) return;
    g.carrying = true;
    squish.poke(0.35);
  }

  /**
   * 손가락 이동. shiftX/Y 는 누른 뒤 몸이 옮겨 간 거리(px) — 옮기는 중에는 손가락과 몸 사이의 거리만큼만 늘어난다.
   */
  move(clientX: number, clientY: number, shiftX = 0, shiftY = 0) {
    const g = this.g;
    if (!g || g.source !== 'pointer') return;
    const now = performance.now();
    const dxTotal = clientX - g.startX - shiftX;
    const dyTotal = clientY - g.startY - shiftY;
    if (!g.moved && Math.hypot(clientX - g.startX, clientY - g.startY) > DRAG_START_PX) {
      g.moved = true;
      g.stretch = squish.startStretch(this.flavor);
    }
    this.lookAt(clientX, clientY);
    const dt = Math.max(1, now - g.lastT);
    const vx = (clientX - g.lastX) / dt;
    const vy = (clientY - g.lastY) / dt;
    g.vx = g.vx * 0.4 + vx * 0.6;
    g.vy = g.vy * 0.4 + vy * 0.6;
    const stepPx = Math.hypot(clientX - g.lastX, clientY - g.lastY);
    const speed = Math.min(1, stepPx / dt / 1.5);
    const stepX = clientX - g.lastX;
    g.lastX = clientX;
    g.lastY = clientY;
    g.lastT = now;
    if (!g.moved) return;

    const disp = { x: dxTotal / g.radius, y: dyTotal / g.radius };
    this.touch = drag(this.touch, disp);
    if (g.hit) this.soft = softPull(this.soft, { x: disp.x * BODY_UNIT, y: -disp.y * BODY_UNIT });
    g.stretch?.update(stretchAmount(this.touch), speed, stretchLength(this.touch));
    this.env.fx()?.trail(clientX, clientY);

    // 머리를 좌우로 문지르면 쓰다듬기 (애정 2단계). 옮기는 중에는 아니다
    if (!g.carrying && g.zone === 'head' && isUnlocked('pat', this.env.level())) {
      const unit = VIEWBOX.w / (g.radius * 2);
      const r = rubStep(g.rub, stepX * unit, now);
      g.rub = r.state;
      if (r.pat) {
        this.patHead(clientX, clientY);
        return;
      }
    }

    // 간질이기: 머리 밖을 빠르게 좌우로 문지르면 방향이 자주 바뀐다
    if (!g.carrying && g.zone !== 'head' && Math.abs(vx) > 0.35) {
      const dir = Math.sign(vx);
      if (g.lastDirX !== 0 && dir !== g.lastDirX) g.reversals.push(now);
      g.lastDirX = dir;
      g.reversals = g.reversals.filter((t) => now - t < 700);
      if (g.reversals.length >= 2 && now - this.lastTickle > 450) {
        this.lastTickle = now;
        g.reversals = [];
        this.touch = tickle(this.touch, dir);
        this.soft = softTickle(this.soft, dir);
        squish.giggle();
        this.env.fx()?.emit('tickle', clientX, clientY);
        this.env.fx()?.react('hearts', 1, clientX, clientY);
        this.showFace('happy', 900);
        vibrate(8, this.env.reduced());
      }
    }
    this.env.requestFrame();
  }

  /** 키보드 화살표로 당기기 (Enter/Space 를 누른 채) — 몸 이동은 페이지가 world.nudgeBody 로 */
  keyPull(ax: number, ay: number) {
    let g = this.g;
    if (g && g.source !== 'key') return;
    if (!g) {
      this.begin('key', 0, 0, null);
      g = this.g;
      if (!g) return;
    }
    if (!g.moved) {
      g.moved = true;
      g.stretch = squish.startStretch(this.flavor);
    }
    const nx = g.keyDisp.x + ax * KEY_DRAG_STEP;
    const ny = g.keyDisp.y + ay * KEY_DRAG_STEP;
    const mag = Math.hypot(nx, ny);
    const k = mag > 2 ? 2 / mag : 1;
    g.keyDisp = { x: nx * k, y: ny * k };
    this.touch = drag(this.touch, g.keyDisp);
    if (g.hit) this.soft = softPull(this.soft, { x: g.keyDisp.x * BODY_UNIT, y: -g.keyDisp.y * BODY_UNIT });
    g.stretch?.update(Math.min(1, Math.hypot(g.keyDisp.x, g.keyDisp.y) / 1.5), 0.5, stretchLength(this.touch));
    this.env.requestFrame();
  }

  isKeyGesture(): boolean {
    return this.g?.source === 'key';
  }

  /** 손을 뗐다. silent = 취소(포인터 잃음) */
  end(silent: boolean): EndResult {
    const g = this.g;
    const none: EndResult = { vx: 0, vy: 0, flick: false, tap: false };
    if (!g) return none;
    this.g = null;
    const now = performance.now();
    this.lastActive = now;
    g.stretch?.stop();
    this.lookBack();
    const spec = this.env.fxSpec;
    const shiny = this.env.shiny;
    const reduced = this.env.reduced();
    const level = this.env.level();
    const fx = this.env.fx();
    const view = this.env.view();

    const isTap = !silent && !g.moved && now - g.startT < (g.source === 'key' ? 400 : TAP_MS);
    if (isTap) {
      // 콕 찌르기: 연달아 찌를수록 세게 튀고 눈이 동그래진다. 찌른 곳·애정 단계에 따라 반응이 다르다
      const recent = this.pokeTimes.filter((t) => now - t < 1000);
      recent.push(now);
      this.pokeTimes = recent;
      const strength = Math.min(1, 0.45 + 0.18 * (recent.length - 1));
      const kind = classifyPoke(g.zone, recent.length, level);
      const s = kind === 'pat' ? 0.25 : strength;
      this.touch = poke(release(this.touch), g.point, s);
      this.soft = softPoke(softRelease(this.soft), g.hit, s);
      squish.poke(kind === 'pat' ? 0.3 : strength, this.flavor);
      // 찐득이: 콕 찔러도 손가락에 살짝 붙었다 쩍
      const tapPeel = peelPlan(this.env.material.feel, now - g.startT, true);
      if (tapPeel.delayMs > 0) this.later(() => squish.peel(0.3), tapPeel.delayMs);
      squish.chime(spec.chime, recent.length - 1, { shiny });
      const px = g.source === 'pointer' ? g.lastX : undefined;
      const py = g.source === 'pointer' ? g.lastY : undefined;
      fx?.emit('poke', px, py, strength);
      view?.pulse(spec.auraPulse * strength);
      if (!reduced) haptic(spec.pokeHaptic);
      this.petNow(now);
      switch (kind) {
        case 'pat':
          this.patHead(px, py);
          break;
        case 'blush': {
          // 볼: 찌를수록 빨개지고 천천히 식는다
          const b = bumpBlush(coolBlush(this.blush.level, now - this.blush.at));
          this.blush = { level: b, at: now };
          this.showFace('blush', Math.max(900, ((b - BLUSH_FACE_AT) / BLUSH_COOL_PER_S) * 1000 + 700));
          break;
        }
        case 'giggle':
          squish.giggle();
          this.touch = hop(this.touch, 0.3);
          this.showFace('happy', 800);
          break;
        case 'laugh':
          this.pokeTimes = [];
          this.laughWiggle();
          break;
        default:
          this.showFace(recent.length >= 3 ? 'wide' : 'happy', 700);
      }
      this.env.requestFrame();
      return { ...none, tap: true };
    }

    const intensity = Math.max(squashAmount(this.touch), stretchAmount(this.touch), wobbleEnergy(this.touch));
    // 튕기듯 놓으면(손가락이 아직 움직이는 중) 그 속도로 출렁인다
    const flicking = g.source === 'pointer' && g.moved && now - g.lastT < 80;
    const toBody = (BODY_UNIT / g.radius) * 1000;
    fx?.endTrail();
    const feel = this.env.material.feel;
    // 찐득이: 손가락을 떼도 잠깐 붙어 위로 딸려 오다가 "쩍" 떨어진다 (옮기다 놓거나 튕기면 바로 떨어진다)
    const plan = !silent && !g.carrying && !flicking ? peelPlan(feel, now - g.startT, false) : { delayMs: 0, lift: 0 };
    if (plan.delayMs > 0) {
      this.peeling = true;
      // 움직임 줄이기: 딸려 오르는 늘어남 없이 잠깐 멈췄다 소리만
      const lift = reduced ? 0 : plan.lift;
      this.touch = drag(press(this.touch, g.point, 0.2), { x: 0, y: -lift });
      if (g.hit && lift > 0) this.soft = softPull(this.soft, { x: 0, y: lift * BODY_UNIT });

      this.showFace('wide', plan.delayMs + 200);
      this.env.requestFrame();
      this.later(() => {
        if (!this.peeling) return;
        this.peeling = false;
        this.touch = release(this.touch);
        this.soft = softRelease(this.soft);
        squish.peel(0.4 + 0.6 * plan.lift);
        squish.squishRelease(0.3 + 0.5 * intensity, wobbleHz(feel) * 2, this.flavor);
        this.showFace('happy', 900);
        this.env.requestFrame();
      }, plan.delayMs);
      return { ...none };
    }
    this.touch = release(this.touch);
    this.soft = softRelease(this.soft, flicking ? { x: g.vx * toBody, y: -g.vy * toBody } : undefined);
    if (!silent) {
      squish.squishRelease(0.25 + 0.75 * intensity, wobbleHz(feel) * 2, this.flavor);
      // 슬로우 라이징: 천천히 차오르는 동안 작은 공기 소리
      if (feel.riseTauMs > 0 && squashAmount(this.touch) > 0.3) squish.riseSigh(recoverMs(feel) / 1000);
      const px = g.source === 'pointer' ? g.startX : undefined;
      const py = g.source === 'pointer' ? g.startY : undefined;
      if (!g.carrying) fx?.emit('release', px, py, intensity);
      if (intensity > 0.5) {
        squish.chime(spec.chime, 2, { shiny });
        view?.pulse(spec.auraPulse * intensity);
      }
      if (flicking && isDizzyFlick(g.vx, g.vy, g.radius, level)) this.goDizzy(g.vx < 0 ? -1 : 1);
      else this.showFace('happy', 900);
    } else {
      this.showFace('default');
    }
    this.env.requestFrame();
    return { vx: flicking ? g.vx : 0, vy: flicking ? g.vy : 0, flick: flicking, tap: false };
  }

  // ── 매 프레임 ──

  /** dt 만큼 진행. 아직 움직이는 중이면 true */
  frame(dt: number, now: number, drawing3d: boolean): boolean {
    const g = this.g;
    if (g && !g.moved) {
      // 누르고만 있는 동안: 점점 세게 눌리고 소리. 오래 누르면 녹아내린다 (애정 5단계)
      const held = now - g.startT;
      const pressure = Math.min(1, held / 900);
      const meltBy = meltAmount(held, this.env.level());
      this.touch = meltBy > 0 ? melt(this.touch, g.point, meltBy) : press(this.touch, g.point, pressure);
      this.soft = softPress(this.soft, pressure);
      const px = g.source === 'pointer' ? g.startX : undefined;
      const py = g.source === 'pointer' ? g.startY : undefined;
      const spec = this.env.fxSpec;
      if (g.squishCount === 0 && held > TAP_MS) {
        g.squishCount = 1;
        squish.squishPress(0.45, this.flavor);
        this.env.fx()?.emit('press', px, py, 0.45);
      } else if (g.squishCount === 1 && held > 900) {
        g.squishCount = 2;
        squish.squishPress(1, this.flavor);
        this.env.fx()?.emit('press', px, py, 1);
        squish.chime(spec.chime, 1, { shiny: this.env.shiny });
        this.env.view()?.pulse(spec.auraPulse);
        if (!this.env.reduced()) haptic(spec.pokeHaptic);
      }
      if (meltBy >= 1 && !g.melted) {
        g.melted = true;
        squish.purr();
        this.env.fx()?.react('hearts', 2);
      }
      if (held > SLEEPY_MS && this.face !== 'sleepy') this.showFace('sleepy');
    }
    if (g) this.petNow(now);

    const gz = this.gaze;
    const target = this.gazeTarget;
    const gazeMoving = Math.abs(gz.x - target.x) > 0.02 || Math.abs(gz.y - target.y) > 0.02;
    if (gazeMoving) this.gaze = approach(gz, target, dt);
    else if (gz.x !== target.x || gz.y !== target.y) this.gaze = { ...target };

    this.touch = step(this.touch, dt);
    if (drawing3d) this.soft = stepSoft(this.soft, dt);
    let filling = false;
    if (this.env.filling) {
      this.fill = stepFill(this.fill, this.squeezeLevel(), dt, this.env.reduced());
      filling = !isFillAtRest(this.fill);
    }
    const resting =
      !g && !this.peeling && !gazeMoving && !filling && isAtRest(this.touch) && (!drawing3d || isSoftAtRest(this.soft));
    if (resting) {
      this.touch = snapToTargets(this.touch);
      this.soft = snapSoft(this.soft);
    }
    return !resting;
  }

  /** 지금 눌리고 늘어난 정도 0..1 (몸속 속이 반응하는 양) */
  squeezeLevel(): number {
    let dent = 0;
    for (const d of this.soft.dents) dent = Math.max(dent, d.depth.x / SOFT_TUNING.dentMax);
    return Math.min(1, Math.max(squashAmount(this.touch), stretchAmount(this.touch), dent));
  }

  /** 졸면서 숨쉬기만 하는 중 (3D 는 20fps 로 충분) */
  dozeOnly(): boolean {
    return this.dozing && !this.g && isAtRest(this.touch);
  }

  pose(): Pose {
    return composePose(this.touch, this.soft, BODY_UNIT);
  }

  transform2d(): Transform {
    return toTransform(this.touch);
  }

  dispose() {
    this.disposed = true;
    this.peeling = false;

    this.g?.stretch?.stop();
    this.g = null;
    if (this.faceTimer !== null) window.clearTimeout(this.faceTimer);
    if (this.gazeReturn !== null) window.clearTimeout(this.gazeReturn);
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }
}
