import { describe, expect, it } from 'vitest';
import { computeShopRates } from '../../economy/shop';
import { MATERIAL_IDS } from '../../data/materialIds';
import { MATERIAL_PERK_TEXT, bonusLabel, formatDuration, setChangeText, trendText } from './perks';

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

describe('가게 요약 글자', () => {
  it('남은 시간', () => {
    expect(formatDuration(0)).toBe('1분');
    expect(formatDuration(59_000)).toBe('1분');
    expect(formatDuration(45 * 60_000)).toBe('45분');
    expect(formatDuration(3 * 3_600_000)).toBe('3시간');
    expect(formatDuration(3 * 3_600_000 + 20 * 60_000 - 1)).toBe('3시간 20분');
    expect(formatDuration(Number.NaN)).toBe('1분');
  });

  it('변화 딱지', () => {
    expect(trendText({ trend: 'up', percent: 40, beforePerHour: 10, afterPerHour: 14 })).toBe('+40%');
    expect(trendText({ trend: 'down', percent: -6, beforePerHour: 50, afterPerHour: 47 })).toBe('-6%');
    expect(trendText({ trend: 'same', percent: 0, beforePerHour: 50, afterPerHour: 50 })).toBe('그대로');
    expect(trendText({ trend: 'up', percent: null, beforePerHour: 0, afterPerHour: 14 })).toBe('+14코인');
    // 큰 가게에서 1코인 오르면 반올림 0% → 최소 1%
    expect(trendText({ trend: 'up', percent: 0, beforePerHour: 200, afterPerHour: 201 })).toBe('+1%');
  });

  it('세트 변화 한 줄', () => {
    expect(setChangeText({ id: 'd', name: '디저트 가게', before: 0, after: 0.1 })).toBe('디저트 가게 세트 +10%가 생겨요');
    expect(setChangeText({ id: 'd', name: '디저트 가게', before: 0.1, after: 0 })).toBe('디저트 가게 세트가 깨져요');
    expect(setChangeText({ id: 'd', name: '디저트 가게', before: 0.1, after: 0.2 })).toBe('디저트 가게 세트 +20%로 올라요');
    expect(setChangeText({ id: 'd', name: '디저트 가게', before: 0.2, after: 0.1 })).toBe('디저트 가게 세트 +10%로 내려가요');
  });
});
