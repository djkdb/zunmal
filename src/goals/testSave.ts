/**
 * 테스트 전용: 시작 말랑이를 고른 직후의 저장(createInitialSave + chooseStarter 와 같은 모양)에 patch 를 얹는다.
 */
import { createInitialSave, type SaveData } from '../store/persistence';

/** 2026-03-10 12:00 서울 (03:00 UTC) */
export const NOW = Date.UTC(2026, 2, 10, 3, 0, 0);
export const HOUR = 3_600_000;
export const TODAY = '2026-03-10';
export const YESTERDAY = '2026-03-09';

export function starterSave(patch: Partial<SaveData> = {}, now = NOW, starter = 'peach-mochi'): SaveData {
  const base = createInitialSave(new Date(now));
  return {
    ...base,
    ownedMalangs: { [starter]: { count: 1, shinyCount: 0, firstObtainedAt: now } },
    partnerId: starter,
    unboxed: [starter],
    playroom: { ...base.playroom, out: [starter] },
    shop: { staff: [starter], lastTickAt: now, banked: 0 },
    ...patch,
  };
}

/** 여러 말랑이를 보유(모두 연 상태) */
export function ownedMap(ids: string[], at = NOW - 3 * 24 * HOUR): SaveData['ownedMalangs'] {
  return Object.fromEntries(ids.map((id, i) => [id, { count: 1, shinyCount: 0, firstObtainedAt: at + i }]));
}
