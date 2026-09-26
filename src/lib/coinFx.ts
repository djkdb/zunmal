/**
 * 코인 연출 — "코인이 상단 코인 알약으로 날아가 쏙 들어간다".
 *
 * 스토어/React에 의존하지 않는 작은 이벤트 버스 + 순수 계산.
 *  - 어느 화면이든 `flyCoins(요소 또는 좌표, 금액)` 을 부르면
 *    `CoinBurst`(AppShell에 한 번 놓임)가 코인을 그리고, TopBar 숫자가 도착에 맞춰 올라간다.
 *  - 코인 지급(스토어 변경)보다 연출이 늦게 시작되는 경우, 지급 직전에 `holdCounter()` 를 부르면
 *    숫자가 먼저 올라가 버리지 않고 코인 도착을 기다린다.
 *  - 코인 개수는 금액이 아니라 연출 강도다 (5~12개).
 */

export interface Point {
  x: number;
  y: number;
}

// ------------------------------------------------------------------
// 순수 계산 (테스트 대상)
// ------------------------------------------------------------------

export const COIN_FX = {
  /** 코인 한 개가 흩어진 자리에서 카운터까지 가는 시간 */
  flightMs: 500,
  /** 코인끼리 출발 간격 */
  staggerMs: 60,
  /** 처음 원점에서 사방으로 튀어 나가는 시간 */
  burstMs: 150,
  /** 튀어 나가는 반지름 범위 */
  burstRadius: [40, 80] as const,
  minCoins: 5,
  maxCoins: 12,
  /** 숫자 카운트업 길이 범위 */
  countUpMs: [400, 1200] as const,
  /** 줄어들 때(코인 사용)는 짧게 */
  countDownMs: 300,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

/** 도착할수록 빨라지는 곡선 (카운터로 빨려 들어가는 느낌) */
export function easeInCubic(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * u;
}

/** 늘어난 양에 따른 카운트업 길이: 300 + 250·log10(Δ) ms를 400~1200으로 자른다. */
export function countUpDuration(delta: number): number {
  if (delta <= 0) return COIN_FX.countDownMs;
  const [lo, hi] = COIN_FX.countUpMs;
  return Math.round(clamp(300 + 250 * Math.log10(delta), lo, hi));
}

/** elapsed ms 시점에 보여 줄 정수 값 (easeOutCubic). */
export function countUpValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return Math.round(from + (to - from) * easeOutCubic(elapsed / duration));
}

/** 금액 → 날릴 코인 수 (금액이 커질수록 조금씩 늘지만 5~12개). */
export function coinCountFor(amount: number): number {
  if (!(amount > 0)) return 0;
  return clamp(Math.round(3 + 2 * Math.log10(amount)), COIN_FX.minCoins, COIN_FX.maxCoins);
}

/** i번째 코인의 도착 시각(연출 시작 기준 ms). */
export function arrivalTime(index: number): number {
  return COIN_FX.burstMs + index * COIN_FX.staggerMs + COIN_FX.flightMs;
}

export function quadBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export interface CoinKeyframe {
  offset: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface CoinFlight {
  id: number;
  /** 애니메이션 전체 길이 (ms) */
  duration: number;
  /** 연출 시작 기준 시작 지연 (ms) */
  delay: number;
  keyframes: CoinKeyframe[];
}

/**
 * 코인 한 개의 경로: 원점 → (튀어 나감) 흩어진 자리 → (잠깐 머묾) → 위로 휘는 포물선으로 목표.
 * rand01은 0~1 난수 두 개를 쓴다 (흩어지는 반지름·각도 흔들림). 좌표는 화면(viewport) 기준.
 */
export function coinPath(index: number, count: number, from: Point, to: Point, rand01: () => number): CoinKeyframe[] {
  const [rMin, rMax] = COIN_FX.burstRadius;
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + (rand01() - 0.5) * 0.8 - Math.PI / 2;
  const radius = rMin + (rMax - rMin) * rand01();
  const scatter: Point = { x: from.x + Math.cos(angle) * radius, y: from.y + Math.sin(angle) * radius * 0.8 };

  const depart = COIN_FX.burstMs + index * COIN_FX.staggerMs;
  const total = depart + COIN_FX.flightMs;

  // 제어점: 중간에서 위로 들어 올리고, 흩어진 방향으로 조금 밀어 코인마다 다른 곡선이 되게 한다
  const dist = Math.hypot(to.x - scatter.x, to.y - scatter.y);
  const lift = 40 + dist * 0.3;
  const ctrl: Point = {
    x: (scatter.x + to.x) / 2 + Math.cos(angle) * 30,
    y: Math.min(scatter.y, to.y) - lift * 0.5,
  };

  const frames: CoinKeyframe[] = [
    { offset: 0, x: from.x, y: from.y, scale: 0.3, opacity: 0 },
    { offset: COIN_FX.burstMs / total, x: scatter.x, y: scatter.y, scale: 1.1, opacity: 1 },
  ];
  if (depart > COIN_FX.burstMs) frames.push({ offset: depart / total, x: scatter.x, y: scatter.y, scale: 1, opacity: 1 });

  const steps = 10;
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const p = quadBezier(scatter, ctrl, to, easeInCubic(u));
    frames.push({
      offset: (depart + COIN_FX.flightMs * u) / total,
      x: p.x,
      y: p.y,
      scale: 1 - 0.35 * u,
      opacity: k === steps ? 0.9 : 1,
    });
  }
  return frames;
}

// ------------------------------------------------------------------
// 이벤트 버스 (브라우저 전용 부분은 호출 시점에만 window/performance에 접근)
// ------------------------------------------------------------------

export interface CoinFlightPlan {
  amount: number;
  /** performance.now() 기준 첫/마지막 코인 도착 시각 */
  firstArrival: number;
  lastArrival: number;
}

export type CoinFxEvent =
  | { type: 'spawn'; flights: CoinFlight[] }
  | { type: 'plan'; plan: CoinFlightPlan }
  | { type: 'arrive'; index: number; count: number }
  | { type: 'hold'; until: number }
  | { type: 'insufficient' };

type Listener = (e: CoinFxEvent) => void;
const listeners = new Set<Listener>();
let target: Element | null = null;
let heldUntil = 0;
let lastPlan: CoinFlightPlan | null = null;
let nextId = 1;

export function subscribeCoinFx(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(e: CoinFxEvent): void {
  for (const fn of listeners) fn(e);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** TopBar의 코인 알약이 스스로를 목표로 등록한다. */
export function setCoinTarget(el: Element | null): void {
  target = el;
}

/** 곧 flyCoins가 올 테니 숫자를 올리지 말고 기다리라고 알린다 (안 오면 ms 뒤 저절로 풀림). */
export function holdCounter(ms = 1500): void {
  heldUntil = now() + ms;
  emit({ type: 'hold', until: heldUntil });
}

export function counterHeldUntil(): number {
  return heldUntil;
}

/** 아직 도착 중인 비행 계획 (없으면 null). */
export function activeFlightPlan(): CoinFlightPlan | null {
  return lastPlan && lastPlan.lastArrival > now() ? lastPlan : null;
}

/** 코인이 모자랄 때 카운터를 붉게 흔든다. */
export function nudgeInsufficient(): void {
  emit({ type: 'insufficient' });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function centerOf(p: Element | Point): Point {
  if ('getBoundingClientRect' in p) {
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return p;
}

export interface FlyCoinsOptions {
  /** 연출 시작 지연 (ms). 계획은 바로 알리므로 숫자는 이 지연 동안 기다린다. */
  delay?: number;
  rand01?: () => number;
}

/**
 * from(요소 또는 화면 좌표)에서 코인을 튀겨 TopBar 코인 알약으로 날린다.
 * 목표가 없거나 금액이 0이면 아무것도 하지 않는다. 움직임 줄이기면 코인은 그리지 않고 도착 1번만 알린다.
 */
export function flyCoins(from: Element | Point, amount: number, opts: FlyCoinsOptions = {}): void {
  const count = coinCountFor(amount);
  if (count === 0) return;
  heldUntil = 0;
  const delay = Math.max(0, opts.delay ?? 0);
  const start = now() + delay;

  if (prefersReducedMotion() || !target || typeof window === 'undefined') {
    lastPlan = { amount, firstArrival: start, lastArrival: start };
    emit({ type: 'plan', plan: lastPlan });
    const fire = () => emit({ type: 'arrive', index: 0, count: 1 });
    if (typeof window === 'undefined' || delay === 0) fire();
    else window.setTimeout(fire, delay);
    return;
  }

  const origin = centerOf(from);
  const dest = centerOf(target);
  const rand = opts.rand01 ?? Math.random;
  const flights: CoinFlight[] = [];
  for (let i = 0; i < count; i++) {
    const keyframes = coinPath(i, count, origin, dest, rand);
    flights.push({ id: nextId++, delay, duration: arrivalTime(i), keyframes });
  }
  lastPlan = { amount, firstArrival: start + arrivalTime(0), lastArrival: start + arrivalTime(count - 1) };
  emit({ type: 'plan', plan: lastPlan });
  emit({ type: 'spawn', flights });
  for (let i = 0; i < count; i++) {
    window.setTimeout(() => emit({ type: 'arrive', index: i, count }), delay + arrivalTime(i));
  }
}
