import { describe, expect, it } from 'vitest';
import { createSeededRng, type RNG } from '../../lib/rng';
import {
  GRID,
  TRAIN_CONFIG as C,
  createTrainState,
  freeCells,
  progress,
  sameCell,
  spawnCell,
  speedLevel,
  step,
  stepMsFor,
  swipeDir,
  turn,
  type Cell,
  type Dir,
  type TrainEvent,
  type TrainState,
} from './logic';

const zeroRng: RNG = () => 0;

/** 사탕·황금 사탕을 원하는 곳에 둔 상태 */
function withBoard(state: TrainState, patch: Partial<TrainState>): TrainState {
  return { ...state, ...patch };
}

/** 기차를 원하는 칸들에 둔 상태 (보간 시작점도 같은 칸) */
function withSnake(state: TrainState, snake: Cell[], dir: Dir): TrainState {
  return { ...state, snake, from: snake.map((c) => ({ ...c })), dir, queue: [] };
}

/** 정확히 n칸 움직일 만큼 시간을 보낸다 (한 번에 maxDt 이하로 쪼갬) */
function advanceTicks(state: TrainState, n: number, rng: RNG = zeroRng): { state: TrainState; events: TrainEvent[] } {
  let s = state;
  const events: TrainEvent[] = [];
  for (let i = 0; i < n && !s.finished; i++) {
    const out = step(s, stepMsFor(s.eaten) - s.accMs, rng);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

/** 사탕이 절대 길에 걸리지 않도록 구석에 둔 상태 */
function quiet(state: TrainState = createTrainState(zeroRng)): TrainState {
  return withBoard(state, { candy: { x: GRID - 1, y: 0 }, golden: null });
}

describe('말랑 기차 — 시작 상태', () => {
  it('판 가운데 줄에 길이 3, 오른쪽을 보고 시작한다', () => {
    const s = createTrainState(createSeededRng(1));
    expect(s.snake).toHaveLength(C.startLength);
    expect(s.dir).toBe('right');
    const [head, second] = s.snake;
    expect(head).toBeDefined();
    expect(second && head && second.x).toBe((head?.x ?? 0) - 1);
    expect(s.snake.every((c) => c.y === Math.floor(GRID / 2))).toBe(true);
    expect(s.from).toEqual(s.snake);
  });

  it('첫 사탕은 기차 위가 아니다', () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = createTrainState(createSeededRng(seed));
      expect(s.candy).not.toBeNull();
      expect(s.snake.some((c) => s.candy && sameCell(c, s.candy))).toBe(false);
    }
  });
});

describe('말랑 기차 — 방향 입력', () => {
  it('정반대(180°)와 같은 방향은 무시한다', () => {
    const s = quiet();
    expect(turn(s, 'left')).toBe(s);
    expect(turn(s, 'right')).toBe(s);
    expect(turn(s, 'up').queue).toEqual(['up']);
  });

  it('예약된 마지막 방향 기준으로 반전을 막는다 (위 예약 후 아래는 무시)', () => {
    const s = turn(quiet(), 'up');
    expect(turn(s, 'down')).toBe(s);
    expect(turn(s, 'left').queue).toEqual(['up', 'left']);
  });

  it('최대 2개까지만 버퍼에 쌓는다', () => {
    let s = quiet();
    s = turn(s, 'up');
    s = turn(s, 'left');
    const full = s;
    expect(turn(full, 'down')).toBe(full);
    expect(full.queue).toHaveLength(C.maxQueuedTurns);
  });

  it('빠른 두 번 꺾기(위→왼쪽)가 두 tick에 걸쳐 차례로 적용된다', () => {
    let s = withSnake(quiet(), [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }], 'right');
    s = turn(turn(s, 'up'), 'left');
    s = advanceTicks(s, 1).state;
    expect(s.snake[0]).toEqual({ x: 6, y: 5 });
    expect(s.dir).toBe('up');
    s = advanceTicks(s, 1).state;
    expect(s.snake[0]).toEqual({ x: 5, y: 5 });
    expect(s.dir).toBe('left');
    expect(s.queue).toEqual([]);
  });

  it('끝난 뒤에는 입력을 받지 않는다', () => {
    const s = { ...quiet(), finished: true };
    expect(turn(s, 'up')).toBe(s);
  });
});

describe('말랑 기차 — 이동과 보간', () => {
  it('한 칸 시간이 차기 전에는 움직이지 않고 progress만 오른다', () => {
    const s0 = quiet();
    const half = step(s0, C.baseStepMs / 2, zeroRng).state;
    expect(half.snake).toEqual(s0.snake);
    expect(progress(half)).toBeCloseTo(0.5, 5);
  });

  it('한 tick 뒤 몸통이 한 칸씩 따라오고 from은 직전 자리다', () => {
    const s0 = quiet();
    const s1 = advanceTicks(s0, 1).state;
    expect(s1.snake[0]).toEqual({ x: (s0.snake[0]?.x ?? 0) + 1, y: s0.snake[0]?.y });
    expect(s1.snake[1]).toEqual(s0.snake[0]);
    expect(s1.snake[2]).toEqual(s0.snake[1]);
    expect(s1.from).toEqual(s0.snake);
    expect(s1.snake).toHaveLength(s0.snake.length);
  });

  it('입력 상태를 변경하지 않는다', () => {
    const s0 = quiet();
    const copy = JSON.parse(JSON.stringify(s0)) as TrainState;
    advanceTicks(s0, 3);
    expect(s0).toEqual(copy);
  });

  it('큰 dt는 maxDtMs로 잘린다 (탭 전환 후 순간이동 방지)', () => {
    const s = step(quiet(), 10_000, zeroRng).state;
    expect(s.elapsedMs).toBe(C.maxDtMs);
  });
});

describe('말랑 기차 — 사탕과 성장', () => {
  it('사탕을 먹으면 길이 +1, 10점, 새 꼬리는 제자리에서 출발한다', () => {
    let s = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
    s = withBoard(s, { candy: { x: 6, y: 6 } });
    const out = advanceTicks(s, 1, () => 0.99);
    expect(out.state.snake).toHaveLength(4);
    expect(out.state.score).toBe(C.points.candy);
    expect(out.state.eaten).toBe(1);
    expect(out.state.snake[3]).toEqual({ x: 3, y: 6 });
    expect(out.state.from[3]).toEqual({ x: 3, y: 6 });
    expect(out.events).toContainEqual({ type: 'eat', kind: 'candy', cell: { x: 6, y: 6 }, points: C.points.candy });
  });

  it('새 사탕은 절대 기차 위에 나오지 않는다 (여러 시드)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = createSeededRng(seed);
      let s = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
      s = withBoard(s, { candy: { x: 6, y: 6 } });
      s = advanceTicks(s, 1, rng).state;
      const candy = s.candy;
      expect(candy).not.toBeNull();
      expect(s.snake.some((c) => candy && sameCell(c, candy))).toBe(false);
      if (s.golden && candy) expect(sameCell(s.golden.cell, candy)).toBe(false);
    }
  });

  it('spawnCell은 빈 칸만 고르고, 빈 칸이 없으면 null', () => {
    const all: Cell[] = [];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) all.push({ x, y });
    expect(spawnCell(all, [], zeroRng)).toBeNull();
    const oneLeft = all.filter((c) => !(c.x === 7 && c.y === 3));
    expect(spawnCell(oneLeft, [], () => 0.999)).toEqual({ x: 7, y: 3 });
    expect(freeCells(oneLeft, [{ x: 7, y: 3 }])).toEqual([]);
  });

  it('사탕을 먹을 때 확률에 따라 황금 사탕이 나타나고, 먹으면 30점', () => {
    let s = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
    s = withBoard(s, { candy: { x: 6, y: 6 } });
    // rng 0 → 황금 등장 판정 통과 (0 < goldenChance)
    const out = advanceTicks(s, 1, zeroRng);
    expect(out.state.golden).not.toBeNull();
    expect(out.events.some((e) => e.type === 'goldenSpawn')).toBe(true);

    let g = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
    g = withBoard(g, { golden: { cell: { x: 6, y: 6 }, expiresAt: 99_999 } });
    const ate = advanceTicks(g, 1).state;
    expect(ate.score).toBe(C.points.golden);
    expect(ate.goldens).toBe(1);
    expect(ate.golden).toBeNull();
    expect(ate.snake).toHaveLength(4);
  });

  it('rng가 확률보다 크면 황금 사탕은 나오지 않는다', () => {
    let s = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
    s = withBoard(s, { candy: { x: 6, y: 6 } });
    expect(advanceTicks(s, 1, () => 0.99).state.golden).toBeNull();
  });

  it('황금 사탕은 goldenMs가 지나면 사라진다', () => {
    const s = withBoard(quiet(), { golden: { cell: { x: 0, y: 0 }, expiresAt: 100 } });
    const a = step(s, 90, zeroRng);
    expect(a.state.golden).not.toBeNull();
    const b = step(a.state, 20, zeroRng);
    expect(b.state.golden).toBeNull();
    expect(b.events).toContainEqual({ type: 'goldenExpire', cell: { x: 0, y: 0 } });
  });

  it('판이 가득 차 새 사탕을 둘 곳이 없으면 끝난다', () => {
    // 맨 아랫줄 오른쪽 끝 한 칸만 비우고, 머리가 그 옆에서 사탕을 먹게 한다
    const snake: Cell[] = [];
    for (let y = 0; y < GRID; y++) {
      const row = y % 2 === 0 ? [...Array(GRID).keys()] : [...Array(GRID).keys()].reverse();
      for (const x of row) snake.push({ x, y });
    }
    // 뱀 모양 경로의 끝(마지막 줄) — 마지막 칸을 사탕으로 비운다
    const last = snake.pop();
    expect(last).toBeDefined();
    const path = snake.reverse(); // 머리 = 경로 끝 바로 앞 칸
    const head = path[0];
    expect(head).toBeDefined();
    const dir: Dir = last && head && last.x > head.x ? 'right' : 'left';
    let s = withSnake(quiet(), path, dir);
    s = withBoard(s, { candy: last ?? null });
    const out = advanceTicks(s, 1);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('full');
  });
});

describe('말랑 기차 — 충돌', () => {
  it('벽에 부딪히면 끝나고, 기차는 그 자리에 멈춘다', () => {
    const s0 = withSnake(quiet(), [{ x: GRID - 1, y: 6 }, { x: GRID - 2, y: 6 }, { x: GRID - 3, y: 6 }], 'right');
    const out = advanceTicks(s0, 1);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('wall');
    expect(out.state.snake).toEqual(s0.snake);
    expect(out.state.from).toEqual(s0.snake);
    expect(out.events.some((e) => e.type === 'crash' && e.reason === 'wall')).toBe(true);
    expect(progress(out.state)).toBe(1);
  });

  it('위쪽 벽도 벽이다 (반대편으로 넘어가지 않음)', () => {
    const s0 = withSnake(quiet(), [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], 'up');
    expect(advanceTicks(s0, 1).state.endReason).toBe('wall');
  });

  it('자기 몸에 부딪히면 끝난다', () => {
    // ㄷ자로 말린 기차: 머리가 아래로 가면 몸통에 부딪힌다
    const snake: Cell[] = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
    ];
    const s0 = withSnake(quiet(), snake, 'left');
    const s1 = turn(s0, 'down');
    const out = advanceTicks(s1, 1);
    expect(out.state.endReason).toBe('self');
  });

  it('꼬리 끝이 비켜 주는 칸으로는 들어갈 수 있다', () => {
    // 2×2로 도는 길이 4 기차: 머리가 방금 꼬리가 있던 칸으로 들어간다
    const snake: Cell[] = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    const s0 = withSnake(quiet(), snake, 'left');
    const out = advanceTicks(turn(s0, 'down'), 1);
    expect(out.state.finished).toBe(false);
    expect(out.state.snake[0]).toEqual({ x: 5, y: 6 });
  });

  it('사탕을 먹어 자라는 순간에는 꼬리 칸도 막혀 있다', () => {
    const snake: Cell[] = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    // 꼬리 칸에 황금 사탕이 겹쳐 있는 가상의 상황: 자라면서 꼬리가 남으므로 부딪힌다
    let s0 = withSnake(quiet(), snake, 'left');
    s0 = withBoard(s0, { golden: { cell: { x: 5, y: 6 }, expiresAt: 99_999 } });
    expect(advanceTicks(turn(s0, 'down'), 1).state.endReason).toBe('self');
  });
});

describe('말랑 기차 — 속도와 시간', () => {
  it('사탕 5개마다 속도 단계가 오르고, 최저 minStepMs에서 멈춘다', () => {
    expect(speedLevel(0)).toBe(0);
    expect(speedLevel(4)).toBe(0);
    expect(speedLevel(5)).toBe(1);
    expect(stepMsFor(0)).toBe(C.baseStepMs);
    expect(stepMsFor(5)).toBe(C.baseStepMs - C.stepMsPerLevel);
    expect(stepMsFor(10)).toBeLessThan(stepMsFor(5));
    expect(stepMsFor(1000)).toBe(C.minStepMs);
    for (let n = 1; n < 80; n++) expect(stepMsFor(n)).toBeLessThanOrEqual(stepMsFor(n - 1));
  });

  it('5번째 사탕에서 speedUp 이벤트', () => {
    let s = withSnake(quiet(), [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }], 'right');
    s = withBoard(s, { candy: { x: 6, y: 6 }, eaten: 4 });
    const out = advanceTicks(s, 1, () => 0.99);
    expect(out.events).toContainEqual({ type: 'speedUp', level: 1 });
  });

  it('90초를 버티면 끝나고 완주 보너스를 받는다', () => {
    // 가운데서 네모로 빙빙 돌기: 한 변 4칸
    let s = withSnake(quiet(), [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], 'right');
    const loop: Dir[] = ['down', 'left', 'up', 'right'];
    let k = 0;
    let moves = 0;
    let guard = 0;
    while (!s.finished && guard++ < 100_000) {
      const before = s.snake[0];
      s = step(s, 16, zeroRng).state;
      if (s.snake[0] !== before) {
        moves++;
        if (moves % 4 === 0) {
          const d = loop[k++ % 4];
          if (d) s = turn(s, d);
        }
      }
    }
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe('time');
    expect(s.elapsedMs).toBe(C.durationMs);
    expect(s.score).toBe(C.surviveBonus);
  });

  it('끝난 상태에서 step은 아무것도 바꾸지 않는다', () => {
    const s = { ...quiet(), finished: true };
    const out = step(s, 100, zeroRng);
    expect(out.state).toBe(s);
    expect(out.events).toEqual([]);
  });
});

describe('말랑 기차 — 스와이프', () => {
  it('문턱보다 짧으면 null, 긴 축 방향을 고른다', () => {
    expect(swipeDir(5, 3, 20)).toBeNull();
    expect(swipeDir(30, 10, 20)).toBe('right');
    expect(swipeDir(-30, 10, 20)).toBe('left');
    expect(swipeDir(10, -30, 20)).toBe('up');
    expect(swipeDir(-10, 40, 20)).toBe('down');
  });
});

// ── 봇 시뮬레이션: 결정적 재현 + 점수 범위 감각 ─────────────────

/** 사탕 쪽으로 가되 안전한 방향만 고르는 단순 봇. mistake 확률로 무작위로 꺾는다. */
function playBot(seed: number, mistake: number): TrainState {
  const rng = createSeededRng(seed);
  const botRng = createSeededRng(seed ^ 0x5bd1e995);
  let s = createTrainState(rng);
  const dirs: Dir[] = ['up', 'down', 'left', 'right'];
  const delta: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  let lastHead = s.snake[0];
  let guard = 0;
  while (!s.finished && guard++ < 100_000) {
    const head = s.snake[0];
    if (head && head !== lastHead) {
      lastHead = head;
      const target = s.golden?.cell ?? s.candy;
      const safe = dirs.filter((d) => {
        const n = { x: head.x + delta[d].x, y: head.y + delta[d].y };
        return n.x >= 0 && n.y >= 0 && n.x < GRID && n.y < GRID && !s.snake.slice(0, -1).some((c) => sameCell(c, n));
      });
      let pick: Dir | undefined;
      if (botRng() < mistake) pick = dirs[Math.floor(botRng() * 4)];
      else if (target) {
        pick = [...safe].sort((a, b) => {
          const da = Math.abs(head.x + delta[a].x - target.x) + Math.abs(head.y + delta[a].y - target.y);
          const db = Math.abs(head.x + delta[b].x - target.x) + Math.abs(head.y + delta[b].y - target.y);
          return da - db;
        })[0];
      }
      if (pick) s = turn(s, pick);
    }
    s = step(s, 16, rng).state;
  }
  return s;
}

describe('말랑 기차 — 봇 플레이', () => {
  it('같은 시드면 같은 결과 (결정적)', () => {
    expect(playBot(7, 0.02)).toEqual(playBot(7, 0.02));
  });

  it('점수는 항상 0 이상이고, 사탕 수와 일치한다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = playBot(seed, 0.03);
      expect(s.finished).toBe(true);
      const bonus = s.endReason === 'time' ? C.surviveBonus : 0;
      expect(s.score).toBe((s.eaten - s.goldens) * C.points.candy + s.goldens * C.points.golden + bonus);
      expect(s.snake.length).toBe(C.startLength + s.eaten);
    }
  });
});
