import { describe, expect, it } from 'vitest';
import { CHARACTERS, STARTER_CHARACTER_IDS, STARTER_FEELS } from './characters';
import { MATERIAL_IDS, materialCoverage, materialIdFor } from './materialIds';

describe('materialCoverage', () => {
  it('없으면 0종', () => {
    expect(materialCoverage([])).toEqual({ have: [], count: 0, total: MATERIAL_IDS.length });
  });

  it('같은 촉감은 한 번만 세고 표 순서로 돌려준다', () => {
    const c = materialCoverage(['soda-drop', 'peach-mochi', 'grape-jelly']);
    expect(c.have).toEqual(['slowRise', 'jelly']);
    expect(c.count).toBe(2);
  });

  it('모르는 id는 기본 촉감으로 센다', () => {
    expect(materialCoverage(['nope']).have).toEqual([materialIdFor('nope')]);
  });

  it('32종을 다 모으면 네 촉감 모두', () => {
    const c = materialCoverage(CHARACTERS.map((ch) => ch.id));
    expect(c.count).toBe(MATERIAL_IDS.length);
    expect(c.have).toEqual([...MATERIAL_IDS]);
  });
});

describe('STARTER_FEELS', () => {
  it('시작 말랑이마다 짧은 촉감 한 줄', () => {
    for (const id of STARTER_CHARACTER_IDS) {
      const line = STARTER_FEELS[id];
      expect(line, id).toBeTruthy();
      expect(line!.length).toBeLessThanOrEqual(12);
    }
  });
});
