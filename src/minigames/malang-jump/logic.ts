/**
 * 말랑 점프 — 순수 시뮬레이션 (Canvas/DOM 무관, dt·RNG 주입).
 *
 * 좌표계: 논리 월드 폭 WORLD.width, 화면 높이 WORLD.height.
 *  - y는 "위로 갈수록 커지는" 높이다 (시작 발판 = 0 근처).
 *  - cameraY는 화면 맨 아래가 가리키는 높이. 렌더러는 screenY = WORLD.height - (y - cameraY)로 변환한다.
 *  - 말랑이의 y는 발(바닥) 위치, 발판의 y는 윗면 높이.
 *
 * 규칙
 *  - 말랑이는 발판에 닿으면 자동으로 튀어 오른다. 플레이어는 좌우만 조종한다.
 *  - 떨어지는 중(vy ≤ 0)일 때만 발판에 착지한다. 올라가는 중에는 발판을 통과한다.
 *  - 발판: 기본 / 움직이는 / 부서지는(한 번 밟으면 떨어짐) / 스프링(아주 높이 점프).
 *  - 화면 좌우 끝을 넘으면 반대편으로 나온다.
 *  - 점수 = 최고 높이 ÷ heightPerPoint + 사탕 개수 × candyPoints.
 *  - 화면 아래로 떨어지거나 60초가 지나면 끝.
 */
import type { RNG } from '../../lib/rng';

export const WORLD = { width: 320, height: 480 } as const;

export const MALANG_JUMP_CONFIG = {
  durationMs: 60_000,
  /** 중력 가속도 (월드 단위/초²) */
  gravity: 1500,
  /** 일반 발판 점프 속도 → 최고 약 173 높이 */
  jumpVelocity: 720,
  /** 스프링 점프 속도 → 최고 약 440 높이 */
  springVelocity: 1150,
  /** 좌우 최고 속도 (월드 단위/초) */
  moveSpeed: 280,
  /** 좌우 가속도 — 즉시 멈추지 않고 살짝 미끄러지는 말랑한 느낌 */
  moveAccel: 2400,
  playerRadius: 16,
  platformWidth: 60,
  platformHeight: 12,
  /** 발판 사이 세로 간격 (높이가 오를수록 gapMin → gapMax) */
  gapStart: 58,
  gapEnd: 118,
  /** 무작위 간격 폭 (±비율) */
  gapJitter: 0.25,
  /** 어떤 경우에도 넘지 않는 간격 — 일반 점프 최고 높이보다 충분히 낮게 */
  gapMax: 145,
  /** 이 높이에서 난이도 최대 */
  hardHeight: 9000,
  movingChanceStart: 0.05,
  movingChanceEnd: 0.35,
  crumbleChanceStart: 0.04,
  crumbleChanceEnd: 0.22,
  springChance: 0.07,
  movingSpeedStart: 50,
  movingSpeedEnd: 100,
  /** 부서진 발판이 떨어지는 속도 */
  crumbleFallSpeed: 260,
  candyChance: 0.28,
  candyRadius: 11,
  candyPoints: 5,
  /** 높이 몇 단위당 1점인가 */
  heightPerPoint: 10,
  /** 말랑이가 화면 위쪽 이 비율보다 올라가면 카메라가 따라 올라간다 (아래에서부터) */
  cameraFollowRatio: 0.55,
  /** 한 프레임 최대 dt (ms) — 탭 전환 등으로 인한 순간이동 방지 */
  maxDtMs: 40,
} as const;

export type JumpConfig = typeof MALANG_JUMP_CONFIG;

export type PlatformKind = 'normal' | 'moving' | 'crumble' | 'spring';

export interface Platform {
  id: number;
  kind: PlatformKind;
  /** 중심 x */
  x: number;
  /** 윗면 높이 */
  y: number;
  /** 움직이는 발판의 x 속도 */
  vx: number;
  /** 부서지는 발판을 이미 밟았는가 (더 이상 착지 불가, 아래로 떨어짐) */
  broken: boolean;
}

export interface Candy {
  id: number;
  x: number;
  /** 중심 높이 */
  y: number;
  /** 색 인덱스 (렌더링용) */
  hue: number;
}

export interface JumpState {
  elapsedMs: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 마지막으로 누른 방향 (렌더링용, -1/1) */
  facing: -1 | 1;
  cameraY: number;
  maxHeight: number;
  platforms: Platform[];
  candies: Candy[];
  /** 다음 발판을 만들 높이 */
  nextPlatformY: number;
  nextId: number;
  candiesCollected: number;
  bounces: number;
  springs: number;
  score: number;
  finished: boolean;
  endReason: 'fall' | 'time' | null;
}

export interface JumpInput {
  /** -1(왼쪽) / 0 / 1(오른쪽) */
  direction: -1 | 0 | 1;
}

export type JumpEvent =
  | { type: 'bounce'; kind: PlatformKind; x: number; y: number }
  | { type: 'candy'; points: number; x: number; y: number }
  | { type: 'fall' }
  | { type: 'timeUp' };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** 높이에 따른 난이도 파라미터 */
export function difficulty(height: number, config: JumpConfig = MALANG_JUMP_CONFIG) {
  const t = height / config.hardHeight;
  return {
    gap: lerp(config.gapStart, config.gapEnd, t),
    movingChance: lerp(config.movingChanceStart, config.movingChanceEnd, t),
    crumbleChance: lerp(config.crumbleChanceStart, config.crumbleChanceEnd, t),
    movingSpeed: lerp(config.movingSpeedStart, config.movingSpeedEnd, t),
  };
}

/** 가로 좌표를 [0, width) 로 감싼다 */
export function wrapX(x: number): number {
  const w = WORLD.width;
  return ((x % w) + w) % w;
}

/** 점수 = 최고 높이 점수 + 사탕 점수 */
export function computeScore(maxHeight: number, candies: number, config: JumpConfig = MALANG_JUMP_CONFIG): number {
  return Math.floor(Math.max(0, maxHeight) / config.heightPerPoint) + candies * config.candyPoints;
}

/** 일정한 속도로 튀어 오를 때 도달하는 최고 높이 (현재 위치 기준 상대값) */
export function apexRise(vy: number, config: JumpConfig = MALANG_JUMP_CONFIG): number {
  return vy > 0 ? (vy * vy) / (2 * config.gravity) : 0;
}

/** 발판 하나를 만든다 (y는 호출자가 결정). 사탕이 함께 생길 수 있다. */
export function spawnPlatform(
  y: number,
  id: number,
  rng: RNG,
  config: JumpConfig = MALANG_JUMP_CONFIG,
): { platform: Platform; candy: Candy | null } {
  const d = difficulty(y, config);
  const half = config.platformWidth / 2;
  const x = half + rng() * (WORLD.width - config.platformWidth);
  const roll = rng();
  let kind: PlatformKind = 'normal';
  if (roll < config.springChance) kind = 'spring';
  else if (roll < config.springChance + d.crumbleChance) kind = 'crumble';
  else if (roll < config.springChance + d.crumbleChance + d.movingChance) kind = 'moving';
  const vx = kind === 'moving' ? d.movingSpeed * (rng() < 0.5 ? -1 : 1) : 0;
  let candy: Candy | null = null;
  if (rng() < config.candyChance) {
    const cx = config.candyRadius + rng() * (WORLD.width - config.candyRadius * 2);
    candy = { id: id + 1, x: cx, y: y + 45 + rng() * 45, hue: Math.floor(rng() * 4) };
  }
  return { platform: { id, kind, x, y, vx, broken: false }, candy };
}

/** 카메라 위쪽 여유분까지 발판을 채운다 (state를 직접 변경 — 내부용) */
function fillPlatforms(s: JumpState, rng: RNG, config: JumpConfig) {
  const limit = s.cameraY + WORLD.height + 120;
  while (s.nextPlatformY < limit) {
    const { platform, candy } = spawnPlatform(s.nextPlatformY, s.nextId, rng, config);
    s.platforms.push(platform);
    s.nextId += 2;
    if (candy) s.candies.push(candy);
    const d = difficulty(s.nextPlatformY, config);
    const jitter = 1 - config.gapJitter + rng() * config.gapJitter * 2;
    s.nextPlatformY += Math.min(config.gapMax, d.gap * jitter);
  }
}

/** 시작 높이 (점수 기준점) */
export const START_Y = 40;

export function createJumpState(rng: RNG, config: JumpConfig = MALANG_JUMP_CONFIG): JumpState {
  const s: JumpState = {
    elapsedMs: 0,
    x: WORLD.width / 2,
    y: START_Y,
    vx: 0,
    vy: config.jumpVelocity,
    facing: 1,
    cameraY: 0,
    maxHeight: 0,
    // 시작 발판: 말랑이 바로 아래, 기본 발판
    platforms: [{ id: 1, kind: 'normal', x: WORLD.width / 2, y: START_Y, vx: 0, broken: false }],
    candies: [],
    nextPlatformY: START_Y + config.gapStart,
    nextId: 2,
    candiesCollected: 0,
    bounces: 0,
    springs: 0,
    score: 0,
    finished: config.durationMs <= 0,
    endReason: null,
  };
  fillPlatforms(s, rng, config);
  return s;
}

/** 가로 방향 겹침 (화면 경계를 넘는 경우도 고려) */
function horizontalDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD.width - d);
}

/** 말랑이가 이번 프레임에 발판 윗면을 위→아래로 지나갔는가 (떨어지는 중일 때만) */
export function landsOn(
  prevY: number,
  nextY: number,
  vy: number,
  x: number,
  platform: Platform,
  config: JumpConfig = MALANG_JUMP_CONFIG,
): boolean {
  if (vy > 0 || platform.broken) return false;
  if (!(prevY >= platform.y && nextY <= platform.y)) return false;
  return horizontalDistance(x, platform.x) <= config.platformWidth / 2 + config.playerRadius * 0.6;
}

/**
 * dt(ms)만큼 시뮬레이션을 진행한다. 새 상태와 이번 프레임의 이벤트를 반환 (이전 상태는 변경하지 않음).
 */
export function stepJump(
  prev: JumpState,
  dtMs: number,
  input: JumpInput,
  rng: RNG,
  config: JumpConfig = MALANG_JUMP_CONFIG,
): { state: JumpState; events: JumpEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dtClamped = Math.max(0, Math.min(dtMs, config.maxDtMs));
  const dt = dtClamped / 1000;
  const events: JumpEvent[] = [];
  const s: JumpState = {
    ...prev,
    platforms: prev.platforms.map((p) => ({ ...p })),
    candies: prev.candies.slice(),
  };
  s.elapsedMs += dtClamped;

  // 좌우 이동 (가속 → 목표 속도)
  const target = input.direction * config.moveSpeed;
  const dv = config.moveAccel * dt;
  s.vx = s.vx < target ? Math.min(target, s.vx + dv) : Math.max(target, s.vx - dv);
  if (input.direction !== 0) s.facing = input.direction;
  s.x = wrapX(s.x + s.vx * dt);

  // 발판 이동
  const half = config.platformWidth / 2;
  for (const p of s.platforms) {
    if (p.broken) {
      p.y -= config.crumbleFallSpeed * dt;
      continue;
    }
    if (p.kind !== 'moving') continue;
    p.x += p.vx * dt;
    if (p.x < half) {
      p.x = half;
      p.vx = Math.abs(p.vx);
    } else if (p.x > WORLD.width - half) {
      p.x = WORLD.width - half;
      p.vx = -Math.abs(p.vx);
    }
  }

  // 수직 이동 + 착지
  const prevY = s.y;
  const nextVy = s.vy - config.gravity * dt;
  const nextY = s.y + ((s.vy + nextVy) / 2) * dt;
  let landed: Platform | null = null;
  for (const p of s.platforms) {
    if (landsOn(prevY, nextY, nextVy, s.x, p, config) && (!landed || p.y > landed.y)) landed = p;
  }
  if (landed) {
    s.y = landed.y;
    s.vy = landed.kind === 'spring' ? config.springVelocity : config.jumpVelocity;
    s.bounces += 1;
    if (landed.kind === 'spring') s.springs += 1;
    if (landed.kind === 'crumble') landed.broken = true;
    events.push({ type: 'bounce', kind: landed.kind, x: s.x, y: landed.y });
  } else {
    s.y = nextY;
    s.vy = nextVy;
  }

  // 사탕
  const cy = s.y + config.playerRadius;
  const reach = config.playerRadius + config.candyRadius;
  s.candies = s.candies.filter((c) => {
    const dx = horizontalDistance(c.x, s.x);
    const dy = c.y - cy;
    if (dx * dx + dy * dy <= reach * reach) {
      s.candiesCollected += 1;
      events.push({ type: 'candy', points: config.candyPoints, x: c.x, y: c.y });
      return false;
    }
    return true;
  });

  // 최고 높이 & 카메라 (둘 다 절대 내려가지 않는다)
  s.maxHeight = Math.max(s.maxHeight, s.y - START_Y);
  s.cameraY = Math.max(s.cameraY, s.y - WORLD.height * config.cameraFollowRatio);
  s.score = computeScore(s.maxHeight, s.candiesCollected, config);

  // 화면 아래로 벗어난 것 정리 + 위쪽 채우기
  const bottom = s.cameraY - 60;
  s.platforms = s.platforms.filter((p) => p.y > bottom);
  s.candies = s.candies.filter((c) => c.y > bottom);
  fillPlatforms(s, rng, config);

  // 종료 판정
  if (s.y + config.playerRadius * 2 < s.cameraY) {
    s.finished = true;
    s.endReason = 'fall';
    events.push({ type: 'fall' });
  } else if (s.elapsedMs >= config.durationMs) {
    s.finished = true;
    s.endReason = 'time';
    events.push({ type: 'timeUp' });
  }
  return { state: s, events };
}

/** 부호 있는 가로 거리 (화면 경계를 넘는 쪽이 더 가까우면 그쪽) */
function signedWrapDelta(from: number, to: number): number {
  let d = to - from;
  if (d > WORLD.width / 2) d -= WORLD.width;
  else if (d < -WORLD.width / 2) d += WORLD.width;
  return d;
}

/**
 * 간단한 자동 조종 (테스트·밸런스 측정용).
 * 지금 속도로 떨어지며 닿을 수 있는 발판 중 가장 높은 곳으로 향한다.
 */
export function botDirection(s: JumpState, config: JumpConfig = MALANG_JUMP_CONFIG): -1 | 0 | 1 {
  const reachTop = s.y + apexRise(s.vy, config);
  let best: Platform | null = null;
  let bestDx = 0;
  for (const p of s.platforms) {
    if (p.broken || p.y > reachTop - 4) continue;
    // 그 높이까지 내려오는 데 걸리는 시간 (내려오는 쪽 해)
    const t = (s.vy + Math.sqrt(s.vy * s.vy + 2 * config.gravity * (s.y - p.y))) / config.gravity;
    const dx = signedWrapDelta(s.x, p.x);
    const need = Math.max(0, Math.abs(dx) - config.platformWidth / 2);
    if (need > config.moveSpeed * t * 0.8) continue;
    if (!best || p.y > best.y) {
      best = p;
      bestDx = dx;
    }
  }
  if (!best || Math.abs(bestDx) < 8) return 0;
  return bestDx < 0 ? -1 : 1;
}
