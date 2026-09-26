import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../lib/rng';
import { FILL_DOTS, createFill, fillDots, fillKindIndex, isFillAtRest, stepFill, type FillState } from './filling';

function run(s: FillState, squeeze: number, ms: number, reduced = false): FillState {
  let out = s;
  for (let t = 0; t < ms; t += 16) out = stepFill(out, squeeze, 16, reduced);
  return out;
}

describe('특별한 속', () => {
  it('누르면 금방 밝아지고 놓으면 천천히 식는다', () => {
    let s = run(createFill(), 1, 200);
    expect(s.glow).toBeGreaterThan(0.9);
    s = run(s, 0, 200);
    expect(s.glow).toBeGreaterThan(0.6);
    s = run(s, 0, 6000);
    expect(s.glow).toBe(0);
  });

  it('누르는 양이 바뀌면 소용돌이치다 멈춘다', () => {
    let s = run(createFill(), 1, 100);
    expect(s.spin).toBeGreaterThan(1);
    const a = s.swirl;
    s = run(s, 1, 300);
    expect(s.swirl).toBeGreaterThan(a);
    s = run(s, 0, 8000);
    expect(isFillAtRest(s)).toBe(true);
  });

  it('움직임 줄이기면 돌지 않는다 (밝기만)', () => {
    const s = run(createFill(), 1, 300, true);
    expect(s.swirl).toBe(0);
    expect(s.glow).toBeGreaterThan(0.9);
  });

  it('이상한 입력에도 멀쩡하다', () => {
    const s = stepFill(createFill(), Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(s.glow) && Number.isFinite(s.swirl)).toBe(true);
  });

  it('알갱이 자리는 시드가 같으면 같고 모두 원 안', () => {
    for (const kind of ['glitter', 'starBeads', 'galaxy', 'rainbowGel'] as const) {
      const a = fillDots(kind, createSeededRng(7));
      expect(a).toEqual(fillDots(kind, createSeededRng(7)));
      expect(a).toHaveLength(FILL_DOTS[kind]);
      for (const d of a) expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(0.95);
      expect(fillKindIndex(kind)).toBeGreaterThan(0);
    }
    expect(fillKindIndex(null)).toBe(0);
  });
});
