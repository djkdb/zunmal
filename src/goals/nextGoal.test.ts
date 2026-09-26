import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../data/collections';
import { DAILY_CAP, GOAL_THRESHOLDS, PULL_PRICE, STARTING_COINS } from '../economy/config';
import { generateDailyMissions } from '../missions/missions';
import { readHub } from './hubState';
import { GOAL_PRIORITY, goalCandidates, nextGoal, type GoalKind } from './nextGoal';
import { HOUR, NOW, TODAY, YESTERDAY, ownedMap, starterSave } from './testSave';

const hub = (patch: Parameters<typeof starterSave>[0] = {}, now = NOW) => readHub(starterSave(patch), now);

/** 첫걸음을 모두 끝낸 플레이어 (다른 목표가 보이도록) */
const veteran = {
  totalPulls: 5,
  ownedMalangs: ownedMap(['peach-mochi', 'custard-bun']),
  unboxed: ['peach-mochi', 'custard-bun'],
  affection: { 'peach-mochi': 20 },
  miniGameRecords: { stack: { bestScore: 100, lastScore: 50, plays: 3 } },
};

const kinds = (h: ReturnType<typeof hub>) => goalCandidates(h).map((g) => g.kind);

/** 오늘 미션 중 이 종류가 있는 날짜 (진행 테스트용) */
const missions = generateDailyMissions(TODAY);

describe('우선순위 표', () => {
  it('모든 종류에 서로 다른 순위', () => {
    const values = Object.values(GOAL_PRIORITY);
    expect(new Set(values).size).toBe(values.length);
  });

  it('후보는 항상 순위 순으로 정렬', () => {
    const list = goalCandidates(hub({ ...veteran, coins: 500, pityCount: 45, giftDay: YESTERDAY }));
    const pr = list.map((g) => g.priority);
    expect([...pr].sort((a, b) => a - b)).toEqual(pr);
  });
});

describe('첫걸음', () => {
  it('새 플레이어: 선물 코인으로 첫 뽑기', () => {
    const g = nextGoal(hub({ coins: STARTING_COINS }));
    expect(g).toMatchObject({ kind: 'first-run', cta: '뽑기', action: { type: 'route', to: '/gacha' } });
    expect(g?.firstRun).toMatchObject({ step: 'pull', progress: { done: 1, total: 6 } });
  });

  it('첫 뽑기 전인데 코인이 없으면 미니게임으로', () => {
    const g = nextGoal(hub({ coins: 30 }));
    expect(g).toMatchObject({ kind: 'first-run', action: { to: '/play' } });
    expect(g?.detail).toContain('70코인');
  });

  it('새 캡슐은 놀이방 그 캡슐로 (이름은 비밀, 등급만)', () => {
    const g = nextGoal(
      hub({ coins: 0, totalPulls: 1, ownedMalangs: { ...ownedMap(['peach-mochi']), ...ownedMap(['jellyfish'], NOW) } }),
    );
    expect(g).toMatchObject({ kind: 'first-run', cta: '열기', action: { type: 'route', to: '/touch/jellyfish' } });
    expect(g?.detail).toContain('레어');
    expect(g?.detail).not.toContain('해파리');
  });

  it('마지막 단계: 코인이 모자라면 모을 양과 진행 막대', () => {
    const g = nextGoal(hub({ ...veteran, totalPulls: 1, coins: 40 }));
    expect(g).toMatchObject({ kind: 'first-run', progress: 0.4, progressText: '40/100', action: { to: '/play' } });
  });

  it('첫걸음을 끝내면 다시 나오지 않는다', () => {
    expect(kinds(hub({ ...veteran, coins: 0 }))).not.toContain('first-run');
  });
});

describe('받을 것 먼저', () => {
  it('말랑 선물이 가장 먼저 (시작한 날은 없음)', () => {
    expect(nextGoal(hub({ coins: STARTING_COINS }))?.kind).not.toBe('gift');
    const g = nextGoal(hub({ coins: STARTING_COINS, giftDay: YESTERDAY }));
    expect(g).toMatchObject({ kind: 'gift', cta: '열기', action: { type: 'claim-gift' } });
    expect(g?.title).toBe('복숭아 모찌가 선물을 가져왔어요');
  });

  it('skip 으로 말풍선이 보여 주는 선물은 건너뛴다', () => {
    const h = hub({ coins: STARTING_COINS, giftDay: YESTERDAY });
    expect(nextGoal(h, ['gift'])?.kind).toBe('first-run');
  });

  it('미션 보상 → 세트 보상 → 가게 → 봉인 캡슐 순', () => {
    const m = missions[0];
    if (!m) throw new Error('no mission');
    const dessert = COLLECTIONS.find((c) => c.id === 'dessert-shop');
    const ids = [...(dessert?.memberIds ?? [])];
    const h = hub({
      ...veteran,
      coins: 0,
      ownedMalangs: { ...ownedMap(ids), ...ownedMap(['jellyfish'], NOW) },
      unboxed: ids,
      missions: { date: TODAY, progress: { [m.kind]: m.target }, claimed: [], bonusClaimed: false },
      shop: { staff: ['peach-mochi'], lastTickAt: NOW - 20 * HOUR, banked: 0 },
    });
    expect(kinds(h).slice(0, 4)).toEqual(['mission-claim', 'set-claim', 'shop-ready', 'sealed']);
    expect(nextGoal(h)?.action).toEqual({ type: 'claim-mission', id: m.id });
  });

  it('미션 세 개를 다 받았으면 보너스 받기', () => {
    const h = hub({
      ...veteran,
      missions: { date: TODAY, progress: {}, claimed: missions.map((x) => x.id), bonusClaimed: false },
    });
    expect(nextGoal(h)?.action).toEqual({ type: 'claim-mission-bonus' });
  });

  it('어제 미션 진행은 오늘 보상이 아니다', () => {
    const m = missions[0];
    if (!m) throw new Error('no mission');
    const h = hub({ ...veteran, missions: { date: YESTERDAY, progress: { [m.kind]: 999 }, claimed: [], bonusClaimed: false } });
    expect(kinds(h)).not.toContain('mission-claim');
  });
});

describe('가게', () => {
  it('조금 쌓인 것으로는 권하지 않는다', () => {
    const h = hub({ ...veteran, coins: 500, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 1 * HOUR, banked: 0 } });
    expect(kinds(h)).not.toContain('shop-ready');
  });

  it('가득 차면 권한다', () => {
    const h = hub({ ...veteran, coins: 500, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 9 * HOUR, banked: 0 } });
    const g = goalCandidates(h).find((x) => x.kind === 'shop-ready');
    expect(g).toMatchObject({ title: '가게가 가득 찼어요', action: { type: 'claim-shop' } });
  });

  it('받으면 바로 뽑을 수 있게 되면 덜 쌓여도 권한다', () => {
    // 한 마리 × 10/시간 × 3시간 = 30코인, 지금 80코인 → 110
    const h = hub({ ...veteran, coins: 80, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 3 * HOUR, banked: 0 } });
    const g = goalCandidates(h).find((x) => x.kind === 'shop-ready');
    expect(g?.detail).toContain('바로 뽑을 수 있어요');
    expect(GOAL_THRESHOLDS.shopReadyCoins).toBeGreaterThan(30);
  });
});

describe('뽑기와 코인', () => {
  it('천장이 가까우면 뽑기보다 먼저 "전설 이상까지 N회"', () => {
    const h = hub({ ...veteran, coins: 300, pityCount: 45 });
    const g = nextGoal(h);
    expect(g).toMatchObject({ kind: 'pity-close', title: '전설 이상까지 5회', cta: '뽑기' });
    expect(g?.progress).toBeCloseTo(0.9);
  });

  it('코인이 없으면 천장 목표는 없다', () => {
    expect(kinds(hub({ ...veteran, coins: 0, pityCount: 45 }))).not.toContain('pity-close');
  });

  it('뽑을 코인이 있으면 뽑기, 없으면 코인 모으기 (모자란 양)', () => {
    expect(nextGoal(hub({ ...veteran, coins: 250 }))).toMatchObject({ kind: 'pull', cta: '뽑기' });
    const g = nextGoal(hub({ ...veteran, coins: 40 }));
    expect(g).toMatchObject({ kind: 'earn', cta: '게임하기', progressText: `40/${PULL_PRICE.single}` });
    expect(g?.detail).toContain('60코인');
  });

  it('오늘 미니게임 코인을 다 모았으면 코인 모으기 대신 애정', () => {
    const h = hub({ ...veteran, coins: 40, dailyEarnedCoins: DAILY_CAP, lastDailyResetDate: TODAY });
    expect(kinds(h)).not.toContain('earn');
    expect(nextGoal(h)?.kind).toBe('affection');
    // 날짜가 지났으면 다시 모을 수 있다
    expect(kinds(hub({ ...veteran, coins: 40, dailyEarnedCoins: DAILY_CAP, lastDailyResetDate: YESTERDAY }))).toContain('earn');
  });
});

describe('미션 조금 남음', () => {
  it('진행이 충분하면 "N만 더 하면 +코인"', () => {
    const pet = missions.find((m) => m.kind === 'pet') ?? missions[0];
    if (!pet) throw new Error('no mission');
    const have = Math.ceil(pet.target * GOAL_THRESHOLDS.missionNearRatio);
    if (have >= pet.target) return;
    const h = hub({ ...veteran, coins: 0, missions: { date: TODAY, progress: { [pet.kind]: have }, claimed: [], bonusClaimed: false } });
    const g = goalCandidates(h).find((x) => x.kind === 'mission-near');
    // 뽑기 미션은 코인이 없으면 권하지 않는다
    if (pet.kind === 'pull') expect(g).toBeUndefined();
    else expect(g?.title).toMatch(new RegExp(`만 더 하면 \\+${pet.reward}코인$`));
  });

  it('조금밖에 안 했으면 권하지 않는다', () => {
    const m = missions[0];
    if (!m) throw new Error('no mission');
    const h = hub({ ...veteran, missions: { date: TODAY, progress: {}, claimed: [], bonusClaimed: false } });
    expect(kinds(h)).not.toContain('mission-near');
  });
});

describe('세트', () => {
  it('두 마리 남은 세트는 뽑기보다 먼저', () => {
    const fruit = COLLECTIONS.find((c) => c.id === 'fruit-basket')?.memberIds.slice(0, 3) ?? [];
    const ids = ['peach-mochi', ...fruit];
    const h = hub({ ...veteran, coins: 300, ownedMalangs: ownedMap(ids), unboxed: ids });
    const g = nextGoal(h);
    expect(g).toMatchObject({ kind: 'set-near', title: '과일 바구니 세트까지 2마리', cta: '뽑기', progressText: '3/5' });
  });

  it('코인이 없고 오늘 게임 코인도 다 모았으면 세트는 도감에서 보기', () => {
    const fruit = COLLECTIONS.find((c) => c.id === 'fruit-basket')?.memberIds.slice(0, 4) ?? [];
    const ids = ['peach-mochi', ...fruit];
    const h = hub({ ...veteran, coins: 0, ownedMalangs: ownedMap(ids), unboxed: ids, dailyEarnedCoins: DAILY_CAP, lastDailyResetDate: TODAY });
    expect(nextGoal(h)).toMatchObject({ kind: 'set-near', cta: '보기', action: { type: 'route', to: '/collection', tab: 'sets' } });
  });

  it('파트너가 있으면 마지막 목표는 늘 애정', () => {
    expect(goalCandidates(hub({ ...veteran })).at(-1)?.kind).toBe('affection');
  });
});

describe('애정', () => {
  it('파트너의 다음 단계까지 남은 애정', () => {
    const g = goalCandidates(hub({ ...veteran, affection: { 'peach-mochi': 70 } })).find((x) => x.kind === 'affection');
    expect(g).toMatchObject({ title: '복숭아 모찌와 더 놀아요', detail: '애정 30만 더 쌓으면 3단계예요', progressText: '2단계' });
    expect(g?.progress).toBeCloseTo(0.4);
  });
});

describe('언제나 하나는 있다', () => {
  it.each<[string, Parameters<typeof starterSave>[0]]>([
    ['새 플레이어', {}],
    ['코인 없음', { ...veteran, coins: 0 }],
    ['부자', { ...veteran, coins: 99_999 }],
  ])('%s', (_, patch) => {
    const g = nextGoal(hub(patch));
    expect(g).not.toBeNull();
    expect(g?.title.length).toBeGreaterThan(0);
    expect(g?.cta.length).toBeGreaterThan(0);
    const all: GoalKind[] = goalCandidates(hub(patch)).map((x) => x.kind);
    expect(new Set(all).size).toBe(all.length);
  });
});
