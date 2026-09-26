import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../data/characters';
import { rarityRank } from '../../data/rarity';
import { createSeededRng } from '../../lib/rng';
import {
  MAX_TIER,
  MERGE_CONFIG as C,
  SPAWN_WEIGHTS,
  TIER_CHARACTER_IDS,
  TIER_RADII,
  WORLD,
  canDrop,
  clampAim,
  constrainToJar,
  createMergeState,
  drop,
  isOverDanger,
  mergePoints,
  radiusOf,
  separatePair,
  setAim,
  spawnTier,
  step,
  type Body,
  type MergeConfig,
  type MergeEvent,
  type MergeState,
} from './logic';

function body(id: number, tier: number, x: number, y: number, extra: Partial<Body> = {}): Body {
  return { id, tier, x, y, vx: 0, vy: 0, age: 0, landed: true, ...extra };
}

function withBodies(bodies: Body[], extra: Partial<MergeState> = {}): MergeState {
  const base = createMergeState(createSeededRng(1));
  return { ...base, bodies, nextId: 100, ...extra };
}

/** ms만큼 16ms 프레임으로 진행 */
function run(state: MergeState, ms: number, config: MergeConfig = C) {
  let s = state;
  const events: MergeEvent[] = [];
  for (let t = 0; t < ms; t += 16) {
    const out = step(s, 16, config);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

const NO_GRAVITY = { ...C, gravity: 0 };

describe('말랑 합치기: 단계와 점수', () => {
  it('단계는 8개이고 반지름이 커진다', () => {
    expect(TIER_RADII).toHaveLength(8);
    for (let i = 1; i < TIER_RADII.length; i++) expect(TIER_RADII[i]!).toBeGreaterThan(TIER_RADII[i - 1]!);
    // 가장 큰 말랑이 두 개가 병에 나란히 들어간다
    expect(radiusOf(MAX_TIER) * 4).toBeLessThanOrEqual(WORLD.width);
  });

  it('단계마다 실제 말랑이가 있고, 클수록 귀하며, 시크릿은 없다', () => {
    expect(TIER_CHARACTER_IDS).toHaveLength(TIER_RADII.length);
    expect(new Set(TIER_CHARACTER_IDS).size).toBe(TIER_CHARACTER_IDS.length);
    const ranks = TIER_CHARACTER_IDS.map((id) => {
      const c = getCharacter(id);
      expect(c, id).toBeDefined();
      expect(c!.rarity).not.toBe('secret');
      return rarityRank(c!.rarity);
    });
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
  });

  it('합치기 점수는 삼각수 k(k+1)/2', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(mergePoints)).toEqual([1, 3, 6, 10, 15, 21, 28]);
    expect(mergePoints(0)).toBe(0);
  });

  it('떨어뜨리는 말랑이는 작은 단계(0~3)에서만, 가중치 비율대로 나온다', () => {
    const rng = createSeededRng(42);
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    const N = 40_000;
    for (let i = 0; i < N; i++) counts[spawnTier(rng)]!++;
    expect(counts.slice(4).every((c) => c === 0)).toBe(true);
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    SPAWN_WEIGHTS.forEach((w, i) => {
      const p = w / total;
      const sigma = Math.sqrt(N * p * (1 - p));
      expect(Math.abs(counts[i]! - N * p)).toBeLessThan(5 * sigma);
    });
  });

  it('rng가 경계값을 내도 범위를 벗어나지 않는다', () => {
    expect(spawnTier(() => 0)).toBe(0);
    expect(spawnTier(() => 0.9999999)).toBe(3);
    expect(spawnTier(() => 1)).toBe(3);
  });
});

describe('말랑 합치기: 조준과 떨어뜨리기', () => {
  it('조준은 현재 말랑이 반지름만큼 벽 안쪽으로 제한된다', () => {
    const s = { ...createMergeState(createSeededRng(3)), current: 3 };
    expect(setAim(s, -50).aimX).toBe(radiusOf(3));
    expect(setAim(s, 9999).aimX).toBe(WORLD.width - radiusOf(3));
    expect(setAim(s, 120).aimX).toBe(120);
    expect(clampAim(Number.NaN, 0)).toBe(WORLD.width / 2);
  });

  it('drop은 조준 위치에 말랑이를 놓고, 다음 말랑이를 꺼내며, 쿨다운 동안 막힌다', () => {
    const rng = createSeededRng(7);
    let s = setAim(createMergeState(rng), 90);
    const { current, next } = s;
    s = drop(s, rng);
    expect(s.bodies).toHaveLength(1);
    expect(s.bodies[0]).toMatchObject({ tier: current, y: C.dropY });
    expect(Math.abs(s.bodies[0]!.x - 90)).toBeLessThanOrEqual(C.dropJitter);
    expect(s.current).toBe(next);
    expect(s.drops).toBe(1);
    expect(canDrop(s)).toBe(false);
    expect(drop(s, rng)).toBe(s);
    s = run(s, C.dropCooldownMs + 20).state;
    expect(canDrop(s)).toBe(true);
    expect(drop(s, rng).bodies).toHaveLength(2);
  });

  it('같은 시드와 같은 입력이면 결과가 똑같다 (결정적)', () => {
    const play = () => {
      const rng = createSeededRng(99);
      let s = createMergeState(rng);
      for (let i = 0; i < 30; i++) {
        s = drop(setAim(s, 40 + ((i * 53) % 220)), rng);
        s = run(s, 600).state;
      }
      return s;
    };
    const a = play();
    expect(a.drops).toBeGreaterThan(0);
    expect(a).toEqual(play());
  });
});

describe('말랑 합치기: 물리', () => {
  it('겹친 두 원은 반지름 합만큼 떨어지고, 무거운 쪽이 덜 밀린다', () => {
    const a = body(1, 0, 100, 100);
    const b = body(2, 5, 110, 100);
    expect(separatePair(a, b)).toBe(true);
    expect(b.x - a.x).toBeCloseTo(radiusOf(0) + radiusOf(5), 6);
    expect(100 - a.x).toBeGreaterThan(b.x - 110);
  });

  it('다가오던 속도는 반사되어 서로 멀어진다 (튕김 계수만큼)', () => {
    const a = body(1, 2, 100, 100, { vx: 200 });
    const b = body(2, 2, 140, 100, { vx: -200 });
    separatePair(a, b);
    expect(b.vx - a.vx).toBeCloseTo(400 * C.restitution, 6);
  });

  it('완전히 같은 위치여도 NaN 없이 분리된다', () => {
    const a = body(1, 1, 100, 100);
    const b = body(2, 1, 100, 100);
    separatePair(a, b);
    expect(Number.isFinite(a.y) && Number.isFinite(b.y)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(radiusOf(1) * 2, 4);
  });

  it('떨어진 두 원은 건드리지 않는다', () => {
    const a = body(1, 0, 0, 0);
    const b = body(2, 0, 100, 0);
    expect(separatePair(a, b)).toBe(false);
    expect(a.x).toBe(0);
  });

  it('벽과 바닥 밖으로 나간 원은 안으로 돌아오고 튕긴다', () => {
    const b = body(1, 2, -10, WORLD.height + 20, { vx: -100, vy: 300 });
    const impact = constrainToJar(b);
    expect(b.x).toBe(radiusOf(2));
    expect(b.y).toBe(WORLD.height - radiusOf(2));
    expect(b.vx).toBeGreaterThan(0);
    expect(b.vy).toBeLessThanOrEqual(0);
    expect(impact).toBe(300);
  });

  it('떨어뜨린 말랑이는 바닥에 내려앉아 멈추고, 착지 이벤트를 한 번 낸다', () => {
    const rng = createSeededRng(5);
    let s = { ...createMergeState(rng), current: 2 };
    s = drop(setAim(s, 150), rng);
    const { state, events } = run(s, 3000);
    const b = state.bodies[0]!;
    expect(b.y).toBeCloseTo(WORLD.height - radiusOf(2), 0);
    expect(Math.abs(b.vy)).toBeLessThan(20);
    expect(events.filter((e) => e.kind === 'land')).toHaveLength(1);
  });

  it('서로 다른 단계로 쌓은 더미는 가라앉아도 크게 겹치지 않고 병 밖으로 나가지 않는다', () => {
    const tiers = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3];
    const bodies = tiers.map((tier, i) => body(i + 1, tier, 40 + ((i * 70) % 220), 60 + i * 34));
    const { state } = run(withBodies(bodies), 4000);
    expect(state.bodies).toHaveLength(bodies.length);
    for (let i = 0; i < state.bodies.length; i++) {
      const a = state.bodies[i]!;
      for (let j = i + 1; j < state.bodies.length; j++) {
        const b = state.bodies[j]!;
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(radiusOf(a.tier) + radiusOf(b.tier) - 2);
      }
      expect(a.x).toBeGreaterThanOrEqual(radiusOf(a.tier) - 0.01);
      expect(a.x).toBeLessThanOrEqual(WORLD.width - radiusOf(a.tier) + 0.01);
      expect(a.y).toBeLessThanOrEqual(WORLD.height - radiusOf(a.tier) + 0.01);
    }
  });

  it('step은 입력 상태를 바꾸지 않고, 이상한 dt는 무시한다', () => {
    const s = withBodies([body(1, 1, 100, 100)]);
    const snapshot = JSON.stringify(s);
    step(s, 16);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(step(s, Number.NaN).state).toBe(s);
    expect(step(s, -5).state).toBe(s);
    // 큰 dt는 maxDtMs로 잘린다
    expect(step(s, 10_000).state.elapsedMs).toBe(C.maxDtMs);
  });
});

describe('말랑 합치기: 합치기 규칙', () => {
  it('같은 단계 둘이 닿으면 가운데에서 한 단계 큰 말랑이가 되고 점수를 준다', () => {
    const r = radiusOf(2);
    const s = withBodies([body(1, 2, 100, 300), body(2, 2, 100 + r * 2 - 1, 300)]);
    const { state, events } = step(s, 16, NO_GRAVITY);
    expect(state.bodies).toHaveLength(1);
    const merged = state.bodies[0]!;
    expect(merged.tier).toBe(3);
    expect(merged.x).toBeCloseTo(100 + r - 0.5, 0);
    expect(merged.id).toBe(100);
    expect(state.nextId).toBe(101);
    expect(state.score).toBe(mergePoints(3));
    expect(state.merges).toBe(1);
    expect(state.maxTier).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'merge', tier: 3, id: 100, points: mergePoints(3) }));
  });

  it('다른 단계끼리는 합쳐지지 않고 밀어낸다', () => {
    const s = withBodies([body(1, 2, 100, 300), body(2, 3, 120, 300)]);
    const { state, events } = step(s, 16, NO_GRAVITY);
    expect(state.bodies.map((b) => b.tier)).toEqual([2, 3]);
    expect(events.some((e) => e.kind === 'merge')).toBe(false);
    expect(state.score).toBe(0);
    const [a, b] = state.bodies;
    expect(Math.hypot(b!.x - a!.x, b!.y - a!.y)).toBeCloseTo(radiusOf(2) + radiusOf(3), 3);
  });

  it('떨어져 있는 같은 단계는 합쳐지지 않는다', () => {
    const s = withBodies([body(1, 1, 60, 300), body(2, 1, 200, 300)]);
    expect(step(s, 16, NO_GRAVITY).state.bodies).toHaveLength(2);
  });

  it('세 개가 줄지어 닿아 있으면 한 쌍만 합쳐지고 하나는 남는다', () => {
    const r = radiusOf(0);
    const s = withBodies([body(1, 0, 100, 300), body(2, 0, 100 + 2 * r, 300), body(3, 0, 100 + 4 * r, 300)]);
    const { state } = step(s, 16, NO_GRAVITY);
    expect(state.bodies.map((b) => b.tier).sort()).toEqual([0, 1]);
  });

  it('연쇄: 합쳐져 생긴 말랑이가 같은 단계와 닿으면 또 합쳐진다', () => {
    const r0 = radiusOf(0);
    const r1 = radiusOf(1);
    // 작은 둘은 위아래로 붙어 있고, 합쳐진 뒤에야 오른쪽 tier 1과 닿는다
    const s = withBodies([body(1, 1, 150 + 2 * r1 - 2, 380), body(2, 0, 150, 380 - r0), body(3, 0, 150, 380 + r0)]);
    const { state } = run(s, 200, NO_GRAVITY);
    expect(state.bodies).toHaveLength(1);
    expect(state.bodies[0]!.tier).toBe(2);
    expect(state.score).toBe(mergePoints(1) + mergePoints(2));
  });

  it('가장 큰 단계끼리 합쳐지면 둘 다 사라지고 큰 보너스', () => {
    const r = radiusOf(MAX_TIER);
    const s = withBodies([body(1, MAX_TIER, r, 300), body(2, MAX_TIER, 3 * r - 1, 300)]);
    const { state, events } = step(s, 16, NO_GRAVITY);
    expect(state.bodies).toHaveLength(0);
    expect(state.score).toBe(C.topMergePoints);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'vanish', points: C.topMergePoints }));
  });
});

describe('말랑 합치기: 게임 오버와 시간', () => {
  const high = (age: number) => body(1, 3, 150, C.dangerY - 5, { age });

  it('위험선 위에 1.5초 이상 머물면 끝난다', () => {
    let s = withBodies([high(C.graceMs)]);
    s = run(s, C.overflowMs - 100, NO_GRAVITY).state;
    expect(s.finished).toBe(false);
    expect(s.dangerMs).toBeGreaterThan(0);
    const out = run(s, 200, NO_GRAVITY);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('overflow');
    expect(out.events).toContainEqual({ kind: 'end', reason: 'overflow' });
  });

  it('방금 떨어뜨린 말랑이는 유예 시간 동안 위험 판정에서 빠진다', () => {
    expect(isOverDanger([high(0)])).toBe(false);
    expect(isOverDanger([high(C.graceMs)])).toBe(true);
    expect(isOverDanger([body(1, 3, 150, 300, { age: 9999 })])).toBe(false);
  });

  it('위험선 아래로 내려가면 위험 시간이 초기화된다', () => {
    let s = run(withBodies([high(C.graceMs)]), 800, NO_GRAVITY).state;
    expect(s.dangerMs).toBeGreaterThan(0);
    s = { ...s, bodies: [body(1, 3, 150, 300, { age: 5000 })] };
    s = step(s, 16, NO_GRAVITY).state;
    expect(s.dangerMs).toBe(0);
  });

  it('120초가 지나면 시간 종료, 끝난 뒤에는 아무것도 바뀌지 않는다', () => {
    let s = createMergeState(createSeededRng(2));
    s = { ...s, elapsedMs: C.durationMs - 10 };
    const out = step(s, 16);
    expect(out.state.finished).toBe(true);
    expect(out.state.endReason).toBe('time');
    expect(out.state.elapsedMs).toBe(C.durationMs);
    expect(step(out.state, 16).state).toBe(out.state);
    expect(drop(out.state, createSeededRng(1))).toBe(out.state);
    expect(setAim(out.state, 10)).toBe(out.state);
  });

  it('아무렇게나 계속 떨어뜨려도 반드시 끝난다', () => {
    const rng = createSeededRng(11);
    let s = createMergeState(rng);
    let frames = 0;
    while (!s.finished && frames < 10_000) {
      s = drop(setAim(s, rng() * WORLD.width), rng);
      s = step(s, 16).state;
      frames++;
    }
    expect(s.finished).toBe(true);
    expect(s.elapsedMs).toBeLessThanOrEqual(C.durationMs);
  });
});
