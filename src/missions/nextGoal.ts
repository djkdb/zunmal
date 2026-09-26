/**
 * 홈 "다음 목표" 말풍선 — 지금 무엇을 하면 좋은지 하나만 고른다. (순수 함수)
 *
 * 처음 온 사람에게는 안내 순서를 따른다: 첫 캡슐 뽑기 → 미니게임으로 코인 모으기 → 도감 보기.
 * 단계는 저장 데이터(뽑은 수·미니게임 기록)에서 계산하므로 저장 구조를 바꾸지 않는다.
 * "도감을 봤는지"와 "안내 닫기"만 저장 밖(기기별 localStorage)에 따로 둔다.
 * 안내가 끝나면 가장 가까운 컬렉션 세트를 알려 준다.
 */
import { COLLECTIONS, collectionProgress, type Collection } from '../data/collections';
import { PULL_PRICE } from '../economy/config';

export type GuideStep = 'pull' | 'play' | 'collection';

/** 안내 순서 (말풍선의 점 표시에도 쓴다) */
export const GUIDE_STEPS: readonly GuideStep[] = ['pull', 'play', 'collection'];

export type NextGoal =
  | { kind: 'guide'; step: GuideStep; index: number }
  | { kind: 'set-reward'; set: Collection }
  | { kind: 'set'; set: Collection; missing: number };

export interface NextGoalInput {
  coins: number;
  totalPulls: number;
  /** 모든 미니게임을 합친 판 수 */
  plays: number;
  ownedIds: ReadonlySet<string>;
  claimedSets: readonly string[];
  /** 도감 화면을 한 번이라도 열었는지 */
  collectionSeen: boolean;
  /** 처음 안내를 닫았는지 */
  guideDismissed: boolean;
}

/** 안내 단계 중 아직 안 한 첫 단계. 모두 했으면 null. */
export function currentGuideStep(input: Pick<NextGoalInput, 'coins' | 'totalPulls' | 'plays' | 'collectionSeen'>): GuideStep | null {
  if (input.totalPulls === 0) {
    // 뽑을 코인이 없으면 먼저 미니게임으로 모은다
    return input.coins >= PULL_PRICE.single ? 'pull' : 'play';
  }
  if (input.plays === 0) return 'play';
  if (!input.collectionSeen) return 'collection';
  return null;
}

/**
 * 세트 목표: 받을 보상이 있으면 그것.
 * 없으면 이미 한 마리라도 모은 세트 중 가장 적게 남은 세트(같으면 목록 순서).
 * 아무 세트도 시작하지 않았으면 목록의 첫 세트(쉬운 세트가 앞에 있다).
 * 모든 세트를 받았으면 null.
 */
export function nearestSetGoal(ownedIds: ReadonlySet<string>, claimedSets: readonly string[]): NextGoal | null {
  let best: { set: Collection; missing: number } | null = null;
  let first: { set: Collection; missing: number } | null = null;
  for (const set of COLLECTIONS) {
    if (claimedSets.includes(set.id)) continue;
    const p = collectionProgress(set, ownedIds);
    if (p.complete) return { kind: 'set-reward', set };
    const missing = p.total - p.owned;
    first ??= { set, missing };
    if (p.owned > 0 && (!best || missing < best.missing)) best = { set, missing };
  }
  const pick = best ?? first;
  return pick ? { kind: 'set', ...pick } : null;
}

export function nextGoal(input: NextGoalInput): NextGoal | null {
  if (!input.guideDismissed) {
    const step = currentGuideStep(input);
    if (step) return { kind: 'guide', step, index: GUIDE_STEPS.indexOf(step) };
  }
  return nearestSetGoal(input.ownedIds, input.claimedSets);
}

/** 닫기를 기억할 때 쓰는 키. 목표가 바뀌면(한 마리 더 모으면) 다시 보인다. */
export function goalKey(goal: NextGoal): string {
  switch (goal.kind) {
    case 'guide':
      return `guide:${goal.step}`;
    case 'set-reward':
      return `reward:${goal.set.id}`;
    case 'set':
      return `set:${goal.set.id}:${goal.missing}`;
  }
}
