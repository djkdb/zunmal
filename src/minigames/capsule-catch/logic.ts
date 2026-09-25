/**
 * 캡슐 받기 — 순수 시뮬레이션 (Canvas/DOM 무관, dt·RNG 주입).
 *
 * 좌표계: 논리 월드 WORLD.width × WORLD.height. 렌더러가 화면 크기에 맞게 스케일한다.
 *
 * 규칙
 *  - 30초 동안 위에서 떨어지는 캡슐을 좌우로 움직여 받는다.
 *  - 일반 캡슐 10점, 황금 캡슐 30점. 연속으로 받을수록 보너스.
 *  - 폭탄을 받으면 감점 + 연속 기록 초기화 + 잠깐 기절(이동 불가).
 *  - 캡슐을 놓치면 연속 기록만 초기화.
 *  - 시간이 지날수록 더 빨리, 더 자주 떨어지고 폭탄 비율이 늘어난다.
 */
import type { RNG } from '../../lib/rng';

export const WORLD = { width: 320, height: 480 } as const;

export const CAPSULE_CATCH_CONFIG = {
  durationMs: 30_000,
  playerWidth: 70,
  playerHeight: 34,
  playerY: WORLD.height - 44,
  playerSpeed: 360, // 월드 단위/초 (키보드)
  itemRadius: 14,
  spawnIntervalStart: 780, // ms
  spawnIntervalEnd: 430,
  fallSpeedStart: 150, // 월드 단위/초
  fallSpeedEnd: 280,
  bombChanceStart: 0.18,
  bombChanceEnd: 0.3,
  goldChance: 0.1,
  points: { capsule: 10, gold: 30, bomb: -20 },
  /** 연속 streakStep개마다 받는 점수 +streakBonus (최대 maxStreakBonus) */
  streakStep: 5,
  streakBonus: 2,
  maxStreakBonus: 10,
  stunMs: 700,
} as const;

export type ItemKind = 'capsule' | 'gold' | 'bomb';

export interface FallingItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vy: number;
  /** 캡슐 색 인덱스 (렌더링용) */
  hue: number;
}

export interface CatchState {
  elapsedMs: number;
  playerX: number;
  items: FallingItem[];
  nextSpawnMs: number;
  nextId: number;
  score: number;
  streak: number;
  maxStreak: number;
  caught: number;
  goldCaught: number;
  bombsHit: number;
  missed: number;
  stunnedUntilMs: number;
  finished: boolean;
}

export interface CatchInput {
  /** -1(왼쪽) / 0 / 1(오른쪽) — 키보드·버튼 */
  direction: -1 | 0 | 1;
  /** 터치/마우스로 지정한 목표 x (월드 좌표). 있으면 direction보다 우선 */
  targetX: number | null;
}

export type CatchEvent =
  | { type: 'catch'; kind: 'capsule' | 'gold'; points: number; x: number; y: number }
  | { type: 'bomb'; points: number; x: number; y: number }
  | { type: 'miss'; x: number };

export type CatchConfig = typeof CAPSULE_CATCH_CONFIG;

export function createCatchState(config: CatchConfig = CAPSULE_CATCH_CONFIG): CatchState {
  return {
    elapsedMs: 0,
    playerX: WORLD.width / 2,
    items: [],
    nextSpawnMs: 400,
    nextId: 1,
    score: 0,
    streak: 0,
    maxStreak: 0,
    caught: 0,
    goldCaught: 0,
    bombsHit: 0,
    missed: 0,
    stunnedUntilMs: 0,
    finished: config.durationMs <= 0,
  };
}

/** 진행도(0~1)에 따른 선형 보간 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function difficulty(elapsedMs: number, config: CatchConfig = CAPSULE_CATCH_CONFIG) {
  const t = elapsedMs / config.durationMs;
  return {
    spawnInterval: lerp(config.spawnIntervalStart, config.spawnIntervalEnd, t),
    fallSpeed: lerp(config.fallSpeedStart, config.fallSpeedEnd, t),
    bombChance: lerp(config.bombChanceStart, config.bombChanceEnd, t),
  };
}

export function streakBonus(streak: number, config: CatchConfig = CAPSULE_CATCH_CONFIG): number {
  return Math.min(config.maxStreakBonus, Math.floor(streak / config.streakStep) * config.streakBonus);
}

export function clampPlayerX(x: number, config: CatchConfig = CAPSULE_CATCH_CONFIG): number {
  const half = config.playerWidth / 2;
  return Math.max(half, Math.min(WORLD.width - half, x));
}

/** 아이템이 바구니(플레이어 상단 영역)에 닿았는가 */
export function isCaught(item: FallingItem, playerX: number, config: CatchConfig = CAPSULE_CATCH_CONFIG): boolean {
  const r = config.itemRadius;
  const top = config.playerY - config.playerHeight / 2;
  const withinY = item.y + r >= top && item.y - r <= top + config.playerHeight * 0.6;
  const withinX = Math.abs(item.x - playerX) <= config.playerWidth / 2 + r * 0.4;
  return withinY && withinX;
}

export function spawnItem(state: CatchState, rng: RNG, config: CatchConfig = CAPSULE_CATCH_CONFIG): FallingItem {
  const d = difficulty(state.elapsedMs, config);
  const roll = rng();
  const kind: ItemKind = roll < d.bombChance ? 'bomb' : roll < d.bombChance + config.goldChance ? 'gold' : 'capsule';
  const margin = config.itemRadius + 4;
  return {
    id: state.nextId,
    kind,
    x: margin + rng() * (WORLD.width - margin * 2),
    y: -config.itemRadius,
    vy: d.fallSpeed * (0.85 + rng() * 0.3),
    hue: Math.floor(rng() * 5),
  };
}

/**
 * dt(ms)만큼 시뮬레이션을 진행한다. 새 상태와 이번 프레임의 이벤트를 반환 (입력 상태는 변경하지 않음).
 */
export function stepCatch(
  prev: CatchState,
  dtMs: number,
  input: CatchInput,
  rng: RNG,
  config: CatchConfig = CAPSULE_CATCH_CONFIG,
): { state: CatchState; events: CatchEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dt = Math.max(0, Math.min(dtMs, 50)); // 탭 전환 등 큰 dt는 잘라서 순간이동 방지
  const events: CatchEvent[] = [];
  const s: CatchState = { ...prev, items: prev.items.slice() };
  s.elapsedMs += dt;

  // 플레이어 이동
  if (s.elapsedMs >= s.stunnedUntilMs) {
    const maxStep = (config.playerSpeed * dt) / 1000;
    if (input.targetX !== null) {
      const delta = input.targetX - s.playerX;
      // 터치는 따라가되 너무 빠르지 않게 (키보드 속도의 2배까지)
      s.playerX += Math.max(-maxStep * 2, Math.min(maxStep * 2, delta));
    } else {
      s.playerX += input.direction * maxStep;
    }
    s.playerX = clampPlayerX(s.playerX, config);
  }

  // 스폰
  s.nextSpawnMs -= dt;
  while (s.nextSpawnMs <= 0 && s.elapsedMs < config.durationMs) {
    s.items.push(spawnItem(s, rng, config));
    s.nextId += 1;
    s.nextSpawnMs += difficulty(s.elapsedMs, config).spawnInterval;
  }

  // 낙하 & 충돌
  const remaining: FallingItem[] = [];
  for (const item of s.items) {
    const moved = { ...item, y: item.y + (item.vy * dt) / 1000 };
    if (isCaught(moved, s.playerX, config)) {
      if (moved.kind === 'bomb') {
        const points = Math.max(config.points.bomb, -s.score);
        s.score += points;
        s.streak = 0;
        s.bombsHit += 1;
        s.stunnedUntilMs = s.elapsedMs + config.stunMs;
        events.push({ type: 'bomb', points, x: moved.x, y: moved.y });
      } else {
        s.streak += 1;
        s.maxStreak = Math.max(s.maxStreak, s.streak);
        const points = config.points[moved.kind] + streakBonus(s.streak, config);
        s.score += points;
        s.caught += 1;
        if (moved.kind === 'gold') s.goldCaught += 1;
        events.push({ type: 'catch', kind: moved.kind, points, x: moved.x, y: moved.y });
      }
      continue;
    }
    if (moved.y - config.itemRadius > WORLD.height) {
      if (moved.kind !== 'bomb') {
        s.streak = 0;
        s.missed += 1;
        events.push({ type: 'miss', x: moved.x });
      }
      continue;
    }
    remaining.push(moved);
  }
  s.items = remaining;

  if (s.elapsedMs >= config.durationMs) s.finished = true;
  return { state: s, events };
}
