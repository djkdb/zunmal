/**
 * 말랑이 만지기용 젤리 물리 모델 (순수 함수, React/DOM 의존 없음).
 *
 * 말랑이를 바닥에 붙은 탄성 덩어리로 본다. 네 개의 감쇠 스프링이 각자 목표값을 따라간다.
 *  - squash : 세로 눌림 (+ 눌림 / − 늘어남). 부피를 대략 보존해 눌리면 옆으로 퍼진다.
 *  - lean   : 윗부분이 옆으로 기운 정도 (몸 높이 대비 비율, skew)
 *  - offsetX/offsetY : 몸 전체의 작은 이동 (몸 반지름 대비 비율)
 *
 * 누르고 있는 동안에는 손가락이 붙잡고 있으므로 감쇠를 크게 해 부드럽게 따라오고,
 * 손을 떼면 감쇠가 작아져 여러 번 출렁이다 멈춘다 (젤리 특유의 흔들림).
 *
 * 좌표계: point 는 몸 중심 기준 정규화 좌표. x −1(왼쪽)…1(오른쪽), y −1(위)…1(아래).
 * drag 의 displacement 도 같은 단위(몸 반지름)이다.
 *
 * 촉감(`data/materials.ts` 의 MaterialFeel)을 상태에 담아 스프링 강성·감쇠·늘어나는 한계·반동·처짐을 바꾼다.
 * 슬로우 라이징은 놓은 뒤 눌림이 스프링 대신 지수 곡선으로 천천히 차오른다 (누를 때는 빠르다 = 히스테리시스).
 * feel 을 주지 않으면 예전 기본 말랑(NEUTRAL_FEEL) 그대로다.
 */
import type { MaterialFeel } from '../data/materials';

export interface Spring {
  x: number;
  v: number;
  target: number;
}

export interface TouchState {
  squash: Spring;
  lean: Spring;
  offsetX: Spring;
  offsetY: Spring;
  /** 손가락/키로 붙잡고 있는가 */
  held: boolean;
  /** 누른 세기 0..1 (press 에서 설정) */
  pressure: number;
  /** 누른 지점 (정규화) */
  pressX: number;
  pressY: number;
  /** 움직임 줄이기: 감쇠를 크게 해 흔들림 횟수를 줄인다 */
  reducedMotion: boolean;
  /** 촉감 */
  feel: MaterialFeel;
}

/** 예전 기본 말랑 (촉감이 없을 때) — 모든 배수 1 */
export const NEUTRAL_FEEL: Readonly<MaterialFeel> = {
  springK: 1,
  zetaFree: 1,
  riseTauMs: 0,
  stretch: 1,
  snap: 1,
  sag: 0,
  stickMs: 0,
  impact: 1,
};

export interface Transform {
  scaleX: number;
  scaleY: number;
  /** CSS skewX 각도 (deg). transform-origin 이 아래 가운데일 때 윗부분이 +lean 쪽으로 기운다. */
  skewXDeg: number;
  /** 몸 반지름 대비 이동량. 픽셀로 바꾸려면 반지름을 곱한다. */
  translateX: number;
  translateY: number;
}

// ── 튜닝 값 ────────────────────────────────────────────────
// 질량 1 기준. 고유진동수 f = √k / 2π, 감쇠비 ζ = c / (2√k).

interface SpringTuning {
  /** 강성 */
  k: number;
  /** 놓았을 때 감쇠비 (작을수록 오래 출렁임) */
  zetaFree: number;
  /** 붙잡고 있을 때 감쇠비 */
  zetaHeld: number;
}

export const TUNING = {
  // 약 2.6Hz, ζ 0.11 → 한 번 놓으면 눈에 보이는 출렁임 4~5회
  squash: { k: 270, zetaFree: 0.11, zetaHeld: 0.55 },
  // 기울기는 조금 느리게(약 2Hz) 흔들려 쫀득한 느낌
  lean: { k: 160, zetaFree: 0.12, zetaHeld: 0.6 },
  offset: { k: 220, zetaFree: 0.2, zetaHeld: 0.7 },
  /** 움직임 줄이기에서 쓰는 최소 감쇠비 */
  reducedZeta: 0.62,
  /** 최대 한 프레임 dt (ms). 탭 전환 등으로 큰 dt 가 와도 폭주하지 않게 */
  maxDtMs: 50,
  /** 적분 하위 스텝 (s) */
  subStep: 1 / 240,
  /** 누르기: 최소/최대 눌림 */
  pressMin: 0.12,
  pressMax: 0.34,
  /** 늘리기 한계 (soft limit) */
  stretchUpMax: 0.5,
  stretchDownMax: 0.3,
  leanMax: 0.6,
  offsetMax: 0.14,
  /** 속도가 이보다 작고 목표와 가까우면 멈춘 것으로 본다 */
  settleEps: 0.0015,
  /** 슬로우 라이징: 튕김(찌르기 등) 속도가 사라지는 빠르기 (1/s) — 빠르게 들어가고 */
  riseKickDamp: 22,
  /** 슬로우 라이징: 이만큼 가까우면 다 돌아온 것으로 본다 */
  riseSnap: 0.004,
} as const;

// ── 유틸 ──────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 부드러운 한계: 작을 때는 거의 그대로, 커질수록 저항이 커져 max 에 점근한다.
 * 슬라임을 당길수록 더 뻑뻑해지는 느낌.
 */
export function softLimit(x: number, max: number): number {
  if (max <= 0) return 0;
  return max * Math.tanh(x / max);
}

function spring(x = 0): Spring {
  return { x, v: 0, target: x };
}

function withTarget(s: Spring, target: number): Spring {
  return { ...s, target };
}

function kick(s: Spring, dv: number): Spring {
  return { ...s, v: s.v + dv };
}

// ── 상태 생성 ──────────────────────────────────────────────

export function createTouchState(options: { reducedMotion?: boolean; feel?: MaterialFeel } = {}): TouchState {
  const feel = options.feel ?? NEUTRAL_FEEL;
  return {
    squash: spring(feel.sag),
    lean: spring(),
    offsetX: spring(),
    offsetY: spring(),
    held: false,
    pressure: 0,
    pressX: 0,
    pressY: 0,
    reducedMotion: options.reducedMotion ?? false,
    feel,
  };
}

/** 촉감 바꾸기 (쉬는 눌림도 새 처짐으로) */
export function setFeel(state: TouchState, feel: MaterialFeel): TouchState {
  return { ...state, feel, squash: state.held ? state.squash : withTarget(state.squash, feel.sag) };
}

/** 늘어나는 한계 배수에서 기울기·옆 이동 배수 (당김만큼 멀리 가지는 않는다) */
function stretchScale(feel: MaterialFeel, share: number): number {
  return 1 + (feel.stretch - 1) * share;
}

export function setReducedMotion(state: TouchState, reducedMotion: boolean): TouchState {
  return { ...state, reducedMotion };
}

// ── 입력 ──────────────────────────────────────────────────

/** 눌림 목표값 */
function pressSquash(pressure: number): number {
  const p = clamp(pressure, 0, 1);
  return TUNING.pressMin + (TUNING.pressMax - TUNING.pressMin) * p;
}

/**
 * 누르기 (누르고 있는 동안 pressure 를 올리며 반복 호출해도 된다).
 * 가운데를 누르면 바로 아래로 눌리고, 가장자리를 누르면 반대쪽으로 살짝 기운다.
 */
export function press(state: TouchState, point: { x: number; y: number }, pressure: number): TouchState {
  const px = clamp(point.x, -1.2, 1.2);
  const py = clamp(point.y, -1.2, 1.2);
  const p = clamp(pressure, 0, 1);
  // 위쪽을 누를수록 더 많이 눌린다 (아래쪽은 바닥에 붙어 있어 덜 움직임)
  const topFactor = 1 + clamp(-py, -0.6, 1) * 0.25;
  return {
    ...state,
    held: true,
    pressure: p,
    pressX: px,
    pressY: py,
    squash: withTarget(state.squash, pressSquash(p) * topFactor),
    lean: withTarget(state.lean, -px * 0.14 * (0.5 + p)),
    offsetX: withTarget(state.offsetX, 0),
    offsetY: withTarget(state.offsetY, 0),
  };
}

/**
 * 누른 채로 끌기. displacement 는 누른 지점부터의 이동량(몸 반지름 단위, y 아래가 +).
 * 위로 당기면 쭉 늘어나고, 아래로 누르면 더 납작해지고, 옆으로 당기면 그쪽으로 기울며 따라온다.
 */
export function drag(state: TouchState, displacement: { x: number; y: number }): TouchState {
  const dx = displacement.x;
  const dy = displacement.y;
  const dist = Math.hypot(dx, dy);
  // 끌수록 누름 효과는 줄고 늘림 효과가 커진다
  const f = state.feel;
  const pressPart = pressSquash(state.pressure) * Math.max(0, 1 - dist * 1.6);
  const upMax = TUNING.stretchUpMax * f.stretch;
  const vertical = dy < 0 ? -softLimit(-dy * 0.55 * stretchScale(f, 0.3), upMax) : softLimit(dy * 0.4, TUNING.stretchDownMax);
  // 옆으로 당겨도 몸이 길어지므로 세로로 살짝 늘어난다
  const sideStretch = -softLimit(Math.abs(dx) * 0.12, 0.1 * f.stretch);
  return {
    ...state,
    held: true,
    squash: withTarget(state.squash, pressPart + vertical + sideStretch),
    lean: withTarget(state.lean, softLimit(dx * 0.55, TUNING.leanMax * stretchScale(f, 0.6))),
    offsetX: withTarget(state.offsetX, softLimit(dx * 0.18, TUNING.offsetMax * stretchScale(f, 0.8))),
    offsetY: withTarget(state.offsetY, 0),
  };
}

/**
 * 놓기: 목표를 쉬는 자세로 되돌리고 감쇠를 풀어 출렁이게 한다.
 * 늘어나 있던 만큼 튕겨 나가는 속도를 조금 더해 "탱" 하는 반동을 만든다.
 */
export function release(state: TouchState): TouchState {
  const snap = 1.5 * state.feel.snap;
  const sag = state.feel.sag;
  return {
    ...state,
    held: false,
    pressure: 0,
    squash: kick(withTarget(state.squash, sag), -(state.squash.x - sag) * snap),
    lean: kick(withTarget(state.lean, 0), -state.lean.x * snap),
    offsetX: withTarget(state.offsetX, 0),
    offsetY: withTarget(state.offsetY, 0),
  };
}

/**
 * 콕 찌르기: 짧게 움푹 들어갔다 튀어나오는 충격. strength 0..1.
 */
export function poke(state: TouchState, point: { x: number; y: number }, strength = 0.6): TouchState {
  const s = clamp(strength, 0, 1);
  const px = clamp(point.x, -1.2, 1.2);
  return {
    ...state,
    squash: kick(state.squash, 3.2 + 3.2 * s),
    lean: kick(state.lean, -px * (1.4 + 1.4 * s)),
    offsetY: kick(state.offsetY, 0.6 * s),
  };
}

/**
 * 간질이기: 문지르는 방향으로 흔드는 작은 충격. direction 은 −1 또는 1.
 */
export function tickle(state: TouchState, direction: number): TouchState {
  const dir = direction < 0 ? -1 : 1;
  return {
    ...state,
    lean: kick(state.lean, dir * 1.6),
    squash: kick(state.squash, -0.9),
  };
}

/**
 * 몸 전체가 부딪혔다 (놀이방: 매트에 착지, 다른 말랑이·벽과 툭). strength 0..1.
 * dirX 는 부딪혀 밀려나는 옆 방향 (−1..1, 0 이면 위에서 떨어진 착지): 세로로 철퍽 눌리고 그 반대쪽으로 기운다.
 */
export function impact(state: TouchState, dirX: number, strength: number): TouchState {
  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
  const d = clamp(Number.isFinite(dirX) ? dirX : 0, -1, 1);
  const k = state.feel.impact;
  return {
    ...state,
    squash: kick(state.squash, (2.4 + 4.2 * s) * (1 - 0.6 * Math.abs(d)) * k),
    lean: kick(state.lean, d * (1.2 + 2.2 * s) * k),
  };
}

/** 녹아내렸을 때 눌림 (가장 납작한 쉬는 자세) */
export const MELT_SQUASH = 0.46;

/**
 * 오래 누르고 있으면 녹아내린다: amount 0..1 만큼 누름 자세에서 납작하게 퍼진 자세로.
 * 누르고 있는 동안 반복 호출한다 (press 대신).
 */
export function melt(state: TouchState, point: { x: number; y: number }, amount: number): TouchState {
  const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  const base = press(state, point, 1);
  const pressT = base.squash.target;
  return {
    ...base,
    squash: withTarget(base.squash, pressT + (MELT_SQUASH - pressT) * a),
    lean: withTarget(base.lean, base.lean.target * (1 - a)),
  };
}

/**
 * 폴짝 뛰기 (애교 점프·깜짝 놀라 깨기): 위로 튀어 오르며 길쭉해졌다가 출렁이며 내려앉는다. strength 0..1.
 */
export function hop(state: TouchState, strength = 1): TouchState {
  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
  return {
    ...state,
    offsetY: kick(state.offsetY, -(3.5 + 4 * s)),
    squash: kick(state.squash, -(2.5 + 3 * s)),
  };
}

/** 하품하며 기지개: 위로 쭉 늘어났다 돌아온다. strength 0..1 */
export function stretchUp(state: TouchState, strength = 1): TouchState {
  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
  return { ...state, squash: kick(state.squash, -(1.5 + 2 * s)) };
}

// ── 적분 ──────────────────────────────────────────────────

function zetaFor(t: SpringTuning, held: boolean, reduced: boolean, feel: MaterialFeel = NEUTRAL_FEEL): number {
  const z = held ? t.zetaHeld : Math.min(1.2, t.zetaFree * feel.zetaFree);
  return reduced ? Math.max(z, TUNING.reducedZeta) : z;
}

function integrate(
  s: Spring,
  t: SpringTuning,
  held: boolean,
  reduced: boolean,
  dt: number,
  feel: MaterialFeel = NEUTRAL_FEEL,
): Spring {
  const zeta = zetaFor(t, held, reduced, feel);
  const k = t.k * feel.springK;
  const c = 2 * zeta * Math.sqrt(k);
  let x = s.x;
  let v = s.v;
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(TUNING.subStep, remaining);
    // semi-implicit Euler: 안정적이고 결정적
    const a = k * (s.target - x) - c * v;
    v += a * h;
    x += v * h;
    remaining -= h;
  }
  return { x, v, target: s.target };
}

/**
 * 슬로우 라이징: 튕김 속도는 금방 사라지고(빠르게 들어감) 목표 쪽으로는 지수 곡선으로 천천히 돌아온다.
 * side = +1 이면 눌린 쪽(x > target)에 있을 때만 느리게, 반대쪽(늘어난 쪽)은 보통 스프링 (늘어난 채 멈춰 있지 않게).
 * side = 0 이면 양쪽 모두 느리게.
 */
export function relaxSpring(s: Spring, tauMs: number, dt: number, fallback: () => Spring, side = 0): Spring {
  if (side !== 0 && (s.x - s.target) * side <= 0 && s.v * side <= 0) return fallback();
  let x = s.x;
  let v = s.v;
  const tau = Math.max(1, tauMs) / 1000;
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(TUNING.subStep, remaining);
    x += v * h;
    v *= Math.exp(-TUNING.riseKickDamp * h);
    if (side === 0 || (x - s.target) * side > 0) x = s.target + (x - s.target) * Math.exp(-h / tau);
    remaining -= h;
  }
  if (Math.abs(x - s.target) < TUNING.riseSnap && Math.abs(v) < 0.02) {
    x = s.target;
    v = 0;
  }
  return { x, v, target: s.target };
}

/** 놓은 뒤 눌림이 목표로 90% 돌아오는 대략의 시간 (ms) — 소리 길이·테스트용 */
export function recoverMs(feel: MaterialFeel): number {
  if (feel.riseTauMs > 0) return feel.riseTauMs * Math.log(10);
  // 감쇠 진동: 포락선 exp(-ζω t) 가 0.1 이 되는 시간
  const w = Math.sqrt(TUNING.squash.k * feel.springK);
  const zeta = Math.min(1.2, TUNING.squash.zetaFree * feel.zetaFree);
  return (Math.log(10) / (zeta * w)) * 1000;
}

/** dtMs 만큼 시뮬레이션을 진행한다. dt 는 [0, maxDtMs] 로 제한된다. */
export function step(state: TouchState, dtMs: number): TouchState {
  const dtClamped = Number.isFinite(dtMs) ? clamp(dtMs, 0, TUNING.maxDtMs) : 0;
  if (dtClamped === 0) return state;
  const dt = dtClamped / 1000;
  const { held, reducedMotion: r, feel } = state;
  const offT: SpringTuning = TUNING.offset;
  const slow = !held && feel.riseTauMs > 0;
  const squash = () => integrate(state.squash, TUNING.squash, held, r, dt, feel);
  const lean = () => integrate(state.lean, TUNING.lean, held, r, dt, feel);
  return {
    ...state,
    squash: slow ? relaxSpring(state.squash, feel.riseTauMs, dt, squash, 1) : squash(),
    lean: slow ? relaxSpring(state.lean, feel.riseTauMs * 0.6, dt, lean) : lean(),
    offsetX: integrate(state.offsetX, offT, held, r, dt, feel),
    offsetY: integrate(state.offsetY, offT, held, r, dt, feel),
  };
}

function springSettled(s: Spring): boolean {
  return Math.abs(s.x - s.target) < TUNING.settleEps && Math.abs(s.v) < TUNING.settleEps * 10;
}

/** 모든 스프링이 목표에 도달해 멈췄는가 (붙잡고 있어도 목표에 도달하면 true) */
export function isSettled(state: TouchState): boolean {
  return springSettled(state.squash) && springSettled(state.lean) && springSettled(state.offsetX) && springSettled(state.offsetY);
}

/** 쉬는 자세(목표 0)에서 멈췄는가 */
export function isAtRest(state: TouchState): boolean {
  return (
    !state.held &&
    isSettled(state) &&
    state.squash.target === state.feel.sag &&
    state.lean.target === 0 &&
    state.offsetX.target === 0 &&
    state.offsetY.target === 0
  );
}

/** 멈춘 뒤 남은 아주 작은 오차를 없애 정확히 목표값에 둔다 (루프를 멈추기 직전에 사용) */
export function snapToTargets(state: TouchState): TouchState {
  const snap = (sp: Spring): Spring => ({ x: sp.target, v: 0, target: sp.target });
  return {
    ...state,
    squash: snap(state.squash),
    lean: snap(state.lean),
    offsetX: snap(state.offsetX),
    offsetY: snap(state.offsetY),
  };
}

// ── 출력 ──────────────────────────────────────────────────

/**
 * 물리 상태 → CSS transform 값.
 * 세로로 눌리면(scaleY<1) 옆으로 퍼지고, 늘어나면 가늘어진다 (넓이를 대략 보존).
 */
export function toTransform(state: TouchState): Transform {
  const f = state.feel;
  const scaleY = clamp(1 - state.squash.x, 0.45, Math.max(1.75, 1.25 + TUNING.stretchUpMax * f.stretch));
  // 완전한 넓이 보존(1/scaleY)의 80% 정도만 반영해 너무 넓적해지지 않게
  const scaleX = clamp(1 + (1 / scaleY - 1) * 0.8, 0.5, 1.9);
  const leanMax = 1.2 * Math.max(1, stretchScale(f, 0.25));
  const lean = clamp(state.lean.x, -leanMax, leanMax);
  return {
    scaleX,
    scaleY,
    // skewX(a): 원점이 아래라서 윗부분은 −tan(a)·높이 만큼 이동 → 부호를 반대로
    skewXDeg: (-Math.atan(lean) * 180) / Math.PI,
    translateX: clamp(state.offsetX.x, -0.5, 0.5),
    translateY: clamp(state.offsetY.x, -0.5, 0.5),
  };
}

/** 현재 늘어난 정도 0..1 (소리 밝기/크기에 사용) */
export function stretchAmount(state: TouchState): number {
  const f = state.feel;
  const vertical = Math.max(0, -state.squash.x) / (TUNING.stretchUpMax * f.stretch);
  const side = Math.abs(state.lean.x) / (TUNING.leanMax * stretchScale(f, 0.6));
  return clamp(Math.max(vertical, side), 0, 1);
}

/** 현재 눌린 정도 0..1 */
export function squashAmount(state: TouchState): number {
  return clamp((state.squash.x - state.feel.sag) / TUNING.pressMax, 0, 1);
}

/** 기본 말랑의 늘림 한계 대비 지금 몇 배 늘어났는가 (쭉쭉이는 2 를 넘는다 — 늘림 소리 음높이에 사용) */
export function stretchLength(state: TouchState): number {
  return Math.max(0, -state.squash.x) / TUNING.stretchUpMax;
}

/**
 * 찐득이: 손가락을 뗄 때 얼마나 붙어 있다가 떨어지는가. 오래 눌렀을수록 오래 붙고 많이 딸려 올라온다.
 * delayMs = 0 이면 붙지 않는다. lift 는 떨어지기 직전 위로 늘어나는 양 (몸 반지름 단위, drag 의 −y).
 */
export function peelPlan(feel: MaterialFeel, heldMs: number, tap: boolean): { delayMs: number; lift: number } {
  if (!(feel.stickMs > 0)) return { delayMs: 0, lift: 0 };
  const held = clamp(Number.isFinite(heldMs) ? heldMs : 0, 0, 1500) / 1500;
  if (tap) return { delayMs: Math.round(feel.stickMs * 0.3), lift: 0.15 };
  return { delayMs: Math.round(feel.stickMs * (0.45 + 0.55 * held)), lift: 0.3 + 0.4 * held };
}

/** 흔들림 크기 (놓았을 때 소리 세기에 사용) 0..1 */
export function wobbleEnergy(state: TouchState): number {
  const e = Math.abs(state.squash.x) * 2.2 + Math.abs(state.lean.x) * 1.2 + Math.abs(state.squash.v) * 0.06;
  return clamp(e, 0, 1);
}

/** 놓은 뒤 세로 출렁임의 대략적인 주파수 (Hz) — 소리 비브라토를 화면과 맞출 때 사용 */
export function wobbleHz(feel: MaterialFeel = NEUTRAL_FEEL): number {
  return Math.sqrt(TUNING.squash.k * feel.springK) / (2 * Math.PI);
}

