/**
 * 말랑 합치기 — 순수 시뮬레이션 (DOM/React 무관, dt·RNG 주입 = 결정적).
 *
 * 좌표계: 병 안쪽 WORLD.width × WORLD.height (월드 px, y는 아래로 증가).
 * 말랑이는 모두 원(circle)으로 계산한다. 반지름은 단계(tier)마다 커진다.
 *
 * 규칙
 *  - 병 위에서 좌우로 조준(aimX)하고 drop() 하면 현재 말랑이가 떨어진다.
 *    (±dropJitter px만큼 살짝 흔들려 떨어진다.) 떨어뜨린 뒤 dropCooldownMs 동안은 다음 말랑이를 떨어뜨릴 수 없다.
 *  - 떨어뜨리는 말랑이는 작은 단계(0~3)에서만 나온다 (SPAWN_WEIGHTS).
 *  - 같은 단계 두 말랑이가 닿으면 합쳐져 한 단계 큰 말랑이가 된다 (가운데 지점).
 *    가장 큰 단계끼리 합쳐지면 둘 다 사라지고 큰 보너스를 받는다.
 *  - 물리: 중력 → 원끼리 겹침 해소(반복 iterations회, 질량 = r²) → 벽/바닥 → 감쇠.
 *    프레임 dt를 substepMs 이하의 같은 크기 조각으로 나눠 계산한다.
 *  - 떨어진 지 graceMs가 지난 말랑이가 위험선(dangerY) 위로 튀어나온 채
 *    overflowMs(1.5초) 동안 이어지면 게임 오버. 120초가 지나도 종료.
 *
 * 점수
 *  - 단계 k(1~7)가 새로 만들어지면 MERGE_POINTS[k] = k(k+1)/2 → 1, 3, 6, 10, 15, 21, 28.
 *  - 가장 큰 단계끼리 합쳐 사라지면 topMergePoints(50).
 */

import type { RNG } from '../../lib/rng';

export const WORLD = { width: 300, height: 420 } as const;

/** 단계별 반지름 (월드 px). index = tier. */
export const TIER_RADII = [15, 20, 26, 33, 41, 50, 61, 74] as const;
export const TIER_COUNT = TIER_RADII.length;

/**
 * 단계별로 등장하는 말랑이 (data/characters.ts의 id). 작을수록 흔한 말랑이, 클수록 귀한 말랑이.
 * 시크릿 말랑이는 쓰지 않는다 (테스트로 확인).
 */
export const TIER_CHARACTER_IDS = [
  'peach-mochi',
  'soda-drop',
  'matcha-bean',
  'tangerine',
  'cherry-twin',
  'starry-night',
  'sunset-king',
  'galaxy-malang',
] as const;
export const MAX_TIER = TIER_COUNT - 1;

/** 떨어뜨리는 말랑이 단계별 가중치 (tier 0~3만). */
export const SPAWN_WEIGHTS = [34, 28, 22, 16] as const;

/** 단계 k가 만들어질 때 점수. index 0은 쓰지 않는다. */
export const MERGE_POINTS = TIER_RADII.map((_, k) => (k * (k + 1)) / 2);

export const MERGE_CONFIG = {
  durationMs: 120_000,
  /** 한 프레임 dt 상한 (탭 전환 후 순간이동 방지) */
  maxDtMs: 50,
  /** 물리 한 조각 최대 길이 */
  substepMs: 1000 / 180,
  iterations: 4,
  /** 월드 px/초² */
  gravity: 1500,
  /** 튕김 계수 (0 = 전혀 안 튐) */
  restitution: 0.18,
  /** 초당 속도 감쇠 비율 */
  linearDamping: 0.6,
  /** 접촉 한 번당 접선 속도 감쇠 (구르는 마찰) */
  contactFriction: 0.02,
  /** 들고 있는 말랑이 중심 y */
  dropY: 34,
  /** 위험선 y. 말랑이 윗변이 이 위로 올라오면 위험 */
  dangerY: 76,
  /** 떨어뜨리고 이 시간 동안은 위험 판정에서 뺀다 */
  graceMs: 1000,
  overflowMs: 1500,
  dropCooldownMs: 450,
  /** 떨어뜨릴 때 좌우로 더하는 무작위 흔들림 최대값 (월드 px) */
  dropJitter: 0.8,
  /** 합쳐질 때 새 말랑이가 살짝 튀어 오르는 속도 */
  mergePop: 90,
  /** land 이벤트를 내는 최소 충돌 속도 */
  landSpeed: 120,
  topMergePoints: 50,
} as const;

export type MergeConfig = { readonly [K in keyof typeof MERGE_CONFIG]: number };

export interface Body {
  id: number;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 생긴 뒤 지난 시간 (ms) */
  age: number;
  /** 처음으로 무언가에 닿았는지 */
  landed: boolean;
}

export interface MergeState {
  elapsedMs: number;
  bodies: Body[];
  nextId: number;
  /** 조준 중심 x */
  aimX: number;
  /** 지금 들고 있는 말랑이 단계 */
  current: number;
  /** 다음 말랑이 단계 (미리보기) */
  next: number;
  cooldownMs: number;
  score: number;
  merges: number;
  drops: number;
  /** 지금까지 만든 가장 큰 단계 */
  maxTier: number;
  /** 위험선을 넘은 채 이어진 시간 */
  dangerMs: number;
  finished: boolean;
  endReason: 'overflow' | 'time' | null;
}

export type MergeEvent =
  | { kind: 'merge'; id: number; tier: number; x: number; y: number; points: number }
  | { kind: 'vanish'; tier: number; x: number; y: number; points: number }
  | { kind: 'land'; id: number; tier: number; speed: number }
  | { kind: 'end'; reason: 'overflow' | 'time' };

export function radiusOf(tier: number): number {
  return TIER_RADII[Math.max(0, Math.min(MAX_TIER, tier))] ?? TIER_RADII[0];
}

/** 새로 떨어뜨릴 말랑이 단계 (작은 단계만) */
export function spawnTier(rng: RNG): number {
  const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.min(0.999999, Math.max(0, rng())) * total;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    roll -= SPAWN_WEIGHTS[i] ?? 0;
    if (roll < 0) return i;
  }
  return 0;
}

/** 단계 tier가 만들어질 때 점수 */
export function mergePoints(tier: number): number {
  return MERGE_POINTS[tier] ?? 0;
}

export function clampAim(x: number, tier: number): number {
  const r = radiusOf(tier);
  const safe = Number.isFinite(x) ? x : WORLD.width / 2;
  return Math.max(r, Math.min(WORLD.width - r, safe));
}

export function createMergeState(rng: RNG, config: MergeConfig = MERGE_CONFIG): MergeState {
  const current = spawnTier(rng);
  const next = spawnTier(rng);
  return {
    elapsedMs: 0,
    bodies: [],
    nextId: 1,
    aimX: WORLD.width / 2,
    current,
    next,
    cooldownMs: 0,
    score: 0,
    merges: 0,
    drops: 0,
    maxTier: 0,
    dangerMs: 0,
    finished: config.durationMs <= 0,
    endReason: config.durationMs <= 0 ? 'time' : null,
  };
}

export function setAim(state: MergeState, x: number): MergeState {
  if (state.finished) return state;
  const aimX = clampAim(x, state.current);
  return aimX === state.aimX ? state : { ...state, aimX };
}

export function canDrop(state: MergeState): boolean {
  return !state.finished && state.cooldownMs <= 0;
}

/** 들고 있는 말랑이를 aimX에 떨어뜨린다. 쿨다운 중이거나 끝났으면 그대로. */
export function drop(state: MergeState, rng: RNG, config: MergeConfig = MERGE_CONFIG): MergeState {
  if (!canDrop(state)) return state;
  const tier = state.current;
  // 아주 작은 흔들림: 같은 자리에 계속 떨어뜨려도 탑처럼 곧게 서지 않고 옆으로 흘러내린다
  const jitter = (rng() - 0.5) * 2 * config.dropJitter;
  const body: Body = {
    id: state.nextId,
    tier,
    x: clampAim(state.aimX + jitter, tier),
    y: config.dropY,
    vx: 0,
    vy: 0,
    age: 0,
    landed: false,
  };
  const current = state.next;
  return {
    ...state,
    bodies: [...state.bodies, body],
    nextId: state.nextId + 1,
    current,
    next: spawnTier(rng),
    aimX: clampAim(state.aimX, current),
    cooldownMs: config.dropCooldownMs,
    drops: state.drops + 1,
    maxTier: Math.max(state.maxTier, tier),
  };
}

// ── 물리 ────────────────────────────────────────────────────

/** 두 원의 겹침을 질량비로 나눠 밀어내고, 다가오는 속도를 튕김 계수로 반사한다. 겹쳤으면 true. */
export function separatePair(a: Body, b: Body, config: MergeConfig = MERGE_CONFIG): boolean {
  const ra = radiusOf(a.tier);
  const rb = radiusOf(b.tier);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ra + rb;
  if (dist >= minDist) return false;
  // 완전히 겹친 경우: 결정적으로 위아래로 분리
  const tooClose = dist < 1e-6;
  const nx = tooClose ? 0 : dx / dist;
  const ny = tooClose ? 1 : dy / dist;
  const ma = ra * ra;
  const mb = rb * rb;
  const inv = 1 / (ma + mb);
  const overlap = minDist - dist;
  // 위치 보정 (가벼운 쪽이 더 많이 밀린다)
  a.x -= nx * overlap * mb * inv;
  a.y -= ny * overlap * mb * inv;
  b.x += nx * overlap * ma * inv;
  b.y += ny * overlap * ma * inv;
  // 속도: 서로 다가오는 성분만 반사
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const j = (-(1 + config.restitution) * vn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx;
    a.vy -= (j / ma) * ny;
    b.vx += (j / mb) * nx;
    b.vy += (j / mb) * ny;
  }
  // 접선 마찰
  const tx = -ny;
  const ty = nx;
  const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  const f = vt * config.contactFriction * 0.5;
  a.vx += f * tx;
  a.vy += f * ty;
  b.vx -= f * tx;
  b.vy -= f * ty;
  return true;
}

/** 벽과 바닥. 닿았으면 부딪힌 속도(양수)를, 아니면 0을 돌려준다. */
export function constrainToJar(b: Body, config: MergeConfig = MERGE_CONFIG): number {
  const r = radiusOf(b.tier);
  let impact = 0;
  if (b.x < r) {
    b.x = r;
    if (b.vx < 0) {
      impact = Math.max(impact, -b.vx);
      b.vx = -b.vx * config.restitution;
    }
  } else if (b.x > WORLD.width - r) {
    b.x = WORLD.width - r;
    if (b.vx > 0) {
      impact = Math.max(impact, b.vx);
      b.vx = -b.vx * config.restitution;
    }
  }
  if (b.y > WORLD.height - r) {
    b.y = WORLD.height - r;
    if (b.vy > 0) {
      impact = Math.max(impact, b.vy);
      b.vy = -b.vy * config.restitution;
      // 바닥 구름 마찰
      b.vx *= 1 - config.contactFriction;
    }
  }
  return impact;
}

function touching(a: Body, b: Body): boolean {
  const d = radiusOf(a.tier) + radiusOf(b.tier);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy <= d * d;
}

/** 물리 한 조각 (h: ms). bodies는 이미 복사본이라 직접 바꾼다. */
function substep(
  bodies: Body[],
  h: number,
  nextIdRef: { value: number },
  events: MergeEvent[],
  config: MergeConfig,
): { bodies: Body[]; score: number; merges: number; maxTier: number } {
  const s = h / 1000;
  let score = 0;
  let merges = 0;
  let maxTier = 0;
  const damp = Math.max(0, 1 - config.linearDamping * s);

  for (const b of bodies) {
    b.vy += config.gravity * s;
    b.vx *= damp;
    b.vy *= damp;
    b.x += b.vx * s;
    b.y += b.vy * s;
    b.age += h;
  }

  const consumed = new Set<number>();
  const born: Body[] = [];

  for (let iter = 0; iter < config.iterations; iter++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a || consumed.has(a.id)) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b || consumed.has(b.id) || consumed.has(a.id)) continue;
        if (a.tier === b.tier && touching(a, b)) {
          consumed.add(a.id);
          consumed.add(b.id);
          merges++;
          const x = (a.x + b.x) / 2;
          const y = (a.y + b.y) / 2;
          if (a.tier >= MAX_TIER) {
            const points = config.topMergePoints;
            score += points;
            events.push({ kind: 'vanish', tier: a.tier, x, y, points });
          } else {
            const tier = a.tier + 1;
            const points = mergePoints(tier);
            score += points;
            maxTier = Math.max(maxTier, tier);
            const id = nextIdRef.value++;
            born.push({
              id,
              tier,
              x,
              y,
              vx: (a.vx + b.vx) / 2,
              vy: Math.min((a.vy + b.vy) / 2, 0) - config.mergePop,
              age: config.graceMs * 0.5,
              landed: true,
            });
            events.push({ kind: 'merge', id, tier, x, y, points });
          }
          break;
        }
        const vBefore = Math.hypot(b.vx - a.vx, b.vy - a.vy);
        if (separatePair(a, b, config)) {
          for (const body of [a, b]) {
            if (!body.landed) {
              body.landed = true;
              if (vBefore >= config.landSpeed) events.push({ kind: 'land', id: body.id, tier: body.tier, speed: vBefore });
            }
          }
        }
      }
    }
    for (const b of bodies) {
      if (consumed.has(b.id)) continue;
      const impact = constrainToJar(b, config);
      if (impact > 0 && !b.landed) {
        b.landed = true;
        if (impact >= config.landSpeed) events.push({ kind: 'land', id: b.id, tier: b.tier, speed: impact });
      }
    }
  }

  const alive = consumed.size > 0 ? bodies.filter((b) => !consumed.has(b.id)) : bodies;
  for (const b of born) constrainToJar(b, config);
  return { bodies: born.length > 0 ? [...alive, ...born] : alive, score, merges, maxTier };
}

/** 위험선 위로 튀어나온 (유예 시간이 지난) 말랑이가 있는지 */
export function isOverDanger(bodies: readonly Body[], config: MergeConfig = MERGE_CONFIG): boolean {
  return bodies.some((b) => b.age >= config.graceMs && b.y - radiusOf(b.tier) < config.dangerY);
}

/** dt(ms)만큼 진행. 입력 상태는 바꾸지 않는다. */
export function step(
  prev: MergeState,
  dtMs: number,
  config: MergeConfig = MERGE_CONFIG,
): { state: MergeState; events: MergeEvent[] } {
  const events: MergeEvent[] = [];
  if (prev.finished) return { state: prev, events };
  const dt = Math.max(0, Math.min(Number.isFinite(dtMs) ? dtMs : 0, config.maxDtMs));
  if (dt === 0) return { state: prev, events };

  let bodies = prev.bodies.map((b) => ({ ...b }));
  const nextIdRef = { value: prev.nextId };
  let score = prev.score;
  let merges = prev.merges;
  let maxTier = prev.maxTier;
  const n = Math.max(1, Math.ceil(dt / config.substepMs));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const out = substep(bodies, h, nextIdRef, events, config);
    bodies = out.bodies;
    score += out.score;
    merges += out.merges;
    maxTier = Math.max(maxTier, out.maxTier);
  }

  const elapsedMs = Math.min(config.durationMs, prev.elapsedMs + dt);
  const dangerMs = isOverDanger(bodies, config) ? prev.dangerMs + dt : 0;
  let finished = false;
  let endReason: MergeState['endReason'] = null;
  if (dangerMs >= config.overflowMs) {
    finished = true;
    endReason = 'overflow';
  } else if (elapsedMs >= config.durationMs) {
    finished = true;
    endReason = 'time';
  }
  if (endReason) events.push({ kind: 'end', reason: endReason });

  return {
    state: {
      ...prev,
      elapsedMs,
      bodies,
      nextId: nextIdRef.value,
      cooldownMs: Math.max(0, prev.cooldownMs - dt),
      score,
      merges,
      maxTier,
      dangerMs,
      finished,
      endReason,
    },
    events,
  };
}
