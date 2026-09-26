/**
 * 3D 젤리 몸의 부드러운 변형 (순수 모듈, three/React/DOM 의존 없음. dt 는 주입받는다).
 *
 * 두 층으로 나눈다.
 *  1. 전체 자세 (physics.ts 의 TouchState): 눌림(squash)·기울기(lean)·이동. 2D 버전과 같은 값을 쓰므로
 *     소리·애정·손맛이 두 버전에서 똑같다. 여기에 숨쉬기를 곱해 부피가 보존되는 크기 변화로 바꾼다
 *     (세로 sy, 가로 sx, 깊이 sz = 1/(sx·sy)).
 *  2. 국소 변형 (이 모듈의 SoftState): 누른 자리가 움푹 들어가는 자국(dent), 손가락 쪽으로 늘어나는
 *     당김(pull), 튕기면 생기는 비틀림(twist)·앞뒤 흔들림(sway). 모두 감쇠 스프링이라 놓으면 출렁이다 멈춘다.
 *     자국·당김으로 변한 부피는 나머지 몸이 법선 방향으로 살짝 부풀거나 줄어 되돌린다 (부피 보존).
 *
 * 좌표는 jellyMesh.ts 의 "몸 좌표" (SVG 단위, 바닥 가운데 원점, y 위, z 카메라 쪽).
 *
 * 촉감(feel): 스프링 강성·감쇠 배수, 당김 한계(쭉쭉이는 훨씬 멀리), 놓을 때 반동, 그리고 슬로우 라이징의
 * 느린 자국 — 놓은 자국은 스프링 대신 지수 곡선으로 천천히 차오른다 (physics.relaxSpring 과 같은 곡선).
 */
import type { MaterialFeel } from '../data/materials';
import type { JellyMesh } from './jellyMesh';
import { meshVolume } from './jellyMesh';
import { NEUTRAL_FEEL, relaxSpring, toTransform, type Spring, type TouchState } from './physics';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 손가락이 닿은 곳 (몸 좌표, 쉬는 자세 기준) + 그 곳의 바깥 법선 */
export interface SoftHit {
  point: Vec3;
  normal: Vec3;
}

export interface Dent {
  center: Vec3;
  /** 들어가는 방향 (단위 벡터, 안쪽) */
  dir: Vec3;
  radius: number;
  depth: Spring;
  /** 아직 손가락이 누르고 있는 자국 */
  active: boolean;
}

export interface SoftState {
  dents: Dent[];
  /** 당김이 시작된 곳 (null 이면 당김 없음) */
  grab: Vec3 | null;
  pullX: Spring;
  pullY: Spring;
  pullZ: Spring;
  /** 몸 높이당 비틀림 (rad) */
  twist: Spring;
  /** 몸 높이당 앞뒤 기울기 (z/y) */
  sway: Spring;
  held: boolean;
  /** 마지막으로 놓은 뒤 흐른 시간 (ms) — 숨쉬기 세기에 쓴다 */
  idleMs: number;
  /** 누적 시간 (ms) — 숨쉬기 위상 */
  timeMs: number;
  reducedMotion: boolean;
  /** 졸고 있다: 느리고 깊게 계속 숨쉰다 */
  doze?: boolean;
  /** 촉감 (없으면 기본 말랑) */
  feel?: MaterialFeel;
}

/** 변형에 쓰는 전체 자세 */
export interface Pose {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** 몸 높이당 x 이동 (기울기) */
  lean: number;
  offsetX: number;
  offsetY: number;
}

interface SpringTuning {
  k: number;
  zetaFree: number;
  zetaHeld: number;
}

export const SOFT_TUNING = {
  // 자국: 약 2.9Hz, 놓으면 탱글하게 두세 번 출렁
  dent: { k: 330, zetaFree: 0.16, zetaHeld: 0.6 },
  pull: { k: 210, zetaFree: 0.15, zetaHeld: 0.7 },
  // 비틀림은 느리고 오래 (약 1.9Hz)
  twist: { k: 140, zetaFree: 0.09, zetaHeld: 0.6 },
  sway: { k: 190, zetaFree: 0.12, zetaHeld: 0.6 },
  reducedZeta: 0.62,
  maxDtMs: 50,
  subStep: 1 / 240,
  settleEps: 0.02,
  /** 동시에 남는 자국 수 */
  maxDents: 3,
  /** 가장 깊게 누른 자국 (몸 좌표 단위) */
  dentMax: 17,
  dentRadius: 17,
  dentRadiusPress: 8,
  /** 자국 둘레가 가운데로 오므라드는 정도 */
  dentPinch: 0.7,
  /** 당김 한계 (몸 좌표 단위) */
  pullMax: 20,
  pullRadius: 26,
  twistMax: 0.5,
  swayMax: 0.35,
  /** 숨쉬기: 세로 진폭, 주기(ms), 놓은 뒤 이만큼 숨쉬다 멈춘다 */
  breathAmp: 0.022,
  breathPeriodMs: 2800,
  breathFadeInMs: 700,
  breathHoldMs: 6000,
  breathFadeOutMs: 1600,
  /** 졸 때 숨쉬기: 세기 배수, 주기 배수 */
  dozeBreath: 1.8,
  dozePeriod: 1.6,
} as const;

// ── 유틸 ──────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function softLimit(x: number, max: number): number {
  return max <= 0 ? 0 : max * Math.tanh(x / max);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function spring(x = 0): Spring {
  return { x, v: 0, target: x };
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: -1 };
}

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

// ── 상태 ──────────────────────────────────────────────────

export function createSoftState(options: { reducedMotion?: boolean; feel?: MaterialFeel } = {}): SoftState {
  return {
    feel: options.feel,
    dents: [],
    grab: null,
    pullX: spring(),
    pullY: spring(),
    pullZ: spring(),
    twist: spring(),
    sway: spring(),
    held: false,
    // 처음 들어오면 바로 숨쉬기 시작
    idleMs: 0,
    timeMs: 0,
    reducedMotion: options.reducedMotion ?? false,
  };
}

export function setSoftReducedMotion(state: SoftState, reducedMotion: boolean): SoftState {
  return { ...state, reducedMotion };
}

/** 졸기 시작/깨기 */
export function setSoftDoze(state: SoftState, doze: boolean): SoftState {
  return { ...state, doze };
}

function pushDent(dents: readonly Dent[], dent: Dent): Dent[] {
  const next = dents.map((d) => (d.active ? { ...d, active: false, depth: { ...d.depth, target: 0 } } : d));
  next.push(dent);
  return next.slice(-SOFT_TUNING.maxDents);
}

function makeDent(hit: SoftHit, radius: number): Dent {
  const n = norm(hit.normal);
  return {
    center: { ...hit.point },
    dir: { x: -n.x, y: -n.y, z: -n.z },
    radius,
    depth: spring(),
    active: true,
  };
}

// ── 입력 ──────────────────────────────────────────────────

/** 손가락을 댄 순간: 그 자리에 자국을 새로 만든다. */
export function softTouch(state: SoftState, hit: SoftHit): SoftState {
  return {
    ...state,
    held: true,
    idleMs: 0,
    grab: { ...hit.point },
    dents: pushDent(state.dents, makeDent(hit, SOFT_TUNING.dentRadius)),
  };
}

/** 누르고 있는 동안 (pressure 0..1): 자국이 점점 깊고 넓어진다. */
export function softPress(state: SoftState, pressure: number): SoftState {
  const p = clamp(finite(pressure), 0, 1);
  return {
    ...state,
    held: true,
    idleMs: 0,
    dents: state.dents.map((d) =>
      d.active
        ? {
            ...d,
            radius: SOFT_TUNING.dentRadius + SOFT_TUNING.dentRadiusPress * p,
            depth: { ...d.depth, target: SOFT_TUNING.dentMax * (0.35 + 0.65 * p) },
          }
        : d,
    ),
  };
}

/**
 * 누른 채 끌기. displacement 는 손가락 이동량 (몸 좌표 단위, y 위 +).
 * 누른 자국은 풀리고, 잡은 자리가 손가락 쪽으로 쭉 늘어난다.
 */
export function softPull(state: SoftState, displacement: { x: number; y: number }): SoftState {
  const dx = finite(displacement.x);
  const dy = finite(displacement.y);
  const dist = Math.hypot(dx, dy);
  const { gain, max } = pullLimits(state.feel);
  const k = dist > 1e-9 ? softLimit(dist * gain, max) / dist : 0;
  return {
    ...state,
    held: true,
    idleMs: 0,
    dents: state.dents.map((d) => (d.active ? { ...d, active: false, depth: { ...d.depth, target: 0 } } : d)),
    pullX: { ...state.pullX, target: dx * k },
    pullY: { ...state.pullY, target: dy * k },
    // 당기면 살짝 앞으로 딸려 나온다
    pullZ: { ...state.pullZ, target: dist * k * 0.35 },
  };
}

/** 콕 찌르기: 자국이 순간 쑥 들어갔다 튀어나오고 몸이 뒤로 한 번 흔들린다. strength 0..1 */
export function softPoke(state: SoftState, hit: SoftHit | null, strength: number): SoftState {
  const s = clamp(finite(strength), 0, 1);
  let dents = state.dents.filter((d) => !d.active);
  if (hit) {
    const dent = makeDent(hit, SOFT_TUNING.dentRadius * 0.9);
    dent.active = false;
    dent.depth = { x: 0, v: 150 + 150 * s, target: 0 };
    dents = pushDent(dents, dent);
  }
  const side = hit ? clamp(hit.point.x / 40, -1, 1) : 0;
  return {
    ...state,
    dents,
    sway: { ...state.sway, v: state.sway.v - (0.8 + 1.2 * s) },
    twist: { ...state.twist, v: state.twist.v + side * (1 + s) },
  };
}

/** 간질이기: 문지르는 방향으로 비틀린다. direction −1 | 1 */
export function softTickle(state: SoftState, direction: number): SoftState {
  const dir = direction < 0 ? -1 : 1;
  return { ...state, twist: { ...state.twist, v: state.twist.v + dir * 2.4 } };
}

/**
 * 놓기. velocity 는 놓는 순간 손가락 속도 (몸 좌표 단위/초, y 위 +).
 * 빠르게 튕기듯 놓으면(flick) 비틀림·앞뒤 흔들림이 크게 붙는다.
 */
export function softRelease(state: SoftState, velocity: { x: number; y: number } = { x: 0, y: 0 }): SoftState {
  const vx = clamp(finite(velocity.x), -2000, 2000);
  const vy = clamp(finite(velocity.y), -2000, 2000);
  const snap = 1.4 * (state.feel ?? NEUTRAL_FEEL).snap;
  return {
    ...state,
    held: false,
    idleMs: 0,
    grab: state.grab,
    dents: state.dents.map((d) => (d.active ? { ...d, active: false, depth: { ...d.depth, target: 0 } } : d)),
    pullX: { ...state.pullX, target: 0, v: state.pullX.v - state.pullX.x * snap },
    pullY: { ...state.pullY, target: 0, v: state.pullY.v - state.pullY.x * snap },
    pullZ: { ...state.pullZ, target: 0 },
    twist: { ...state.twist, target: 0, v: state.twist.v + softLimit(vx * 0.006, 4) },
    sway: { ...state.sway, target: 0, v: state.sway.v + softLimit(vy * 0.004, 3) },
  };
}

// ── 적분 ──────────────────────────────────────────────────

/** 당김 세기·한계 (쭉쭉이는 멀리) */
export function pullLimits(feel: MaterialFeel = NEUTRAL_FEEL): { gain: number; max: number; radius: number } {
  const extra = feel.stretch - 1;
  return {
    gain: 0.5 * (1 + extra * 0.3),
    max: SOFT_TUNING.pullMax * feel.stretch,
    radius: SOFT_TUNING.pullRadius * (1 + extra * 0.3),
  };
}

function integrate(
  s: Spring,
  t: SpringTuning,
  held: boolean,
  reduced: boolean,
  dt: number,
  feel: MaterialFeel = NEUTRAL_FEEL,
): Spring {
  const zeta0 = held ? t.zetaHeld : Math.min(1.2, t.zetaFree * feel.zetaFree);
  const zeta = reduced ? Math.max(zeta0, SOFT_TUNING.reducedZeta) : zeta0;
  const k = t.k * feel.springK;
  const c = 2 * zeta * Math.sqrt(k);
  let x = finite(s.x);
  let v = finite(s.v);
  const target = finite(s.target);
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(SOFT_TUNING.subStep, remaining);
    const a = k * (target - x) - c * v;
    v += a * h;
    x += v * h;
    remaining -= h;
  }
  return { x, v, target };
}

function settled(s: Spring, eps: number = SOFT_TUNING.settleEps): boolean {
  return Math.abs(s.x - s.target) < eps && Math.abs(s.v) < eps * 10;
}

/** dtMs 만큼 진행 (dt 는 [0, maxDtMs] 로 제한 — 탭 전환 뒤 큰 dt 에도 폭주하지 않는다) */
export function stepSoft(state: SoftState, dtMs: number): SoftState {
  const ms = Number.isFinite(dtMs) ? clamp(dtMs, 0, SOFT_TUNING.maxDtMs) : 0;
  if (ms === 0) return state;
  const dt = ms / 1000;
  const { held, reducedMotion: r } = state;
  const feel = state.feel ?? NEUTRAL_FEEL;
  const T = SOFT_TUNING;
  const rise = feel.riseTauMs;
  const dents = state.dents
    .map((d) => {
      const spring = () => integrate(d.depth, T.dent, d.active, r, dt, feel);
      // 슬로우 라이징: 놓은 자국은 천천히 차오른다 (누르는 동안은 빠른 스프링)
      return { ...d, depth: !d.active && rise > 0 ? relaxSpring(d.depth, rise, dt, spring, 1) : spring() };
    })
    // 다 돌아온 자국은 지운다
    .filter((d) => d.active || !settled(d.depth, 0.05));
  const twist = integrate(state.twist, T.twist, held, r, dt, feel);
  const sway = integrate(state.sway, T.sway, held, r, dt, feel);
  return {
    ...state,
    dents,
    pullX: integrate(state.pullX, T.pull, held, r, dt, feel),
    pullY: integrate(state.pullY, T.pull, held, r, dt, feel),
    pullZ: integrate(state.pullZ, T.pull, held, r, dt, feel),
    twist: { ...twist, x: clamp(twist.x, -T.twistMax * 2, T.twistMax * 2) },
    sway: { ...sway, x: clamp(sway.x, -T.swayMax * 2, T.swayMax * 2) },
    idleMs: held ? 0 : state.idleMs + ms,
    timeMs: state.timeMs + ms,
  };
}

/** 숨쉬기 세기 0..1 — 놓은 직후 서서히 시작해 몇 초 뒤 멈춘다 (멈추면 그리기도 쉰다) */
export function breathLevel(state: SoftState): number {
  if (state.reducedMotion || state.held) return 0;
  const T = SOFT_TUNING;
  if (state.doze) return T.dozeBreath;
  const t = state.idleMs;
  return smoothstep(0, T.breathFadeInMs, t) * (1 - smoothstep(T.breathHoldMs, T.breathHoldMs + T.breathFadeOutMs, t));
}

/** 국소 변형이 모두 멈추고 숨쉬기도 끝났는가 */
export function isSoftAtRest(state: SoftState): boolean {
  if (state.held) return false;
  if (state.dents.length > 0) return false;
  const springs = [state.pullX, state.pullY, state.pullZ];
  if (!springs.every((s) => settled(s) && s.target === 0)) return false;
  if (!settled(state.twist, 0.002) || !settled(state.sway, 0.002)) return false;
  return breathLevel(state) === 0;
}

/** 멈추기 직전 남은 아주 작은 값을 없앤다 */
export function snapSoft(state: SoftState): SoftState {
  const z = (s: Spring): Spring => ({ x: s.target, v: 0, target: s.target });
  return {
    ...state,
    dents: [],
    grab: null,
    pullX: z(state.pullX),
    pullY: z(state.pullY),
    pullZ: z(state.pullZ),
    twist: z(state.twist),
    sway: z(state.sway),
  };
}

/** 스프링 에너지 합 (위치 + 운동) — 테스트·디버그용 */
export function softEnergy(state: SoftState): number {
  const T = SOFT_TUNING;
  const e = (s: Spring, k: number) => 0.5 * k * (s.x - s.target) ** 2 + 0.5 * s.v * s.v;
  let sum = e(state.pullX, T.pull.k) + e(state.pullY, T.pull.k) + e(state.pullZ, T.pull.k);
  sum += e(state.twist, T.twist.k) * 100 + e(state.sway, T.sway.k) * 100;
  for (const d of state.dents) sum += e(d.depth, T.dent.k);
  return sum;
}

// ── 자세 ─────────────────────────────────────────────────

/**
 * physics.ts 의 전체 자세 + 숨쉬기 → 부피 보존 크기 (sx·sy·sz = 1).
 * unit 은 physics 정규화 단위 1 이 몸 좌표로 몇인지 (말랑이 상자 반폭 = 74).
 */
export function composePose(touch: TouchState, soft: SoftState, unit = 74): Pose {
  const t = toTransform(touch);
  const period = SOFT_TUNING.breathPeriodMs * (soft.doze ? SOFT_TUNING.dozePeriod : 1);
  const b = 1 + SOFT_TUNING.breathAmp * breathLevel(soft) * Math.sin((2 * Math.PI * soft.timeMs) / period);
  const sy = t.scaleY * b;
  const sx = t.scaleX / Math.sqrt(b);
  return {
    scaleX: sx,
    scaleY: sy,
    scaleZ: 1 / (sx * sy),
    lean: clamp(touch.lean.x, -1.2, 1.2),
    offsetX: t.translateX * unit,
    // physics 는 아래가 + → 몸 좌표는 위가 +
    offsetY: -t.translateY * unit,
  };
}

export const REST_POSE: Pose = { scaleX: 1, scaleY: 1, scaleZ: 1, lean: 0, offsetX: 0, offsetY: 0 };

// ── 변형 ─────────────────────────────────────────────────

/** 전체 자세 + 비틀림/앞뒤 흔들림을 한 점에 적용 (in-place) */
function applyGlobal(out: Float32Array, o: number, pose: Pose, twistPerH: number, swayPerH: number, height: number) {
  let x = out[o]! * pose.scaleX;
  const y = out[o + 1]! * pose.scaleY;
  let z = out[o + 2]! * pose.scaleZ;
  const hn = height > 0 ? y / height : 0;
  if (twistPerH !== 0) {
    const a = twistPerH * hn;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const nx = x * c + z * s;
    z = -x * s + z * c;
    x = nx;
  }
  x += pose.lean * y + pose.offsetX;
  z += swayPerH * y;
  out[o] = x;
  out[o + 1] = y + pose.offsetY;
  out[o + 2] = z;
}

export interface DeformScratch {
  /** 국소 영향 가중치 (정점 수) */
  weight: Float32Array;
}

export function createScratch(mesh: JellyMesh): DeformScratch {
  return { weight: new Float32Array(mesh.vertexCount) };
}

/** 한 점의 국소 변형 (자국 + 당김). 반환값은 국소 영향 가중치 0..1 */
function localDisplace(
  px: number,
  py: number,
  pz: number,
  frontness: number,
  soft: SoftState,
  out: Float32Array,
  o: number,
): number {
  let x = px;
  let y = py;
  let z = pz;
  let w = 0;
  // 가장자리(앞면 높이가 낮은 곳)는 덜 들어간다 → 뒤쪽 카드가 비치지 않게
  const edge = smoothstep(0.02, 0.45, frontness);
  for (const d of soft.dents) {
    const depth = d.depth.x;
    if (depth === 0) continue;
    const dx = px - d.center.x;
    const dy = py - d.center.y;
    const dz = pz - d.center.z;
    const g = Math.exp(-(dx * dx + dy * dy + dz * dz) / (d.radius * d.radius));
    if (g < 1e-4) continue;
    const m = depth * g * edge;
    // 안으로 들어가면서 둘레 표면이 손가락 쪽으로 끌려 들어간다 (그림도 오므라들어 정면에서도 보인다)
    const pinch = (m / d.radius) * SOFT_TUNING.dentPinch;
    x += d.dir.x * m - dx * pinch;
    y += d.dir.y * m - dy * pinch;
    z += d.dir.z * m - dz * pinch;
    w = Math.max(w, g);
  }
  const g0 = soft.grab;
  if (g0 && (soft.pullX.x !== 0 || soft.pullY.x !== 0 || soft.pullZ.x !== 0)) {
    const dx = px - g0.x;
    const dy = py - g0.y;
    const dz = pz - g0.z;
    const r = pullLimits(soft.feel).radius;

    const g = Math.exp(-(dx * dx + dy * dy + dz * dz * 0.25) / (r * r));
    // 바닥은 접시에 붙어 있어 덜 딸려 온다
    const floor = smoothstep(0, 18, py);
    x += soft.pullX.x * g * floor;
    y += soft.pullY.x * g * floor;
    z += soft.pullZ.x * g * floor;
    w = Math.max(w, g);
  }
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  return w;
}

/**
 * 메시 정점 전체를 변형해 out(xyz) 에 쓴다.
 * 순서: 국소 변형(자국·당김) → 부피 보정(법선 방향 부풀림) → 전체 자세(크기·비틀림·기울기·이동).
 * 전체 자세 단계는 부피를 바꾸지 않는다(크기 곱 1, 회전·밀림).
 */
export function deformJelly(
  mesh: JellyMesh,
  pose: Pose,
  soft: SoftState,
  out: Float32Array,
  scratch: DeformScratch = createScratch(mesh),
  options: { preserveVolume?: boolean } = {},
): void {
  const { rest, front, restNormal, vertexArea, vertexCount } = mesh;
  const weight = scratch.weight;
  let anyLocal = false;
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 3;
    const w = localDisplace(rest[o]!, rest[o + 1]!, rest[o + 2]!, front[v]!, soft, out, o);
    weight[v] = w;
    if (w > 0) anyLocal = true;
  }
  if (anyLocal && options.preserveVolume !== false) {
    const vol = meshVolume(out, mesh.index);
    let area = 0;
    for (let v = 0; v < vertexCount; v++) area += vertexArea[v]! * (1 - weight[v]!);
    if (area > 1e-6) {
      // 부피 차이를 나머지 표면의 두께로 나눠 법선 방향으로 밀어낸다
      const delta = clamp((mesh.volume - vol) / area, -4, 4);
      for (let v = 0; v < vertexCount; v++) {
        const o = v * 3;
        const k = delta * (1 - weight[v]!);
        out[o] = out[o]! + restNormal[o]! * k;
        out[o + 1] = out[o + 1]! + restNormal[o + 1]! * k;
        out[o + 2] = out[o + 2]! + restNormal[o + 2]! * k;
      }
    }
  }
  const twist = soft.twist.x;
  const sway = soft.sway.x;
  for (let v = 0; v < vertexCount; v++) applyGlobal(out, v * 3, pose, twist, sway, mesh.height);
}

/**
 * 몸 밖 장식 카드처럼 부피가 없는 점들을 같은 변형장으로 옮긴다 (자국 제외, 당김 포함).
 */
export function deformPoints(
  src: Float32Array,
  count: number,
  height: number,
  pose: Pose,
  soft: SoftState,
  out: Float32Array,
): void {
  const noDents: SoftState = soft.dents.length > 0 ? { ...soft, dents: [] } : soft;
  for (let v = 0; v < count; v++) {
    const o = v * 3;
    localDisplace(src[o]!, src[o + 1]!, src[o + 2]!, 0, noDents, out, o);
    applyGlobal(out, o, pose, soft.twist.x, soft.sway.x, height);
  }
}
