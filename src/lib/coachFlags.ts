/**
 * 홈 "다음 목표" 말풍선의 기기별 표시 기록. 게임 저장(스키마·버전)과 따로 둔다 —
 * 지워져도 안내가 한 번 더 보일 뿐 기록에는 영향이 없다.
 */
const KEY = 'malang-coach';

export interface CoachFlags {
  /** 도감 화면을 한 번이라도 열었는지 */
  collectionSeen: boolean;
  /** 처음 안내를 닫았는지 */
  guideDismissed: boolean;
  /** 닫은 목표(goalKey). 목표가 바뀌면 다시 보인다 */
  hiddenGoal: string | null;
}

const EMPTY: CoachFlags = { collectionSeen: false, guideDismissed: false, hiddenGoal: null };

export function readCoachFlags(): CoachFlags {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const p = parsed as Partial<Record<keyof CoachFlags, unknown>>;
    return {
      collectionSeen: p.collectionSeen === true,
      guideDismissed: p.guideDismissed === true,
      hiddenGoal: typeof p.hiddenGoal === 'string' ? p.hiddenGoal : null,
    };
  } catch {
    return EMPTY;
  }
}

export function writeCoachFlags(patch: Partial<CoachFlags>): CoachFlags {
  const next = { ...readCoachFlags(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장 못 해도 이번 화면에서는 반영된다
  }
  return next;
}
