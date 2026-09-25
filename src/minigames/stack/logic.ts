/**
 * 말랑 쌓기 — 순수 시뮬레이션 (Canvas/DOM 무관, dt 주입, RNG 없음 = 완전 결정적).
 *
 * 좌표계: 논리 월드 WORLD.width × WORLD.height. 블록 x는 왼쪽 끝, w는 너비(월드 px).
 * 높이(y)는 렌더러가 층 번호로 계산하므로 로직은 가로 방향만 다룬다.
 *
 * 규칙
 *  - 탑 위에서 젤리 블록이 좌우로 왕복한다 (벽에 닿으면 튕김).
 *  - drop() 하면 아래 블록과 겹친 부분만 남고, 튀어나온 부분은 잘려서 떨어진다.
 *  - 아래 블록과 perfectTolerance(4px) 이내로 맞으면 "딱 맞음": 자르지 않고 그대로 정렬.
 *    딱 맞음이 regrowAfter(3)번 이상 이어지면 그때부터 딱 맞음마다 regrowAmount만큼 다시 넓어진다
 *    (최대 baseWidth).
 *  - 한 층 올라갈 때마다 블록이 조금씩 빨라진다 (maxSpeed까지).
 *  - 아래 블록과 전혀 겹치지 않으면 게임 오버. 45초가 지나도 종료.
 *
 * 점수
 *  - 쌓은 블록 1개당 pointsPerBlock(10점).
 *  - 딱 맞음 보너스: perfectBonus + perfectBonusStep × (연속 - 1), 최대 perfectBonusMax.
 *    → 10, 15, 20, 25, 30, 30, …
 *  - 예) 20층(딱 맞음 5번이 연속 2+3) = 200 + (10+15) + (10+15+20) = 270점.
 */

export const WORLD = { width: 320, height: 480 } as const;

export const STACK_CONFIG = {
  durationMs: 45_000,
  blockHeight: 24,
  baseWidth: 160,
  /** 한 프레임 dt 상한 (탭 전환 후 순간이동 방지) */
  maxDtMs: 50,
  /** 월드 px/초 */
  speedStart: 120,
  speedPerFloor: 6,
  maxSpeed: 300,
  /** 이 거리(월드 px) 이내면 딱 맞음 */
  perfectTolerance: 4,
  regrowAfter: 3,
  regrowAmount: 10,
  pointsPerBlock: 10,
  perfectBonus: 10,
  perfectBonusStep: 5,
  perfectBonusMax: 30,
} as const;

export type StackConfig = typeof STACK_CONFIG;

export interface Block {
  x: number;
  w: number;
}

export interface Slider extends Block {
  /** 1: 오른쪽, -1: 왼쪽 */
  dir: 1 | -1;
}

export interface StackState {
  elapsedMs: number;
  /** 탑. index 0이 바닥 블록 (파트너 색) */
  tower: Block[];
  slider: Slider;
  score: number;
  /** 쌓은 층수 (바닥 블록 제외) */
  floors: number;
  perfects: number;
  perfectStreak: number;
  maxPerfectStreak: number;
  finished: boolean;
  endReason: 'miss' | 'time' | null;
}

export type DropResult =
  | { kind: 'ignored' }
  | { kind: 'perfect'; placed: Block; points: number; streak: number; grew: boolean }
  | { kind: 'trim'; placed: Block; cut: Block; points: number }
  | { kind: 'miss'; lost: Block };

/** 층수(바닥 제외)에 따른 이동 속도 */
export function speedForFloor(floors: number, config: StackConfig = STACK_CONFIG): number {
  return Math.min(config.maxSpeed, config.speedStart + config.speedPerFloor * Math.max(0, floors));
}

/** 딱 맞음 보너스 (streak은 이번 딱 맞음을 포함한 연속 횟수, 1 이상) */
export function perfectBonus(streak: number, config: StackConfig = STACK_CONFIG): number {
  if (streak <= 0) return 0;
  return Math.min(config.perfectBonusMax, config.perfectBonus + config.perfectBonusStep * (streak - 1));
}

/**
 * 새 슬라이더. floorIndex = 이 블록이 놓일 탑 인덱스(바닥=0).
 * 홀수 층은 왼쪽 끝에서 오른쪽으로, 짝수 층은 오른쪽 끝에서 왼쪽으로 출발한다.
 */
export function spawnSlider(width: number, floorIndex: number): Slider {
  return floorIndex % 2 === 1 ? { x: 0, w: width, dir: 1 } : { x: WORLD.width - width, w: width, dir: -1 };
}

export function createStackState(config: StackConfig = STACK_CONFIG): StackState {
  const base: Block = { x: (WORLD.width - config.baseWidth) / 2, w: config.baseWidth };
  return {
    elapsedMs: 0,
    tower: [base],
    slider: spawnSlider(config.baseWidth, 1),
    score: 0,
    floors: 0,
    perfects: 0,
    perfectStreak: 0,
    maxPerfectStreak: 0,
    finished: config.durationMs <= 0,
    endReason: config.durationMs <= 0 ? 'time' : null,
  };
}

/** 슬라이더를 dt만큼 이동 (벽에서 튕김). 새 객체 반환 */
export function moveSlider(slider: Slider, distance: number): Slider {
  const max = Math.max(0, WORLD.width - slider.w);
  let x = slider.x + slider.dir * distance;
  let dir = slider.dir;
  // 한 번에 여러 번 튕길 수 있을 만큼 큰 이동도 안전하게 처리
  for (let i = 0; i < 8 && (x < 0 || x > max); i++) {
    if (x > max) {
      x = max - (x - max);
      dir = -1;
    } else if (x < 0) {
      x = -x;
      dir = 1;
    }
  }
  return { x: Math.max(0, Math.min(max, x)), w: slider.w, dir };
}

/** dt(ms)만큼 진행. 입력 상태는 변경하지 않는다. */
export function step(prev: StackState, dtMs: number, config: StackConfig = STACK_CONFIG): StackState {
  if (prev.finished) return prev;
  const dt = Math.max(0, Math.min(Number.isFinite(dtMs) ? dtMs : 0, config.maxDtMs));
  const elapsedMs = prev.elapsedMs + dt;
  const slider = moveSlider(prev.slider, (speedForFloor(prev.floors, config) * dt) / 1000);
  if (elapsedMs >= config.durationMs) {
    return { ...prev, elapsedMs: config.durationMs, slider, finished: true, endReason: 'time' };
  }
  return { ...prev, elapsedMs, slider };
}

/** 현재 슬라이더를 내려놓는다. */
export function drop(prev: StackState, config: StackConfig = STACK_CONFIG): { state: StackState; result: DropResult } {
  if (prev.finished) return { state: prev, result: { kind: 'ignored' } };
  const top = prev.tower[prev.tower.length - 1];
  if (!top) return { state: prev, result: { kind: 'ignored' } };
  const cur = prev.slider;
  const nextFloorIndex = prev.tower.length + 1; // 이번 블록이 놓인 뒤 다음 슬라이더의 층

  // 딱 맞음
  if (Math.abs(cur.x - top.x) <= config.perfectTolerance) {
    const streak = prev.perfectStreak + 1;
    let placed: Block = { x: top.x, w: top.w };
    let grew = false;
    if (streak >= config.regrowAfter && top.w < config.baseWidth) {
      const w = Math.min(config.baseWidth, top.w + config.regrowAmount);
      const center = top.x + top.w / 2;
      const x = Math.max(0, Math.min(WORLD.width - w, center - w / 2));
      placed = { x, w };
      grew = true;
    }
    const points = config.pointsPerBlock + perfectBonus(streak, config);
    const state: StackState = {
      ...prev,
      tower: [...prev.tower, placed],
      slider: spawnSlider(placed.w, nextFloorIndex),
      score: prev.score + points,
      floors: prev.floors + 1,
      perfects: prev.perfects + 1,
      perfectStreak: streak,
      maxPerfectStreak: Math.max(prev.maxPerfectStreak, streak),
    };
    return { state, result: { kind: 'perfect', placed, points, streak, grew } };
  }

  const left = Math.max(cur.x, top.x);
  const right = Math.min(cur.x + cur.w, top.x + top.w);
  const overlap = right - left;

  // 완전히 빗나감 → 게임 오버
  if (overlap <= 0) {
    const state: StackState = { ...prev, perfectStreak: 0, finished: true, endReason: 'miss' };
    return { state, result: { kind: 'miss', lost: { x: cur.x, w: cur.w } } };
  }

  const placed: Block = { x: left, w: overlap };
  // 잘린 조각: 슬라이더가 오른쪽으로 넘쳤으면 오른쪽 조각, 왼쪽으로 넘쳤으면 왼쪽 조각
  const cut: Block = cur.x > top.x ? { x: right, w: cur.w - overlap } : { x: cur.x, w: cur.w - overlap };
  const points = config.pointsPerBlock;
  const state: StackState = {
    ...prev,
    tower: [...prev.tower, placed],
    slider: spawnSlider(placed.w, nextFloorIndex),
    score: prev.score + points,
    floors: prev.floors + 1,
    perfectStreak: 0,
  };
  return { state, result: { kind: 'trim', placed, cut, points } };
}
