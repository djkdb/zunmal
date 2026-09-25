import type { Rarity } from '../data/rarity';
import {
  DAILY_CAP,
  DEFAULT_GAME_MULTIPLIER,
  GAME_MULTIPLIERS,
  PARTNER_RARITY_BONUS,
  PER_GAME_CAP,
  TICKET_BUNDLE,
  TICKET_PRICE,
} from './config';
import { seoulDateKey } from './daily';

export function getGameMultiplier(gameId: string): number {
  return GAME_MULTIPLIERS[gameId] ?? DEFAULT_GAME_MULTIPLIER;
}

export interface RewardInput {
  gameId: string;
  score: number;
  /** 파트너가 없으면 undefined → 보너스 0 */
  partnerRarity: Rarity | undefined;
  /** 오늘 이미 획득한 코인 */
  dailyEarned: number;
}

export interface RewardBreakdown {
  score: number;
  baseCoins: number;
  partnerBonus: number;
  /** 판당 상한 적용 후 */
  earnedCoins: number;
  /** 일일 상한 적용 후 실제 지급액 */
  grantedCoins: number;
  cappedByGame: boolean;
  cappedByDaily: boolean;
  /** 지급 후 남은 일일 한도 */
  dailyRemaining: number;
}

/** 점수를 음이 아닌 정수로 정규화 (NaN/Infinity/음수 방어). */
export function normalizeScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score);
}

/**
 * 미니게임 점수 → 코인 보상 계산 (순수 함수).
 *
 *   baseCoins    = floor(score × gameMultiplier)
 *   partnerBonus = floor(baseCoins × partnerRarityBonus)
 *   earnedCoins  = min(baseCoins + partnerBonus, PER_GAME_CAP)
 *   granted      = min(earnedCoins, DAILY_CAP − dailyEarned)
 */
export function computeReward(input: RewardInput): RewardBreakdown {
  const score = normalizeScore(input.score);
  const baseCoins = Math.floor(score * getGameMultiplier(input.gameId));
  const bonusRate = input.partnerRarity ? PARTNER_RARITY_BONUS[input.partnerRarity] : 0;
  const partnerBonus = Math.floor(baseCoins * bonusRate);
  const uncapped = baseCoins + partnerBonus;
  const earnedCoins = Math.min(uncapped, PER_GAME_CAP);

  const dailyEarned = Math.max(0, Math.floor(input.dailyEarned));
  const remainingBefore = Math.max(0, DAILY_CAP - dailyEarned);
  const grantedCoins = Math.min(earnedCoins, remainingBefore);

  return {
    score,
    baseCoins,
    partnerBonus,
    earnedCoins,
    grantedCoins,
    cappedByGame: uncapped > PER_GAME_CAP,
    cappedByDaily: grantedCoins < earnedCoins,
    dailyRemaining: remainingBefore - grantedCoins,
  };
}

export type TicketPackId = 'single' | 'bundle';

export interface TicketPack {
  id: TicketPackId;
  tickets: number;
  price: number;
}

export const TICKET_PACKS: Readonly<Record<TicketPackId, TicketPack>> = {
  single: { id: 'single', tickets: 1, price: TICKET_PRICE },
  bundle: { id: 'bundle', tickets: TICKET_BUNDLE.count, price: TICKET_BUNDLE.price },
};

export type PurchaseResult =
  | { ok: true; coins: number; tickets: number }
  | { ok: false; reason: 'insufficient-coins' };

/** 뽑기권 구매 계산 (순수 함수). */
export function purchaseTickets(coins: number, tickets: number, packId: TicketPackId): PurchaseResult {
  const pack = TICKET_PACKS[packId];
  if (coins < pack.price) return { ok: false, reason: 'insufficient-coins' };
  return { ok: true, coins: coins - pack.price, tickets: tickets + pack.tickets };
}

export interface DailyState {
  dailyEarnedCoins: number;
  lastDailyResetDate: string;
}

/** 서울 날짜가 바뀌었으면 일일 획득량을 초기화한 새 상태를 반환. 같으면 입력을 그대로 반환. */
export function applyDailyReset<T extends DailyState>(state: T, now: Date = new Date()): T {
  const today = seoulDateKey(now);
  if (state.lastDailyResetDate === today) return state;
  return { ...state, dailyEarnedCoins: 0, lastDailyResetDate: today };
}
