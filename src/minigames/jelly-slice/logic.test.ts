import { describe, expect, it } from 'vitest';
import { createSeededRng, type RNG } from '../../lib/rng';
import {
  JELLY_SLICE_CONFIG as C,
  WORLD,
  comboBonus,
  createSliceState,
  difficulty,
  hitRadius,
  launchFlyer,
  planWave,
  segmentHitsCircle,
  stepSlice,
  type Flyer,
  type SliceEvent,
  type SliceState,
  type SwipeSegment,
} from './logic';

const rng0: RNG = () => 0.5;

function flyer(partial: Partial<Flyer>): Flyer {
  return {
    id: 1,
    kind: 'jelly',
    x: 160,
    y: 200,
    vx: 0,
    vy: 0,
    r: C.jellyRadius,
    angle: 0,
    spin: 0,
    variant: 0,
    ...partial,
  };
}

/** 스폰 없이 원하는 비행체만 둔 상태 */
function withFlyers(flyers: Flyer[], extra: Partial<SliceState> = {}): SliceState {
  return { ...createSliceState(), nextWaveMs: 99_999, flyers, ...extra };
}

function cut(x1: number, y1: number, x2: number, y2: number, strokeId = 1): SwipeSegment {
  return { x1, y1, x2, y2, strokeId };
}

function run(state: SliceState, ms: number, rng: RNG = rng0) {
  let s = state;
  const events: SliceEvent[] = [];
  for (let t = 0; t < ms; t += 16) {
    const out = stepSlice(s, 16, [], rng);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

describe('선분-원 판정', () => {
  it('원을 지나가는 선분은 맞는다', () => {
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 5, 10)).toBe(true);
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 15, 10)).toBe(false);
  });
  it('선분 끝 밖의 원은 끝점 거리로 판단한다', () => {
    expect(segmentHitsCircle(0, 0, 10, 0, 25, 0, 10)).toBe(false);
    expect(segmentHitsCircle(0, 0, 10, 0, 19, 0, 10)).toBe(true);
  });
  it('길이 0 선분(탭)은 점-원 판정', () => {
    expect(segmentHitsCircle(5, 5, 5, 5, 0, 0, 8)).toBe(true);
    expect(segmentHitsCircle(9, 9, 9, 9, 0, 0, 8)).toBe(false);
  });
});

describe('포물선 발사', () => {
  it('바닥 아래에서 위로 튀어 올라 꼭대기가 화면 안이고, 다시 떨어진다', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 50; i++) {
      const f = launchFlyer('jelly', i, rng);
      expect(f.y).toBeGreaterThan(WORLD.height);
      expect(f.vy).toBeLessThan(0);
      const apexY = f.y - (f.vy * f.vy) / (2 * C.gravity);
      expect(apexY).toBeGreaterThanOrEqual(C.apexMinY - 1e-6);
      expect(apexY).toBeLessThanOrEqual(C.apexMaxY + 1e-6);
      const airtime = (2 * -f.vy) / C.gravity;
      const landX = f.x + f.vx * airtime;
      expect(landX).toBeGreaterThanOrEqual(C.launchMargin - 1e-6);
      expect(landX).toBeLessThanOrEqual(WORLD.width - C.launchMargin + 1e-6);
    }
  });

  it('중력으로 올라갔다가 내려와 놓침으로 처리된다 (벌점 없음)', () => {
    const f = launchFlyer('jelly', 1, rng0);
    const { state, events } = run(withFlyers([f], { score: 50 }), 4000);
    expect(state.flyers).toHaveLength(0);
    expect(state.missed).toBe(1);
    expect(state.score).toBe(50);
    expect(state.lives).toBe(C.lives);
    expect(events.filter((e) => e.type === 'miss')).toHaveLength(1);
  });

  it('폭탄은 놓쳐도 세지 않는다', () => {
    const { state } = run(withFlyers([launchFlyer('bomb', 1, rng0)]), 4000);
    expect(state.missed).toBe(0);
    expect(state.flyers).toHaveLength(0);
  });
});

describe('자르기', () => {
  it('스와이프로 젤리를 자르면 점수', () => {
    const out = stepSlice(withFlyers([flyer({})]), 16, [cut(100, 200, 220, 200)], rng0);
    expect(out.state.score).toBe(C.points.jelly);
    expect(out.state.sliced).toBe(1);
    expect(out.state.flyers).toHaveLength(0);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'slice', kind: 'jelly', combo: 1 }));
  });

  it('탭(길이 0)으로도 자를 수 있다', () => {
    const out = stepSlice(withFlyers([flyer({})]), 16, [cut(165, 205, 165, 205)], rng0);
    expect(out.state.sliced).toBe(1);
  });

  it('비껴가면 잘리지 않는다', () => {
    const out = stepSlice(withFlyers([flyer({})]), 16, [cut(0, 300, 320, 300)], rng0);
    expect(out.state.sliced).toBe(0);
    expect(out.state.flyers).toHaveLength(1);
  });

  it('황금 젤리는 30점', () => {
    const out = stepSlice(withFlyers([flyer({ kind: 'gold' })]), 16, [cut(100, 200, 220, 200)], rng0);
    expect(out.state.score).toBe(C.points.gold);
    expect(out.state.goldSliced).toBe(1);
  });

  it('한 번에 여러 개를 자르면 콤보 보너스', () => {
    const flyers = [flyer({ id: 1, x: 60 }), flyer({ id: 2, x: 160 }), flyer({ id: 3, x: 260 })];
    const out = stepSlice(withFlyers(flyers), 16, [cut(20, 200, 300, 200)], rng0);
    expect(out.state.score).toBe(3 * C.points.jelly + comboBonus(2) + comboBonus(3));
    expect(out.state.maxCombo).toBe(3);
  });

  it('같은 스트로크는 프레임을 넘어도 콤보가 이어지고, 새 스트로크는 새로 센다', () => {
    const s0 = withFlyers([flyer({ id: 1, x: 60 }), flyer({ id: 2, x: 260 })]);
    const a = stepSlice(s0, 16, [cut(40, 200, 80, 200, 5)], rng0);
    const b = stepSlice(a.state, 16, [cut(240, 200, 280, 200, 5)], rng0);
    expect(b.events).toContainEqual(expect.objectContaining({ type: 'slice', combo: 2 }));
    const c = stepSlice(a.state, 16, [cut(240, 200, 280, 200, 6)], rng0);
    expect(c.events).toContainEqual(expect.objectContaining({ type: 'slice', combo: 1 }));
  });

  it('콤보 보너스는 상한이 있다', () => {
    expect(comboBonus(1)).toBe(0);
    expect(comboBonus(2)).toBe(C.comboStep);
    expect(comboBonus(100)).toBe(C.maxComboBonus);
  });
});

describe('가시 폭탄과 목숨', () => {
  it('폭탄을 자르면 목숨 1개와 콤보를 잃는다', () => {
    const s0 = withFlyers([flyer({ id: 1, kind: 'bomb', r: C.bombRadius }), flyer({ id: 2, x: 260 })], {
      strokeId: 1,
      strokeCount: 4,
    });
    const out = stepSlice(s0, 16, [cut(100, 200, 300, 200)], rng0);
    expect(out.state.lives).toBe(C.lives - 1);
    expect(out.state.bombsHit).toBe(1);
    // 폭탄 뒤 같은 스트로크의 젤리는 콤보 1부터
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'slice', combo: 1 }));
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'bomb', lostLife: true, livesLeft: 2 }));
  });

  it('폭탄 판정은 그림보다 작다 (가장자리를 스치면 괜찮다)', () => {
    const bomb = flyer({ kind: 'bomb', r: C.bombRadius });
    const edge = 200 + C.bombRadius * 0.9;
    const out = stepSlice(withFlyers([bomb]), 16, [cut(100, edge, 220, edge)], rng0);
    expect(out.state.lives).toBe(C.lives);
  });

  it('맞은 직후 무적 시간에는 목숨을 더 잃지 않는다', () => {
    const bombs = [flyer({ id: 1, kind: 'bomb', x: 60 }), flyer({ id: 2, kind: 'bomb', x: 260 })];
    const out = stepSlice(withFlyers(bombs), 16, [cut(20, 200, 300, 200)], rng0);
    expect(out.state.lives).toBe(C.lives - 1);
    expect(out.state.bombsHit).toBe(2);
  });

  it('목숨을 모두 잃으면 바로 끝난다', () => {
    const out = stepSlice(withFlyers([flyer({ kind: 'bomb' })], { lives: 1 }), 16, [cut(100, 200, 220, 200)], rng0);
    expect(out.state.lives).toBe(0);
    expect(out.state.finished).toBe(true);
    expect(out.state.knockedOut).toBe(true);
  });
});

describe('묶음과 난이도', () => {
  it('묶음의 첫 개는 항상 젤리이고 폭탄 수는 제한된다', () => {
    const rng = createSeededRng(3);
    for (let i = 0; i < 300; i++) {
      const elapsed = (i / 300) * C.durationMs;
      const kinds = planWave(elapsed, rng);
      expect(kinds[0]).not.toBe('bomb');
      expect(kinds.length).toBeGreaterThanOrEqual(1);
      expect(kinds.length).toBeLessThanOrEqual(difficulty(elapsed).waveSize);
      expect(kinds.filter((k) => k === 'bomb').length).toBeLessThanOrEqual(difficulty(elapsed).maxBombs);
    }
  });

  it('시간이 지날수록 어려워진다', () => {
    const a = difficulty(0);
    const b = difficulty(C.durationMs);
    expect(b.waveInterval).toBeLessThan(a.waveInterval);
    expect(b.waveSize).toBeGreaterThan(a.waveSize);
    expect(b.bombChance).toBeGreaterThan(a.bombChance);
  });

  it('끝나기 직전에는 새로 던지지 않는다', () => {
    const s = { ...createSliceState(), elapsedMs: C.durationMs - C.spawnStopBeforeEndMs + 10, nextWaveMs: 0 };
    const out = stepSlice(s, 16, [], rng0);
    expect(out.state.flyers).toHaveLength(0);
    expect(out.state.pending).toHaveLength(0);
  });
});

describe('타이머', () => {
  it('45초 후 종료되고 이후 step은 변화 없음', () => {
    const { state } = run(createSliceState(), C.durationMs + 100, createSeededRng(1));
    expect(state.finished).toBe(true);
    expect(state.knockedOut).toBe(false);
    const again = stepSlice(state, 16, [cut(0, 0, 320, 480)], rng0);
    expect(again.state).toBe(state);
  });

  it('큰 dt는 잘라서 처리한다', () => {
    const out = stepSlice(createSliceState(), 10_000, [], rng0);
    expect(out.state.elapsedMs).toBe(50);
  });

  it('입력 배열과 이전 상태를 바꾸지 않는다', () => {
    const s0 = withFlyers([flyer({})]);
    const segs = [cut(100, 200, 220, 200)];
    stepSlice(s0, 16, segs, rng0);
    expect(s0.flyers).toHaveLength(1);
    expect(s0.score).toBe(0);
    expect(segs).toHaveLength(1);
  });
});

/** 봇 플레이로 점수 범위 확인 (economy 배율 조정 근거) */
function playBot(seed: number, skill: number): SliceState {
  const rng = createSeededRng(seed);
  const botRng = createSeededRng(seed + 1000);
  const decided = new Map<number, boolean>();
  let s = createSliceState();
  let stroke = 0;
  while (!s.finished) {
    // 꼭대기 근처의 젤리를 한 스트로크에 모아 자른다 (폭탄은 피함)
    const targets = s.flyers.filter((f) => {
      if (f.kind === 'bomb' || f.vy < -120) return false;
      // 폭탄과 겹친 젤리는 기다린다
      if (s.flyers.some((b) => b.kind === 'bomb' && Math.hypot(b.x - f.x, b.y - f.y) <= hitRadius(b))) return false;
      if (!decided.has(f.id)) decided.set(f.id, botRng() < skill);
      return decided.get(f.id);
    });
    stroke += 1;
    const segs = targets.map((f) => cut(f.x, f.y, f.x, f.y, stroke));
    s = stepSlice(s, 16, segs, rng).state;
  }
  return s;
}

describe('봇 플레이', () => {
  it('잘하는 봇과 보통 봇의 점수는 합리적인 범위', () => {
    for (const seed of [1, 2, 3]) {
      const great = playBot(seed, 1);
      const casual = playBot(seed, 0.6);
      expect(great.lives).toBe(C.lives);
      expect(great.sliced).toBeGreaterThan(50);
      expect(great.score).toBeGreaterThan(casual.score);
      expect(casual.score).toBeGreaterThan(250);
      expect(great.score).toBeLessThan(2000);
    }
  });
});
