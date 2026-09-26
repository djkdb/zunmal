import { describe, expect, it } from 'vitest';
import { computeShopRates } from '../../economy/shop';
import { MATERIAL_IDS } from '../../data/materialIds';
import { MATERIAL_PERK_TEXT, bonusLabel } from './perks';

describe('가게 글자', () => {
  it('보너스 칩: "반짝 +25%", "디저트 가게 세트 +20%"', () => {
    const owned = { 'peach-mochi': { shinyCount: 1 }, 'custard-bun': { shinyCount: 0 }, 'choco-chip': { shinyCount: 0 } };
    const r = computeShopRates(['peach-mochi', 'custard-bun', 'choco-chip'], { owned, affection: { 'peach-mochi': 100 } });
    expect(r.staff[0]?.bonuses.map(bonusLabel)).toEqual(['친밀도 +10%', '반짝 +25%', '디저트 가게 세트 +20%']);
    expect(bonusLabel({ kind: 'help', amount: 0.1 })).toBe('쭉쭉 도움 +10%');
  });

  it('촉감마다 특기 한 줄', () => {
    for (const m of MATERIAL_IDS) expect(MATERIAL_PERK_TEXT[m].length).toBeGreaterThan(5);
  });
});
