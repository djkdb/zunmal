/**
 * 홈 허브가 보는 "지금 상태" — 저장 데이터와 지금 시각(ms)에서 한 번에 계산한다. 순수 모듈.
 *
 * 다음 목표(`nextGoal.ts`), 첫걸음(`firstRun.ts`), 오늘 줄·탭 알림(`today.ts`)이 모두 이 값을 읽는다.
 * 저장 구조를 바꾸지 않고 이미 있는 값에서 계산한다:
 *  - 오늘(서울 날짜)·일일 상한은 `lastDailyResetDate`/`dailyEarnedCoins`(날짜가 지났으면 0으로 본다)
 *  - 오늘 한 일은 미션 하루 기록(`missions.progress`, 날짜가 지났으면 빈 기록)
 *  - 봉인된 캡슐 = 보유 − `unboxed` (놀이방 선반 순서: 등급 높은 순 → 최근 순)
 *  - 가게 코인은 `economy/shop.ts`, 말랑 선물은 `economy/gift.ts`, 도감은 `data/collectionProgress.ts`
 */
import { getCharacter, type Character } from '../data/characters';
import { summarizeCollection, type CollectionSummary } from '../data/collectionProgress';
import { GACHA_RULES } from '../data/rarity';
import { DAILY_CAP, GOAL_THRESHOLDS, PULL_PRICE } from '../economy/config';
import { seoulDateKey } from '../economy/daily';
import { giftAvailable, giftCoins, giftGiver } from '../economy/gift';
import { computeShopRates, readShop, type ShopRates, type ShopReading } from '../economy/shop';
import {
  canClaimBonus,
  generateDailyMissions,
  isMissionDone,
  rollMissions,
  type Mission,
  type MissionState,
} from '../missions/missions';
import type { SaveData } from '../store/persistence';
import { shelfOrder } from '../touch/shelf';

/** 허브가 읽는 저장 조각 (store 상태를 그대로 넘겨도 된다) */
export type HubSave = Pick<
  SaveData,
  | 'coins'
  | 'ownedMalangs'
  | 'pityCount'
  | 'partnerId'
  | 'miniGameRecords'
  | 'dailyEarnedCoins'
  | 'lastDailyResetDate'
  | 'totalPulls'
  | 'claimedSets'
  | 'affection'
  | 'missions'
  | 'unboxed'
  | 'shop'
  | 'giftDay'
>;

export interface HubState {
  save: HubSave;
  now: number;
  /** 서울 날짜 키 */
  today: string;
  coins: number;
  canPull: boolean;
  /** 1회 뽑기까지 모자란 코인 (뽑을 수 있으면 0) */
  coinsToPull: number;
  /** 지금 코인으로 1회 뽑기를 몇 번 할 수 있나 */
  pullsAffordable: number;
  /** 오늘 미니게임으로 더 받을 수 있는 코인 */
  dailyLeft: number;
  /** 전설 이상 확정까지 남은 뽑기 수 (1..천장) */
  pityLeft: number;
  /** 모든 미니게임을 합친 판 수 */
  plays: number;
  /** 한 번이라도 쓰다듬었나 */
  petted: boolean;
  partner: Character | undefined;
  /** 봉인된 캡슐 속 말랑이 id (선반 순서) */
  sealed: string[];
  /** 시작한 날(가장 먼저 얻은 말랑이의 서울 날짜)이 오늘인가 */
  firstDay: boolean;
  missions: {
    state: MissionState;
    list: Mission[];
    /** 다 했고 아직 안 받은 미션 */
    claimable: Mission[];
    bonusReady: boolean;
    claimedCount: number;
  };
  gift: { giver: string | null; available: boolean; coins: number };
  shop: {
    rates: ShopRates;
    reading: ShopReading;
    /** 직원이 없다 */
    empty: boolean;
    /** 받기를 권할 만큼 쌓였다 (GOAL_THRESHOLDS.shopReadyCoins, 가득 참, 또는 받으면 바로 뽑을 수 있음) */
    ready: boolean;
    /** 오늘 한 번 이상 받았다 */
    claimedToday: boolean;
  };
  collection: CollectionSummary;
}

export function readHub(save: HubSave, now: number): HubState {
  const today = seoulDateKey(new Date(now));
  const coins = Math.max(0, save.coins);
  const canPull = coins >= PULL_PRICE.single;
  const earnedToday = save.lastDailyResetDate === today ? save.dailyEarnedCoins : 0;
  const plays = Object.values(save.miniGameRecords).reduce((sum, r) => sum + r.plays, 0);
  const petted = Object.values(save.affection).some((v) => v > 0);

  const unboxed = new Set(save.unboxed);
  const sealed = shelfOrder(
    Object.entries(save.ownedMalangs).flatMap(([id, o]) => {
      const c = getCharacter(id);
      return c && !unboxed.has(id) ? [{ id, rarity: c.rarity, firstObtainedAt: o.firstObtainedAt }] : [];
    }),
  ).map((s) => s.id);

  const firstAt = Object.values(save.ownedMalangs).reduce((min, o) => Math.min(min, o.firstObtainedAt), Infinity);
  const firstDay = Number.isFinite(firstAt) && seoulDateKey(new Date(firstAt)) === today;

  const missionState = rollMissions(save.missions, today);
  const list = generateDailyMissions(missionState.date);
  const claimable = list.filter((m) => !missionState.claimed.includes(m.id) && isMissionDone(missionState, m));

  const giver = giftGiver({ unboxed: save.unboxed, affection: save.affection, partnerId: save.partnerId });

  const rates = computeShopRates(save.shop.staff, { owned: save.ownedMalangs, affection: save.affection });
  const reading = readShop(save.shop, rates, now);
  const shopReady =
    reading.coins >= 1 &&
    (reading.full || reading.coins >= GOAL_THRESHOLDS.shopReadyCoins || (!canPull && coins + reading.coins >= PULL_PRICE.single));

  return {
    save,
    now,
    today,
    coins,
    canPull,
    coinsToPull: Math.max(0, PULL_PRICE.single - coins),
    pullsAffordable: Math.floor(coins / PULL_PRICE.single),
    dailyLeft: Math.max(0, DAILY_CAP - earnedToday),
    pityLeft: Math.max(1, GACHA_RULES.pityThreshold - save.pityCount),
    plays,
    petted,
    partner: save.partnerId ? getCharacter(save.partnerId) : undefined,
    sealed,
    firstDay,
    missions: {
      state: missionState,
      list,
      claimable,
      bonusReady: canClaimBonus(missionState, list),
      claimedCount: missionState.claimed.length,
    },
    gift: {
      giver,
      available: giftAvailable(save.giftDay, today, giver),
      coins: giftCoins(giver ? (save.affection[giver] ?? 0) : 0),
    },
    shop: {
      rates,
      reading,
      empty: save.shop.staff.length === 0,
      ready: shopReady,
      claimedToday: (missionState.progress['shop-claim'] ?? 0) > 0,
    },
    collection: summarizeCollection({ owned: save.ownedMalangs, claimedSets: save.claimedSets }),
  };
}
