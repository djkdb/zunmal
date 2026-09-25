import { describe, expect, it } from 'vitest';
import { createSeededRng, pickOne, randomIndex, shuffle } from './rng';

describe('createSeededRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('다른 시드는 다른 수열을 만든다', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const same = Array.from({ length: 20 }, () => a() === b()).every(Boolean);
    expect(same).toBe(false);
  });

  it('항상 [0, 1) 범위를 반환한다', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('helpers', () => {
  it('randomIndex는 rng가 1을 반환해도 범위를 넘지 않는다', () => {
    expect(randomIndex(() => 1, 5)).toBe(4);
    expect(randomIndex(() => 0, 5)).toBe(0);
  });

  it('pickOne은 빈 배열에서 에러를 던진다', () => {
    expect(() => pickOne(() => 0, [])).toThrow();
  });

  it('shuffle은 원소를 보존한다', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(createSeededRng(3), input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
