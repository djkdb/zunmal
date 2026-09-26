/**
 * 전설 이상 말랑이 몸속의 특별한 속(반짝이 가루·물방울 속 별·은하·무지개 젤)이 누를 때 반응하는 양.
 * 순수 모듈 (dt 주입). 그리기는 3D 셰이더 uniform(jellyScene)과 2D SVG 덧그림(FillingArt)이 이 값만 읽는다.
 *
 *  - glow : 눌린 만큼 속이 밝아진다 (빠르게 오르고 천천히 식는다).
 *  - spin : 누르는 양이 바뀔 때마다 속이 소용돌이친다 (각속도, 서서히 멈춤). swirl 은 누적 각도.
 * 움직임 줄이기: 소용돌이(회전)는 없고 밝기만 바뀐다.
 */
import type { RNG } from '../lib/rng';
import type { FillingKind } from '../data/materials';

export interface FillState {
  /** 누적 회전 (rad) */
  swirl: number;
  /** 회전 속도 (rad/s) */
  spin: number;
  /** 밝기 0..1 */
  glow: number;
  /** 지난 누름 양 (변화량을 재기 위해) */
  last: number;
}

export const FILL_TUNING = {
  /** 누름 변화 1 당 더해지는 회전 속도 (rad/s) */
  spinPerSqueeze: 7,
  maxSpin: 6,
  /** 회전이 잦아드는 시정수 (s) */
  spinTau: 0.9,
  /** 밝아지는 / 식는 시정수 (s) */
  glowUpTau: 0.08,
  glowDownTau: 0.9,
  /** 가만히 있을 때 기본 밝기 */
  baseGlow: 0,
  settle: 0.004,
} as const;

export function createFill(): FillState {
  return { swirl: 0, spin: 0, glow: FILL_TUNING.baseGlow, last: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 누름 양(0..1)을 dtMs 만큼 반영 (새 상태) */
export function stepFill(s: FillState, squeeze: number, dtMs: number, reduced = false): FillState {
  const T = FILL_TUNING;
  const dt = clamp(Number.isFinite(dtMs) ? dtMs : 0, 0, 50) / 1000;
  const q = clamp(Number.isFinite(squeeze) ? squeeze : 0, 0, 1);
  if (dt === 0) return s;
  const dq = Math.abs(q - s.last);
  let spin = reduced ? 0 : clamp(s.spin + dq * T.spinPerSqueeze, -T.maxSpin, T.maxSpin);
  spin *= Math.exp(-dt / T.spinTau);
  if (Math.abs(spin) < T.settle) spin = 0;
  const tau = q > s.glow ? T.glowUpTau : T.glowDownTau;
  let glow = q + (s.glow - q) * Math.exp(-dt / tau);
  if (Math.abs(glow - q) < T.settle) glow = q;
  return { swirl: (s.swirl + spin * dt) % (Math.PI * 200), spin, glow, last: q };
}

/** 더 그릴 것이 없다 (회전 멈춤 + 밝기 도착) */
export function isFillAtRest(s: FillState): boolean {
  return s.spin === 0 && s.glow === s.last;
}

/** 2D 덧그림 알갱이 하나 (단위 원 안, 반지름 비율, 색 0..1 = 두 색 사이) */
export interface FillDot {
  x: number;
  y: number;
  r: number;
  mix: number;
}

/** 속 종류마다 알갱이 수 */
export const FILL_DOTS: Readonly<Record<FillingKind, number>> = {
  glitter: 22,
  starBeads: 7,
  galaxy: 26,
  rainbowGel: 6,
};

/**
 * 2D 덧그림 알갱이 자리 (RNG 주입 → 시드가 같으면 같은 자리). 모두 단위 원 안.
 * galaxy 는 두 팔 나선 위에, 나머지는 원 안에 고르게 흩뿌린다.
 */
export function fillDots(kind: FillingKind, rng: RNG): FillDot[] {
  const n = FILL_DOTS[kind];
  const dots: FillDot[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'galaxy') {
      const arm = i % 2;
      const t = (i >> 1) / Math.max(1, n / 2 - 1);
      const a = arm * Math.PI + t * Math.PI * 1.6 + (rng() - 0.5) * 0.35;
      const rr = 0.12 + 0.78 * t;
      dots.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 0.03 + rng() * 0.05, mix: t });
      continue;
    }
    // 원 안에 고르게 (면적 균등)
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * 0.9;
    const size = kind === 'glitter' ? 0.03 + rng() * 0.04 : kind === 'starBeads' ? 0.1 + rng() * 0.07 : 0.28 + rng() * 0.16;
    dots.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: size, mix: kind === 'rainbowGel' ? i / n : rng() });
  }
  return dots;
}

/** 3D 셰이더에 넘기는 속 종류 번호 (0 = 없음) */
export function fillKindIndex(kind: FillingKind | null | undefined): number {
  switch (kind) {
    case 'glitter':
      return 1;
    case 'starBeads':
      return 2;
    case 'galaxy':
      return 3;
    case 'rainbowGel':
      return 4;
    default:
      return 0;
  }
}
