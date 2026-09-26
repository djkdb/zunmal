import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { COLLECTIONS } from './collections';
import {
  COLLECTION_NEW_MS,
  characterPullChance,
  displayPercent,
  expectedPullsToCollect,
  isNewInCollection,
  nearestIncompleteSet,
  orderSetsForDisplay,
  roughPullCount,
  setProgressOf,
  summarizeCollection,
  type OwnedLike,
} from './collectionProgress';
import { RARITIES } from './rarity';

const own = (ids: string[], shiny: string[] = []): OwnedLike =>
  Object.fromEntries(ids.map((id) => [id, { shinyCount: shiny.includes(id) ? 1 : 0 }]));

const set = (id: string) => {
  const s = COLLECTIONS.find((c) => c.id === id);
  if (!s) throw new Error(id);
  return s;
};

describe('summarizeCollection', () => {
  it('빈 도감', () => {
    const s = summarizeCollection({ owned: {}, claimedSets: [] });
    expect(s.owned).toBe(0);
    expect(s.total).toBe(CHARACTERS.length);
    expect(s.percent).toBe(0);
    expect(s.shinySpecies).toBe(0);
    expect(s.byRarity.map((r) => r.rarity)).toEqual([...RARITIES]);
    expect(s.byRarity.reduce((n, r) => n + r.total, 0)).toBe(CHARACTERS.length);
    expect(s.sets).toHaveLength(COLLECTIONS.length);
    expect(s.claimableSets).toEqual([]);
  });

  it('전체·등급별 수와 반짝 종류 수', () => {
    const s = summarizeCollection({ owned: own(['peach-mochi', 'custard-bun', 'jellyfish'], ['jellyfish']), claimedSets: [] });
    expect(s.owned).toBe(3);
    expect(s.shinySpecies).toBe(1);
    expect(s.byRarity.find((r) => r.rarity === 'common')).toMatchObject({ owned: 2, total: 10 });
    expect(s.byRarity.find((r) => r.rarity === 'rare')).toMatchObject({ owned: 1, total: 7 });
    expect(s.percent).toBe(9);
  });

  it('알 수 없는 id 는 세지 않는다', () => {
    expect(summarizeCollection({ owned: own(['nope', 'peach-mochi']), claimedSets: [] }).owned).toBe(1);
  });

  it('완성하고 안 받은 세트만 받을 수 있음', () => {
    const dessert = set('dessert-shop');
    const s = summarizeCollection({ owned: own([...dessert.memberIds]), claimedSets: [] });
    expect(s.claimableSets.map((x) => x.set.id)).toEqual(['dessert-shop']);
    const after = summarizeCollection({ owned: own([...dessert.memberIds]), claimedSets: ['dessert-shop'] });
    expect(after.claimableSets).toEqual([]);
    expect(after.sets.find((x) => x.set.id === 'dessert-shop')).toMatchObject({ complete: true, claimed: true, claimable: false });
  });
});

describe('displayPercent', () => {
  it('하나라도 있으면 1 이상, 다 모아야 100', () => {
    expect(displayPercent(0, 32)).toBe(0);
    expect(displayPercent(1, 1000)).toBe(1);
    expect(displayPercent(999, 1000)).toBe(99);
    expect(displayPercent(32, 32)).toBe(100);
    expect(displayPercent(16, 32)).toBe(50);
    expect(displayPercent(3, 0)).toBe(0);
  });
});

describe('setProgressOf', () => {
  it('없는 말랑이·가장 높은 등급·기대 뽑기 수', () => {
    const p = setProgressOf(set('spring-picnic'), own(['peach-mochi', 'matcha-bean']), []);
    expect(p).toMatchObject({ owned: 2, total: 5, missing: 3, hardestMissing: 'epic', complete: false });
    expect(p.missingIds).toEqual(['marshmallow', 'lemon-sprout', 'sakura-spirit']);
    expect(p.expectedPulls).toBeGreaterThan(1 / characterPullChance('sakura-spirit'));
  });

  it('다 모으면 기대 뽑기 수 0', () => {
    const s = set('fruit-basket');
    expect(setProgressOf(s, own([...s.memberIds]), [])).toMatchObject({ missing: 0, expectedPulls: 0, hardestMissing: null, ratio: 1 });
  });
});

describe('characterPullChance', () => {
  it('등급 확률 ÷ 같은 등급 수, 모르면 0', () => {
    expect(characterPullChance('peach-mochi')).toBeCloseTo(0.6195 / 10, 6);
    expect(characterPullChance('nope')).toBe(0);
  });
});

describe('nearestIncompleteSet', () => {
  it('시작한 세트 중 가장 적게 남은 세트', () => {
    // 복숭아 모찌는 디저트 가게(6)와 봄 소풍(5)에 모두 속한다
    const s = summarizeCollection({ owned: own(['peach-mochi']), claimedSets: [] });
    expect(s.nearestSet?.set.id).toBe('spring-picnic');
    expect(s.nearestSet?.missing).toBe(4);
  });

  it('시작 안 한 세트는 적게 남아도 고르지 않는다 (시크릿 세트가 "가깝다"고 하지 않기)', () => {
    const s = summarizeCollection({ owned: own(['peach-mochi']), claimedSets: [] });
    expect(['deep-sea', 'dream-end']).not.toContain(s.nearestSet?.set.id);
  });

  it('남은 수가 같으면 덜 비싼(낮은 등급이 남은) 세트', () => {
    // 과일 바구니: 일반 2마리 남음 / 깊은 바다: 해파리(레어)만 있고 에픽·시크릿 2마리 남음
    const fruit = set('fruit-basket').memberIds.filter((id) => !['grape-jelly', 'tangerine'].includes(id));
    const s = summarizeCollection({ owned: own([...fruit, 'jellyfish']), claimedSets: [] });
    expect(s.sets.find((x) => x.set.id === 'fruit-basket')?.missing).toBe(2);
    expect(s.sets.find((x) => x.set.id === 'deep-sea')?.missing).toBe(2);
    expect(s.nearestSet?.set.id).toBe('fruit-basket');
  });

  it('아무 세트도 시작 안 했으면 가장 덜 비싼 세트', () => {
    const s = summarizeCollection({ owned: {}, claimedSets: [] });
    expect(s.nearestSet?.hardestMissing).not.toBe('secret');
    // 디저트 가게: 일반 5 + 레어 1 — 가장 흔한 말랑이들
    expect(s.nearestSet?.set.id).toBe('dessert-shop');
  });

  it('모두 모았으면 null', () => {
    const all = own(CHARACTERS.map((c) => c.id));
    expect(summarizeCollection({ owned: all, claimedSets: [] }).nearestSet).toBeNull();
    expect(nearestIncompleteSet([])).toBeNull();
  });
});

describe('expectedPullsToCollect', () => {
  it('한 마리면 1/p', () => {
    expect(expectedPullsToCollect(['peach-mochi'])).toBeCloseTo(1 / characterPullChance('peach-mochi'), 6);
  });

  it('같은 확률 둘이면 1.5/p (Σ 1/p 보다 작고 가장 드문 1/p 보다 크다)', () => {
    const p = characterPullChance('peach-mochi');
    const e = expectedPullsToCollect(['peach-mochi', 'custard-bun']);
    expect(e).toBeCloseTo(1.5 / p, 6);
    const spring = setProgressOf(set('spring-picnic'), own(['peach-mochi']), []);
    const exact = expectedPullsToCollect(spring.missingIds);
    expect(exact).toBeLessThan(spring.expectedPulls);
    expect(exact).toBeGreaterThan(1 / characterPullChance('sakura-spirit'));
  });

  it('비었거나 모르는 id 만 있으면 0', () => {
    expect(expectedPullsToCollect([])).toBe(0);
    expect(expectedPullsToCollect(['nope'])).toBe(0);
  });
});

describe('roughPullCount', () => {
  it('크기에 맞춰 둥글린다', () => {
    expect(roughPullCount(0)).toBe(0);
    expect(roughPullCount(Number.NaN)).toBe(0);
    expect(roughPullCount(0.4)).toBe(1);
    expect(roughPullCount(8.2)).toBe(9);
    expect(roughPullCount(24.2)).toBe(25);
    expect(roughPullCount(11)).toBe(10);
    expect(roughPullCount(412)).toBe(410);
    expect(roughPullCount(6012)).toBe(6000);
  });
});

describe('orderSetsForDisplay', () => {
  it('받을 수 있음 → 시작한 세트(남은 수 순) → 시작 안 한 세트 → 받은 세트', () => {
    const dessert = set('dessert-shop').memberIds;
    const fruit = set('fruit-basket').memberIds;
    // 디저트 가게 완성·안 받음, 과일 바구니 완성·받음, 봄 소풍은 모찌·마시멜로(디저트) + 말차 + 레몬(과일)으로 1마리 남음
    const s = summarizeCollection({
      owned: own([...dessert, ...fruit, 'matcha-bean']),
      claimedSets: ['fruit-basket'],
    });
    const order = orderSetsForDisplay(s.sets).map((x) => x.set.id);
    expect(order[0]).toBe('dessert-shop');
    expect(order[1]).toBe('spring-picnic');
    expect(order[order.length - 1]).toBe('fruit-basket');
    expect(order).toHaveLength(COLLECTIONS.length);
    // 시작 안 한 세트는 시작한 세트 뒤
    const started = s.sets.filter((x) => !x.complete && x.owned > 0).map((x) => x.set.id);
    const firstUnstarted = order.findIndex((id) => s.sets.find((x) => x.set.id === id)?.owned === 0);
    for (const id of started) expect(order.indexOf(id)).toBeLessThan(firstUnstarted);
  });

  it('아무것도 없으면 덜 비싼 순이라 꿈의 끝(시크릿)이 맨 뒤', () => {
    const order = orderSetsForDisplay(summarizeCollection({ owned: {}, claimedSets: [] }).sets).map((x) => x.set.id);
    expect(order[0]).toBe('dessert-shop');
    expect(order[order.length - 1]).toBe('dream-end');
  });
});

describe('isNewInCollection', () => {
  const now = 1_700_000_000_000;
  it('봉인 캡슐이면 오래전에 얻었어도 NEW', () => {
    expect(isNewInCollection({ firstObtainedAt: now - 30 * COLLECTION_NEW_MS }, true, now)).toBe(true);
  });
  it('연 말랑이는 처음 얻은 지 하루 안에만 NEW', () => {
    expect(isNewInCollection({ firstObtainedAt: now - 1000 }, false, now)).toBe(true);
    expect(isNewInCollection({ firstObtainedAt: now - COLLECTION_NEW_MS }, false, now)).toBe(false);
    expect(isNewInCollection({ firstObtainedAt: now + 5000 }, false, now)).toBe(true);
  });
  it('없는 말랑이는 NEW 가 아니다', () => {
    expect(isNewInCollection(undefined, true, now)).toBe(false);
  });
});
