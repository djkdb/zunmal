import type { Rarity } from '../data/rarity';

/**
 * 경제 밸런스 설정 — 게임 내 모든 코인 관련 숫자는 여기에만 둔다.
 * 컴포넌트/미니게임에 숫자를 하드코딩하지 말 것.
 *
 * 설계 목표 (초기값):
 *  - 평균적인 한 판(20~30초) ≈ 100~150 코인 ≈ 뽑기권 1장 남짓.
 *  - 하루 상한 3000 코인 ≈ 뽑기권 30장 (11장 묶음 3번 = 33장) — 과도한 파밍 방지.
 */

/** 신규 플레이어 시작 코인. 코인은 미니게임으로만 얻는다는 원칙에 따라 0. */
export const STARTING_COINS = 0;

/** 신규 플레이어 시작 뽑기권. 첫 경험을 위해 0 — 대신 시작 파트너 말랑이 1마리를 고른다. */
export const STARTING_TICKETS = 0;

/** 뽑기권 1장 가격 (코인). */
export const TICKET_PRICE = 100;

/** 묶음 구매: 1000 코인에 11장 (1장 보너스, 약 9% 할인). */
export const TICKET_BUNDLE = { count: 11, price: 1000 } as const;

/** 1회 뽑기 / 10연 뽑기에 필요한 뽑기권 수. */
export const PULL_COST = { single: 1, multi: 10 } as const;

/**
 * 중복 환급 코인. 이미 보유한 말랑이를 다시 뽑으면 지급.
 * 희귀할수록 뽑기권 가치(100)에 근접하거나 초과하도록 설정해 "꽝" 느낌을 줄인다.
 */
export const DUPLICATE_REFUND: Readonly<Record<Rarity, number>> = {
  common: 10,
  rare: 30,
  epic: 80,
  legendary: 300,
  mythic: 1000,
};

/** 등록되지 않은 미니게임에 쓰는 기본 점수→코인 배율. */
export const DEFAULT_GAME_MULTIPLIER = 0.5;

/**
 * 미니게임별 점수→코인 배율. baseCoins = floor(score × multiplier).
 * 게임마다 점수 스케일이 다르므로 "평균 플레이 ≈ 100~150 코인"이 되도록 맞춘다.
 */
export const GAME_MULTIPLIERS: Readonly<Record<string, number>> = {
  // 20초, 탭 1회 1점 + 콤보 보너스. 평균 200~260점 → 100~130 코인.
  'button-malang': 0.5,
  // 30초, 캡슐 10~30점, 폭탄 감점. 평균 300~400점 → 120~160 코인.
  'capsule-catch': 0.4,
  // 최대 60초, 높이 10당 1점 + 사탕 5점. 떨어지면 끝이라 보통 10~20초에 250~350점 → 100~140 코인,
  // 끝까지 버티는 잘하는 플레이는 500점 이상 → 판당 상한 200 도달.
  'malang-jump': 0.4,
};

/**
 * 파트너 말랑이 희귀도 보너스 (baseCoins에 곱해지는 추가 비율).
 * 수집 동기를 주되 게임 실력보다 크게 작용하지 않도록 최대 30%.
 */
export const PARTNER_RARITY_BONUS: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 0.05,
  epic: 0.1,
  legendary: 0.2,
  mythic: 0.3,
};

/** 한 판에서 얻을 수 있는 최대 코인 (파트너 보너스 포함). */
export const PER_GAME_CAP = 200;

/** 하루(Asia/Seoul 달력 기준)에 얻을 수 있는 최대 코인. */
export const DAILY_CAP = 3000;
