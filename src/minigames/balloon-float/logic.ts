/**
 * 풍선 말랑 — 순수 시뮬레이션 (Canvas/DOM 무관, dt·RNG 주입).
 *
 * 좌표계: 논리 월드 WORLD.width × WORLD.height, y는 아래로 갈수록 커진다 (캔버스와 같음).
 *  - 말랑이는 x = PLAYER_X 에 고정, 기둥이 오른쪽에서 왼쪽으로 흘러온다.
 *  - 말랑이 위치(x, y)는 몸통 중심. 풍선 묶음은 몸통 위쪽(BALLOON_OFFSET)에 있다.
 *
 * 규칙
 *  - 누르면 풍선이 훅 부풀며 위로 떠오른다(flap). 중력이 계속 아래로 당긴다.
 *  - 기둥(사탕 지팡이/구름) 사이 틈을 지나가면 +passPoints, 틈의 별을 먹으면 +starPoints.
 *  - 풍선 2개로 시작. 기둥이나 바닥에 닿으면 풍선이 하나 터지고 잠깐 무적. 풍선이 0개가 되면 끝.
 *  - 풍선이 하나뿐이면 조금 더 무겁다 (중력 ×oneBalloonGravity).
 *  - 첫 입력 전에는 제자리에서 둥실거리며 기다린다 (autoStartMs 뒤에는 자동 출발).
 *  - 90초가 지나면 끝. 남은 풍선마다 완주 보너스.
 */
import type { RNG } from '../../lib/rng';

export const WORLD = { width: 320, height: 480 } as const;

/** 말랑이의 고정 가로 위치 */
export const PLAYER_X = 92;

export const BALLOON_CONFIG = {
  durationMs: 90_000,
  /** 중력 (월드 단위/초², 아래로 +) */
  gravity: 900,
  /** 한 번 누를 때 위로 향하는 속도 → 최고 약 45 상승 (연타하면 초당 약 145 상승) */
  flapVelocity: 285,
  /** 최대 낙하 속도 — 풍선이라 너무 빨리 떨어지지 않는다 */
  maxFallSpeed: 420,
  /** 풍선이 하나 남았을 때 중력 배율 */
  oneBalloonGravity: 1.12,
  startBalloons: 2,
  /** 판정용 몸통 반지름 (그림 반지름 ≈ 21보다 작게 — 너그러운 판정) */
  bodyRadius: 14,
  /** 판정용 풍선 묶음 반지름과 몸통 중심 기준 위치 */
  balloonRadius: 11,
  balloonOffsetX: -4,
  balloonOffsetY: -46,
  /** 바닥(땅) 윗면 y */
  groundY: 440,
  /** 기둥 폭 */
  pillarWidth: 56,
  /** 틈 높이: 시작 → 최대 난이도 */
  gapStart: 182,
  gapEnd: 146,
  /** 기둥 사이 가로 간격 (한 기둥 왼쪽 끝 → 다음 기둥 왼쪽 끝) */
  spacingStart: 215,
  spacingEnd: 182,
  /** 스크롤 속도 (월드 단위/초) */
  speedStart: 118,
  speedEnd: 172,
  /** 이웃한 틈 중심의 최대 높이 차 — 연타로 오를 수 있는 속도보다 넉넉히 작게 */
  shiftStart: 70,
  shiftEnd: 100,
  /** 틈이 화면 위/아래 끝에 너무 붙지 않도록 남기는 여백 */
  gapMargin: 34,
  /** 이 시간(ms)에 난이도 최대 */
  hardMs: 70_000,
  /** 첫 기둥이 나타나는 x (화면 오른쪽 밖) */
  firstPillarX: WORLD.width + 60,
  /** 별 */
  starRadius: 11,
  gapStarChance: 0.6,
  midStarChance: 0.35,
  passPoints: 10,
  starPoints: 5,
  /** 완주 시 남은 풍선 하나당 보너스 */
  finishBonusPerBalloon: 30,
  /** 부딪힌 뒤 무적 시간 */
  invulnMs: 1500,
  /** 부딪히면 살짝 튕겨 오르는 속도 */
  hitBounceVelocity: 260,
  /** 바닥에 닿으면 튕겨 오르는 속도 */
  floorBounceVelocity: 400,
  /** 첫 입력이 없어도 이 시간 뒤에는 출발 */
  autoStartMs: 3000,
  /** 한 프레임 최대 dt (ms) */
  maxDtMs: 40,
} as const;

export type BalloonConfig = typeof BALLOON_CONFIG;

export type PillarKind = 'cane' | 'cloud';

export interface Pillar {
  id: number;
  kind: PillarKind;
  /** 왼쪽 끝 x */
  x: number;
  /** 틈 윗변 y */
  gapTop: number;
  /** 틈 아랫변 y */
  gapBottom: number;
  /** 이미 통과해 점수를 받았는가 */
  passed: boolean;
}

export interface Star {
  id: number;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BalloonState {
  /** 첫 입력 전 대기 중 */
  waiting: boolean;
  waitMs: number;
  /** 출발 후 흐른 시간 */
  elapsedMs: number;
  /** 몸통 중심 y */
  y: number;
  /** 세로 속도 (아래로 +) */
  vy: number;
  balloons: number;
  /** 남은 무적 시간 */
  invulnMs: number;
  /** 지금까지 흘러간 거리 (배경 시차용) */
  distance: number;
  pillars: Pillar[];
  stars: Star[];
  /** 다음 기둥을 놓을 x (distance 기준이 아니라 화면 좌표, 스크롤과 함께 줄어든다) */
  nextPillarX: number;
  /** 마지막으로 만든 틈의 중심 y */
  lastGapCenter: number;
  nextId: number;
  passed: number;
  starsCollected: number;
  hits: number;
  flaps: number;
  score: number;
  finished: boolean;
  endReason: 'pop' | 'time' | null;
}

export type BalloonEvent =
  | { type: 'flap' }
  | { type: 'pass'; points: number }
  | { type: 'star'; points: number; x: number; y: number }
  | { type: 'hit'; balloonsLeft: number; cause: 'pillar' | 'floor' }
  | { type: 'pop' }
  | { type: 'timeUp'; bonus: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** 흐른 시간에 따른 난이도 파라미터 */
export function difficulty(elapsedMs: number, config: BalloonConfig = BALLOON_CONFIG) {
  const t = elapsedMs / config.hardMs;
  return {
    gap: lerp(config.gapStart, config.gapEnd, t),
    spacing: lerp(config.spacingStart, config.spacingEnd, t),
    speed: lerp(config.speedStart, config.speedEnd, t),
    shift: lerp(config.shiftStart, config.shiftEnd, t),
  };
}

/** 점수 = 통과 기둥 × passPoints + 별 × starPoints + 완주 보너스 */
export function computeScore(
  passed: number,
  stars: number,
  finishBonus = 0,
  config: BalloonConfig = BALLOON_CONFIG,
): number {
  return Math.max(0, passed) * config.passPoints + Math.max(0, stars) * config.starPoints + Math.max(0, finishBonus);
}

/** 틈 중심이 있을 수 있는 범위 */
export function gapCenterRange(gap: number, config: BalloonConfig = BALLOON_CONFIG): { min: number; max: number } {
  const half = gap / 2;
  return { min: half + config.gapMargin, max: config.groundY - half - config.gapMargin };
}

/**
 * 다음 틈 중심 y. 직전 틈 중심에서 ±shift 이내이면서 화면 안쪽 범위를 벗어나지 않는다.
 * → 이웃한 두 틈 사이 높이 차가 항상 제한되어 반드시 지나갈 수 있다.
 */
export function nextGapCenter(
  prevCenter: number,
  gap: number,
  shift: number,
  rng: RNG,
  config: BalloonConfig = BALLOON_CONFIG,
): number {
  const { min, max } = gapCenterRange(gap, config);
  const lo = Math.max(min, prevCenter - shift);
  const hi = Math.min(max, prevCenter + shift);
  if (hi <= lo) return Math.max(min, Math.min(max, prevCenter));
  return lo + rng() * (hi - lo);
}

/** 기둥 하나(+ 별)를 만든다 */
export function spawnPillar(
  x: number,
  prevCenter: number,
  elapsedMs: number,
  id: number,
  rng: RNG,
  config: BalloonConfig = BALLOON_CONFIG,
): { pillar: Pillar; stars: Star[]; center: number } {
  const d = difficulty(elapsedMs, config);
  const center = nextGapCenter(prevCenter, d.gap, d.shift, rng, config);
  const kind: PillarKind = rng() < 0.5 ? 'cane' : 'cloud';
  const pillar: Pillar = {
    id,
    kind,
    x,
    gapTop: center - d.gap / 2,
    gapBottom: center + d.gap / 2,
    passed: false,
  };
  const stars: Star[] = [];
  if (rng() < config.gapStarChance) {
    // 틈 안쪽, 가장자리에서 떨어진 곳
    const jitter = (rng() - 0.5) * d.gap * 0.3;
    stars.push({ id: id + 1, x: x + config.pillarWidth / 2, y: center + jitter });
  }
  if (rng() < config.midStarChance) {
    // 이전 틈과 이번 틈 사이 길목 (두 중심을 이은 선 근처)
    const mx = x - (d.spacing - config.pillarWidth) / 2;
    if (mx > PLAYER_X + 40) stars.push({ id: id + 2, x: mx, y: (center + prevCenter) / 2 });
  }
  return { pillar, stars, center };
}

/** 화면 오른쪽 밖까지 기둥을 채운다 (state를 직접 변경 — 내부용) */
function fillPillars(s: BalloonState, rng: RNG, config: BalloonConfig) {
  while (s.nextPillarX < WORLD.width + config.pillarWidth + 40) {
    const { pillar, stars, center } = spawnPillar(s.nextPillarX, s.lastGapCenter, s.elapsedMs, s.nextId, rng, config);
    s.pillars.push(pillar);
    s.stars.push(...stars);
    s.nextId += 3;
    s.lastGapCenter = center;
    s.nextPillarX += difficulty(s.elapsedMs, config).spacing;
  }
}

export function createBalloonState(rng: RNG, config: BalloonConfig = BALLOON_CONFIG): BalloonState {
  const startY = config.groundY * 0.45;
  const s: BalloonState = {
    waiting: true,
    waitMs: 0,
    elapsedMs: 0,
    y: startY,
    vy: 0,
    balloons: config.startBalloons,
    invulnMs: 0,
    distance: 0,
    pillars: [],
    stars: [],
    nextPillarX: config.firstPillarX,
    // 첫 틈은 말랑이 높이 근처에서 시작
    lastGapCenter: startY,
    nextId: 1,
    passed: 0,
    starsCollected: 0,
    hits: 0,
    flaps: 0,
    score: 0,
    finished: config.durationMs <= 0,
    endReason: null,
  };
  fillPillars(s, rng, config);
  return s;
}

/** 누르기: 위로 훅 떠오른다. 대기 중이면 출발. 끝난 뒤에는 무시. */
export function flap(prev: BalloonState, config: BalloonConfig = BALLOON_CONFIG): BalloonState {
  if (prev.finished) return prev;
  return { ...prev, waiting: false, vy: -config.flapVelocity, flaps: prev.flaps + 1 };
}

/** 원과 직사각형이 겹치는가 (가장 가까운 점까지 거리) */
export function circleRectHit(cx: number, cy: number, r: number, rect: Rect): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** 기둥의 위/아래 두 직사각형 */
export function pillarRects(p: Pillar, config: BalloonConfig = BALLOON_CONFIG): [Rect, Rect] {
  return [
    // 위 기둥은 화면 위로 넉넉히 뻗어 있어 천장 너머로 피할 수 없다
    { x: p.x, y: -400, w: config.pillarWidth, h: p.gapTop + 400 },
    { x: p.x, y: p.gapBottom, w: config.pillarWidth, h: config.groundY - p.gapBottom },
  ];
}

/** 판정 원 두 개: 몸통, 풍선 묶음 */
export function hitCircles(y: number, config: BalloonConfig = BALLOON_CONFIG) {
  return [
    { x: PLAYER_X, y, r: config.bodyRadius },
    { x: PLAYER_X + config.balloonOffsetX, y: y + config.balloonOffsetY, r: config.balloonRadius },
  ];
}

export function hitsPillar(y: number, p: Pillar, config: BalloonConfig = BALLOON_CONFIG): boolean {
  const rects = pillarRects(p, config);
  return hitCircles(y, config).some((c) => rects.some((r) => circleRectHit(c.x, c.y, c.r, r)));
}

/** 가장 위쪽 판정점이 천장(0)에 닿지 않도록 하는 최소 y */
export function ceilingY(config: BalloonConfig = BALLOON_CONFIG): number {
  return -config.balloonOffsetY + config.balloonRadius;
}

/**
 * dt(ms)만큼 진행한다. 새 상태와 이번 프레임의 이벤트를 반환 (이전 상태는 변경하지 않음).
 */
export function step(
  prev: BalloonState,
  dtMs: number,
  rng: RNG,
  config: BalloonConfig = BALLOON_CONFIG,
): { state: BalloonState; events: BalloonEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dtClamped = Math.max(0, Math.min(dtMs, config.maxDtMs));
  const dt = dtClamped / 1000;
  const events: BalloonEvent[] = [];
  const s: BalloonState = {
    ...prev,
    pillars: prev.pillars.map((p) => ({ ...p })),
    stars: prev.stars.slice(),
  };

  if (s.waiting) {
    s.waitMs += dtClamped;
    if (s.waitMs < config.autoStartMs) return { state: s, events };
    s.waiting = false;
  }

  s.elapsedMs += dtClamped;
  s.invulnMs = Math.max(0, s.invulnMs - dtClamped);
  const d = difficulty(s.elapsedMs, config);

  // 세로 이동
  const g = config.gravity * (s.balloons <= 1 ? config.oneBalloonGravity : 1);
  const nextVy = Math.min(config.maxFallSpeed, s.vy + g * dt);
  s.y += ((s.vy + nextVy) / 2) * dt;
  s.vy = nextVy;
  const ceil = ceilingY(config);
  if (s.y < ceil) {
    s.y = ceil;
    s.vy = Math.max(0, s.vy);
  }

  // 스크롤
  const dx = d.speed * dt;
  s.distance += dx;
  for (const p of s.pillars) p.x -= dx;
  s.stars = s.stars.map((st) => ({ ...st, x: st.x - dx }));
  s.nextPillarX -= dx;

  const hit = (cause: 'pillar' | 'floor') => {
    s.balloons -= 1;
    s.hits += 1;
    events.push({ type: 'hit', balloonsLeft: s.balloons, cause });
    if (s.balloons <= 0) {
      s.finished = true;
      s.endReason = 'pop';
      events.push({ type: 'pop' });
    } else {
      s.invulnMs = config.invulnMs;
      s.vy = -(cause === 'floor' ? config.floorBounceVelocity : config.hitBounceVelocity);
    }
  };

  // 바닥
  const floor = config.groundY - config.bodyRadius;
  if (s.y >= floor) {
    s.y = floor;
    if (s.invulnMs > 0) s.vy = -config.floorBounceVelocity;
    else hit('floor');
  }

  // 기둥
  if (!s.finished && s.invulnMs <= 0) {
    for (const p of s.pillars) {
      if (hitsPillar(s.y, p, config)) {
        hit('pillar');
        break;
      }
    }
  }

  // 통과 판정: 기둥 오른쪽 끝이 말랑이 중심을 지나면
  for (const p of s.pillars) {
    if (!p.passed && p.x + config.pillarWidth < PLAYER_X) {
      p.passed = true;
      s.passed += 1;
      events.push({ type: 'pass', points: config.passPoints });
    }
  }

  // 별: 두 판정 원 중 하나라도 닿으면 먹는다
  const circles = hitCircles(s.y, config);
  s.stars = s.stars.filter((st) => {
    const got = circles.some((c) => {
      const reach = c.r + config.starRadius + 4;
      const ddx = c.x - st.x;
      const ddy = c.y - st.y;
      return ddx * ddx + ddy * ddy <= reach * reach;
    });
    if (got && !s.finished) {
      s.starsCollected += 1;
      events.push({ type: 'star', points: config.starPoints, x: st.x, y: st.y });
      return false;
    }
    return true;
  });

  // 정리 + 채우기
  s.pillars = s.pillars.filter((p) => p.x + config.pillarWidth > -20);
  s.stars = s.stars.filter((st) => st.x > -20);
  fillPillars(s, rng, config);

  let bonus = 0;
  if (!s.finished && s.elapsedMs >= config.durationMs) {
    s.finished = true;
    s.endReason = 'time';
    bonus = s.balloons * config.finishBonusPerBalloon;
    events.push({ type: 'timeUp', bonus });
  }
  s.score = computeScore(s.passed, s.starsCollected, bonus, config);
  return { state: s, events };
}

/**
 * 간단한 자동 조종 (테스트·밸런스 측정용).
 * 앞에 있는 가장 가까운 틈 중심을 목표로, 목표보다 아래로 처지면 누른다.
 */
export function botShouldFlap(s: BalloonState, config: BalloonConfig = BALLOON_CONFIG): boolean {
  const next = s.pillars
    .filter((p) => p.x + config.pillarWidth > PLAYER_X - config.bodyRadius)
    .sort((a, b) => a.x - b.x)[0];
  // 몸통+풍선 묶음 전체의 가운데가 틈 가운데에 오도록 몸통 목표를 조금 아래로
  const offset = (config.bodyRadius - config.balloonOffsetY + config.balloonRadius) / 2 - config.bodyRadius;
  const target = (next ? (next.gapTop + next.gapBottom) / 2 : config.groundY * 0.5) + offset;
  // 한 번 누르면 약 apex만큼 올랐다 내려오므로, 목표보다 apex/2 아래에서 눌러 목표 근처를 오르내린다
  const apex = (config.flapVelocity * config.flapVelocity) / (2 * config.gravity);
  return s.vy >= 0 && s.y > target + apex / 2;
}
