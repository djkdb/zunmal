import { describe, expect, it } from 'vitest';
import { createSeededRng, type RNG } from '../../lib/rng';
import {
  MALANG_JUMP_CONFIG as C,
  WORLD,
  botDirection,
  computeScore,
  createJumpState,
  landsOn,
  stepJump,
  wrapX,
  type JumpEvent,
  type JumpInput,
  type JumpState,
  type Platform,
} from './logic';

const idle: JumpInput = { direction: 0 };
const rng0: RNG = () => 0.5;

function platform(p: Partial<Platform>): Platform {
  return { id: 100, kind: 'normal', x: WORLD.width / 2, y: 200, vx: 0, broken: false, ...p };
}

/** 발판/사탕을 직접 지정한 상태 (자동 생성 없음) */
function scene(over: Partial<JumpState>): JumpState {
  return {
    ...createJumpState(rng0),
    platforms: [],
    candies: [],
    nextPlatformY: 1e9,
    ...over,
  };
}

function run(state: JumpState, ms: number, input: JumpInput = idle, rng: RNG = rng0) {
  let s = state;
  const events: JumpEvent[] = [];
  for (let t = 0; t < ms && !s.finished; t += 16) {
    const out = stepJump(s, 16, input, rng);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

function botRun(seed: number, noise = 0) {
  const rng = createSeededRng(seed);
  const brng = createSeededRng(seed * 7919);
  let s = createJumpState(rng);
  let dir: -1 | 0 | 1 = 0;
  let acc = 0;
  while (!s.finished) {
    acc += 16;
    if (acc >= 120) {
      // 사람의 반응 속도처럼 120ms마다 판단, noise 확률로 엉뚱한 방향
      acc = 0;
      dir = brng() < noise ? (brng() < 0.5 ? -1 : 1) : botDirection(s);
    }
    s = stepJump(s, 16, { direction: dir }, rng).state;
  }
  return s;
}

describe('말랑 점프 로직', () => {
  it('시작 상태: 발판 위에서 튀어 오르고, 화면 위까지 발판이 채워져 있다', () => {
    const s = createJumpState(createSeededRng(1));
    expect(s.vy).toBe(C.jumpVelocity);
    expect(s.finished).toBe(false);
    const top = Math.max(...s.platforms.map((p) => p.y));
    expect(top).toBeGreaterThan(WORLD.height);
  });

  it('올라가는 중에는 발판을 통과하고, 떨어질 때만 튄다', () => {
    // 발판 바로 아래에서 위로 올라가는 중
    const rising = scene({ y: 190, vy: 600, platforms: [platform({ y: 200 })] });
    const up = run(rising, 200);
    expect(up.events.some((e) => e.type === 'bounce')).toBe(false);
    expect(up.state.y).toBeGreaterThan(200);
    // 발판 바로 위에서 떨어지는 중
    const falling = scene({ y: 203, vy: -300, platforms: [platform({ y: 200 })] });
    const out = stepJump(falling, 16, idle, rng0);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'bounce', kind: 'normal' }));
    expect(out.state.y).toBe(200);
    expect(out.state.vy).toBe(C.jumpVelocity);
    expect(out.state.bounces).toBe(1);
  });

  it('발판 옆으로 벗어나 있으면 착지하지 않는다', () => {
    const p = platform({ x: 60, y: 200 });
    expect(landsOn(205, 195, -300, 60, p)).toBe(true);
    expect(landsOn(205, 195, -300, 200, p)).toBe(false);
    expect(landsOn(205, 195, 300, 60, p)).toBe(false);
  });

  it('스프링 발판은 훨씬 높이 튀어 오른다', () => {
    const s = scene({ y: 203, vy: -300, platforms: [platform({ kind: 'spring', y: 200 })] });
    const out = stepJump(s, 16, idle, rng0);
    expect(out.state.vy).toBe(C.springVelocity);
    expect(out.state.springs).toBe(1);
    expect(C.springVelocity).toBeGreaterThan(C.jumpVelocity * 1.4);
  });

  it('부서지는 발판은 한 번 밟으면 부서져 떨어지고, 다시 밟을 수 없다', () => {
    const s = scene({ y: 203, vy: -300, platforms: [platform({ kind: 'crumble', y: 200 })] });
    const first = stepJump(s, 16, idle, rng0).state;
    const broken = first.platforms[0];
    expect(broken?.broken).toBe(true);
    // 한 번 더 떨어져도 착지하지 않는다
    const again = scene({ ...first, y: 203, vy: -300, bounces: 0 });
    const out = stepJump(again, 16, idle, rng0);
    expect(out.events.some((e) => e.type === 'bounce')).toBe(false);
    expect(out.state.platforms[0]!.y).toBeLessThan(broken!.y);
  });

  it('화면 좌우 끝을 넘으면 반대편으로 나온다', () => {
    expect(wrapX(-10)).toBe(WORLD.width - 10);
    expect(wrapX(WORLD.width + 5)).toBe(5);
    const s = scene({ x: WORLD.width - 2, vx: C.moveSpeed, y: 300, vy: 300 });
    const right = stepJump(s, 16, { direction: 1 }, rng0).state;
    expect(right.x).toBeGreaterThanOrEqual(0);
    expect(right.x).toBeLessThan(10);
    const s2 = scene({ x: 2, vx: -C.moveSpeed, y: 300, vy: 300 });
    const left = stepJump(s2, 16, { direction: -1 }, rng0).state;
    expect(left.x).toBeGreaterThan(WORLD.width - 10);
  });

  it('카메라와 점수는 절대 내려가지 않는다', () => {
    const rng = createSeededRng(3);
    let s = createJumpState(rng);
    let prevCam = s.cameraY;
    let prevScore = s.score;
    let prevMax = s.maxHeight;
    for (let i = 0; i < 2000 && !s.finished; i++) {
      s = stepJump(s, 16, { direction: botDirection(s) }, rng).state;
      expect(s.cameraY).toBeGreaterThanOrEqual(prevCam);
      expect(s.score).toBeGreaterThanOrEqual(prevScore);
      expect(s.maxHeight).toBeGreaterThanOrEqual(prevMax);
      prevCam = s.cameraY;
      prevScore = s.score;
      prevMax = s.maxHeight;
    }
    expect(s.cameraY).toBeGreaterThan(0);
  });

  it('점수 = 높이 점수 + 사탕 점수, 사탕을 먹으면 사라진다', () => {
    expect(computeScore(1234, 3)).toBe(Math.floor(1234 / C.heightPerPoint) + 3 * C.candyPoints);
    expect(computeScore(-50, 0)).toBe(0);
    const s = scene({ y: 300, vy: 0, candies: [{ id: 9, x: WORLD.width / 2, y: 300 + C.playerRadius, hue: 0 }] });
    const out = stepJump(s, 16, idle, rng0);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'candy', points: C.candyPoints }));
    expect(out.state.candiesCollected).toBe(1);
    expect(out.state.candies).toHaveLength(0);
  });

  it('화면 아래로 떨어지면 끝난다', () => {
    const s = scene({ y: 300, vy: 0, cameraY: 200 });
    const { state, events } = run(s, 3000);
    expect(state.finished).toBe(true);
    expect(state.endReason).toBe('fall');
    expect(events.filter((e) => e.type === 'fall')).toHaveLength(1);
    // 끝난 뒤에는 더 진행하지 않는다
    expect(stepJump(state, 16, idle, rng0).state).toBe(state);
  });

  it('제한 시간이 지나면 끝난다', () => {
    const s = { ...createJumpState(rng0), elapsedMs: C.durationMs - 10 };
    const out = stepJump(s, 16, idle, rng0);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('time');
    expect(out.events).toContainEqual({ type: 'timeUp' });
  });

  it('큰 dt는 잘라서 순간이동을 막는다', () => {
    const s = createJumpState(createSeededRng(5));
    const big = stepJump(s, 5000, idle, createSeededRng(9)).state;
    const capped = stepJump(s, C.maxDtMs, idle, createSeededRng(9)).state;
    expect(big.elapsedMs).toBe(C.maxDtMs);
    expect(big.y).toBeCloseTo(capped.y, 6);
    expect(stepJump(s, -20, idle, rng0).state.elapsedMs).toBe(0);
  });

  it('발판 간격은 일반 점프로 닿을 수 있는 높이를 넘지 않는다', () => {
    const apex = (C.jumpVelocity * C.jumpVelocity) / (2 * C.gravity);
    expect(C.gapMax).toBeLessThan(apex - 15);
    const rng = createSeededRng(11);
    let s = createJumpState(rng);
    // 카메라를 강제로 끌어올려 높은 곳의 발판도 생성
    s = stepJump({ ...s, y: 12_000, vy: 0, cameraY: 12_000 - WORLD.height * 0.5 }, 16, idle, rng).state;
    const ys = s.platforms.filter((p) => !p.broken).map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeLessThanOrEqual(C.gapMax + 1e-6);
  });

  it('같은 시드면 같은 결과 (결정적)', () => {
    const a = botRun(42, 0.2);
    const b = botRun(42, 0.2);
    expect(a.score).toBe(b.score);
    expect(a.elapsedMs).toBe(b.elapsedMs);
    expect(a.x).toBe(b.x);
    expect(botRun(43, 0.2).elapsedMs).not.toBe(a.elapsedMs);
  });

  it('자동 조종 플레이의 점수가 합리적인 범위', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const strong = seeds.map((seed) => botRun(seed).score);
    const casual = seeds.map((seed) => botRun(seed, 0.25).score);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // 잘하는 플레이: 수백 점, 60초 안에 무한히 커지지 않음
    expect(avg(strong)).toBeGreaterThan(500);
    expect(Math.max(...strong)).toBeLessThan(2000);
    // 보통 플레이: 잘하는 플레이보다 낮지만 0은 아님
    expect(avg(casual)).toBeGreaterThan(80);
    expect(avg(casual)).toBeLessThan(avg(strong));
  });
});
