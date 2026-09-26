import type { Rarity } from '../../data/rarity';

/** 신화 이상만 전체 화면 등장 연출을 쓴다 */
export function isEpicRarity(rarity: Rarity): boolean {
  return rarity === 'mythic' || rarity === 'secret';
}
