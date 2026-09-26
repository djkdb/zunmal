/**
 * 말랑 기차 — 순수 로직 (React/DOM 무관, 시간·RNG 주입).
 *
 * 규칙 (스네이크)
 *  - 13×13 판. 파트너 말랑이(머리)가 아기 말랑이 기차를 끌고 한 칸씩 움직인다.
 *  - 사탕을 먹으면 기차 끝에 아기 말랑이가 한 마리 붙는다(길이 +1).
 *  - 벽이나 자기 기차에 부딪히면 끝. 90초가 지나도 끝(끝까지 버티면 완주 보너스).
 *  - 사탕 10점, 황금 사탕 30점. 황금 사탕은 사탕을 먹을 때 가끔 따로 나타나고 몇 초 뒤 사라진다.
 *  - 사탕(황금 포함) 5개마다 속도가 한 단계 빨라진다.
 *  - 방향 입력은 최대 2개까지 버퍼에 쌓인다. 바로 뒤로 돌기(180°)와 같은 방향은 무시한다.
 *  - 이동은 tick 단위. 렌더러는 from[i] → snake[i] 사이를 progress(0~1)로 보간해 부드럽게 그린다.
 */
import type { RNG } from '../../lib/rng';

export const GRID = 13;

export const TRAIN_CONFIG = {
  durationMs: 90_000,
  /** 시작 속도: 한 칸 이동에 걸리는 시간 (ms) */
  baseStepMs: 210,
  /** 속도 단계마다 줄어드는 시간 */
  stepMsPerLevel: 14,
  /** 가장 빠른 속도 */
  minStepMs: 110,
  /** 사탕 몇 개마다 속도 단계가 오르는지 */
  candiesPerLevel: 5,
  startLength: 3,
  points: { candy: 10, golden: 30 },
  /** 90초를 끝까지 버티면 */
  surviveBonus: 50,
  /** 일반 사탕을 먹을 때 황금 사탕이 나타날 확률 (이미 있으면 안 나옴) */
  goldenChance: 0.3,
  /** 황금 사탕이 판 위에 있는 시간 */
  goldenMs: 5000,
  /** 방향 입력 버퍼 크기 */
  maxQueuedTurns: 2,
  /** 탭 전환 등으로 생긴 큰 dt는 잘라낸다 */
  maxDtMs: 250,
} as const;

export type TrainConfig = typeof TRAIN_CONFIG;

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

export interface Golden {
  cell: Cell;
  /** 이 시각(elapsedMs)이 되면 사라진다 */
  expiresAt: number;
}

export type EndReason = 'wall' | 'self' | 'time' | 'full';

export interface TrainState {
  /** [0] = 머리(파트너), 나머지 = 아기 말랑이 */
  snake: Cell[];
  /** 직전 tick에서 각 칸이 있던 자리 (보간 시작점). snake와 길이가 같다. */
  from: Cell[];
  dir: Dir;
  /** 아직 적용하지 않은 방향 입력 */
  queue: Dir[];
  candy: Cell | null;
  golden: Golden | null;
  elapsedMs: number;
  /** 다음 tick까지 쌓인 시간 */
  accMs: number;
  /** 먹은 사탕 수 (황금 포함) */
  eaten: number;
  goldens: number;
  score: number;
  finished: boolean;
  endReason: EndReason | null;
}

export type TrainEvent =
  | { type: 'eat'; kind: 'candy' | 'golden'; cell: Cell; points: number }
  | { type: 'speedUp'; level: number }
  | { type: 'goldenSpawn'; cell: Cell }
  | { type: 'goldenExpire'; cell: Cell }
  | { type: 'crash'; reason: 'wall' | 'self'; cell: Cell }
  | { type: 'end'; reason: EndReason };

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function inBounds(c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < GRID && c.y < GRID;
}

/** 먹은 사탕 수 → 속도 단계 (0부터) */
export function speedLevel(eaten: number, config: TrainConfig = TRAIN_CONFIG): number {
  return Math.floor(Math.max(0, eaten) / config.candiesPerLevel);
}

/** 먹은 사탕 수 → 한 칸 이동 시간 (ms) */
export function stepMsFor(eaten: number, config: TrainConfig = TRAIN_CONFIG): number {
  return Math.max(config.minStepMs, config.baseStepMs - speedLevel(eaten, config) * config.stepMsPerLevel);
}

/** 기차와 다른 사탕이 없는 빈 칸 목록 (왼쪽 위부터 행 순서) */
export function freeCells(snake: readonly Cell[], blocked: readonly (Cell | null)[] = []): Cell[] {
  const taken = new Set<number>();
  for (const c of snake) taken.add(c.y * GRID + c.x);
  for (const c of blocked) if (c) taken.add(c.y * GRID + c.x);
  const out: Cell[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!taken.has(y * GRID + x)) out.push({ x, y });
    }
  }
  return out;
}

/** 빈 칸 중 하나를 무작위로 고른다. 빈 칸이 없으면 null. */
export function spawnCell(snake: readonly Cell[], blocked: readonly (Cell | null)[], rng: RNG): Cell | null {
  const free = freeCells(snake, blocked);
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(rng() * free.length))] ?? null;
}

export function createTrainState(rng: RNG, config: TrainConfig = TRAIN_CONFIG): TrainState {
  const mid = Math.floor(GRID / 2);
  const headX = Math.floor(GRID / 3);
  const snake: Cell[] = Array.from({ length: config.startLength }, (_, i) => ({ x: headX - i, y: mid }));
  return {
    snake,
    from: snake.map((c) => ({ ...c })),
    dir: 'right',
    queue: [],
    candy: spawnCell(snake, [], rng),
    golden: null,
    elapsedMs: 0,
    accMs: 0,
    eaten: 0,
    goldens: 0,
    score: 0,
    finished: config.durationMs <= 0,
    endReason: config.durationMs <= 0 ? 'time' : null,
  };
}

/**
 * 방향 입력. 마지막으로 예약된 방향(없으면 현재 방향) 기준으로
 * 같은 방향·정반대 방향은 무시하고, 버퍼가 가득 차도 무시한다.
 */
export function turn(prev: TrainState, dir: Dir, config: TrainConfig = TRAIN_CONFIG): TrainState {
  if (prev.finished) return prev;
  if (prev.queue.length >= config.maxQueuedTurns) return prev;
  const last = prev.queue[prev.queue.length - 1] ?? prev.dir;
  if (dir === last || dir === OPPOSITE[last]) return prev;
  return { ...prev, queue: [...prev.queue, dir] };
}

/** 한 칸 전진. s는 이미 복사된 상태(제자리 변경). */
function tick(s: TrainState, rng: RNG, config: TrainConfig, events: TrainEvent[]): void {
  const next = s.queue[0];
  if (next !== undefined) {
    s.dir = next;
    s.queue = s.queue.slice(1);
  }
  const head = s.snake[0];
  if (!head) return;
  const d = DELTA[s.dir];
  const nh: Cell = { x: head.x + d.x, y: head.y + d.y };

  if (!inBounds(nh)) {
    crash(s, 'wall', nh, events);
    return;
  }

  const ateCandy = s.candy !== null && sameCell(nh, s.candy);
  const ateGolden = s.golden !== null && sameCell(nh, s.golden.cell);
  const grows = ateCandy || ateGolden;
  // 자라지 않으면 꼬리 끝은 이번 tick에 비켜 주므로 부딪힘 판정에서 뺀다
  const body = grows ? s.snake : s.snake.slice(0, -1);
  if (body.some((c) => sameCell(c, nh))) {
    crash(s, 'self', nh, events);
    return;
  }

  const old = s.snake;
  const moved = [nh, ...old];
  if (!grows) moved.pop();
  s.snake = moved;
  // 새 칸 i는 old[i]에서 출발한다. 자라서 새로 붙은 꼬리는 제자리에서 시작.
  const last = old[old.length - 1] ?? nh;
  s.from = moved.map((_, i) => ({ ...(old[i] ?? last) }));

  if (grows) {
    const levelBefore = speedLevel(s.eaten, config);
    s.eaten += 1;
    if (ateGolden && s.golden) {
      s.goldens += 1;
      s.score += config.points.golden;
      events.push({ type: 'eat', kind: 'golden', cell: nh, points: config.points.golden });
      s.golden = null;
    } else {
      s.score += config.points.candy;
      events.push({ type: 'eat', kind: 'candy', cell: nh, points: config.points.candy });
      s.candy = spawnCell(s.snake, [s.golden?.cell ?? null], rng);
      if (s.candy === null) {
        finish(s, 'full', events);
        return;
      }
      if (s.golden === null && rng() < config.goldenChance) {
        const cell = spawnCell(s.snake, [s.candy], rng);
        if (cell) {
          s.golden = { cell, expiresAt: s.elapsedMs + config.goldenMs };
          events.push({ type: 'goldenSpawn', cell });
        }
      }
    }
    const levelAfter = speedLevel(s.eaten, config);
    if (levelAfter > levelBefore) events.push({ type: 'speedUp', level: levelAfter });
  }
}

function crash(s: TrainState, reason: 'wall' | 'self', cell: Cell, events: TrainEvent[]): void {
  events.push({ type: 'crash', reason, cell });
  // 부딪힌 자리에 멈춰 있도록 보간 시작점을 현재 위치로 맞춘다
  s.from = s.snake.map((c) => ({ ...c }));
  finish(s, reason, events);
}

function finish(s: TrainState, reason: EndReason, events: TrainEvent[]): void {
  s.finished = true;
  s.endReason = reason;
  s.accMs = 0;
  s.queue = [];
  events.push({ type: 'end', reason });
}

/**
 * dt(ms)만큼 진행한다: 시간 → 황금 사탕 만료 → 쌓인 시간만큼 tick → 시간 종료 판정.
 * 입력 상태는 변경하지 않고 새 상태와 이벤트를 반환한다.
 */
export function step(
  prev: TrainState,
  dtMs: number,
  rng: RNG,
  config: TrainConfig = TRAIN_CONFIG,
): { state: TrainState; events: TrainEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dt = Math.max(0, Math.min(dtMs, config.maxDtMs));
  const events: TrainEvent[] = [];
  const s: TrainState = { ...prev };
  s.elapsedMs = Math.min(config.durationMs, s.elapsedMs + dt);
  s.accMs += dt;

  if (s.golden && s.golden.expiresAt <= s.elapsedMs) {
    events.push({ type: 'goldenExpire', cell: s.golden.cell });
    s.golden = null;
  }

  let interval = stepMsFor(s.eaten, config);
  while (!s.finished && s.accMs >= interval) {
    s.accMs -= interval;
    tick(s, rng, config, events);
    interval = stepMsFor(s.eaten, config);
  }

  if (!s.finished && s.elapsedMs >= config.durationMs) {
    s.score += config.surviveBonus;
    finish(s, 'time', events);
  }
  return { state: s, events };
}

/** 현재 칸 사이 보간 진행도 (0~1). 렌더러용. */
export function progress(state: TrainState, config: TrainConfig = TRAIN_CONFIG): number {
  if (state.finished) return 1;
  return Math.max(0, Math.min(1, state.accMs / stepMsFor(state.eaten, config)));
}

/** 스와이프 이동량 → 방향. 문턱(px)보다 짧으면 null. */
export function swipeDir(dx: number, dy: number, threshold: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
