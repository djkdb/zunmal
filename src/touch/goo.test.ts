import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../lib/rng';
import { GOO_TUNING, createGoo, gooDraws, gooLift, gooPeelSpeed, stepGoo, type Goo } from './goo';

const contact = { x: 0.1, y: 0.2 };

function run(g: Goo | null, ms: number, onFrame?: (g: Goo) => void): Goo | null {
  let cur = g;
  for (let t = 0; t < ms && cur; t += 16) {
    cur = stepGoo(cur, 16);
    if (cur && onFrame) onFrame(cur);
  }
  return cur;
}

describe('찐득이 실 가닥', () => {
  it('가닥 수 0 이나 붙는 시간 0 이면 없다', () => {
    expect(createGoo(0, contact, 300, 1, createSeededRng(1))).toBeNull();
    expect(createGoo(5, contact, 0, 1, createSeededRng(1))).toBeNull();
    expect(createGoo(99, contact, 300, 1, createSeededRng(1))?.strands.length).toBe(GOO_TUNING.maxStrands);
  });

  it('같은 시드면 같은 가닥 (결정적)', () => {
    expect(createGoo(5, contact, 300, 1, createSeededRng(7))).toEqual(createGoo(5, contact, 300, 1, createSeededRng(7)));
  });

  it('손가락이 들리며 늘어나고 가늘어지다가, 가닥마다 다른 때 끊어져 방울이 되고 사라진다', () => {
    const g = createGoo(5, contact, 380, 1.4, createSeededRng(3));
    expect(g).not.toBeNull();
    const first = gooDraws(g);
    expect(first).toHaveLength(5);
    let longest = 0;
    let thinnest = Infinity;
    let sawDrop = false;
    let sawMixed = false;
    const end = run(g, 2000, (cur) => {
      const draws = gooDraws(cur);
      for (const d of draws) {
        if (!d.drop) {
          longest = Math.max(longest, Math.hypot(d.x1 - d.x0, d.y1 - d.y0));
          thinnest = Math.min(thinnest, d.waist);
        } else {
          sawDrop = true;
        }
        expect(d.alpha).toBeGreaterThanOrEqual(0);
        expect(d.alpha).toBeLessThanOrEqual(1);
      }
      if (draws.some((d) => d.drop) && draws.some((d) => !d.drop)) sawMixed = true;
    });
    expect(longest).toBeGreaterThan(0.8);
    expect(thinnest).toBeLessThan(first[0]!.waist);
    expect(sawDrop).toBe(true);
    expect(sawMixed).toBe(true);
    expect(end).toBeNull();
  });

  it('손가락은 위(−y)로 들린다', () => {
    const g = createGoo(3, contact, 300, 1, createSeededRng(2))!;
    const later = run(g, 200)!;
    const d = gooDraws(later).filter((x) => !x.drop);
    for (const s of d) expect(s.y1).toBeLessThan(s.y0);
    expect(gooLift(later)).toBeGreaterThan(gooLift(g));
  });

  it('떼어내는 빠르기: 붙어 있는 동안만, 0..1', () => {
    const g = createGoo(5, contact, 380, 1, createSeededRng(5))!;
    expect(gooPeelSpeed(g)).toBeGreaterThan(0);
    const mid = run(g, 200)!;
    expect(gooPeelSpeed(mid)).toBeGreaterThan(0);
    expect(gooPeelSpeed(mid)).toBeLessThanOrEqual(1);
    const after = run(g, 400);
    expect(gooPeelSpeed(after)).toBe(0);
    expect(gooPeelSpeed(null)).toBe(0);
  });
});
