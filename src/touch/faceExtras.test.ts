import { describe, expect, it } from 'vitest';
import { SHAPES } from '../components/malang/shapes';
import { baseEyes, EXTRA_FACES, faceExtras, isExtraFace, spiralPath } from './faceExtras';

describe('face extras', () => {
  it('picks the eyes to draw underneath', () => {
    expect(baseEyes('default', 'sparkle')).toBe('sparkle');
    expect(baseEyes('dizzy', 'wide')).toBe('wide');
    expect(baseEyes('yawn', 'dot')).toBe('sleepy');
    expect(baseEyes('blush', 'dot')).toBe('happy');
    expect(baseEyes('happy', 'dot')).toBe('happy');
  });

  it('only the touch-only faces add paths', () => {
    const shape = SHAPES.round;
    for (const f of EXTRA_FACES) {
      expect(isExtraFace(f)).toBe(true);
      expect(faceExtras(f, shape).length).toBeGreaterThan(0);
    }
    expect(isExtraFace('happy')).toBe(false);
    expect(faceExtras('default', shape)).toEqual([]);
  });

  it('draws valid, finite paths around the face for every shape', () => {
    for (const shape of Object.values(SHAPES)) {
      for (const f of EXTRA_FACES) {
        for (const p of faceExtras(f, shape)) {
          expect(p.d).toMatch(/^M/);
          expect(p.d).not.toMatch(/NaN|Infinity/);
          expect(p.fill !== undefined || p.stroke !== undefined).toBe(true);
          const nums = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
          for (const n of nums) {
            expect(n).toBeGreaterThan(-20);
            expect(n).toBeLessThan(140);
          }
        }
      }
    }
  });

  it('dizzy eyes cover the original eyes (radius > widest eye)', () => {
    const shape = SHAPES.round;
    const [cover] = faceExtras('dizzy', shape);
    expect(cover?.fill).toBe('#ffffff');
    // 가장 큰 눈(wide)은 반지름 7 + 선
    expect(cover?.d).toContain('A8.4 8.4');
  });

  it('spiral starts near the centre and ends at the radius', () => {
    const d = spiralPath(10, 10, 6, 2, 8);
    const pts = d.split(/[ML]/).filter(Boolean).map((s) => s.trim().split(' ').map(Number));
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(first[0]! - 10, first[1]! - 10)).toBeLessThan(1.5);
    expect(Math.hypot(last[0]! - 10, last[1]! - 10)).toBeCloseTo(6, 1);
  });
});
