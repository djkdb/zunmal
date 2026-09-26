/**
 * 캡슐 머신 돔 속 캡슐 더미 — 작은 공 쌓기 풀이기 (순수, 시드·dt 주입, three/DOM 의존 없음).
 *
 * 위치 기반(Verlet) 풀이: 중력으로 떨어뜨리고, 공끼리 겹침·돔 벽(구)·바닥 판(평면)을 제약으로 밀어낸다.
 * 불러올 때 한 번 `settlePile`로 가라앉힌 더미를 쓰고, 뽑을 때는 `stirPile`로 휘저은 뒤 같은 `stepPile`로 다시 가라앉힌다.
 * 좌표: 돔 가운데 = 원점, y 위. 단위는 돔 반지름 1 기준.
 */
import { createSeededRng, randomRange, type RNG } from '../../lib/rng';

/** 더미 속 조각 종류 — 두 색 캡슐이 대부분, 광택 공·진주·크롬 몇 개가 섞인다 (참고: 실제 뽑기 기계 사진) */
export type PieceKind = 'capsule' | 'ball' | 'pearl' | 'ribbed' | 'clover';

export interface PileBody {
  x: number;
  y: number;
  z: number;
  /** 지난 스텝 위치 (Verlet 속도 = 위치 − 지난 위치) */
  px: number;
  py: number;
  pz: number;
  r: number;
  kind: PieceKind;
  /** 색 번호 (그리는 쪽 팔레트 안에서) */
  tone: number;
}

export interface PileBounds {
  /** 돔 안쪽 반지름 (유리 두께만큼 1보다 작다) */
  radius: number;
  /** 바닥 판 높이 — 돔이 몸통 목에 끼는 자리 */
  floorY: number;
}

export interface PileState {
  bodies: PileBody[];
  bounds: PileBounds;
}

export const PILE_BOUNDS: PileBounds = { radius: 0.955, floorY: -0.7 };

/** 조각 구성 (합 = 개수). 순서대로 채운 뒤 섞는다 */
export const PILE_MIX: readonly { kind: PieceKind; count: number; tones: number }[] = [
  { kind: 'capsule', count: 19, tones: 6 },
  { kind: 'ball', count: 4, tones: 6 },
  { kind: 'pearl', count: 3, tones: 3 },
  { kind: 'ribbed', count: 2, tones: 1 },
  { kind: 'clover', count: 2, tones: 2 },
];

export const PILE_COUNT = PILE_MIX.reduce((s, m) => s + m.count, 0);

export interface StepOptions {
  gravity?: number;
  /** 제약 반복 횟수 */
  iterations?: number;
  /** 스텝마다 속도에 곱하는 값 (공기 저항) */
  damping?: number;
  /** 바닥·벽에 닿은 공의 접선 속도에 곱하는 값 (구름 마찰 흉내) */
  friction?: number;
}

const DEFAULTS: Required<StepOptions> = { gravity: 9.8, iterations: 4, damping: 0.992, friction: 0.9 };

/** 시드 고정 더미 — 돔 위쪽에 흩뿌린 상태(아직 가라앉지 않음) */
export function createPile(seed: number, bounds: PileBounds = PILE_BOUNDS): PileState {
  const rng = createSeededRng(seed);
  const kinds: { kind: PieceKind; tone: number }[] = [];
  for (const m of PILE_MIX) for (let i = 0; i < m.count; i++) kinds.push({ kind: m.kind, tone: i % m.tones });
  // 섞기 (Fisher–Yates) — 크롬이 한쪽에 몰리지 않게
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const a = kinds[i];
    const b = kinds[j];
    if (a && b) {
      kinds[i] = b;
      kinds[j] = a;
    }
  }
  // 크롬 조각은 마지막에 떨어뜨려 더미 위에 얹힌다 (묻히면 안 보인다)
  const chromeLast = [...kinds.filter((k) => k.kind !== 'ribbed' && k.kind !== 'clover'), ...kinds.filter((k) => k.kind === 'ribbed' || k.kind === 'clover')];
  const bodies: PileBody[] = [];
  const R = bounds.radius;
  chromeLast.forEach((k, order) => {
    const frac = order / Math.max(1, chromeLast.length - 1);
    const r = k.kind === 'capsule' ? randomRange(rng, 0.2, 0.235) : k.kind === 'pearl' ? randomRange(rng, 0.16, 0.18) : randomRange(rng, 0.18, 0.21);
    // 겹치지 않는 자리를 몇 번 찾아보고, 못 찾으면 그냥 둔다 (풀이기가 밀어낸다)
    let best = { x: 0, y: 0, z: 0 };
    let bestGap = -Infinity;
    for (let tries = 0; tries < 40; tries++) {
      // 차례대로 위쪽 띠에 흩뿌린다 → 나중 것이 위에 얹힌다
      const lo = bounds.floorY + r + frac * (R - bounds.floorY - 2 * r) * 0.75;
      const y = randomRange(rng, lo, Math.min(R - r, lo + 0.6));
      const ring = Math.sqrt(Math.max(0, (R - r) ** 2 - y * y));
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * ring;
      // 크롬은 앞쪽(카메라 쪽, +z)에 — 뒤에 묻히면 반짝임이 안 보인다
      const front = k.kind === 'ribbed' || k.kind === 'clover';
      const cand = { x: Math.cos(a) * d, y, z: front ? Math.abs(Math.sin(a) * d) : Math.sin(a) * d };
      let gap = Infinity;
      for (const o of bodies) gap = Math.min(gap, Math.hypot(o.x - cand.x, o.y - cand.y, o.z - cand.z) - o.r - r);
      if (gap > bestGap) {
        bestGap = gap;
        best = cand;
      }
      if (gap >= 0) break;
    }
    bodies.push({ ...best, px: best.x, py: best.y, pz: best.z, r, kind: k.kind, tone: k.tone });
  });
  return { bodies, bounds };
}

/** 한 스텝: 적분 → 제약 반복 → 닿은 곳 마찰 */
export function stepPile(state: PileState, dt: number, options: StepOptions = {}): void {
  const o = { ...DEFAULTS, ...options };
  const { bodies, bounds } = state;
  const g = o.gravity * dt * dt;
  for (const b of bodies) {
    const vx = (b.x - b.px) * o.damping;
    const vy = (b.y - b.py) * o.damping;
    const vz = (b.z - b.pz) * o.damping;
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    b.x += vx;
    b.y += vy - g;
    b.z += vz;
  }
  const n = bodies.length;
  for (let it = 0; it < o.iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = bodies[i] as PileBody;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j] as PileBody;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-6;
        // 질량 ∝ r³ — 큰 공이 덜 밀린다
        const ma = a.r ** 3;
        const mb = b.r ** 3;
        const push = (min - d) / d;
        const fa = mb / (ma + mb);
        const fb = ma / (ma + mb);
        a.x -= dx * push * fa;
        a.y -= dy * push * fa;
        a.z -= dz * push * fa;
        b.x += dx * push * fb;
        b.y += dy * push * fb;
        b.z += dz * push * fb;
      }
    }
    for (const b of bodies) constrain(b, bounds);
  }
  // 바닥·벽에 닿은 공: 접선 속도를 줄여 굴러 멈추게 한다
  for (const b of bodies) {
    const onFloor = b.y <= bounds.floorY + b.r + 1e-4;
    const len = Math.hypot(b.x, b.y, b.z);
    const onWall = len >= bounds.radius - b.r - 1e-4;
    if (!onFloor && !onWall) continue;
    b.px = b.x - (b.x - b.px) * o.friction;
    b.pz = b.z - (b.z - b.pz) * o.friction;
    if (onWall) b.py = b.y - (b.y - b.py) * o.friction;
  }
}

function constrain(b: PileBody, bounds: PileBounds): void {
  const lim = bounds.radius - b.r;
  const len = Math.hypot(b.x, b.y, b.z);
  if (len > lim) {
    const s = lim / len;
    b.x *= s;
    b.y *= s;
    b.z *= s;
  }
  if (b.y < bounds.floorY + b.r) b.y = bounds.floorY + b.r;
}

/** 운동 에너지 비슷한 값 (스텝당 이동 거리 제곱 합) — 멈췄는지 판정용 */
export function pileMotion(state: PileState): number {
  let e = 0;
  for (const b of state.bodies) e += (b.x - b.px) ** 2 + (b.y - b.py) ** 2 + (b.z - b.pz) ** 2;
  return e;
}

/**
 * 멈출 때까지 가라앉힌다 (불러올 때 미리 계산). 쓴 스텝 수를 돌려준다.
 * 마지막에 속도를 0으로 맞춰 다음 스텝이 튀지 않게 한다.
 */
export function settlePile(state: PileState, dt = 1 / 120, maxSteps = 2400, still = 1e-9): number {
  let steps = 0;
  let calm = 0;
  while (steps < maxSteps) {
    // 처음엔 공기 저항을 세게 → 빨리 가라앉는다
    stepPile(state, dt, { damping: steps < 600 ? 0.97 : 0.95, friction: 0.8 });
    steps++;
    if (pileMotion(state) < still) {
      if (++calm > 30) break;
    } else calm = 0;
  }
  for (const b of state.bodies) {
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
  }
  return steps;
}

/**
 * 휘젓기: 손잡이가 바닥 판을 돌리는 느낌 — 아래쪽 공일수록 세게 튀어 오르고 돔 축을 따라 소용돌이친다.
 * 속도를 바꾸는 것이므로 지난 위치를 옮긴다. `strength` 1 = 보통 한 번 돌리기.
 */
export function stirPile(state: PileState, rng: RNG, strength: number, dt = 1 / 120): void {
  const { floorY, radius } = state.bounds;
  for (const b of state.bodies) {
    const depth = 1 - Math.min(1, Math.max(0, (b.y - floorY) / (radius - floorY)));
    const up = strength * (0.8 + 1.6 * depth) * randomRange(rng, 0.55, 1.1);
    const swirl = strength * randomRange(rng, 0.4, 1);
    const side = strength * 0.35;
    // 소용돌이: y 축 둘레 접선 방향
    const tx = -b.z;
    const tz = b.x;
    const tl = Math.hypot(tx, tz) || 1;
    const vx = (tx / tl) * swirl + randomRange(rng, -side, side);
    const vz = (tz / tl) * swirl + randomRange(rng, -side, side);
    b.px -= vx * dt;
    b.py -= up * dt;
    b.pz -= vz * dt;
  }
}

/** 가장 크게 겹친 깊이 (공끼리) — 테스트·디버그용 */
export function maxOverlap(state: PileState): number {
  let worst = 0;
  const bs = state.bodies;
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i] as PileBody;
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j] as PileBody;
      worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return worst;
}

/** 시드 고정 + 미리 가라앉힌 더미 (같은 시드 → 같은 더미) */
export function buildSettledPile(seed: number): PileState {
  const s = createPile(seed);
  settlePile(s);
  return s;
}
