/**
 * 일일 미션 — 순수 모듈 (React/Zustand 무관).
 * 날짜 키(서울 기준 YYYY-MM-DD)로 시드를 만들어 모든 기기에서 같은 날 같은 미션이 나온다.
 */
import { MISSION_REWARD_COINS } from '../economy/config';
import { createSeededRng, shuffle } from '../lib/rng';

export const MISSION_KINDS = ['play-games', 'pull', 'pet', 'earn-coins', 'new-best'] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
export type MissionDifficulty = keyof typeof MISSION_REWARD_COINS;

export interface Mission {
  /** 오늘 안에서 고유 (kind와 같음 — 하루에 같은 종류는 하나만) */
  id: MissionKind;
  kind: MissionKind;
  target: number;
  difficulty: MissionDifficulty;
  reward: number;
}

interface MissionTemplate {
  kind: MissionKind;
  /** 난이도별 목표치 */
  targets: Readonly<Record<MissionDifficulty, number>>;
}

const TEMPLATES: readonly MissionTemplate[] = [
  { kind: 'play-games', targets: { easy: 2, normal: 3, hard: 5 } },
  { kind: 'pull', targets: { easy: 1, normal: 3, hard: 10 } },
  { kind: 'pet', targets: { easy: 15, normal: 30, hard: 60 } },
  { kind: 'earn-coins', targets: { easy: 200, normal: 400, hard: 700 } },
  { kind: 'new-best', targets: { easy: 1, normal: 1, hard: 2 } },
];

/** 미션 문구 (UI와 테스트에서 함께 사용) */
export function missionLabel(m: Pick<Mission, 'kind' | 'target'>): string {
  switch (m.kind) {
    case 'play-games':
      return `미니게임 ${m.target}판 하기`;
    case 'pull':
      return `캡슐 ${m.target}개 뽑기`;
    case 'pet':
      return `말랑이 ${m.target}번 쓰다듬기`;
    case 'earn-coins':
      return `미니게임으로 코인 ${m.target.toLocaleString()}개 모으기`;
    case 'new-best':
      return m.target === 1 ? '미니게임 최고 기록 깨기' : `최고 기록 ${m.target}번 깨기`;
  }
}

/** 날짜 키 → 32비트 시드 (FNV-1a) */
export function seedFromDate(dateKey: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 그날의 미션 3개: 서로 다른 종류, 쉬움/보통/어려움 하나씩 */
export function generateDailyMissions(dateKey: string): Mission[] {
  const rng = createSeededRng(seedFromDate(dateKey));
  const kinds = shuffle(rng, TEMPLATES).slice(0, 3);
  const difficulties = shuffle(rng, ['easy', 'normal', 'hard'] as const);
  return kinds.map((t, i) => {
    const difficulty = difficulties[i] ?? 'easy';
    return {
      id: t.kind,
      kind: t.kind,
      target: t.targets[difficulty],
      difficulty,
      reward: MISSION_REWARD_COINS[difficulty],
    };
  });
}

export interface MissionState {
  /** 이 진행도가 속한 날짜 (서울) */
  date: string;
  progress: Partial<Record<MissionKind, number>>;
  claimed: MissionKind[];
  bonusClaimed: boolean;
}

export function createMissionState(dateKey: string): MissionState {
  return { date: dateKey, progress: {}, claimed: [], bonusClaimed: false };
}

/** 날짜가 바뀌었으면 새 상태로 (같으면 그대로 반환) */
export function rollMissions(state: MissionState, dateKey: string): MissionState {
  return state.date === dateKey ? state : createMissionState(dateKey);
}

/** 이벤트 기록. 오늘 미션에 없는 종류여도 기록해 두면 무해하다. */
export function recordMission(state: MissionState, kind: MissionKind, amount: number): MissionState {
  const add = Math.max(0, Math.floor(amount));
  if (add === 0) return state;
  return { ...state, progress: { ...state.progress, [kind]: (state.progress[kind] ?? 0) + add } };
}

export function isMissionDone(state: MissionState, m: Mission): boolean {
  return (state.progress[m.kind] ?? 0) >= m.target;
}

export type MissionClaim =
  | { ok: true; state: MissionState; coins: number }
  | { ok: false; reason: 'unknown' | 'not-done' | 'already-claimed' };

export function claimMission(state: MissionState, missions: readonly Mission[], id: MissionKind): MissionClaim {
  const m = missions.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'unknown' };
  if (state.claimed.includes(id)) return { ok: false, reason: 'already-claimed' };
  if (!isMissionDone(state, m)) return { ok: false, reason: 'not-done' };
  return { ok: true, state: { ...state, claimed: [...state.claimed, id] }, coins: m.reward };
}

export function canClaimBonus(state: MissionState, missions: readonly Mission[]): boolean {
  return !state.bonusClaimed && missions.every((m) => state.claimed.includes(m.id));
}

/** 받을 수 있는 보상이 하나라도 있는가 (탭 알림 점 표시용) */
export function hasClaimable(state: MissionState, missions: readonly Mission[]): boolean {
  return (
    missions.some((m) => !state.claimed.includes(m.id) && isMissionDone(state, m)) || canClaimBonus(state, missions)
  );
}
