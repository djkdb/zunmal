import type { Character, MalangEyes } from '../../data/characters';
import { rarityRank, type Rarity } from '../../data/rarity';
import { darken, luminance } from '../../lib/color';

/**
 * 게임 속 파트너 말랑이의 표정. 연출 전용이며 점수·코인과 무관하다.
 * - happy: 잘했을 때 (웃는 눈 + 하트)
 * - wow: 아주 잘했을 때 (반짝 눈 + 별)
 * - oops: 맞았거나 위험할 때 (동그란 눈 + 땀방울)
 * - sad: 실패했을 때 (감은 눈 + 시무룩 선)
 */
export type PartnerMood = 'idle' | 'happy' | 'wow' | 'oops' | 'sad';

const MOOD_EYES: Readonly<Record<Exclude<PartnerMood, 'idle'>, MalangEyes>> = {
  happy: 'happy',
  wow: 'sparkle',
  oops: 'wide',
  sad: 'sleepy',
};

/** 표정에 맞게 눈만 바꾼 캐릭터. idle이면 원래 캐릭터를 그대로 돌려준다. */
export function moodCharacter(partner: Character, mood: PartnerMood): Character {
  if (mood === 'idle') return partner;
  const eyes = MOOD_EYES[mood];
  return eyes === partner.eyes ? partner : { ...partner, eyes };
}

/** 전설 이상 파트너는 게임 속에서 희귀도 오라와 반짝 꼬리를 두른다 (장식만) */
export function hasPartnerFlair(rarity: Rarity): boolean {
  return rarityRank(rarity) >= rarityRank('legendary');
}

/**
 * 파트너의 색으로 그리는 궤적(칼날 자국, 비행 꼬리) 색.
 * 보조 색이 있으면 그것을, 너무 밝으면(흰 유니콘 등) 크림 바탕에서 보이도록 어둡게 한다.
 */
export function partnerTrailColor(partner: Pick<Character, 'color' | 'accentColor'>): string {
  const base = partner.accentColor ?? partner.color;
  const lum = luminance(base);
  if (lum > 0.6) return darken(base, 0.35);
  if (lum > 0.45) return darken(base, 0.15);
  return base;
}
