/**
 * 미니게임 보상을 "보여 주는" 계산 (순수). 로비의 예상 코인, 오늘 받은 코인 막대, 결과 화면의 상한 설명.
 * 코인 수는 모두 computeReward 하나로 계산한다 — 화면에 보이는 값과 실제로 받는 값이 어긋나지 않게.
 */
import type { Rarity } from '../data/rarity';
import { DAILY_CAP, DEFAULT_TYPICAL_SCORE, EXPECTED_COINS_ROUNDING, GAME_TYPICAL_SCORES, PER_GAME_CAP } from './config';
import { seoulDateKey } from './daily';
import { computeReward, type RewardBreakdown } from './economy';

/** 저장된 미니게임 기록 중 여기서 쓰는 부분 (store/persistence.ts MiniGameRecord와 같은 모양) */
export interface PlayRecord {
  bestScore: number;
  lastScore: number;
  plays: number;
}

export function typicalScore(gameId: string): number {
  return GAME_TYPICAL_SCORES[gameId] ?? DEFAULT_TYPICAL_SCORE;
}

export type ExpectedBasis = 'typical' | 'mine';

/**
 * 예상 점수: 해 본 게임은 내 기록(최고와 최근의 가운데 — 최고만 보면 너무 후하고 최근만 보면 한 판 실수에 흔들린다),
 * 안 해 본 게임은 보통 점수. 옛 저장에서 옮겨 온 기록(plays 0, 최고만 있음)은 최고 기록.
 */
export function expectedScore(gameId: string, record: PlayRecord | undefined): { score: number; basis: ExpectedBasis } {
  if (!record || record.bestScore <= 0) return { score: typicalScore(gameId), basis: 'typical' };
  if (record.plays <= 0) return { score: record.bestScore, basis: 'mine' };
  return { score: Math.round((record.bestScore + record.lastScore) / 2), basis: 'mine' };
}

/** "약 N코인": 10 단위로 반올림, 받을 게 있으면 최소 10 */
export function roundAbout(coins: number): number {
  if (!(coins > 0)) return 0;
  const step = EXPECTED_COINS_ROUNDING;
  return Math.max(step, Math.round(coins / step) * step);
}

export interface ExpectedCoins {
  /** 화면에 보일 값 ("약 N코인") */
  about: number;
  /** computeReward가 준 정확한 값 (파트너 보너스·판당 상한·오늘 남은 한도까지 반영) */
  exact: number;
  basis: ExpectedBasis;
  /** 오늘 한도를 다 써서 받을 코인이 없다 */
  dailyFull: boolean;
}

export function expectedCoins(input: {
  gameId: string;
  record: PlayRecord | undefined;
  partnerRarity: Rarity | undefined;
  dailyEarned: number;
}): ExpectedCoins {
  const { score, basis } = expectedScore(input.gameId, input.record);
  const reward = computeReward({
    gameId: input.gameId,
    score,
    partnerRarity: input.partnerRarity,
    dailyEarned: input.dailyEarned,
  });
  const dailyFull = input.dailyEarned >= DAILY_CAP;
  return { about: roundAbout(reward.grantedCoins), exact: reward.grantedCoins, basis, dailyFull };
}

/** 저장된 오늘 받은 코인. 서울 날짜가 바뀌었는데 아직 초기화 전이면 0 (store의 applyDailyReset과 같은 기준) */
export function todayEarned(dailyEarnedCoins: number, lastDailyResetDate: string, now: Date = new Date()): number {
  if (lastDailyResetDate !== seoulDateKey(now)) return 0;
  return Math.max(0, Math.floor(dailyEarnedCoins));
}

export interface DailyProgress {
  earned: number;
  cap: number;
  left: number;
  /** 0..1 막대 비율 */
  ratio: number;
  full: boolean;
}

export function dailyProgress(earned: number): DailyProgress {
  const e = Math.min(DAILY_CAP, Math.max(0, Math.floor(earned)));
  return { earned: e, cap: DAILY_CAP, left: DAILY_CAP - e, ratio: DAILY_CAP > 0 ? e / DAILY_CAP : 1, full: e >= DAILY_CAP };
}

/** 이번 판이 끝난 뒤 오늘 받은 코인 (computeReward가 돌려준 남은 한도에서 거꾸로) */
export function earnedAfter(reward: Pick<RewardBreakdown, 'dailyRemaining'>): number {
  return DAILY_CAP - reward.dailyRemaining;
}

export interface RewardTrims {
  /** 판당 상한으로 깎인 코인 */
  gameTrim: number;
  /** 오늘 상한으로 깎인 코인 */
  dailyTrim: number;
}

/** base + 보너스 − gameTrim − dailyTrim = 받은 코인 (항상) */
export function rewardTrims(reward: RewardBreakdown): RewardTrims {
  return {
    gameTrim: Math.max(0, reward.baseCoins + reward.partnerBonus - reward.earnedCoins),
    dailyTrim: Math.max(0, reward.earnedCoins - reward.grantedCoins),
  };
}

/** 상한이 걸렸을 때 결과 화면에 붙는 한 줄 (걸리지 않았으면 null) */
export function rewardNote(reward: RewardBreakdown): string | null {
  if (reward.cappedByDaily) {
    if (reward.grantedCoins <= 0) return '오늘 받을 코인을 모두 받았어요. 자정에 다시 채워져요.';
    return `오늘 상한에 닿아 ${reward.grantedCoins.toLocaleString('ko-KR')}코인만 받았어요.`;
  }
  if (reward.cappedByGame) return `한 판에는 ${PER_GAME_CAP.toLocaleString('ko-KR')}코인까지 받아요.`;
  return null;
}
