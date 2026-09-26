import { describe, expect, it } from 'vitest';
import {
  MELT_SQUASH,
  TUNING,
  createTouchState,
  hop,
  melt,
  stretchUp,
  drag,
  isAtRest,
  isSettled,
  poke,
  press,
  release,
  snapToTargets,
  softLimit,
  step,
  stretchAmount,
  tickle,
  toTransform,
  type TouchState,
} from './physics';

const FRAME = 1000 / 60;

function run(state: TouchState, ms: number, onFrame?: (s: TouchState) => void): TouchState {
  let s = state;
  for (let t = 0; t < ms; t += FRAME) {
    s = step(s, FRAME);
    onFrame?.(s);
  }
  return s;
}

/** 놓은 뒤 쉬는 자세(squash 0)를 몇 번 가로지르는지 */
function countZeroCrossings(state: TouchState, ms: number): { crossings: number; minSquash: number; settleMs: number } {
  let s = state;
  let crossings = 0;
  let prev = s.squash.x;
  let minSquash = Infinity;
  let settleMs = -1;
  for (let t = 0; t < ms; t += FRAME) {
    s = step(s, FRAME);
    if (Math.sign(s.squash.x) !== Math.sign(prev) && Math.abs(s.squash.x) > 0.002) crossings++;
    if (Math.abs(s.squash.x) > 0.002) prev = s.squash.x;
    minSquash = Math.min(minSquash, s.squash.x);
    if (settleMs < 0 && isAtRest(s)) settleMs = t;
  }
  return { crossings, minSquash, settleMs };
}

describe('touch physics', () => {
  it('rest state is stable', () => {
    const s = run(createTouchState(), 5000);
    expect(isAtRest(s)).toBe(true);
    expect(toTransform(s)).toEqual({ scaleX: 1, scaleY: 1, skewXDeg: -0, translateX: 0, translateY: 0 });
  });

  it('press squashes vertically and bulges horizontally', () => {
    const s = run(press(createTouchState(), { x: 0, y: 0 }, 1), 800);
    const t = toTransform(s);
    expect(t.scaleY).toBeLessThan(0.75);
    expect(t.scaleX).toBeGreaterThan(1.2);
    // 누르고 있는 동안에는 목표 근처에서 안정
    expect(isSettled(s)).toBe(true);
  });

  it('stronger pressure squashes more', () => {
    const soft = run(press(createTouchState(), { x: 0, y: 0 }, 0), 800);
    const hard = run(press(createTouchState(), { x: 0, y: 0 }, 1), 800);
    expect(hard.squash.x).toBeGreaterThan(soft.squash.x);
  });

  it('pressing the side leans away from the finger', () => {
    const s = run(press(createTouchState(), { x: -1, y: 0 }, 1), 800);
    expect(s.lean.x).toBeGreaterThan(0);
  });

  it('release overshoots, wobbles several times, then settles to rest', () => {
    const pressed = run(press(createTouchState(), { x: 0, y: 0 }, 1), 800);
    const { crossings, minSquash, settleMs } = countZeroCrossings(release(pressed), 8000);
    // 반대쪽(늘어난 쪽)으로 확실히 튕긴다
    expect(minSquash).toBeLessThan(-0.12);
    // 여러 번 출렁인다
    expect(crossings).toBeGreaterThanOrEqual(4);
    // 5초 안에 멈춘다
    expect(settleMs).toBeGreaterThan(0);
    expect(settleMs).toBeLessThan(5000);
  });

  it('reduced motion wobbles fewer times and settles faster', () => {
    const pressed = run(press(createTouchState({ reducedMotion: true }), { x: 0, y: 0 }, 1), 800);
    const { crossings, settleMs } = countZeroCrossings(release(pressed), 8000);
    expect(crossings).toBeLessThanOrEqual(1);
    expect(settleMs).toBeGreaterThan(0);
    expect(settleMs).toBeLessThan(2000);
  });

  it('dragging up stretches tall and thin', () => {
    let s = press(createTouchState(), { x: 0, y: -0.5 }, 0.5);
    s = run(drag(s, { x: 0, y: -1 }), 1000);
    const t = toTransform(s);
    expect(t.scaleY).toBeGreaterThan(1.2);
    expect(t.scaleX).toBeLessThan(0.9);
    expect(stretchAmount(s)).toBeGreaterThan(0.4);
  });

  it('dragging sideways leans toward the drag', () => {
    let s = press(createTouchState(), { x: 0, y: 0 }, 0.5);
    s = run(drag(s, { x: 1, y: 0 }), 1000);
    const t = toTransform(s);
    expect(s.lean.x).toBeGreaterThan(0.3);
    // 윗부분이 오른쪽으로 → CSS skewX 는 음수
    expect(t.skewXDeg).toBeLessThan(0);
    expect(t.translateX).toBeGreaterThan(0);
  });

  it('stretch is bounded even for huge drags', () => {
    for (const d of [
      { x: 0, y: -100 },
      { x: 100, y: 0 },
      { x: -100, y: 100 },
      { x: 0, y: 1e6 },
    ]) {
      let s = press(createTouchState(), { x: 0, y: 0 }, 1);
      let maxScaleY = 0;
      let minScaleY = Infinity;
      let maxSkew = 0;
      s = run(drag(s, d), 2000, (f) => {
        const t = toTransform(f);
        maxScaleY = Math.max(maxScaleY, t.scaleY);
        minScaleY = Math.min(minScaleY, t.scaleY);
        maxSkew = Math.max(maxSkew, Math.abs(t.skewXDeg));
      });
      expect(Math.abs(s.squash.target)).toBeLessThanOrEqual(TUNING.stretchUpMax + TUNING.pressMax);
      expect(Math.abs(s.lean.target)).toBeLessThanOrEqual(TUNING.leanMax);
      expect(maxScaleY).toBeLessThanOrEqual(1.75);
      expect(minScaleY).toBeGreaterThanOrEqual(0.45);
      expect(maxSkew).toBeLessThan(45);
      // 다시 놓으면 쉬는 자세로
      expect(isAtRest(run(release(s), 8000))).toBe(true);
    }
  });

  it('soft limit is monotonic and saturates', () => {
    expect(softLimit(0, 1)).toBe(0);
    expect(softLimit(0.1, 1)).toBeCloseTo(0.0997, 3);
    expect(softLimit(10, 0.5)).toBeLessThanOrEqual(0.5);
    expect(softLimit(-10, 0.5)).toBeGreaterThanOrEqual(-0.5);
    expect(softLimit(2, 1)).toBeGreaterThan(softLimit(1, 1));
    // 멀리 갈수록 늘어나는 양이 줄어든다 (저항 증가)
    expect(softLimit(2, 1) - softLimit(1.5, 1)).toBeLessThan(softLimit(0.5, 1) - softLimit(0, 1));
  });

  it('clamps dt so huge or invalid frames do not explode', () => {
    const pressed = release(run(press(createTouchState(), { x: 0, y: 0 }, 1), 800));
    const big = step(pressed, 10_000);
    const capped = step(pressed, TUNING.maxDtMs);
    expect(big).toEqual(capped);
    expect(step(pressed, -5)).toBe(pressed);
    expect(step(pressed, Number.NaN)).toBe(pressed);
    expect(Math.abs(big.squash.x)).toBeLessThan(1);
  });

  it('is deterministic', () => {
    const script = (s0: TouchState) => {
      let s = press(s0, { x: 0.3, y: -0.2 }, 0.7);
      s = run(s, 300);
      s = drag(s, { x: 0.5, y: -0.8 });
      s = run(s, 400);
      s = release(s);
      s = poke(s, { x: -0.4, y: 0 }, 1);
      s = tickle(s, -1);
      return run(s, 900);
    };
    expect(script(createTouchState())).toEqual(script(createTouchState()));
  });

  it('poke and tickle move the jelly and it settles afterwards', () => {
    let s = poke(createTouchState(), { x: 0.5, y: 0 }, 1);
    let maxSquash = 0;
    s = run(s, 200, (f) => (maxSquash = Math.max(maxSquash, f.squash.x)));
    expect(maxSquash).toBeGreaterThan(0.1);
    s = tickle(tickle(s, 1), -1);
    expect(isAtRest(run(s, 6000))).toBe(true);
  });

  it('snapToTargets removes the tiny residual once settled', () => {
    const s = snapToTargets(run(release(run(press(createTouchState(), { x: 0, y: 0 }, 1), 500)), 6000));
    expect(toTransform(s).scaleX).toBe(1);
    expect(toTransform(s).scaleY).toBe(1);
    expect(isAtRest(s)).toBe(true);
  });

  it('does not mutate the input state', () => {
    const s0 = createTouchState();
    const copy = JSON.parse(JSON.stringify(s0)) as TouchState;
    step(poke(press(s0, { x: 0, y: 0 }, 1), { x: 0, y: 0 }), 16);
    expect(s0).toEqual(copy);
  });
});

describe('reactions: melt, hop, stretchUp', () => {
  it('melting spreads flatter than the deepest press and recovers after release', () => {
    const pressed = run(press(createTouchState(), { x: 0, y: 0 }, 1), 1500);
    const melted = run(melt(createTouchState(), { x: 0.4, y: 0 }, 1), 1500);
    expect(toTransform(melted).scaleY).toBeLessThan(toTransform(pressed).scaleY);
    expect(melted.squash.target).toBeCloseTo(MELT_SQUASH);
    expect(melted.lean.target).toBeCloseTo(0);
    const half = melt(createTouchState(), { x: 0, y: 0 }, 0.5);
    expect(half.squash.target).toBeLessThan(MELT_SQUASH);
    const back = run(release(melted), 6000);
    expect(isAtRest(back)).toBe(true);
    expect(melt(createTouchState(), { x: 0, y: 0 }, Number.NaN).squash.target).toBeCloseTo(TUNING.pressMax);
  });

  it('hop jumps up (negative offset) and lands back', () => {
    let s = hop(createTouchState(), 1);
    let minY = 0;
    s = run(s, 6000, (f) => {
      minY = Math.min(minY, toTransform(f).translateY);
    });
    expect(minY).toBeLessThan(-0.2);
    expect(isAtRest(s)).toBe(true);
  });

  it('stretchUp makes the body taller for a moment', () => {
    let maxY = 1;
    run(stretchUp(createTouchState(), 1), 1000, (f) => {
      maxY = Math.max(maxY, toTransform(f).scaleY);
    });
    expect(maxY).toBeGreaterThan(1.08);
  });
});
