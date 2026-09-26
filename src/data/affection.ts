/**
 * 친밀도(애정) 단계 — 순수 데이터. 놀이방 반응(touch/reactions.ts)과 디저트 가게·말랑 선물(economy/)이 함께 쓴다.
 * 애정 자체는 저장된 값(affection)이고, 단계는 거기서 계산한다.
 *
 * 단계가 오르면 열리는 것 세 가지를 화면 한 곳에서 보여 주려면 `economy/affection.ts`의 `affectionProgress`를 쓴다
 * (가게 보너스·선물 코인은 economy 공식이라 거기서 합친다).
 */

/** 애정 이만큼마다 한 단계. */
export const AFFECTION_PER_LEVEL = 50;

/** 친밀도 게이지의 하트 수 — 한 단계를 이만큼 나눠 채운다 (하트 하나 = 애정 10) */
export const AFFECTION_HEARTS = 5;

/** 애정 → 단계 (0 이상이면 1단계부터) */
export function levelOf(affection: number): number {
  const a = Number.isFinite(affection) ? Math.max(0, affection) : 0;
  return Math.floor(a / AFFECTION_PER_LEVEL) + 1;
}

// ── 단계별로 열리는 반응 (놀이방 touch/reactions.ts 가 다시 내보낸다) ──────────

export type ReactionId = 'pat' | 'blush' | 'tickle' | 'melt' | 'dizzy' | 'jump';

/** 반응을 부르는 손짓 (방법 보기 그림·손가락 시범의 종류) */
export type ReactionGesture =
  | 'press' // 꾹 누르기
  | 'pull' // 쭉 당기기
  | 'poke' // 콕 한 번
  | 'carry' // 들어서 옮기고 던지기
  | 'rub' // 좌우로 문지르기
  | 'tap' // 옆을 톡 한 번
  | 'taps' // 톡톡톡톡 빠르게
  | 'hold' // 오래 누르기
  | 'flick' // 세게 튕기기
  | 'pats'; // 세 번 쓰다듬기

/** 그림에서 강조할 곳 */
export type ReactionArea = 'head' | 'cheek' | 'belly' | 'body';

export interface ReactionUnlock {
  id: ReactionId;
  level: number;
  /** 게이지·축하 문구에 쓰는 이름 */
  label: string;
  /** 어떻게 하면 되는지 (한 줄, 존댓말) — 방법 보기·열림 알림·게이지 아래 줄이 모두 이 글을 쓴다 */
  howTo: string;
  gesture: ReactionGesture;
  area: ReactionArea;
}

export const REACTION_UNLOCKS: readonly ReactionUnlock[] = [
  { id: 'pat', level: 2, label: '머리 쓰다듬기', howTo: '머리 위를 좌우로 살살 문질러요', gesture: 'rub', area: 'head' },
  { id: 'blush', level: 3, label: '볼 콕', howTo: '얼굴 옆 볼을 톡 찔러요', gesture: 'tap', area: 'cheek' },
  { id: 'tickle', level: 4, label: '간지럼', howTo: '배를 톡톡톡톡 빠르게 찔러요', gesture: 'taps', area: 'belly' },
  { id: 'melt', level: 5, label: '녹아내리기', howTo: '손가락을 떼지 말고 2초 넘게 꾹 눌러요', gesture: 'hold', area: 'body' },
  { id: 'dizzy', level: 6, label: '빙글빙글', howTo: '쭉 당겼다가 휙 튕기듯 놓아요', gesture: 'flick', area: 'body' },
  { id: 'jump', level: 7, label: '애교 점프', howTo: '머리를 연달아 세 번 쓰다듬어요', gesture: 'pats', area: 'head' },
];

/** 다음에 열릴 반응 (다 열었으면 null) */
export function nextUnlock(level: number): ReactionUnlock | null {
  return REACTION_UNLOCKS.find((r) => r.level > level) ?? null;
}

/** 정확히 이 단계에서 열리는 반응들 (축하 문구용) */
export function unlocksAt(level: number): ReactionUnlock[] {
  return REACTION_UNLOCKS.filter((r) => r.level === level);
}
