import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '../../data/characters';
import { RARITIES } from '../../data/rarity';
import { luminance } from '../../lib/color';
import { hasPartnerFlair, moodCharacter, partnerTrailColor } from './partner';

const peach = getCharacter('peach-mochi')!;

describe('moodCharacter', () => {
  it('idle이면 원래 캐릭터 그대로', () => {
    expect(moodCharacter(peach, 'idle')).toBe(peach);
  });

  it('표정마다 눈만 바꾸고 나머지는 그대로 둔다', () => {
    const happy = moodCharacter(peach, 'happy');
    expect(happy.eyes).toBe('happy');
    expect({ ...happy, eyes: peach.eyes }).toEqual(peach);
    expect(moodCharacter(peach, 'wow').eyes).toBe('sparkle');
    expect(moodCharacter(peach, 'oops').eyes).toBe('wide');
    expect(moodCharacter(peach, 'sad').eyes).toBe('sleepy');
  });

  it('원본 캐릭터 데이터를 바꾸지 않는다', () => {
    const before = peach.eyes;
    moodCharacter(peach, 'oops');
    expect(peach.eyes).toBe(before);
  });
});

describe('hasPartnerFlair', () => {
  it('전설 이상만 장식이 붙는다', () => {
    const withFlair = RARITIES.filter(hasPartnerFlair);
    expect(withFlair).toEqual(['legendary', 'mythic', 'secret']);
  });
});

describe('partnerTrailColor', () => {
  it('모든 말랑이의 궤적 색이 크림 바탕에서 보일 만큼 어둡다', () => {
    for (const c of CHARACTERS) {
      const color = partnerTrailColor(c);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(luminance(color), c.id).toBeLessThanOrEqual(0.6);
    }
  });
});
