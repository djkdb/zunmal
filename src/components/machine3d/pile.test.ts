import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../lib/rng';
import { PILE_BOUNDS, PILE_COUNT, buildSettledPile, maxOverlap, pileMotion, settlePile, stepPile, stirPile, createPile } from './pile';

describe('capsule pile solver', () => {
  it('settles into a still pile without overlaps, inside the dome and above the floor', () => {
    const s = buildSettledPile(7);
    expect(s.bodies).toHaveLength(PILE_COUNT);
    expect(maxOverlap(s)).toBeLessThan(0.01);
    for (const b of s.bodies) {
      expect(Math.hypot(b.x, b.y, b.z)).toBeLessThanOrEqual(PILE_BOUNDS.radius - b.r + 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(PILE_BOUNDS.floorY + b.r - 1e-6);
    }
    // 멈춘 뒤 몇 스텝을 더 돌려도 거의 움직이지 않는다 (쌓인 채 안정)
    for (let i = 0; i < 120; i++) stepPile(s, 1 / 120);
    expect(pileMotion(s)).toBeLessThan(1e-5);
  });

  it('fills the lower part of the dome (a heap, not a floating cloud)', () => {
    const s = buildSettledPile(3);
    const top = Math.max(...s.bodies.map((b) => b.y + b.r));
    // 돔 아랫부분(목 위 ~40–60%)까지 찬다
    expect(top).toBeGreaterThan(-0.2);
    expect(top).toBeLessThan(0.55);
    const meanY = s.bodies.reduce((a, b) => a + b.y, 0) / s.bodies.length;
    expect(meanY).toBeLessThan(-0.15);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = buildSettledPile(11);
    const b = buildSettledPile(11);
    const c = buildSettledPile(12);
    expect(a.bodies.map((x) => [x.x, x.y, x.z, x.kind])).toEqual(b.bodies.map((x) => [x.x, x.y, x.z, x.kind]));
    expect(a.bodies.map((x) => x.x)).not.toEqual(c.bodies.map((x) => x.x));
  });

  it('mixes kinds as configured', () => {
    const s = createPile(5);
    const count = (k: string) => s.bodies.filter((b) => b.kind === k).length;
    expect(count('capsule')).toBeGreaterThan(15);
    expect(count('ribbed') + count('clover')).toBeGreaterThanOrEqual(2);
  });

  it('a stir lifts the heap, then it settles back without escaping', () => {
    const s = buildSettledPile(21);
    const before = s.bodies.reduce((a, b) => a + b.y, 0);
    const rng = createSeededRng(1);
    stirPile(s, rng, 1.2);
    let peak = before;
    for (let i = 0; i < 20; i++) {
      stepPile(s, 1 / 120);
      peak = Math.max(peak, s.bodies.reduce((a, b) => a + b.y, 0));
    }
    expect(peak).toBeGreaterThan(before + 0.3);
    settlePile(s);
    expect(maxOverlap(s)).toBeLessThan(0.01);
    for (const b of s.bodies) expect(Math.hypot(b.x, b.y, b.z)).toBeLessThanOrEqual(PILE_BOUNDS.radius - b.r + 1e-6);
  });
});
