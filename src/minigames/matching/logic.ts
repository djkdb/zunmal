/**
 * 짝 맞추기 — 순수 로직 (React/DOM 무관, RNG·시간 주입).
 *
 * 규칙
 *  - 4×4 카드 16장 = 서로 다른 말랑이 8쌍. 두 장씩 뒤집어 같은 말랑이면 짝 성공.
 *  - 두 장이 열려 있는 동안에는 세 번째 카드를 뒤집을 수 없다.
 *  - 짝이 틀리면 mismatchDelayMs 뒤에 두 장이 다시 덮인다(resolveMismatch).
 *  - 제한 시간 60초. 8쌍을 모두 찾으면 남은 시간과 상관없이 즉시 끝난다.
 *
 * 점수 (시간과 시도 횟수 모두에 의존)
 *  - 짝 1쌍:                matchPoints (20)
 *  - 연속 성공 콤보 보너스:  min(maxComboBonus, (combo − 1) × comboStep)
 *                           → 2연속 +5, 3연속 +10, … 최대 +25. 틀리면 콤보 0.
 *  - 틀려도 감점은 없지만 시도(두 장 뒤집기) 횟수는 모두 센다.
 *  - 전부 찾았을 때 클리어 보너스:
 *      남은 초(올림) × timeBonusPerSec (4)
 *    + max(0, attemptPar − 시도) × attemptBonus (16회 기준, 1회 적을 때마다 +5)
 *
 *  예) 평균: 40초에 20번 시도로 클리어 ≈ 160 + 콤보 30 + 시간 80 = 270점
 *      잘함: 25초에 12번 시도로 클리어 ≈ 160 + 콤보 60 + 시간 140 + 시도 20 = 380점
 *      시간 초과(5쌍) ≈ 100~120점
 */
import { CHARACTERS } from '../../data/characters';
import { shuffle, type RNG } from '../../lib/rng';

export const MATCHING_CONFIG = {
  durationMs: 60_000,
  pairs: 8,
  columns: 4,
  mismatchDelayMs: 700,
  matchPoints: 20,
  comboStep: 5,
  maxComboBonus: 25,
  timeBonusPerSec: 4,
  attemptPar: 16,
  attemptBonus: 5,
} as const;

export type MatchingConfig = typeof MATCHING_CONFIG;

export interface MatchCard {
  /** 보드 위 위치 (0..15) */
  index: number;
  /** 같은 짝끼리 같은 값 */
  pairId: number;
  characterId: string;
}

export interface MatchingState {
  cards: readonly MatchCard[];
  /** 찾은 카드 */
  matched: readonly boolean[];
  /** 현재 앞면이 보이는(아직 짝을 못 찾은) 카드 인덱스. 최대 2장 */
  open: readonly number[];
  /** 틀린 두 장이 다시 덮이는 시각 (null이면 대기 없음) */
  hideAt: number | null;
  score: number;
  combo: number;
  maxCombo: number;
  /** 두 장을 뒤집은 횟수 */
  attempts: number;
  pairsFound: number;
  /** 모든 짝을 찾았는지 */
  cleared: boolean;
  /** 클리어 보너스로 더한 점수 (표시용) */
  clearBonus: number;
}

/** 캐릭터 id 풀에서 서로 다른 pairs개를 골라 두 장씩 섞은 보드를 만든다. */
export function createBoard(
  rng: RNG,
  pool: readonly string[] = CHARACTERS.map((c) => c.id),
  config: MatchingConfig = MATCHING_CONFIG,
): MatchCard[] {
  const unique = [...new Set(pool)];
  if (unique.length < config.pairs) throw new Error('createBoard: not enough characters');
  const picked = shuffle(rng, unique).slice(0, config.pairs);
  const deck = picked.flatMap((characterId, pairId) => [
    { pairId, characterId },
    { pairId, characterId },
  ]);
  return shuffle(rng, deck).map((c, index) => ({ ...c, index }));
}

export function createMatchingState(cards: readonly MatchCard[]): MatchingState {
  return {
    cards,
    matched: cards.map(() => false),
    open: [],
    hideAt: null,
    score: 0,
    combo: 0,
    maxCombo: 0,
    attempts: 0,
    pairsFound: 0,
    cleared: false,
    clearBonus: 0,
  };
}

/** combo번째 연속 성공의 보너스 점수 (combo ≥ 1) */
export function comboBonus(combo: number, config: MatchingConfig = MATCHING_CONFIG): number {
  if (combo <= 1) return 0;
  return Math.min(config.maxComboBonus, (combo - 1) * config.comboStep);
}

/** 짝 하나를 찾았을 때 얻는 점수 */
export function matchScore(combo: number, config: MatchingConfig = MATCHING_CONFIG): number {
  return config.matchPoints + comboBonus(combo, config);
}

/** 전부 찾았을 때의 보너스: 남은 시간 + 적은 시도 */
export function computeClearBonus(
  remainingMs: number,
  attempts: number,
  config: MatchingConfig = MATCHING_CONFIG,
): number {
  const secs = Math.ceil(Math.max(0, remainingMs) / 1000);
  const efficiency = Math.max(0, config.attemptPar - attempts);
  return secs * config.timeBonusPerSec + efficiency * config.attemptBonus;
}

export type FlipEvent = 'rejected' | 'opened' | 'match' | 'mismatch';

export interface FlipOutcome {
  state: MatchingState;
  event: FlipEvent;
  /** 이번 뒤집기로 얻은 점수 (클리어 보너스 제외) */
  points: number;
}

/** 틀린 두 장을 덮는다. 아직 시간이 안 됐거나 대기 중이 아니면 그대로 반환. */
export function resolveMismatch(state: MatchingState, now: number): MatchingState {
  if (state.hideAt === null || now < state.hideAt) return state;
  return { ...state, open: [], hideAt: null };
}

/**
 * index 카드를 뒤집는다.
 * 대기 시간이 지난 오답 카드는 먼저 덮은 뒤 처리한다.
 * 거부: 클리어 후 / 범위 밖 / 이미 찾은 카드 / 이미 열린 카드 / 두 장이 열려 있을 때.
 */
export function flip(
  prev: MatchingState,
  index: number,
  now: number,
  config: MatchingConfig = MATCHING_CONFIG,
): FlipOutcome {
  const state = resolveMismatch(prev, now);
  const rejected: FlipOutcome = { state, event: 'rejected', points: 0 };
  const card = state.cards[index];
  if (state.cleared || !card) return rejected;
  if (state.matched[index] || state.open.includes(index) || state.open.length >= 2) return rejected;

  if (state.open.length === 0) {
    return { state: { ...state, open: [index] }, event: 'opened', points: 0 };
  }

  const firstIndex = state.open[0] as number;
  const first = state.cards[firstIndex];
  const attempts = state.attempts + 1;

  if (first && first.pairId === card.pairId) {
    const combo = state.combo + 1;
    const points = matchScore(combo, config);
    const matched = state.matched.map((m, i) => m || i === index || i === firstIndex);
    const pairsFound = state.pairsFound + 1;
    return {
      state: {
        ...state,
        matched,
        open: [],
        hideAt: null,
        score: state.score + points,
        combo,
        maxCombo: Math.max(state.maxCombo, combo),
        attempts,
        pairsFound,
        cleared: pairsFound >= state.cards.length / 2,
      },
      event: 'match',
      points,
    };
  }

  return {
    state: { ...state, open: [firstIndex, index], hideAt: now + config.mismatchDelayMs, combo: 0, attempts },
    event: 'mismatch',
    points: 0,
  };
}

/** 클리어한 상태에 남은 시간·시도 보너스를 한 번만 더한다. */
export function applyClearBonus(
  state: MatchingState,
  remainingMs: number,
  config: MatchingConfig = MATCHING_CONFIG,
): MatchingState {
  if (!state.cleared || state.clearBonus > 0) return state;
  const bonus = computeClearBonus(remainingMs, state.attempts, config);
  return { ...state, score: state.score + bonus, clearBonus: bonus };
}

/** 카드가 앞면인지 (찾았거나 열려 있음) */
export function isFaceUp(state: MatchingState, index: number): boolean {
  return state.matched[index] === true || state.open.includes(index);
}
