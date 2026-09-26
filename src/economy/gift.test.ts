import { describe, expect, it } from 'vitest';
import { AFFECTION_PER_LEVEL } from '../data/affection';
import { GIFT_COINS } from './config';
import { giftAvailable, giftCoins, giftGiver } from './gift';

describe('말랑 선물', () => {
  it('친밀도가 가장 높은 말랑이가 가져온다', () => {
    expect(
      giftGiver({ unboxed: ['peach-mochi', 'soda-drop'], affection: { 'soda-drop': 30, 'peach-mochi': 5 }, partnerId: 'peach-mochi' }),
    ).toBe('soda-drop');
  });

  it('같으면 파트너, 파트너가 없으면 도감 순', () => {
    expect(giftGiver({ unboxed: ['peach-mochi', 'soda-drop'], affection: {}, partnerId: 'soda-drop' })).toBe('soda-drop');
    expect(giftGiver({ unboxed: ['soda-drop', 'peach-mochi'], affection: {}, partnerId: null })).toBe('peach-mochi');
  });

  it('봉인된 캡슐 속 말랑이는 가져오지 않는다 (연 말랑이가 없으면 파트너)', () => {
    expect(giftGiver({ unboxed: ['peach-mochi'], affection: { phoenix: 999 }, partnerId: 'peach-mochi' })).toBe('peach-mochi');
    expect(giftGiver({ unboxed: [], affection: {}, partnerId: 'peach-mochi' })).toBe('peach-mochi');
    expect(giftGiver({ unboxed: [], affection: {}, partnerId: null })).toBeNull();
  });

  it('코인 = 기본 + 단계 × 10, 최대 120', () => {
    expect(giftCoins(0)).toBe(GIFT_COINS.base + GIFT_COINS.perLevel);
    expect(giftCoins(AFFECTION_PER_LEVEL * 3)).toBe(GIFT_COINS.base + 4 * GIFT_COINS.perLevel);
    expect(giftCoins(99_999)).toBe(GIFT_COINS.max);
    expect(giftCoins(Number.NaN)).toBe(GIFT_COINS.base + GIFT_COINS.perLevel);
  });

  it('서울 날짜로 하루 한 번', () => {
    expect(giftAvailable(null, '2026-09-26', 'peach-mochi')).toBe(true);
    expect(giftAvailable('2026-09-25', '2026-09-26', 'peach-mochi')).toBe(true);
    expect(giftAvailable('2026-09-26', '2026-09-26', 'peach-mochi')).toBe(false);
    expect(giftAvailable(null, '2026-09-26', null)).toBe(false);
  });
});
