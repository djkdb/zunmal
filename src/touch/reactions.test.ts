import { describe, expect, it } from 'vitest';
import { SHAPES } from '../components/malang/shapes';
import {
  AFFECTION_PER_LEVEL,
  BLUSH_STEP,
  DIZZY_SPEED,
  DOZE_AFTER_MS,
  GAZE_MAX,
  JUMP_WINDOW_MS,
  MELT_FULL_MS,
  MELT_START_MS,
  REACTION_UNLOCKS,
  BASIC_GESTURES,
  RUB_STROKE,
  createRub,
  rubStep,
  TICKLE_POKES,
  YAWN_AFTER_MS,
  approach,
  bumpBlush,
  classifyPoke,
  coolBlush,
  gazeToward,
  idlePhase,
  isDizzyFlick,
  isUnlocked,
  levelOf,
  meltAmount,
  nextUnlock,
  registerPat,
  touchZone,
  unlocksAt,
} from './reactions';

describe('affection levels and unlocks', () => {
  it('computes levels from stored affection', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(AFFECTION_PER_LEVEL - 1)).toBe(1);
    expect(levelOf(AFFECTION_PER_LEVEL)).toBe(2);
    expect(levelOf(-5)).toBe(1);
    expect(levelOf(Number.NaN)).toBe(1);
  });

  it('level 1 only has the basic squish; each later level opens one reaction', () => {
    for (const r of REACTION_UNLOCKS) expect(isUnlocked(r.id, 1)).toBe(false);
    const levels = REACTION_UNLOCKS.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels[0]).toBe(2);
    for (const r of REACTION_UNLOCKS) {
      expect(isUnlocked(r.id, r.level)).toBe(true);
      expect(isUnlocked(r.id, r.level - 1)).toBe(false);
      expect(unlocksAt(r.level).map((u) => u.id)).toEqual([r.id]);
    }
  });

  it('tells which reaction opens next', () => {
    expect(nextUnlock(1)?.id).toBe('pat');
    expect(nextUnlock(2)?.id).toBe('blush');
    const last = REACTION_UNLOCKS[REACTION_UNLOCKS.length - 1]!;
    expect(nextUnlock(last.level)).toBeNull();
    expect(unlocksAt(1)).toEqual([]);
  });
});

describe('touch zones', () => {
  it('head is the top ~35%, cheeks are the side bands, belly is the rest (every shape)', () => {
    for (const shape of Object.values(SHAPES)) {
      const h = shape.bottom - shape.top;
      const w = shape.right - shape.left;
      const midX = (shape.left + shape.right) / 2;
      expect(touchZone({ x: midX, y: shape.top + 4 }, shape)).toBe('head');
      // 머리 띠 가장자리까지 머리 (눈보다 아래여도 넉넉히)
      expect(touchZone({ x: shape.left + 2, y: shape.top + h * 0.33 }, shape)).toBe('head');
      expect(touchZone({ x: shape.left + w * 0.1, y: shape.top + h * 0.5 }, shape)).toBe('cheek');
      expect(touchZone({ x: shape.right - w * 0.1, y: shape.top + h * 0.5 }, shape)).toBe('cheek');
      expect(touchZone({ x: midX, y: shape.top + h * 0.5 }, shape)).toBe('belly');
      expect(touchZone({ x: midX, y: shape.bottom - 4 }, shape)).toBe('belly');
    }
  });

  it('every reaction and basic gesture has a how-to line', () => {
    for (const r of [...REACTION_UNLOCKS, ...BASIC_GESTURES]) {
      expect(r.howTo.length).toBeGreaterThan(5);
      expect(r.howTo.length).toBeLessThan(40);
    }
  });

  it('classifies pokes by zone, only when unlocked', () => {
    expect(classifyPoke('head', 1, 1)).toBe('poke');
    expect(classifyPoke('head', 1, 2)).toBe('pat');
    expect(classifyPoke('cheek', 1, 2)).toBe('poke');
    expect(classifyPoke('cheek', 1, 3)).toBe('blush');
    expect(classifyPoke('belly', 1, 3)).toBe('poke');
    expect(classifyPoke('belly', 1, 4)).toBe('giggle');
    expect(classifyPoke('cheek', TICKLE_POKES, 4)).toBe('laugh');
    expect(classifyPoke('cheek', TICKLE_POKES, 3)).toBe('blush');
  });

  it('three pats in a row make an aegyo jump once unlocked', () => {
    let pats: number[] = [];
    let jumped = false;
    for (const t of [0, 400, 800]) {
      const r = registerPat(pats, t, 7);
      pats = r.pats;
      jumped = r.jump;
    }
    expect(jumped).toBe(true);
    expect(pats).toEqual([]);
    // 너무 느리면 새로 센다
    let slow: number[] = [];
    for (const t of [0, JUMP_WINDOW_MS + 1, 2 * JUMP_WINDOW_MS + 2]) {
      const r = registerPat(slow, t, 7);
      slow = r.pats;
      expect(r.jump).toBe(false);
    }
    // 잠겨 있으면 점프 없음
    expect(registerPat([0, 100], 200, 6).jump).toBe(false);
  });
});

describe('rubbing the head', () => {
  it('two left-right turns within a second count as a pat', () => {
    let st = createRub();
    let pat = false;
    const moves: [number, number][] = [
      [5, 0],
      [5, 80],
      [-5, 200],
      [-5, 300],
      [5, 450],
    ];
    for (const [dx, t] of moves) {
      const r = rubStep(st, dx, t);
      st = r.state;
      pat = pat || r.pat;
    }
    expect(pat).toBe(true);
  });

  it('slow back-and-forth or tiny jitters do not count', () => {
    let st = createRub();
    let pat = false;
    for (const [dx, t] of [
      [5, 0],
      [-5, 900],
      [5, 2100],
      [0.5, 2200],
      [-0.5, 2250],
    ] as [number, number][]) {
      const r = rubStep(st, dx, t);
      st = r.state;
      pat = pat || r.pat;
    }
    expect(pat).toBe(false);
  });

  it('one long stroke also counts, then it starts over', () => {
    let st = createRub();
    let pats = 0;
    for (let i = 0; i < 13; i++) {
      const r = rubStep(st, 5, i * 30);
      st = r.state;
      if (r.pat) pats++;
    }
    expect(pats).toBe(1);
    expect(st.path).toBeLessThan(RUB_STROKE);
  });
});

describe('melt, dizzy, idle', () => {
  it('melts smoothly after holding, only when unlocked', () => {
    expect(meltAmount(MELT_FULL_MS, 4)).toBe(0);
    expect(meltAmount(MELT_START_MS, 5)).toBe(0);
    const mid = meltAmount((MELT_START_MS + MELT_FULL_MS) / 2, 5);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(meltAmount(MELT_FULL_MS + 5000, 5)).toBe(1);
  });

  it('detects a hard flick relative to body size', () => {
    const r = 100;
    const fast = ((DIZZY_SPEED + 1) * r) / 1000;
    expect(isDizzyFlick(fast, 0, r, 6)).toBe(true);
    expect(isDizzyFlick(fast, 0, r, 5)).toBe(false);
    expect(isDizzyFlick(fast / 3, 0, r, 6)).toBe(false);
    expect(isDizzyFlick(fast, 0, 0, 6)).toBe(false);
  });

  it('yawns after 8s and dozes after 20s', () => {
    expect(idlePhase(0)).toBe('awake');
    expect(idlePhase(YAWN_AFTER_MS - 1)).toBe('awake');
    expect(idlePhase(YAWN_AFTER_MS)).toBe('yawn');
    expect(idlePhase(DOZE_AFTER_MS)).toBe('doze');
    expect(idlePhase(Number.NaN)).toBe('awake');
  });
});

describe('blush and gaze', () => {
  it('blush builds up to 1 and cools down to 0', () => {
    let b = 0;
    for (let i = 0; i < 5; i++) b = bumpBlush(b);
    expect(b).toBe(1);
    expect(bumpBlush(0)).toBeCloseTo(BLUSH_STEP);
    expect(coolBlush(1, 1000)).toBeLessThan(1);
    expect(coolBlush(0.1, 100000)).toBe(0);
    expect(coolBlush(0.5, Number.NaN)).toBe(0.5);
  });

  it('gaze follows the finger but never slides further than GAZE_MAX', () => {
    const far = gazeToward(500, 0);
    expect(far.x).toBeCloseTo(GAZE_MAX);
    expect(far.y).toBe(0);
    const near = gazeToward(4, 0);
    expect(near.x).toBeLessThan(1);
    expect(gazeToward(0, 0)).toEqual({ x: 0, y: 0 });
    const up = gazeToward(0, -500);
    expect(up.y).toBeLessThan(0);
    expect(Math.abs(up.y)).toBeLessThanOrEqual(GAZE_MAX);
  });

  it('approach eases toward the target and clamps dt', () => {
    const a = approach({ x: 0, y: 0 }, { x: 10, y: 0 }, 16);
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(10);
    const big = approach({ x: 0, y: 0 }, { x: 10, y: 0 }, 1e9);
    expect(big.x).toBeLessThan(10);
    expect(approach({ x: 1, y: 1 }, { x: 5, y: 5 }, Number.NaN)).toEqual({ x: 1, y: 1 });
  });
});
