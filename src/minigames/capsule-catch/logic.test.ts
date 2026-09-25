import { describe, expect, it } from 'vitest';
import { createSeededRng, type RNG } from '../../lib/rng';
import {
  CAPSULE_CATCH_CONFIG as C,
  WORLD,
  clampPlayerX,
  createCatchState,
  difficulty,
  isCaught,
  stepCatch,
  streakBonus,
  type CatchInput,
  type CatchState,
  type FallingItem,
} from './logic';

const idle: CatchInput = { direction: 0, targetX: null };
const rng0: RNG = () => 0.5;

function withItem(state: CatchState, item: Partial<FallingItem>): CatchState {
  return {
    ...state,
    nextSpawnMs: 99_999,
    items: [{ id: 1, kind: 'capsule', x: state.playerX, y: C.playerY - 40, vy: 200, hue: 0, ...item }],
  };
}

function run(state: CatchState, ms: number, input: CatchInput = idle, rng: RNG = rng0) {
  let s = state;
  const events = [];
  for (let t = 0; t < ms; t += 16) {
    const out = stepCatch(s, 16, input, rng);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

describe('캡슐 받기 로직', () => {
  it('플레이어는 화면 밖으로 나가지 않는다', () => {
    expect(clampPlayerX(-100)).toBe(C.playerWidth / 2);
    expect(clampPlayerX(9999)).toBe(WORLD.width - C.playerWidth / 2);
    const { state } = run(createCatchState(), 3000, { direction: -1, targetX: null });
    expect(state.playerX).toBe(C.playerWidth / 2);
  });

  it('터치 목표 위치로 이동한다', () => {
    const { state } = run({ ...createCatchState(), nextSpawnMs: 99_999 }, 1000, { direction: 0, targetX: 80 });
    expect(state.playerX).toBeCloseTo(80, 0);
  });

  it('캡슐을 받으면 점수와 연속 기록 증가', () => {
    const { state, events } = run(withItem(createCatchState(), { kind: 'capsule' }), 500);
    expect(events).toContainEqual(expect.objectContaining({ type: 'catch', kind: 'capsule', points: C.points.capsule }));
    expect(state.score).toBe(C.points.capsule);
    expect(state.streak).toBe(1);
    expect(state.items).toHaveLength(0);
  });

  it('황금 캡슐은 더 높은 점수', () => {
    const { state } = run(withItem(createCatchState(), { kind: 'gold' }), 500);
    expect(state.score).toBe(C.points.gold);
    expect(state.goldCaught).toBe(1);
  });

  it('폭탄: 감점(0 미만 불가), 연속 초기화, 기절', () => {
    const base = { ...createCatchState(), score: 15, streak: 7 };
    const { state } = run(withItem(base, { kind: 'bomb' }), 300);
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.bombsHit).toBe(1);
    expect(state.stunnedUntilMs).toBeGreaterThan(0);
    // 기절 중에는 움직이지 않음
    const before = state.playerX;
    const moved = stepCatch(state, 16, { direction: 1, targetX: null }, rng0).state;
    expect(moved.playerX).toBe(before);
  });

  it('캡슐을 놓치면 연속 기록 초기화, 폭탄은 놓쳐도 괜찮다', () => {
    const far = { x: 20, y: WORLD.height - 20 };
    const start = { ...createCatchState(), playerX: WORLD.width - 40, streak: 4 };
    const miss = run(withItem(start, { kind: 'capsule', ...far }), 400);
    expect(miss.state.streak).toBe(0);
    expect(miss.state.missed).toBe(1);
    const bomb = run(withItem(start, { kind: 'bomb', ...far }), 400);
    expect(bomb.state.streak).toBe(4);
    expect(bomb.state.missed).toBe(0);
  });

  it('연속 보너스', () => {
    expect(streakBonus(4)).toBe(0);
    expect(streakBonus(5)).toBe(C.streakBonus);
    expect(streakBonus(1000)).toBe(C.maxStreakBonus);
  });

  it('충돌 판정은 바구니 폭 안에서만', () => {
    const item: FallingItem = { id: 1, kind: 'capsule', x: 100, y: C.playerY - C.playerHeight / 2, vy: 0, hue: 0 };
    expect(isCaught(item, 100)).toBe(true);
    expect(isCaught(item, 100 + C.playerWidth)).toBe(false);
    expect(isCaught({ ...item, y: 50 }, 100)).toBe(false);
  });

  it('시간이 지날수록 어려워진다', () => {
    const a = difficulty(0);
    const b = difficulty(C.durationMs);
    expect(b.spawnInterval).toBeLessThan(a.spawnInterval);
    expect(b.fallSpeed).toBeGreaterThan(a.fallSpeed);
    expect(b.bombChance).toBeGreaterThan(a.bombChance);
  });

  it('30초 후 종료되고 이후 step은 변화 없음', () => {
    const { state } = run(createCatchState(), C.durationMs + 100, idle, createSeededRng(1));
    expect(state.finished).toBe(true);
    const again = stepCatch(state, 16, idle, rng0);
    expect(again.state).toBe(state);
  });

  it('큰 dt는 잘라서 처리한다', () => {
    const out = stepCatch(createCatchState(), 10_000, idle, rng0);
    expect(out.state.elapsedMs).toBe(50);
  });

  it('완벽하게 받는 봇은 합리적인 점수를 얻는다', () => {
    const rng = createSeededRng(42);
    let s = createCatchState();
    while (!s.finished) {
      // 가장 낮은(가장 먼저 떨어질) 캡슐을 쫓고 폭탄은 무시하는 단순 봇
      const target = s.items.filter((i) => i.kind !== 'bomb').sort((a, b) => b.y - a.y)[0];
      s = stepCatch(s, 16, { direction: 0, targetX: target ? target.x : null }, rng).state;
    }
    expect(s.caught).toBeGreaterThan(10);
    expect(s.score).toBeGreaterThan(200);
    expect(s.score).toBeLessThan(2000);
  });
});
