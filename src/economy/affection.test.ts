import { describe, expect, it } from 'vitest';
import { AFFECTION_HEARTS, AFFECTION_PER_LEVEL, REACTION_UNLOCKS, levelOf } from '../data/affection';
import { GIFT_COINS, SHOP_AFFECTION_BONUS, SHOP_MATERIAL_PERKS } from './config';
import {
  affectionForLevel,
  affectionMaxLevel,
  affectionProgress,
  hasLevelUpPerks,
  heartFills,
  levelUpPerks,
  perkLines,
  perksAt,
} from './affection';
import { giftCoins } from './gift';
import { affectionBonus } from './shop';

describe('affectionProgress', () => {
  it('새 말랑이: Lv.1, 빈 하트, 다음 단계에 머리 쓰다듬기', () => {
    const p = affectionProgress(0);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.needed).toBe(AFFECTION_PER_LEVEL);
    expect(p.toNext).toBe(AFFECTION_PER_LEVEL);
    expect(p.hearts).toEqual([0, 0, 0, 0, 0]);
    expect(p.perks.shopBonus).toBe(0);
    expect(p.next?.level).toBe(2);
    expect(p.next?.reactions.map((r) => r.id)).toEqual(['pat']);
    expect(p.next?.shopBonus).toBeCloseTo(SHOP_AFFECTION_BONUS.perLevel);
    expect(p.next?.giftGain).toBe(GIFT_COINS.perLevel);
    expect(p.nextReaction?.id).toBe('pat');
    expect(p.maxed).toBe(false);
  });

  it('levelOf·가게·선물 공식과 같은 값을 쓴다', () => {
    for (const v of [0, 1, 49, 50, 99, 150, 199, 200, 250, 399, 400, 1234, 9999]) {
      const p = affectionProgress(v);
      expect(p.level).toBe(levelOf(v));
      expect(p.xp + affectionForLevel(p.level)).toBe(v);
      expect(p.toNext).toBe(AFFECTION_PER_LEVEL - p.xp);
      expect(p.perks.giftCoins).toBe(giftCoins(v));
      expect(p.perks.shopBonus).toBeCloseTo(affectionBonus(v, 'jelly'));
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThan(1);
    }
  });

  it('Lv.4 → Lv.5: 녹아내리기 + 가게 +20% + 선물 +10', () => {
    const p = affectionProgress(3 * AFFECTION_PER_LEVEL + 18);
    expect(p.level).toBe(4);
    expect(p.xp).toBe(18);
    expect(p.toNext).toBe(32);
    expect(p.next?.reactions[0]?.label).toBe('녹아내리기');
    expect(p.next?.shopBonus).toBeCloseTo(0.2);
    expect(p.next?.giftCoins).toBe(GIFT_COINS.base + 5 * GIFT_COINS.perLevel);
    expect(p.next?.giftGain).toBe(GIFT_COINS.perLevel);
  });

  it('찐득이는 가게 보너스가 두 배', () => {
    const p = affectionProgress(3 * AFFECTION_PER_LEVEL, { material: 'sticky' });
    expect(p.perks.shopBonus).toBeCloseTo(3 * SHOP_AFFECTION_BONUS.perLevel * SHOP_MATERIAL_PERKS.stickyAffectionMultiplier);
    expect(p.next?.shopBonus).toBeCloseTo(affectionBonus(4 * AFFECTION_PER_LEVEL, 'sticky'));
  });

  it('하트는 단계 안의 애정을 다섯 칸으로 나눠 채운다', () => {
    expect(AFFECTION_HEARTS).toBe(5);
    expect(heartFills(0)).toEqual([0, 0, 0, 0, 0]);
    expect(heartFills(10)).toEqual([1, 0, 0, 0, 0]);
    expect(heartFills(25)).toEqual([1, 1, 0.5, 0, 0]);
    expect(heartFills(49)[4]).toBeCloseTo(0.9);
    expect(affectionProgress(AFFECTION_PER_LEVEL).hearts).toEqual([0, 0, 0, 0, 0]);
  });

  it('이상한 값은 0 으로', () => {
    expect(affectionProgress(Number.NaN).level).toBe(1);
    expect(affectionProgress(-30).value).toBe(0);
    expect(affectionProgress(12.7).xp).toBe(12);
  });
});

describe('perkLines', () => {
  it('반응 → 가게 → 선물 순 짧은 줄', () => {
    expect(perkLines(levelUpPerks(5)).map((l) => l.text)).toEqual(['새 반응 녹아내리기', '가게 보너스 +20%', '선물 +10코인']);
    expect(perkLines(levelUpPerks(5))[0]?.howTo).toBe(REACTION_UNLOCKS.find((r) => r.level === 5)?.howTo);
  });
  it('반응이 없는 단계는 선물만, 끝난 뒤에는 없음', () => {
    expect(perkLines(levelUpPerks(8)).map((l) => l.kind)).toEqual(['gift']);
    expect(perkLines(levelUpPerks(affectionMaxLevel() + 1))).toEqual([]);
  });
});

describe('최대 단계', () => {
  it('반응·가게·선물이 모두 끝까지 오르는 단계 (선물 상한이 가장 늦다)', () => {
    const lastReaction = Math.max(...REACTION_UNLOCKS.map((r) => r.level));
    const giftCap = Math.ceil((GIFT_COINS.max - GIFT_COINS.base) / GIFT_COINS.perLevel);
    const shopCap = 1 + Math.ceil(SHOP_AFFECTION_BONUS.max / SHOP_AFFECTION_BONUS.perLevel);
    expect(affectionMaxLevel()).toBe(Math.max(lastReaction, giftCap, shopCap));
    expect(affectionMaxLevel('sticky')).toBe(affectionMaxLevel());
  });

  it('최대 단계부터는 더 열릴 것이 없고 next 가 null', () => {
    const max = affectionMaxLevel();
    const before = affectionProgress(affectionForLevel(max) - 1);
    expect(before.maxed).toBe(false);
    expect(before.next && hasLevelUpPerks(before.next)).toBe(true);
    const at = affectionProgress(affectionForLevel(max));
    expect(at.maxed).toBe(true);
    expect(at.next).toBeNull();
    expect(at.nextReaction).toBeNull();
    expect(at.perks.giftCoins).toBe(GIFT_COINS.max);
    expect(at.perks.shopBonus).toBeCloseTo(SHOP_AFFECTION_BONUS.max);
    for (let lv = max + 1; lv < max + 20; lv += 1) expect(hasLevelUpPerks(levelUpPerks(lv))).toBe(false);
  });

  it('단계마다 새로 생기는 것이 perksAt 차이와 같다', () => {
    for (let lv = 2; lv <= affectionMaxLevel(); lv += 1) {
      const up = levelUpPerks(lv);
      const a = perksAt(lv - 1);
      const b = perksAt(lv);
      expect(up.shopBonus === null).toBe(b.shopBonus <= a.shopBonus + 1e-9);
      expect(up.giftGain).toBe(b.giftCoins - a.giftCoins);
      expect(hasLevelUpPerks(up)).toBe(true);
    }
    expect(hasLevelUpPerks(levelUpPerks(1))).toBe(false);
  });
});
