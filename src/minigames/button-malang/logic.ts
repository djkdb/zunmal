/**
 * 말랑 누르기 — 순수 로직 (React/DOM 무관, 시간 주입).
 *
 * 규칙
 *  - 20초 동안 말랑이를 최대한 많이 누른다.
 *  - 이전 타격 후 comboWindowMs 이내에 다시 누르면 콤보가 이어진다.
 *  - 콤보 comboStep마다 타격당 점수 +1 (최대 +maxComboBonus).
 *  - 말랑이 바깥(빈 곳)을 누르면 실수 → 콤보 초기화.
 *  - 비정상적으로 빠른 입력(minIntervalMs 미만)은 무시한다 (오토클릭 방지).
 */
export const BUTTON_MALANG_CONFIG = {
  durationMs: 20_000,
  comboWindowMs: 700,
  comboStep: 20,
  maxComboBonus: 2,
  minIntervalMs: 50,
} as const;

export type ButtonMalangConfig = typeof BUTTON_MALANG_CONFIG;

export interface ButtonMalangState {
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  lastHitAt: number | null;
}

export function createButtonMalangState(): ButtonMalangState {
  return { score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, lastHitAt: null };
}

/** 현재 콤보에서의 타격당 보너스 점수 */
export function comboBonus(combo: number, config: ButtonMalangConfig = BUTTON_MALANG_CONFIG): number {
  return Math.min(config.maxComboBonus, Math.floor(combo / config.comboStep));
}

export interface HitOutcome {
  state: ButtonMalangState;
  /** 이번 타격 획득 점수 (무시된 입력이면 0) */
  points: number;
  accepted: boolean;
}

export function applyHit(
  state: ButtonMalangState,
  now: number,
  config: ButtonMalangConfig = BUTTON_MALANG_CONFIG,
): HitOutcome {
  const since = state.lastHitAt === null ? Infinity : now - state.lastHitAt;
  if (since < config.minIntervalMs) return { state, points: 0, accepted: false };

  const combo = since <= config.comboWindowMs ? state.combo + 1 : 1;
  const points = 1 + comboBonus(combo, config);
  return {
    state: {
      score: state.score + points,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      hits: state.hits + 1,
      misses: state.misses,
      lastHitAt: now,
    },
    points,
    accepted: true,
  };
}

export function applyMiss(state: ButtonMalangState): ButtonMalangState {
  return { ...state, combo: 0, misses: state.misses + 1, lastHitAt: null };
}

/** 시간이 지나 콤보가 끊겼는지 (표시용) */
export function isComboAlive(state: ButtonMalangState, now: number, config = BUTTON_MALANG_CONFIG): boolean {
  return state.lastHitAt !== null && now - state.lastHitAt <= config.comboWindowMs;
}
