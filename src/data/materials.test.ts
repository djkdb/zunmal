import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { FILLING_BY_ID, MATERIALS, MATERIAL_BY_ID, MATERIAL_IDS, fillingOf, materialIdOf, materialOf } from './materials';

describe('촉감 표', () => {
  it('32종 모두 촉감이 정해져 있고 표에 없는 id 가 없다', () => {
    for (const c of CHARACTERS) expect(MATERIAL_BY_ID[c.id], c.id).toBeDefined();
    const ids = new Set(CHARACTERS.map((c) => c.id));
    for (const id of Object.keys(MATERIAL_BY_ID)) expect(ids.has(id), id).toBe(true);
  });

  it('네 가지 촉감이 모두 쓰이고 한쪽으로 쏠리지 않는다', () => {
    const count = new Map<string, number>();
    for (const c of CHARACTERS) count.set(materialIdOf(c), (count.get(materialIdOf(c)) ?? 0) + 1);
    for (const m of MATERIAL_IDS) expect(count.get(m) ?? 0, m).toBeGreaterThanOrEqual(5);
  });

  it('모르는 말랑이는 기본 촉감', () => {
    expect(materialOf({ id: 'nope' }).id).toBe('jelly');
  });

  it('촉감마다 성격이 숫자로 드러난다', () => {
    const { slowRise, jelly, stretchy, sticky } = MATERIALS;
    expect(slowRise.feel.riseTauMs).toBeGreaterThan(0);
    expect(jelly.world.bounce).toBeGreaterThan(slowRise.world.bounce * 3);
    expect(stretchy.feel.stretch).toBeGreaterThanOrEqual(2);
    expect(stretchy.carryFrac).toBeGreaterThan(jelly.carryFrac);
    expect(sticky.feel.stickMs).toBeGreaterThan(0);
    expect(sticky.world.stick).toBeGreaterThan(0);
    for (const m of MATERIAL_IDS) {
      if (m !== 'sticky') expect(MATERIALS[m].world.stick).toBe(0);
    }
  });
});

describe('특별한 속', () => {
  it('전설 이상만 속이 있고 모두 있다', () => {
    for (const c of CHARACTERS) {
      const f = fillingOf(c);
      const high = c.rarity === 'legendary' || c.rarity === 'mythic' || c.rarity === 'secret';
      expect(f !== null, c.id).toBe(high);
      if (high) expect(FILLING_BY_ID[c.id], c.id).toBeDefined();
    }
  });

  it('표에 없는 전설은 기본 반짝이 가루', () => {
    const f = fillingOf({ id: 'x', rarity: 'legendary', color: '#123456' });
    expect(f?.kind).toBe('glitter');
    expect(f?.label).toBe('반짝이 가루 속');
  });
});
