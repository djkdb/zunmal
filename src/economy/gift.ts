/**
 * 말랑 선물 — 서울 날짜로 하루 한 번, 친밀도가 가장 높은 말랑이가 선물 상자를 가져온다. 순수 모듈.
 * 코인 = 기본 + 애정 단계 × 단계당 (상한). 숫자는 economy/config.ts GIFT_COINS.
 */
import { levelOf } from '../data/affection';
import { CHARACTERS } from '../data/characters';
import { GIFT_COINS } from './config';

export interface GiftInput {
  /** 캡슐을 연 보유 말랑이 id (봉인된 캡슐 속 말랑이는 선물을 가져오지 않는다) */
  unboxed: readonly string[];
  affection: Readonly<Record<string, number | undefined>>;
  partnerId: string | null;
}

/** 선물을 가져올 말랑이: 친밀도가 가장 높은 말랑이, 같으면 파트너, 그다음 도감 순. 없으면 파트너(있으면) */
export function giftGiver({ unboxed, affection, partnerId }: GiftInput): string | null {
  const pool = new Set(unboxed);
  // 파트너를 먼저 보면 같은 친밀도에서 파트너가 이긴다 (더 큰 값만 바꾼다)
  const order = [...(partnerId && pool.has(partnerId) ? [partnerId] : []), ...CHARACTERS.map((c) => c.id).filter((id) => pool.has(id))];
  let best: string | null = null;
  let bestAff = -1;
  for (const id of order) {
    const a = affection[id] ?? 0;
    if (a > bestAff) {
      best = id;
      bestAff = a;
    }
  }
  return best ?? partnerId;
}

/** 선물 코인 */
export function giftCoins(affection: number): number {
  return Math.min(GIFT_COINS.max, GIFT_COINS.base + levelOf(affection) * GIFT_COINS.perLevel);
}

/** 오늘(서울 날짜 키) 선물을 받을 수 있는지 */
export function giftAvailable(giftDay: string | null, today: string, giver: string | null): boolean {
  return giver !== null && giftDay !== today;
}
