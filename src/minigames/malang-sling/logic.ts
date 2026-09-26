/**
 * 말랑 새총 — 순수 시뮬레이션 (Canvas/DOM 무관, dt·RNG 주입).
 *
 * 좌표계: 논리 월드 WORLD.width × WORLD.height, y는 아래로 증가. 몸체(블록·심술 사탕) 좌표는 중심.
 *
 * 규칙
 *  - 새총 고무줄을 당긴 벡터(drag)의 반대 방향으로 파트너 말랑이를 쏜다. 당긴 길이가 maxPull을
 *    넘으면 잘라내고, 발사 속도 = (당긴 길이 / maxPull) × maxLaunchSpeed. minPull 미만이면 취소.
 *  - 말랑이는 중력을 받는 원. 바닥·블록에 부딪히면 튕기고, 충돌 세기만큼 몸체에 피해와 옆 방향 충격을 준다.
 *  - 블록·심술 사탕은 회전하지 않는 직사각형(AABB). 깨어 있는 몸체만 움직이고, 멈추면 잠든다.
 *    받침이 사라지거나 무게 중심이 받침 밖으로 나가면 깨어나 미끄러져 떨어진다(간이 넘어짐).
 *    떨어지거나 깔린 충격도 피해가 된다. 화면 밖으로 떨어진 심술 사탕은 터진 것으로 친다.
 *  - 스테이지마다 발사 3번. 심술 사탕을 모두 터뜨리면 클리어(남은 발사 보너스), 3번 다 쓰면 다음 스테이지.
 *  - 스테이지 stageCount개를 모두 거치거나 durationMs(120초)가 지나면 끝.
 *
 * 점수
 *  - 심술 사탕 50점, 한 발에 여러 개 터뜨리면 두 번째부터 +20점씩.
 *  - 젤리 블록 10점, 초코 블록 15점.
 *  - 스테이지 클리어 40점 + 남은 발사 1번당 40점.
 */
import { randomRange, shuffle, type RNG } from '../../lib/rng';

export const WORLD = { width: 320, height: 480 } as const;
/** 바닥 윗면 y */
export const GROUND_Y = 416;
/** 새총 고무줄 중심(말랑이가 놓이는 곳) */
export const SLING = { x: 84, y: 330 } as const;

export const SLING_CONFIG = {
  durationMs: 120_000,
  stageCount: 4,
  shotsPerStage: 3,
  /** 한 프레임 dt 상한 */
  maxDtMs: 50,
  /** 물리 고정 간격 (ms) */
  substepMs: 1000 / 120,

  gravity: 900,
  projectileRadius: 18,
  maxPull: 72,
  minPull: 14,
  maxLaunchSpeed: 640,
  /** 조준선: 물리 간격 previewDotEvery번마다 점 하나, previewDots개 (= 앞부분 0.3초만) */
  previewDotEvery: 4,
  previewDots: 9,

  groundRestitution: 0.42,
  /** 바닥에 튕길 때 가로 속도 유지 비율 */
  groundBounceFriction: 0.8,
  /** 바닥에서 구를 때 감속 (px/s²) */
  rollDecel: 260,
  bodyRestitution: 0.3,
  bodyTangentKeep: 0.85,
  /** 부순 몸체를 뚫고 지나갈 때 속도 유지 비율 */
  pierceKeep: 0.65,
  /** 부딪힌 몸체에 전달하는 가로 충격 비율 */
  kick: 0.7,
  /** 이 충돌 속도 이하는 피해 없음 */
  hitDamageFloor: 90,
  hitDamageScale: 0.4,
  /** 떨어짐·깔림·옆 충돌 피해 */
  impactDamageFloor: 200,
  impactDamageScale: 0.35,

  /** 받침 위 몸체의 마찰 감속 (px/s²) */
  bodyFrictionDecel: 500,
  /** 무게 중심이 받침 밖이면 이 가속으로 미끄러져 떨어진다 */
  tipAccel: 600,
  sleepSpeed: 8,
  sleepAfterMs: 150,
  /** 옆으로 이 속도 이상 밀어야 잠든 몸체가 깨어난다 */
  wakeSpeed: 30,

  /** 발사 후 이 시간이 지나면 말랑이 비행 종료 */
  flightTimeoutMs: 6000,
  /** 말랑이가 이 속도 이하로 이만큼 머무르면 비행 종료 */
  restSpeed: 30,
  restMs: 400,
  /** 발사가 끝난 뒤 몸체가 멈추길 기다리는 최대 시간 */
  settleMaxMs: 1800,
  /** 스테이지 클리어/실패 안내 시간 */
  interludeMs: 1300,

  hp: { jelly: 45, choco: 160, enemy: 30 },
  points: { enemy: 50, multiPop: 20, jelly: 10, choco: 15, stageClear: 40, leftoverShot: 40 },
} as const;

const C = SLING_CONFIG;

export type BodyKind = 'jelly' | 'choco' | 'enemy' | 'shelf';

export interface Body {
  id: number;
  kind: BodyKind;
  /** 중심 좌표 */
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  awake: boolean;
  /** 멈춘 채로 지난 시간 (잠들기 판정) */
  restMs: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  flightMs: number;
  restMs: number;
}

export type SlingPhase = 'aim' | 'flying' | 'settling' | 'clear' | 'fail' | 'done';

export interface SlingState {
  elapsedMs: number;
  accMs: number;
  phase: SlingPhase;
  /** 현재 phase가 시작된 뒤 지난 시간 */
  phaseMs: number;
  stageIndex: number;
  stages: Body[][];
  bodies: Body[];
  projectile: Projectile | null;
  shotsLeft: number;
  /** 이번 발사로 터뜨린 심술 사탕 수 (연속 보너스) */
  shotPops: number;
  score: number;
  pops: number;
  blocksBroken: number;
  stagesCleared: number;
  shotsFired: number;
  finished: boolean;
  endReason: 'complete' | 'time' | null;
}

export type SlingEvent =
  | { type: 'launch'; power: number }
  | { type: 'impact'; x: number; y: number; nx: number; ny: number; strength: number; target: 'ground' | BodyKind }
  | { type: 'break'; kind: 'jelly' | 'choco'; x: number; y: number; points: number }
  | { type: 'pop'; x: number; y: number; points: number; combo: number }
  | { type: 'shotEnd' }
  | { type: 'stageClear'; bonus: number; leftover: number }
  | { type: 'stageFail' }
  | { type: 'nextStage'; stageIndex: number }
  | { type: 'finish'; reason: 'complete' | 'time' };

// ── 조준 ────────────────────────────────────────────────────

export interface Vec {
  x: number;
  y: number;
}

/** 당긴 벡터를 maxPull 이내로 자른다. */
export function clampPull(dx: number, dy: number): Vec {
  const len = Math.hypot(dx, dy);
  if (len <= C.maxPull || len === 0) return { x: dx, y: dy };
  const k = C.maxPull / len;
  return { x: dx * k, y: dy * k };
}

/** 당긴 벡터 → 발사 속도. 너무 짧게 당기면 null (발사 취소). */
export function launchVelocity(dx: number, dy: number): Vec | null {
  const p = clampPull(dx, dy);
  const len = Math.hypot(p.x, p.y);
  if (len < C.minPull) return null;
  const speed = (len / C.maxPull) * C.maxLaunchSpeed;
  return { x: (-p.x / len) * speed, y: (-p.y / len) * speed };
}

/** 각도(도, 위쪽이 +)·힘(0~1) → 당긴 벡터. 키보드 조준용. */
export function pullFromAngle(angleDeg: number, power: number): Vec {
  const a = (angleDeg * Math.PI) / 180;
  const len = Math.max(0, Math.min(1, power)) * C.maxPull;
  // 발사 방향 (cos a, -sin a)의 반대로 당긴다
  return { x: -Math.cos(a) * len, y: Math.sin(a) * len };
}

/**
 * 조준선 점들: 발사 지점에서 충돌 없이 중력만 받은 궤적. 실제 비행과 같은 고정 간격 적분을 쓴다.
 */
export function previewTrajectory(v: Vec, start: Vec = SLING): Vec[] {
  const dots: Vec[] = [];
  const dt = C.substepMs / 1000;
  let x = start.x;
  let y = start.y;
  let vx = v.x;
  let vy = v.y;
  for (let i = 1; i <= C.previewDots * C.previewDotEvery; i++) {
    vy += C.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    if (i % C.previewDotEvery === 0) dots.push({ x, y });
  }
  return dots;
}

// ── 스테이지 생성 ───────────────────────────────────────────

export const SIZES = {
  pillar: { w: 18, h: 58 },
  cube: { w: 32, h: 32 },
  enemy: { w: 30, h: 30 },
  plankH: 18,
} as const;

/** 아랫변 중심(cx, bottom)에 놓인 잠든 몸체 */
export function createBody(id: number, kind: BodyKind, cx: number, bottom: number, w: number, h: number): Body {
  const hp = kind === 'shelf' ? Infinity : C.hp[kind];
  return { id, kind, x: cx, y: bottom - h / 2, w, h, vx: 0, vy: 0, hp, maxHp: hp, awake: false, restMs: 0 };
}

class Builder {
  bodies: Body[] = [];
  private id = 0;
  add(kind: BodyKind, cx: number, bottom: number, w: number, h: number): number {
    this.bodies.push(createBody(this.id++, kind, cx, bottom, w, h));
    return bottom - h;
  }
  pillar(cx: number, bottom: number) {
    return this.add('choco', cx, bottom, SIZES.pillar.w, SIZES.pillar.h);
  }
  plank(cx: number, bottom: number, w = 80) {
    return this.add('jelly', cx, bottom, w, SIZES.plankH);
  }
  cube(cx: number, bottom: number, kind: 'jelly' | 'choco' = 'jelly') {
    return this.add(kind, cx, bottom, SIZES.cube.w, SIZES.cube.h);
  }
  enemy(cx: number, bottom: number) {
    return this.add('enemy', cx, bottom, SIZES.enemy.w, SIZES.enemy.h);
  }
  shelf(left: number, right: number, top: number) {
    this.add('shelf', (left + right) / 2, top + 12, right - left, 12);
    return top;
  }
}

export type TemplateId = 'gate' | 'twins' | 'pyramid' | 'shelf' | 'castle';

type Template = (rng: RNG) => Body[];

/** 기둥 두 개 + 널빤지 + 꼭대기 사탕, 바닥에 사탕 하나 */
const gate: Template = (rng) => {
  const b = new Builder();
  const x = Math.round(randomRange(rng, 200, 232));
  b.pillar(x - 28, GROUND_Y);
  const top = b.pillar(x + 28, GROUND_Y);
  const plankTop = b.plank(x, top);
  b.enemy(x, plankTop);
  b.enemy(x + 62, GROUND_Y);
  return b.bodies;
};

/** 사탕 두 탑: 앞은 상자 두 개, 뒤는 기둥 문 */
const twins: Template = (rng) => {
  const b = new Builder();
  const x1 = Math.round(randomRange(rng, 170, 188));
  const x2 = Math.round(randomRange(rng, 262, 272));
  let t = b.cube(x1, GROUND_Y);
  t = b.cube(x1, t, 'choco');
  b.enemy(x1, t);
  b.pillar(x2 - 26, GROUND_Y);
  const pt = b.pillar(x2 + 26, GROUND_Y);
  const plankTop = b.plank(x2, pt, 72);
  b.enemy(x2, plankTop);
  b.cube(x2, GROUND_Y);
  return b.bodies;
};

/** 3-2-1 상자 피라미드, 꼭대기와 옆에 사탕 */
const pyramid: Template = (rng) => {
  const b = new Builder();
  const x = Math.round(randomRange(rng, 200, 222));
  const step = SIZES.cube.w + 2;
  let row = GROUND_Y;
  row = Math.min(b.cube(x - step, row), b.cube(x, row, 'choco'), b.cube(x + step, row));
  row = Math.min(b.cube(x - step / 2, row), b.cube(x + step / 2, row));
  const top = b.cube(x, row, 'choco');
  b.enemy(x, top);
  b.enemy(x + 67, GROUND_Y);
  return b.bodies;
};

/** 벽에 붙은 높은 선반 위 탑 + 바닥 사탕 */
const shelf: Template = (rng) => {
  const b = new Builder();
  const shelfTop = Math.round(randomRange(rng, 270, 300));
  b.shelf(214, WORLD.width, shelfTop);
  const x = 262;
  b.pillar(x - 24, shelfTop);
  const pt = b.pillar(x + 24, shelfTop);
  const plankTop = b.plank(x, pt, 70);
  b.enemy(x, plankTop);
  const gx = Math.round(randomRange(rng, 168, 190));
  const ct = b.cube(gx, GROUND_Y, 'choco');
  b.enemy(gx, ct);
  return b.bodies;
};

/** 기둥 세 개 성: 안쪽 바닥과 지붕에 사탕 */
const castle: Template = (rng) => {
  const b = new Builder();
  const x = Math.round(randomRange(rng, 205, 250));
  const gap = 50;
  b.pillar(x - gap, GROUND_Y);
  b.pillar(x, GROUND_Y);
  const pt = b.pillar(x + gap, GROUND_Y);
  b.enemy(x - gap / 2, GROUND_Y);
  b.enemy(x + gap / 2, GROUND_Y);
  const roof = Math.min(b.plank(x - 25, pt, 48), b.plank(x + 25, pt, 48));
  b.cube(x - 40, roof);
  b.cube(x + 40, roof);
  b.enemy(x, roof);
  return b.bodies;
};

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = { gate, twins, pyramid, shelf, castle };

/** 스테이지 순서: 쉬움 → 보통 → 보통/어려움 → 성. 같은 틀은 겹치지 않는다. */
export function pickStageTemplates(rng: RNG): TemplateId[] {
  const middle = shuffle<TemplateId>(rng, ['twins', 'pyramid', 'shelf']).slice(0, Math.max(0, C.stageCount - 2));
  return (['gate', ...middle, 'castle'] as TemplateId[]).slice(0, C.stageCount);
}

export function buildStage(id: TemplateId, rng: RNG): Body[] {
  return TEMPLATES[id](rng);
}

export function createSlingState(rng: RNG): SlingState {
  const stages = pickStageTemplates(rng).map((id) => buildStage(id, rng));
  return {
    elapsedMs: 0,
    accMs: 0,
    phase: 'aim',
    phaseMs: 0,
    stageIndex: 0,
    stages,
    bodies: cloneBodies(stages[0] ?? []),
    projectile: null,
    shotsLeft: C.shotsPerStage,
    shotPops: 0,
    score: 0,
    pops: 0,
    blocksBroken: 0,
    stagesCleared: 0,
    shotsFired: 0,
    finished: false,
    endReason: null,
  };
}

export function enemiesLeft(state: Pick<SlingState, 'bodies'>): number {
  return state.bodies.filter((b) => b.kind === 'enemy').length;
}

function cloneBodies(bodies: readonly Body[]): Body[] {
  return bodies.map((b) => ({ ...b }));
}

function cloneState(s: SlingState): SlingState {
  return { ...s, bodies: cloneBodies(s.bodies), projectile: s.projectile ? { ...s.projectile } : null };
}

// ── 발사 ────────────────────────────────────────────────────

export function fire(state: SlingState, dx: number, dy: number): { state: SlingState; launched: boolean; events: SlingEvent[] } {
  if (state.finished || state.phase !== 'aim' || state.shotsLeft <= 0) return { state, launched: false, events: [] };
  const v = launchVelocity(dx, dy);
  if (!v) return { state, launched: false, events: [] };
  const pull = clampPull(dx, dy);
  const next: SlingState = {
    ...state,
    phase: 'flying',
    phaseMs: 0,
    shotsLeft: state.shotsLeft - 1,
    shotsFired: state.shotsFired + 1,
    shotPops: 0,
    projectile: { x: SLING.x + pull.x, y: SLING.y + pull.y, vx: v.x, vy: v.y, active: true, flightMs: 0, restMs: 0 },
  };
  const power = Math.hypot(pull.x, pull.y) / C.maxPull;
  return { state: next, launched: true, events: [{ type: 'launch', power }] };
}

// ── 물리 ────────────────────────────────────────────────────

const mass = (b: Body) => (b.w * b.h) / 400;
const isStatic = (b: Body) => b.kind === 'shelf';
const bottomOf = (b: Body) => b.y + b.h / 2;
const topOf = (b: Body) => b.y - b.h / 2;
const leftOf = (b: Body) => b.x - b.w / 2;
const rightOf = (b: Body) => b.x + b.w / 2;

interface Support {
  grounded: boolean;
  /** 받침 몸체들이 덮는 가로 구간 */
  left: number;
  right: number;
  any: boolean;
}

function findSupport(b: Body, bodies: readonly Body[]): Support {
  if (bottomOf(b) >= GROUND_Y - 1) return { grounded: true, left: -Infinity, right: Infinity, any: true };
  let left = Infinity;
  let right = -Infinity;
  for (const o of bodies) {
    if (o === b) continue;
    if (Math.abs(bottomOf(b) - topOf(o)) > 1.5) continue;
    const ol = Math.max(leftOf(b), leftOf(o));
    const or = Math.min(rightOf(b), rightOf(o));
    if (or - ol < 0.5) continue;
    left = Math.min(left, leftOf(o));
    right = Math.max(right, rightOf(o));
  }
  return { grounded: false, left, right, any: left <= right };
}

interface Ctx {
  s: SlingState;
  events: SlingEvent[];
  removed: Set<number>;
}

function damage(ctx: Ctx, b: Body, amount: number) {
  if (isStatic(b) || amount <= 0 || ctx.removed.has(b.id)) return;
  b.hp -= amount;
  if (b.hp <= 0) destroy(ctx, b);
}

function destroy(ctx: Ctx, b: Body) {
  if (ctx.removed.has(b.id) || isStatic(b)) return;
  ctx.removed.add(b.id);
  const s = ctx.s;
  if (b.kind === 'enemy') {
    s.shotPops += 1;
    const combo = s.shotPops;
    const points = C.points.enemy + (combo > 1 ? C.points.multiPop * (combo - 1) : 0);
    s.score += points;
    s.pops += 1;
    ctx.events.push({ type: 'pop', x: b.x, y: b.y, points, combo });
  } else if (b.kind === 'jelly' || b.kind === 'choco') {
    const points = C.points[b.kind];
    s.score += points;
    s.blocksBroken += 1;
    ctx.events.push({ type: 'break', kind: b.kind, x: b.x, y: b.y, points });
  }
}

function impactDamage(speed: number) {
  return Math.max(0, speed - C.impactDamageFloor) * C.impactDamageScale;
}

function wake(b: Body) {
  if (isStatic(b)) return;
  b.awake = true;
  b.restMs = 0;
}

/** 몸체 두 개의 겹침 해소. 적어도 하나는 깨어 있다. */
function resolvePair(ctx: Ctx, a: Body, b: Body) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ox = (a.w + b.w) / 2 - Math.abs(dx);
  const oy = (a.h + b.h) / 2 - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return;
  if (oy <= ox) {
    const upper = dy > 0 ? a : b;
    const lower = upper === a ? b : a;
    const lowerVy = lower.awake ? lower.vy : 0;
    if (isStatic(upper)) {
      lower.y += oy;
      lower.vy = Math.max(lower.vy, 0);
      return;
    }
    upper.y -= oy;
    if (!upper.awake) wake(upper);
    const impact = upper.vy - lowerVy;
    if (impact > 0) {
      upper.vy = lowerVy;
      const dmg = impactDamage(impact);
      if (dmg > 0) {
        damage(ctx, upper, dmg);
        damage(ctx, lower, dmg);
      }
    }
    return;
  }
  const left = dx > 0 ? a : b;
  const right = left === a ? b : a;
  const lv = left.awake ? left.vx : 0;
  const rv = right.awake ? right.vx : 0;
  const closing = lv - rv;
  // 잠든 쪽은 충분히 세게 밀릴 때만 깨어난다. 아니면 벽처럼 취급.
  const leftMovable = !isStatic(left) && (left.awake || closing > C.wakeSpeed);
  const rightMovable = !isStatic(right) && (right.awake || closing > C.wakeSpeed);
  if (leftMovable && rightMovable) {
    left.x -= ox / 2;
    right.x += ox / 2;
  } else if (leftMovable) {
    left.x -= ox;
  } else if (rightMovable) {
    right.x += ox;
  } else {
    return;
  }
  if (closing <= 0) return;
  if (leftMovable && rightMovable) {
    wake(left);
    wake(right);
    const ml = mass(left);
    const mr = mass(right);
    const v = (ml * lv + mr * rv) / (ml + mr);
    left.vx = v;
    right.vx = v;
  } else if (leftMovable) {
    left.vx = Math.min(left.vx, 0);
  } else {
    right.vx = Math.max(right.vx, 0);
  }
  const dmg = impactDamage(closing);
  if (dmg > 0) {
    damage(ctx, left, dmg);
    damage(ctx, right, dmg);
  }
}

function stepBodies(ctx: Ctx, dt: number) {
  const bodies = ctx.s.bodies;
  for (const b of bodies) {
    if (!b.awake || isStatic(b)) continue;
    b.vy += C.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (bottomOf(b) > GROUND_Y) {
      b.y = GROUND_Y - b.h / 2;
      if (b.vy > 0) {
        damage(ctx, b, impactDamage(b.vy));
        b.vy = 0;
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a || ctx.removed.has(a.id)) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b || ctx.removed.has(b.id)) continue;
        if (!a.awake && !b.awake) continue;
        resolvePair(ctx, a, b);
      }
    }
  }
  const alive = bodies.filter((b) => !ctx.removed.has(b.id));
  for (const b of alive) {
    if (isStatic(b)) continue;
    const sup = findSupport(b, alive);
    if (!b.awake) {
      if (!sup.any || b.x < sup.left || b.x > sup.right) wake(b);
      continue;
    }
    if (!sup.any) {
      b.restMs = 0;
      continue;
    }
    if (b.x < sup.left || b.x > sup.right) {
      // 무게 중심이 받침 밖: 받침 반대쪽으로 미끄러져 떨어진다
      const dir = b.x < sup.left ? -1 : 1;
      b.vx += dir * C.tipAccel * dt;
      b.restMs = 0;
      continue;
    }
    const decel = C.bodyFrictionDecel * dt;
    b.vx = Math.abs(b.vx) <= decel ? 0 : b.vx - Math.sign(b.vx) * decel;
    if (Math.abs(b.vx) < C.sleepSpeed && Math.abs(b.vy) < C.sleepSpeed) {
      b.restMs += dt * 1000;
      if (b.restMs >= C.sleepAfterMs) {
        b.awake = false;
        b.vx = 0;
        b.vy = 0;
      }
    } else {
      b.restMs = 0;
    }
  }
  // 화면 밖으로 나간 몸체: 심술 사탕은 터진 것으로 친다
  for (const b of alive) {
    if (b.x < -30 || b.x > WORLD.width + 30 || b.y > WORLD.height + 40) destroy(ctx, b);
  }
}

function stepProjectile(ctx: Ctx, p: Projectile, dt: number) {
  const R = C.projectileRadius;
  p.flightMs += dt * 1000;
  p.vy += C.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  let touching = false;

  if (p.y + R > GROUND_Y) {
    p.y = GROUND_Y - R;
    touching = true;
    if (p.vy > 0) {
      const s = p.vy;
      if (s > 60) {
        ctx.events.push({ type: 'impact', x: p.x, y: GROUND_Y, nx: 0, ny: -1, strength: Math.min(1, s / 500), target: 'ground' });
        p.vx *= C.groundBounceFriction;
      }
      p.vy = s > 60 ? -s * C.groundRestitution : 0;
    }
    if (p.vy === 0) {
      const decel = C.rollDecel * dt;
      p.vx = Math.abs(p.vx) <= decel ? 0 : p.vx - Math.sign(p.vx) * decel;
    }
  }

  for (const b of ctx.s.bodies) {
    if (ctx.removed.has(b.id)) continue;
    const cx = Math.max(leftOf(b), Math.min(p.x, rightOf(b)));
    const cy = Math.max(topOf(b), Math.min(p.y, bottomOf(b)));
    let nx = p.x - cx;
    let ny = p.y - cy;
    let d = Math.hypot(nx, ny);
    if (d >= R) continue;
    let pen: number;
    if (d === 0) {
      // 중심이 몸체 안: 가장 가까운 면으로 밀어낸다
      const dl = p.x - leftOf(b);
      const dr = rightOf(b) - p.x;
      const dtp = p.y - topOf(b);
      const db = bottomOf(b) - p.y;
      const m = Math.min(dl, dr, dtp, db);
      if (m === dtp) [nx, ny] = [0, -1];
      else if (m === dl) [nx, ny] = [-1, 0];
      else if (m === dr) [nx, ny] = [1, 0];
      else [nx, ny] = [0, 1];
      pen = m + R;
      d = 1;
    } else {
      nx /= d;
      ny /= d;
      pen = R - d;
    }
    touching = true;
    const vn = p.vx * nx + p.vy * ny;
    if (vn >= 0) {
      p.x += nx * pen;
      p.y += ny * pen;
      continue;
    }
    const s = -vn;
    if (s > 60) {
      ctx.events.push({ type: 'impact', x: p.x - nx * R, y: p.y - ny * R, nx, ny, strength: Math.min(1, s / 500), target: b.kind });
    }
    if (!isStatic(b)) {
      damage(ctx, b, Math.max(0, s - C.hitDamageFloor) * C.hitDamageScale);
    }
    if (ctx.removed.has(b.id)) {
      p.vx *= C.pierceKeep;
      p.vy *= C.pierceKeep;
      continue;
    }
    p.x += nx * pen;
    p.y += ny * pen;
    const tx = p.vx - vn * nx;
    const ty = p.vy - vn * ny;
    p.vx = tx * C.bodyTangentKeep - C.bodyRestitution * vn * nx;
    p.vy = ty * C.bodyTangentKeep - C.bodyRestitution * vn * ny;
    if (!isStatic(b) && Math.abs(nx) > 0.2) {
      wake(b);
      b.vx += (-nx * s * C.kick) / mass(b);
    }
  }

  const speed = Math.hypot(p.vx, p.vy);
  if (touching && speed < C.restSpeed) p.restMs += dt * 1000;
  else p.restMs = 0;
  const out = p.x > WORLD.width + R * 2 || p.x < -R * 2 || p.y > WORLD.height + R * 2;
  if (out || p.restMs >= C.restMs || p.flightMs >= C.flightTimeoutMs) p.active = false;
}

function setPhase(s: SlingState, phase: SlingPhase) {
  s.phase = phase;
  s.phaseMs = 0;
}

function substep(ctx: Ctx, dtMs: number) {
  const s = ctx.s;
  const dt = dtMs / 1000;
  s.phaseMs += dtMs;
  const p = s.projectile;
  if (p?.active) {
    stepProjectile(ctx, p, dt);
    if (!p.active && s.phase === 'flying') {
      ctx.events.push({ type: 'shotEnd' });
      setPhase(s, 'settling');
    }
  }
  stepBodies(ctx, dt);
  if (ctx.removed.size > 0) {
    s.bodies = s.bodies.filter((b) => !ctx.removed.has(b.id));
    ctx.removed.clear();
  }
  // 사탕을 다 터뜨리면 말랑이가 굴러가길 기다리지 않는다
  if (s.phase === 'flying' && enemiesLeft(s) === 0) setPhase(s, 'settling');

  if (s.phase === 'settling') {
    const calm = s.bodies.every((b) => !b.awake);
    if (calm || s.phaseMs >= C.settleMaxMs) {
      if (enemiesLeft(s) === 0) {
        const leftover = s.shotsLeft;
        const bonus = C.points.stageClear + leftover * C.points.leftoverShot;
        s.score += bonus;
        s.stagesCleared += 1;
        ctx.events.push({ type: 'stageClear', bonus, leftover });
        setPhase(s, 'clear');
      } else if (s.shotsLeft > 0) {
        setPhase(s, 'aim');
      } else {
        ctx.events.push({ type: 'stageFail' });
        setPhase(s, 'fail');
      }
    }
  } else if ((s.phase === 'clear' || s.phase === 'fail') && s.phaseMs >= C.interludeMs) {
    const nextIndex = s.stageIndex + 1;
    const next = s.stages[nextIndex];
    if (!next) {
      finish(ctx, 'complete');
      return;
    }
    s.stageIndex = nextIndex;
    s.bodies = cloneBodies(next);
    s.projectile = null;
    s.shotsLeft = C.shotsPerStage;
    s.shotPops = 0;
    setPhase(s, 'aim');
    ctx.events.push({ type: 'nextStage', stageIndex: nextIndex });
  }
}

function finish(ctx: Ctx, reason: 'complete' | 'time') {
  const s = ctx.s;
  s.finished = true;
  s.endReason = reason;
  setPhase(s, 'done');
  ctx.events.push({ type: 'finish', reason });
}

/** dt(ms)만큼 진행. 입력 상태는 변경하지 않는다. */
export function step(state: SlingState, dtMs: number): { state: SlingState; events: SlingEvent[] } {
  if (state.finished) return { state, events: [] };
  const s = cloneState(state);
  const ctx: Ctx = { s, events: [], removed: new Set() };
  const dt = Math.max(0, Math.min(C.maxDtMs, dtMs));
  s.elapsedMs += dt;
  s.accMs += dt;
  while (s.accMs >= C.substepMs && !s.finished) {
    s.accMs -= C.substepMs;
    substep(ctx, C.substepMs);
  }
  if (!s.finished && s.elapsedMs >= C.durationMs) finish(ctx, 'time');
  return { state: s, events: ctx.events };
}

/** 남은 시간(초) */
export function timeLeft(state: SlingState): number {
  return Math.max(0, (C.durationMs - state.elapsedMs) / 1000);
}
