/**
 * 놀이방 선반 목록 (순수 모듈). 보유 말랑이를 등급 높은 순 → 최근 얻은 순으로 늘어놓고,
 * 아직 열지 않은 말랑이는 봉인된 캡슐로, 매트에 나와 있는 말랑이는 "나와 있음"으로 표시한다.
 */
import type { Rarity } from '../data/rarity';
import { rarityRank } from '../data/rarity';

export interface ShelfSource {
  id: string;
  rarity: Rarity;
  firstObtainedAt: number;
}

export interface ShelfEntry {
  id: string;
  rarity: Rarity;
  /** 아직 캡슐을 열지 않았다 */
  sealed: boolean;
  /** 매트 위에 나와 있다 (봉인 캡슐이 매트에 놓인 경우 포함) */
  out: boolean;
}

export function shelfOrder(items: readonly ShelfSource[]): ShelfSource[] {
  return [...items].sort(
    (a, b) =>
      rarityRank(b.rarity) - rarityRank(a.rarity) ||
      b.firstObtainedAt - a.firstObtainedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * 선반 칸들. outIds = 매트에 올라간 말랑이(열린 것), capsuleIds = 매트에 놓인 봉인 캡슐.
 */
export function buildShelf(
  items: readonly ShelfSource[],
  unboxed: ReadonlySet<string>,
  outIds: ReadonlySet<string>,
  capsuleIds: ReadonlySet<string> = new Set(),
): ShelfEntry[] {
  return shelfOrder(items).map((it) => ({
    id: it.id,
    rarity: it.rarity,
    sealed: !unboxed.has(it.id),
    out: outIds.has(it.id) || capsuleIds.has(it.id),
  }));
}

export type ShelfAction = 'take-out' | 'put-back' | 'full';

/** 선반 칸을 눌렀을 때 할 일: 나와 있으면 넣기, 아니면 자리가 있을 때 꺼내기 */
export function shelfAction(entry: Pick<ShelfEntry, 'out'>, onMat: number, cap: number): ShelfAction {
  if (entry.out) return 'put-back';
  return onMat >= cap ? 'full' : 'take-out';
}
