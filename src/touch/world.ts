/**
 * 놀이방 매트 위 말랑이 여럿이 함께 사는 물리 세계 (순수 모듈, React/DOM/three 의존 없음. dt·RNG 주입).
 *
 * 두 층 중 "몸 전체의 위치" 층이다. 몸 안쪽의 출렁임(눌림·당김·기울기)은 말랑이마다 physics.ts·softbody.ts 가
 * 따로 맡고, 이 세계는 착지·부딪힘 사건(WorldEvent)과 맞닿아 눌린 정도(squeeze)를 그쪽에 넘겨 준다.
 *
 * 좌표 (세계 단위 1 = 말랑이 그림 상자 한 변, 화면 크기와 무관):
 *  - x: 매트 가로 (오른쪽 +)
 *  - y: 매트 깊이 (화면 아래 = 보는 사람 쪽 +). 화면에는 위에서 비스듬히 내려다본 3/4 시점으로 그린다.
 *  - z: 매트 위 높이 (위 +). 매트 = 0.
 * 몸은 반지름 r 인 말랑한 공이다 (가운데 = 바닥 위 z + r). 서로 파고들면 스프링으로 밀어내고(부드러운 충돌),
 * 접촉면에는 쿨롱 마찰이 있어 가운데쯤 올려 둔 말랑이는 위에 얹힌 채로 쉬고, 많이 비껴 두면 기대다 미끄러진다.
 *
 * 상태는 성능을 위해 제자리에서 바꾼다(stepWorld 등이 world 를 고친다). 같은 입력·dt 면 결과가 같다.
 */
import type { RNG } from '../lib/rng';

/** 몸 재질 — 2단계(말랑이마다 다른 재질)에서 캐릭터별 값을 넣는 자리 */
export interface BodyMaterial {
  /** 바닥에 떨어질 때 튀어 오르는 비율 (0..1) */
  bounce: number;
  /** 벽에 부딪힐 때 튕기는 비율 */
  wallBounce: number;
  /** 매트 위 미끄럼 마찰 계수 */
  friction: number;
  /** 몸끼리 마찰 계수 (클수록 잘 얹힌다) */
  grip: number;
  /** 몸끼리 밀어내는 강성 배수 (작을수록 더 푹 파고든다 = 더 말랑) */
  stiffness: number;
  /** 질량 배수 */
  mass: number;
}

export const JELLY_MATERIAL: Readonly<BodyMaterial> = {
  bounce: 0.32,
  wallBounce: 0.55,
  friction: 0.3,
  grip: 0.9,
  stiffness: 1,
  mass: 1,
};

export interface WorldBody {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 몸 반지름 (세계 단위, 매트 방향) */
  r: number;
  /** 몸 높이 (세계 단위). 말랑이는 보통 폭보다 낮다 → 몸끼리 위아래로는 이 높이로 닿는다 */
  h: number;
  material: BodyMaterial;
  /** 손가락이 들고 옮기는 중 (스프링으로 목표를 따라간다, 중력 없음) */
  held: boolean;
  holdX: number;
  holdY: number;
  holdZ: number;
  /** 매트나 다른 말랑이 위에 받쳐져 있다 (지난 스텝 기준) */
  supported: boolean;
  /**
   * 맞닿아 눌린 정도 (r 대비, 밀려나는 방향). x·y 는 매트 방향, z 는 위에서 눌림(−) / 아래에서 받침(+).
   * 그리는 쪽이 이 방향으로 몸을 살짝 납작하게 만든다.
   */
  squeezeX: number;
  squeezeY: number;
  squeezeZ: number;
}

export interface WorldBounds {
  /** 매트 가로 (세계 단위) */
  w: number;
  /** 매트 깊이 */
  d: number;
}

export interface World {
  bounds: WorldBounds;
  bodies: WorldBody[];
  /** 지금 이 기기에서 올릴 수 있는 최대 수 */
  cap: number;
  reducedMotion: boolean;
  /** 지난 스텝에 맞닿아 있던 쌍 ("a|b") — 새로 부딪힌 순간만 소리를 낸다 */
  contacts: Set<string>;
  /** 계속 붙어 있으면 마지막으로 소리 낸 시각 대신 누적 시간 (ms) */
  timeMs: number;
}

export type WorldEvent =
  | { kind: 'land'; id: string; speed: number }
  | { kind: 'bump'; a: string; b: string; speed: number; nx: number; ny: number }
  | { kind: 'wall'; id: string; speed: number; nx: number; ny: number };

export const WORLD_TUNING = {
  /** 중력 (세계 단위/s²) — 실제보다 약간 느긋하게 떨어져 말랑이가 보인다 */
  gravity: 38,
  subStep: 1 / 240,
  maxDtMs: 50,
  /** 몸끼리 밀어내는 스프링 (단위 질량당) — 위에 얹히면 r 의 약 10% 파고든다 */
  contactK: 1300,
  contactZeta: 0.55,
  /** 들고 있을 때 손가락을 따라가는 스프링 */
  holdK: 420,
  holdZeta: 0.95,
  /** 들고 있는 말랑이는 부딪힐 때 이만큼 무겁게 친다 (남을 밀고 간다) */
  heldMassScale: 3,
  /** 들어 올리는 높이 (세계 단위) */
  liftZ: 0.22,
  /** 들고 옮기는 말랑이가 다른 말랑이에 이만큼(반지름 합 대비) 다가가면 그 위로 올라탄다 */
  climbReach: 1.25,
  /** 이보다 느리게 옮길 때만 올라탄다 (빠르면 밀어낸다) */
  climbSpeed: 2.2,
  /** 이 속도 미만의 착지는 튀지 않는다 (미세 떨림 방지) */
  restSpeed: 0.9,
  /** 착지 소리를 내는 최소 속도 */
  landEventSpeed: 1.2,
  bumpEventSpeed: 0.7,
  wallEventSpeed: 1,
  /** 던지기 최대 속도 */
  maxThrow: 11,
  /** 던질 때 살짝 띄우는 양 (속도 대비) */
  tossLift: 0.22,
  maxSpeed: 30,
  /** 움직임 줄이기: 튀어 오름을 이만큼 줄인다 */
  reducedBounce: 0.25,
  /** 이 속도 아래면 쉬는 것으로 본다 */
  settleSpeed: 0.03,
  /** 기본 상한 (저장 상한과 같다) */
  maxBodies: 5,
} as const;

// ── 만들기 ─────────────────────────────────────────────────

export function createWorld(bounds: WorldBounds, options: { cap?: number; reducedMotion?: boolean } = {}): World {
  return {
    bounds: sanitizeBounds(bounds),
    bodies: [],
    cap: clampCap(options.cap ?? WORLD_TUNING.maxBodies),
    reducedMotion: options.reducedMotion ?? false,
    contacts: new Set(),
    timeMs: 0,
  };
}

function clampCap(cap: number): number {
  return Number.isFinite(cap) ? Math.max(1, Math.min(WORLD_TUNING.maxBodies, Math.floor(cap))) : WORLD_TUNING.maxBodies;
}

function sanitizeBounds(b: WorldBounds): WorldBounds {
  const w = Number.isFinite(b.w) ? Math.max(0.5, b.w) : 3;
  const d = Number.isFinite(b.d) ? Math.max(0.5, b.d) : 3;
  return { w, d };
}

export function setWorldCap(world: World, cap: number): void {
  world.cap = clampCap(cap);
}

export function setWorldReducedMotion(world: World, reduced: boolean): void {
  world.reducedMotion = reduced;
}

/** 매트 크기가 바뀌면(화면 회전) 몸을 안쪽으로 옮긴다 */
export function resizeWorld(world: World, bounds: WorldBounds): void {
  world.bounds = sanitizeBounds(bounds);
  for (const b of world.bodies) confine(b, world.bounds);
}

export function getBody(world: World, id: string): WorldBody | undefined {
  return world.bodies.find((b) => b.id === id);
}

export interface NewBody {
  id: string;
  x: number;
  y: number;
  /** 떨어뜨릴 높이 (기본 0 = 매트 위) */
  z?: number;
  r: number;
  /** 몸 높이 (기본 2r) */
  h?: number;
  material?: Partial<BodyMaterial>;
}

/** 몸을 올린다. 상한이 찼거나 같은 id 가 있으면 false */
export function addBody(world: World, nb: NewBody): boolean {
  if (world.bodies.length >= world.cap) return false;
  if (world.bodies.some((b) => b.id === nb.id)) return false;
  const r = Number.isFinite(nb.r) && nb.r > 0 ? nb.r : 0.3;
  const body: WorldBody = {
    id: nb.id,
    x: finite(nb.x, world.bounds.w / 2),
    y: finite(nb.y, world.bounds.d / 2),
    z: Math.max(0, finite(nb.z ?? 0, 0)),
    vx: 0,
    vy: 0,
    vz: 0,
    r,
    h: nb.h !== undefined && Number.isFinite(nb.h) && nb.h > 0 ? nb.h : 2 * r,
    material: { ...JELLY_MATERIAL, ...nb.material },
    held: false,
    holdX: 0,
    holdY: 0,
    holdZ: 0,
    supported: false,
    squeezeX: 0,
    squeezeY: 0,
    squeezeZ: 0,
  };
  confine(body, world.bounds);
  world.bodies.push(body);
  return true;
}

export function removeBody(world: World, id: string): boolean {
  const i = world.bodies.findIndex((b) => b.id === id);
  if (i < 0) return false;
  world.bodies.splice(i, 1);
  for (const key of [...world.contacts]) if (key.split('|').includes(id)) world.contacts.delete(key);
  return true;
}

/**
 * 새 말랑이를 떨어뜨릴 자리: 매트 안에서 다른 말랑이들과 가장 먼 후보를 고른다 (RNG 주입).
 */
export function findDropSpot(world: World, r: number, rng: RNG, tries = 24): { x: number; y: number } {
  const { w, d } = world.bounds;
  const lo = (n: number) => Math.min(n / 2, r);
  let best = { x: w / 2, y: d * 0.55 };
  let bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const x = lo(w) + rng() * Math.max(0, w - 2 * lo(w));
    const y = lo(d) + rng() * Math.max(0, d - 2 * lo(d));
    let nearest = Infinity;
    for (const b of world.bodies) nearest = Math.min(nearest, Math.hypot(b.x - x, b.y - y) - b.r - r);
    // 가운데 쪽을 조금 더 좋아한다 (가장자리에 붙지 않게)
    const center = -0.15 * Math.hypot(x - w / 2, (y - d * 0.55) * 0.8);
    const score = (world.bodies.length === 0 ? 0 : Math.min(nearest, 3)) + center;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

// ── 손가락 ─────────────────────────────────────────────────

/** 들어 올려 옮기기 시작 */
export function grabBody(world: World, id: string): void {
  const b = getBody(world, id);
  if (!b) return;
  b.held = true;
  b.holdX = b.x;
  b.holdY = b.y;
  b.holdZ = Math.max(b.z, WORLD_TUNING.liftZ);
}

/** 들고 있는 동안 목표 위치 (매트 좌표) */
export function moveHeld(world: World, id: string, x: number, y: number): void {
  const b = getBody(world, id);
  if (!b || !b.held) return;
  b.holdX = finite(x, b.holdX);
  b.holdY = finite(y, b.holdY);
}

/**
 * 놓기. 손가락 속도(세계 단위/s)를 그대로 던지는 속도로 — 빠를수록 살짝 떠올라 날아간다.
 */
export function releaseBody(world: World, id: string, vx = 0, vy = 0): void {
  const b = getBody(world, id);
  if (!b) return;
  b.held = false;
  const sx = finite(vx, 0);
  const sy = finite(vy, 0);
  const speed = Math.hypot(sx, sy);
  const k = speed > WORLD_TUNING.maxThrow ? WORLD_TUNING.maxThrow / speed : 1;
  b.vx = sx * k;
  b.vy = sy * k;
  b.vz = Math.max(b.vz, Math.min(3.2, speed * k * WORLD_TUNING.tossLift));
}

/** 키보드 화살표·옆 말랑이의 툭: 그 방향으로 살짝 밀고 톡 띄운다. dir 은 (−1..1) */
export function nudgeBody(world: World, id: string, dirX: number, dirY: number, strength = 1): void {
  const b = getBody(world, id);
  if (!b || b.held) return;
  const s = Math.max(0, Math.min(1.5, finite(strength, 1)));
  b.vx += finite(dirX, 0) * 2.6 * s;
  b.vy += finite(dirY, 0) * 2.6 * s;
  b.vz = Math.max(b.vz, 1.6 * s);
}

/** 제자리에서 폴짝 (캡슐에서 튀어나올 때) */
export function popBody(world: World, id: string, vz: number): void {
  const b = getBody(world, id);
  if (!b) return;
  b.vz = Math.max(b.vz, finite(vz, 0));
}

// ── 적분 ──────────────────────────────────────────────────

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

function effMass(b: WorldBody): number {
  return b.material.mass * (b.held ? WORLD_TUNING.heldMassScale : 1);
}

function confine(b: WorldBody, bounds: WorldBounds): { nx: number; ny: number; speed: number } | null {
  let hit: { nx: number; ny: number; speed: number } | null = null;
  const minX = Math.min(b.r, bounds.w / 2);
  const maxX = Math.max(bounds.w - b.r, bounds.w / 2);
  const minY = Math.min(b.r, bounds.d / 2);
  const maxY = Math.max(bounds.d - b.r, bounds.d / 2);
  const e = b.material.wallBounce;
  if (b.x < minX) {
    b.x = minX;
    if (b.vx < 0) {
      hit = { nx: 1, ny: 0, speed: -b.vx };
      b.vx = -b.vx * e;
    }
  } else if (b.x > maxX) {
    b.x = maxX;
    if (b.vx > 0) {
      hit = { nx: -1, ny: 0, speed: b.vx };
      b.vx = -b.vx * e;
    }
  }
  if (b.y < minY) {
    b.y = minY;
    if (b.vy < 0) {
      hit = { nx: 0, ny: 1, speed: Math.max(hit?.speed ?? 0, -b.vy) };
      b.vy = -b.vy * e;
    }
  } else if (b.y > maxY) {
    b.y = maxY;
    if (b.vy > 0) {
      hit = { nx: 0, ny: -1, speed: Math.max(hit?.speed ?? 0, b.vy) };
      b.vy = -b.vy * e;
    }
  }
  return hit;
}

/** 매트에 닿아 있는 몸의 접선 방향 유효 질량 배수 */
const GROUND_ANCHOR = 40;

function pairKey(a: WorldBody, b: WorldBody): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

function subStep(world: World, h: number, events: WorldEvent[], touching: Set<string>, reported: Set<string>): void {
  const T = WORLD_TUNING;
  const bodies = world.bodies;
  const n = bodies.length;
  const bounceScale = world.reducedMotion ? T.reducedBounce : 1;

  // 1) 외력: 중력 / 들고 있는 스프링
  for (const b of bodies) {
    b.squeezeX = 0;
    b.squeezeY = 0;
    b.squeezeZ = 0;
    if (b.held) {
      const c = 2 * T.holdZeta * Math.sqrt(T.holdK);
      // 다른 말랑이 위로 옮기면 그 위에 올라탈 만큼 들어 올린다 → 놓으면 쌓인다
      let targetZ = b.holdZ;
      // 천천히 가져가면 올라타고, 빠르게 밀면 밀어낸다
      const climbing = Math.hypot(b.vx, b.vy) < T.climbSpeed;
      for (const o of bodies) {
        if (!climbing) break;
        if (o === b || o.held) continue;
        const d = Math.hypot(b.x - o.x, b.y - o.y);
        const rr = b.r + o.r;
        if (d < rr * T.climbReach) {
          // 가까워질수록 미리 올라가 옆으로 밀지 않고 넘어간다 (위아래는 높이 비율로 줄여 잰다)
          const zs = rr / ((b.h + o.h) / 2);
          const up = Math.sqrt(Math.max(0, rr * rr - d * d * 0.6)) / zs;
          targetZ = Math.max(targetZ, o.z + o.h / 2 + up - b.h / 2 + 0.03);
        }
      }
      b.vx += (T.holdK * (b.holdX - b.x) - c * b.vx) * h;
      b.vy += (T.holdK * (b.holdY - b.y) - c * b.vy) * h;
      b.vz += (T.holdK * (targetZ - b.z) - c * b.vz) * h;
    } else {
      b.vz -= T.gravity * h;
      // 매트에 닿아 있으면 매트가 곧바로 받친다 (몸끼리 계산 전에 — 그래야 아래 말랑이의 "떨어지려는 속도"가
      // 위 말랑이에게 마찰로 새어 들어가 미끄러지지 않는다)
      if (b.z <= 1e-6 && b.vz < 0) b.vz = 0;
    }
  }

  // 2) 몸끼리: 부드러운 밀어내기 + 쿨롱 마찰 (충격량으로)
  const supported = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const rr = a.r + b.r;
      // 위아래는 두 몸 높이의 평균이 반지름 합이 되도록 늘려 잰다 (납작한 말랑이끼리 딱 붙어 쌓이게)
      const dz = (a.z + a.h / 2 - (b.z + b.h / 2)) * (rr / ((a.h + b.h) / 2));
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) continue;
      const dist = Math.sqrt(d2);
      // 완전히 겹치면 옆으로 민다
      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      const nz = dist > 1e-6 ? dz / dist : 0;
      const overlap = rr - dist;
      const ma = effMass(a);
      const mb = effMass(b);
      const mEff = (ma * mb) / (ma + mb);
      const k = T.contactK * Math.sqrt(a.material.stiffness * b.material.stiffness);
      const c = 2 * T.contactZeta * Math.sqrt(k);
      // 상대 속도 (a 기준)
      const rvx = a.vx - b.vx;
      const rvy = a.vy - b.vy;
      const rvz = a.vz - b.vz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      // 단위 질량당 k 를 두 몸의 유효 질량에 곱해 힘으로 (밀어내기만, 끌어당기지 않는다)
      const fn = Math.max(0, (k * overlap - c * vn) * mEff * 2);
      const jn = fn * h;
      a.vx += (jn * nx) / ma;
      a.vy += (jn * ny) / ma;
      a.vz += (jn * nz) / ma;
      b.vx -= (jn * nx) / mb;
      b.vy -= (jn * ny) / mb;
      b.vz -= (jn * nz) / mb;
      // 마찰: 접선 상대 속도를 최대 μ·jn 만큼 없앤다
      const tvx = rvx - vn * nx;
      const tvy = rvy - vn * ny;
      const tvz = rvz - vn * nz;
      const vt = Math.hypot(tvx, tvy, tvz);
      if (vt > 1e-6) {
        const mu = Math.sqrt(a.material.grip * b.material.grip);
        // 매트에 붙어 있는 쪽은 매트 마찰이 함께 버텨 준다 → 접선 방향으로는 훨씬 무겁게 본다.
        // (그러지 않으면 위에 얹힌 말랑이가 아래 말랑이를 조금씩 밀며 천천히 미끄러진다)
        const ta = a.z <= 1e-6 && !a.held ? ma * GROUND_ANCHOR : ma;
        const tb = b.z <= 1e-6 && !b.held ? mb * GROUND_ANCHOR : mb;
        const jt = Math.min(mu * jn, (vt * ta * tb) / (ta + tb));
        a.vx -= (jt * tvx) / vt / ta;
        a.vy -= (jt * tvy) / vt / ta;
        a.vz -= (jt * tvz) / vt / ta;
        b.vx += (jt * tvx) / vt / tb;
        b.vy += (jt * tvy) / vt / tb;
        b.vz += (jt * tvz) / vt / tb;
      }
      const sq = overlap / rr;
      a.squeezeX += nx * sq;
      a.squeezeY += ny * sq;
      a.squeezeZ += nz * sq;
      b.squeezeX -= nx * sq;
      b.squeezeY -= ny * sq;
      b.squeezeZ -= nz * sq;
      // 위쪽에서 받쳐 준다
      if (nz > 0.45) supported[i] = true;
      if (nz < -0.45) supported[j] = true;
      const key = pairKey(a, b);
      touching.add(key);
      if (!world.contacts.has(key) && !reported.has(key) && -vn > T.bumpEventSpeed) {
        reported.add(key);
        events.push({ kind: 'bump', a: a.id, b: b.id, speed: -vn, nx, ny });
      }
    }
  }

  // 3) 움직이기 + 매트·벽
  for (let i = 0; i < n; i++) {
    const b = bodies[i]!;
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp > T.maxSpeed) {
      const k = T.maxSpeed / sp;
      b.vx *= k;
      b.vy *= k;
      b.vz *= k;
    }
    // 매트 마찰 (들고 있을 때는 손이 받친다). 움직이기 전에 걸어야 작은 밀림이 쌓여 기어가지 않는다
    if (b.z <= 1e-6 && !b.held) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) {
        const dv = b.material.friction * T.gravity * h;
        const k = v > dv ? (v - dv) / v : 0;
        b.vx *= k;
        b.vy *= k;
      }
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    let onGround = false;
    if (b.z <= 0) {
      b.z = 0;
      onGround = true;
      if (b.vz < 0) {
        const impact = -b.vz;
        if (!b.held && impact > T.landEventSpeed) events.push({ kind: 'land', id: b.id, speed: impact });
        b.vz = impact > T.restSpeed && !b.held ? impact * b.material.bounce * bounceScale : 0;
      }
    }
    b.supported = onGround || supported[i]!;
    const wall = confine(b, world.bounds);
    if (wall && wall.speed > T.wallEventSpeed) events.push({ kind: 'wall', id: b.id, ...wall });
  }
}

/**
 * dtMs 만큼 진행하고 이번에 생긴 사건(착지·부딪힘·벽)을 돌려준다.
 * dt 는 [0, maxDtMs] 로 제한 (탭 전환 뒤 큰 dt 에도 폭주하지 않는다).
 */
export function stepWorld(world: World, dtMs: number): WorldEvent[] {
  const ms = Number.isFinite(dtMs) ? Math.max(0, Math.min(WORLD_TUNING.maxDtMs, dtMs)) : 0;
  const events: WorldEvent[] = [];
  if (ms === 0) return events;
  let remaining = ms / 1000;
  const touching = new Set<string>();
  const reported = new Set<string>();
  while (remaining > 1e-9) {
    const h = Math.min(WORLD_TUNING.subStep, remaining);
    touching.clear();
    subStep(world, h, events, touching, reported);
    remaining -= h;
  }
  world.contacts = new Set(touching);
  world.timeMs += ms;
  return events;
}

// ── 상태 읽기 ──────────────────────────────────────────────

/** 몸 하나가 멈췄는가 (들고 있지 않고, 받쳐져 있고, 거의 안 움직임) */
export function isBodyAtRest(b: WorldBody): boolean {
  const s = WORLD_TUNING.settleSpeed;
  return !b.held && b.supported && Math.abs(b.vx) < s && Math.abs(b.vy) < s && Math.abs(b.vz) < s * 4;
}

/** 세계 전체가 멈췄는가 → 그리기를 쉬어도 된다 */
export function isWorldAtRest(world: World): boolean {
  return world.bodies.every(isBodyAtRest);
}

/** 멈추기 직전 남은 아주 작은 속도를 없앤다 */
export function settleWorld(world: World): void {
  for (const b of world.bodies) {
    if (b.held) continue;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
  }
}

/** 운동 에너지 + 위치 에너지 (단위 질량) — 테스트·디버그용 */
export function worldEnergy(world: World): number {
  let e = 0;
  for (const b of world.bodies) {
    const m = b.material.mass;
    e += 0.5 * m * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) + m * WORLD_TUNING.gravity * b.z;
  }
  return e;
}

/** 맞닿아 눌린 양 0..1 (그리기용) */
export function squeezeAmount(b: WorldBody): number {
  return Math.min(1, Math.hypot(b.squeezeX, b.squeezeY, b.squeezeZ));
}
