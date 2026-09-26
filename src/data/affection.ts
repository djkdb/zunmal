/**
 * 친밀도(애정) 단계 — 순수 데이터. 놀이방 반응(touch/reactions.ts)과 디저트 가게·말랑 선물(economy/)이 함께 쓴다.
 * 애정 자체는 저장된 값(affection)이고, 단계는 거기서 계산한다.
 */

/** 애정 이만큼마다 한 단계. */
export const AFFECTION_PER_LEVEL = 50;

/** 애정 → 단계 (0 이상이면 1단계부터) */
export function levelOf(affection: number): number {
  const a = Number.isFinite(affection) ? Math.max(0, affection) : 0;
  return Math.floor(a / AFFECTION_PER_LEVEL) + 1;
}
