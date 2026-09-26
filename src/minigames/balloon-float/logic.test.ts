import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../lib/rng';
import {
  BALLOON_CONFIG as C,
  PLAYER_X,
  WORLD,
  botShouldFlap,
  ceilingY,
  circleRectHit,
  computeScore,
  createBalloonState,
  difficulty,
  flap,
  gapCenterRange,
  hitsPillar,
  nextGapCenter,
  spawnPillar,
  step,
  type BalloonEvent,
  type BalloonState,
  type Pillar,
} from './logic';

const FRAME = 16;

/** 기둥·별 없는 빈 하늘에서 출발한 상태 (물리만 볼 때) */
function emptySky(seed = 1): BalloonState {
  const s = createBalloonState(createSeededRng(seed));
  return { ...s, waiting: false, pillars: [], stars: [], nextPillarX: 1e9 };
}

function pillarAt(x: number, gapTop: number, gapBottom: number): Pillar {
  return { id: 99, kind: 'cane', x, gapTop, gapBottom, passed: false };
}

function run(s: BalloonState, ms: number, seed = 7, bot = false) {
  const rng = createSeededRng(seed);
  const events: BalloonEvent[] = [];
  let state = s;
  for (let t = 0; t < ms && !state.finished; t += FRAME) {
    if (bot && botShouldFlap(state)) state = flap(state);
    const out = step(state, FRAME, rng);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

describe('풍선 말랑 — 물리', () => {
  it('첫 입력 전에는 떠 있고 시간이 흐르지 않는다', () => {
    const s0 = createBalloonState(createSeededRng(1));
    const { state } = run(s0, 1000);
    expect(state.waiting).toBe(true);
    expect(state.y).toBe(s0.y);
    expect(state.elapsedMs).toBe(0);
    expect(state.pillars[0]?.x).toBe(s0.pillars[0]?.x);
  });

  it('입력이 없어도 autoStartMs 뒤에는 출발한다', () => {
    const s0 = createBalloonState(createSeededRng(1));
    const { state } = run(s0, C.autoStartMs + 200);
    expect(state.waiting).toBe(false);
    expect(state.elapsedMs).toBeGreaterThan(0);
  });

  it('누르면 위로, 가만히 두면 중력으로 아래로 간다', () => {
    const s = flap(emptySky());
    expect(s.vy).toBe(-C.flapVelocity);
    const up = step(s, FRAME, createSeededRng(1)).state;
    expect(up.y).toBeLessThan(s.y);
    const { state: down } = run(emptySky(), 400);
    expect(down.y).toBeGreaterThan(emptySky().y);
  });

  it('낙하 속도는 maxFallSpeed를 넘지 않는다', () => {
    let s = { ...emptySky(), y: 100 };
    const rng = createSeededRng(1);
    for (let i = 0; i < 30; i++) {
      s = step(s, 40, rng).state;
      expect(s.vy).toBeLessThanOrEqual(C.maxFallSpeed);
    }
  });

  it('풍선이 하나면 더 빨리 떨어진다', () => {
    const two = step({ ...emptySky(), vy: 0 }, 30, createSeededRng(1)).state;
    const one = step({ ...emptySky(), vy: 0, balloons: 1 }, 30, createSeededRng(1)).state;
    expect(one.vy).toBeGreaterThan(two.vy);
  });

  it('천장을 넘지 않는다 (풍선 판정점이 화면 안)', () => {
    let s = emptySky();
    const rng = createSeededRng(1);
    for (let i = 0; i < 120; i++) s = step(flap(s), FRAME, rng).state;
    expect(s.y).toBeGreaterThanOrEqual(ceilingY());
    expect(s.y + C.balloonOffsetY - C.balloonRadius).toBeGreaterThanOrEqual(0);
  });

  it('dt는 maxDtMs로 잘린다 (탭 전환 뒤 순간이동 방지)', () => {
    const a = step(emptySky(), 5000, createSeededRng(1)).state;
    expect(a.elapsedMs).toBe(C.maxDtMs);
  });

  it('flap은 원래 상태를 바꾸지 않고, 끝난 뒤에는 무시된다', () => {
    const s = emptySky();
    const y = s.vy;
    flap(s);
    expect(s.vy).toBe(y);
    const done = { ...s, finished: true };
    expect(flap(done)).toBe(done);
  });
});

describe('풍선 말랑 — 충돌', () => {
  it('circleRectHit: 모서리·변·안쪽·바깥', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(circleRectHit(5, 5, 1, r)).toBe(true);
    expect(circleRectHit(13, 5, 4, r)).toBe(true);
    expect(circleRectHit(15, 5, 4, r)).toBe(false);
    // 모서리 대각선: (13,13)까지 거리 √18 ≈ 4.24
    expect(circleRectHit(13, 13, 4, r)).toBe(false);
    expect(circleRectHit(13, 13, 4.5, r)).toBe(true);
    expect(circleRectHit(5, 5, 3, { x: 0, y: 0, w: 0, h: 10 })).toBe(false);
  });

  it('틈 한가운데는 안전, 기둥에 몸통이나 풍선이 닿으면 부딪힘', () => {
    const p = pillarAt(PLAYER_X - C.pillarWidth / 2, 150, 330);
    // 몸통+풍선 전체가 틈 안
    expect(hitsPillar(260, p)).toBe(false);
    // 몸통이 아래 기둥에
    expect(hitsPillar(330, p)).toBe(true);
    // 몸통은 틈 안이지만 풍선이 위 기둥에
    expect(hitsPillar(185, p)).toBe(true);
    // 가로로 멀면 무관
    expect(hitsPillar(330, { ...p, x: PLAYER_X + 100 })).toBe(false);
  });

  it('기둥에 닿으면 풍선 하나가 터지고 무적 시간 동안은 다시 터지지 않는다', () => {
    const p = pillarAt(PLAYER_X - 10, 100, 200);
    const s: BalloonState = { ...emptySky(), y: 300, vy: 0, pillars: [p] };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.events).toContainEqual({ type: 'hit', balloonsLeft: 1, cause: 'pillar' });
    expect(out.state.balloons).toBe(1);
    expect(out.state.invulnMs).toBe(C.invulnMs);
    expect(out.state.finished).toBe(false);
    const again = step({ ...out.state, y: 300 }, FRAME, createSeededRng(1));
    expect(again.state.balloons).toBe(1);
  });

  it('풍선이 하나일 때 부딪히면 끝', () => {
    const p = pillarAt(PLAYER_X - 10, 100, 200);
    const s: BalloonState = { ...emptySky(), y: 300, vy: 0, balloons: 1, pillars: [p] };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.state.balloons).toBe(0);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('pop');
    expect(out.events.map((e) => e.type)).toEqual(['hit', 'pop']);
    // 끝난 뒤에는 더 진행하지 않는다
    expect(step(out.state, FRAME, createSeededRng(1)).state).toBe(out.state);
  });

  it('바닥에 닿으면 풍선이 터지고 위로 튕긴다', () => {
    const s: BalloonState = { ...emptySky(), y: C.groundY - C.bodyRadius - 1, vy: 300 };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.events).toContainEqual({ type: 'hit', balloonsLeft: 1, cause: 'floor' });
    expect(out.state.vy).toBe(-C.floorBounceVelocity);
    expect(out.state.y).toBeLessThanOrEqual(C.groundY - C.bodyRadius);
  });
});

describe('풍선 말랑 — 기둥 생성과 난이도', () => {
  it('난이도: 시간이 갈수록 틈은 좁아지고 속도는 빨라지며, 최대치에서 멈춘다', () => {
    const a = difficulty(0);
    const b = difficulty(C.hardMs);
    const c = difficulty(C.hardMs * 3);
    expect(a.gap).toBe(C.gapStart);
    expect(b.gap).toBe(C.gapEnd);
    expect(c).toEqual(b);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.spacing).toBeLessThan(a.spacing);
  });

  it('nextGapCenter: 이전 틈에서 shift 이내, 화면 범위 안', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createSeededRng(seed);
      let prev = 200;
      for (let i = 0; i < 300; i++) {
        const d = difficulty(i * 400);
        const c = nextGapCenter(prev, d.gap, d.shift, rng);
        const range = gapCenterRange(d.gap);
        expect(Math.abs(c - prev)).toBeLessThanOrEqual(d.shift + 1e-9);
        expect(c).toBeGreaterThanOrEqual(range.min);
        expect(c).toBeLessThanOrEqual(range.max);
        prev = c;
      }
    }
  });

  it('범위 밖의 이전 중심에서도 범위 안으로 돌아온다', () => {
    const rng = createSeededRng(3);
    const range = gapCenterRange(C.gapStart);
    const c = nextGapCenter(-500, C.gapStart, C.shiftStart, rng);
    expect(c).toBeGreaterThanOrEqual(range.min);
  });

  it('틈은 항상 말랑이(몸통+풍선) 크기보다 넉넉하다', () => {
    const playerSpan = C.bodyRadius - C.balloonOffsetY + C.balloonRadius;
    expect(C.gapEnd).toBeGreaterThan(playerSpan + 50);
    const { pillar } = spawnPillar(400, 200, C.hardMs, 1, createSeededRng(5));
    expect(pillar.gapBottom - pillar.gapTop).toBeCloseTo(C.gapEnd);
    expect(pillar.gapTop).toBeGreaterThan(0);
    expect(pillar.gapBottom).toBeLessThan(C.groundY);
  });

  it('별은 틈 안이나 두 틈 사이 길목에만 생긴다', () => {
    const rng = createSeededRng(11);
    let prev = 200;
    let count = 0;
    for (let i = 0; i < 200; i++) {
      const { pillar, stars, center } = spawnPillar(600, prev, i * 300, i * 3 + 1, rng);
      for (const st of stars) {
        count += 1;
        if (st.x > pillar.x) {
          expect(st.y).toBeGreaterThan(pillar.gapTop + C.starRadius);
          expect(st.y).toBeLessThan(pillar.gapBottom - C.starRadius);
        } else {
          expect(st.y).toBeCloseTo((center + prev) / 2);
        }
      }
      prev = center;
    }
    expect(count).toBeGreaterThan(100);
  });

  it('기둥은 화면 오른쪽 밖에서 끊김 없이 이어지고 간격이 일정 범위', () => {
    const { state } = run({ ...createBalloonState(createSeededRng(2)), waiting: false, invulnMs: 1e9 }, 30_000);
    const xs = state.pillars.map((p) => p.x).sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < xs.length; i++) {
      const gap = (xs[i] ?? 0) - (xs[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(C.spacingEnd - 1);
      expect(gap).toBeLessThanOrEqual(C.spacingStart + 1);
    }
    // 다음 기둥은 항상 화면 밖에서 생긴다
    expect(state.nextPillarX).toBeGreaterThan(WORLD.width + C.pillarWidth);
  });
});

describe('풍선 말랑 — 점수와 종료', () => {
  it('computeScore', () => {
    expect(computeScore(0, 0)).toBe(0);
    expect(computeScore(3, 2)).toBe(3 * C.passPoints + 2 * C.starPoints);
    expect(computeScore(1, 0, 60)).toBe(C.passPoints + 60);
    expect(computeScore(-1, -1, -5)).toBe(0);
  });

  it('기둥을 지나면 한 번만 점수', () => {
    const p = pillarAt(PLAYER_X - C.pillarWidth + 1, 0, C.groundY);
    const s: BalloonState = { ...emptySky(), pillars: [p] };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.events).toContainEqual({ type: 'pass', points: C.passPoints });
    expect(out.state.passed).toBe(1);
    expect(out.state.score).toBe(C.passPoints);
    const again = step(out.state, FRAME, createSeededRng(1));
    expect(again.state.passed).toBe(1);
  });

  it('별에 닿으면 먹는다', () => {
    const s: BalloonState = { ...emptySky(), vy: 0, stars: [{ id: 5, x: PLAYER_X + 5, y: emptySky().y }] };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.state.starsCollected).toBe(1);
    expect(out.state.stars).toHaveLength(0);
    expect(out.state.score).toBe(C.starPoints);
  });

  it('90초가 지나면 끝나고 남은 풍선마다 보너스', () => {
    const s: BalloonState = { ...emptySky(), elapsedMs: C.durationMs - 10, passed: 4, invulnMs: 1e9 };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('time');
    expect(out.events).toContainEqual({ type: 'timeUp', bonus: 2 * C.finishBonusPerBalloon });
    expect(out.state.score).toBe(4 * C.passPoints + 2 * C.finishBonusPerBalloon);
  });

  it('누르지 않으면 바닥에 두 번 닿아 끝난다', () => {
    const { state } = run(createBalloonState(createSeededRng(4)), 20_000);
    expect(state.finished).toBe(true);
    expect(state.endReason).toBe('pop');
    expect(state.hits).toBe(2);
  });

  it('간단한 자동 조종으로도 여러 시드에서 끝까지 지나갈 수 있다 (틈이 항상 통과 가능)', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = run(flap(createBalloonState(createSeededRng(seed))), C.durationMs + 1000, seed, true);
      // 단순한 봇이라 급하게 꺾이는 틈에서 가끔 한 번 부딪히지만, 풍선 2개로 항상 완주한다
      expect(state.endReason).toBe('time');
      expect(state.hits).toBeLessThanOrEqual(1);
      scores.push(state.score);
    }
    // 완주 점수 범위 (밸런스 기준): 기둥 약 69개 + 별 + 보너스
    for (const sc of scores) {
      expect(sc).toBeGreaterThan(800);
      expect(sc).toBeLessThan(1300);
    }
  });
});
