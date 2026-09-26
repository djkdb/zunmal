import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../data/collections';
import { PULL_PRICE, STARTING_COINS } from '../economy/config';
import { currentGuideStep, goalKey, nearestSetGoal, nextGoal, type NextGoalInput } from './nextGoal';

const fresh: NextGoalInput = {
  coins: STARTING_COINS,
  totalPulls: 0,
  plays: 0,
  ownedIds: new Set(['peach-mochi']),
  claimedSets: [],
  collectionSeen: false,
  guideDismissed: false,
};

describe('currentGuideStep', () => {
  it('처음: 선물 코인으로 첫 캡슐 뽑기', () => {
    expect(currentGuideStep(fresh)).toBe('pull');
  });

  it('뽑을 코인이 없으면 미니게임부터', () => {
    expect(currentGuideStep({ ...fresh, coins: PULL_PRICE.single - 1 })).toBe('play');
  });

  it('미니게임을 먼저 해도 코인이 모이면 첫 뽑기로 돌아온다', () => {
    expect(currentGuideStep({ ...fresh, plays: 2, coins: 150 })).toBe('pull');
  });

  it('뽑기 → 미니게임 → 도감 → 끝', () => {
    expect(currentGuideStep({ ...fresh, coins: 0, totalPulls: 1 })).toBe('play');
    expect(currentGuideStep({ ...fresh, coins: 0, totalPulls: 1, plays: 1 })).toBe('collection');
    expect(currentGuideStep({ ...fresh, totalPulls: 1, plays: 1, collectionSeen: true })).toBeNull();
  });
});

describe('nearestSetGoal', () => {
  it('모은 말랑이가 있는 세트 중 가장 적게 남은 세트', () => {
    // 복숭아 모찌는 디저트 가게(6)와 봄 소풍(5)에 모두 속한다
    const g = nearestSetGoal(new Set(['peach-mochi']), []);
    expect(g).toMatchObject({ kind: 'set', set: { id: 'spring-picnic' }, missing: 4 });
  });

  it('아무 세트도 시작하지 않았으면 목록 첫 세트', () => {
    const g = nearestSetGoal(new Set(), []);
    expect(g).toMatchObject({ kind: 'set', set: { id: COLLECTIONS[0]?.id } });
  });

  it('완성하고 아직 안 받은 세트가 있으면 보상 받기가 먼저', () => {
    const dessert = COLLECTIONS.find((c) => c.id === 'dessert-shop');
    const g = nearestSetGoal(new Set(dessert?.memberIds), []);
    expect(g).toMatchObject({ kind: 'set-reward', set: { id: 'dessert-shop' } });
    expect(nearestSetGoal(new Set(dessert?.memberIds), ['dessert-shop'])?.kind).toBe('set');
  });

  it('모든 세트 보상을 받았으면 목표 없음', () => {
    const all = new Set(COLLECTIONS.flatMap((c) => c.memberIds));
    expect(nearestSetGoal(all, COLLECTIONS.map((c) => c.id))).toBeNull();
  });
});

describe('nextGoal', () => {
  it('안내 중에는 단계와 순서 번호', () => {
    expect(nextGoal(fresh)).toEqual({ kind: 'guide', step: 'pull', index: 0 });
  });

  it('안내를 닫거나 끝내면 세트 목표', () => {
    expect(nextGoal({ ...fresh, guideDismissed: true })?.kind).toBe('set');
    expect(nextGoal({ ...fresh, totalPulls: 3, plays: 1, collectionSeen: true })?.kind).toBe('set');
  });

  it('goalKey는 남은 수가 바뀌면 달라진다', () => {
    const a = nearestSetGoal(new Set(['peach-mochi']), []);
    const b = nearestSetGoal(new Set(['peach-mochi', 'matcha-bean']), []);
    expect(a && goalKey(a)).not.toBe(b && goalKey(b));
  });
});
