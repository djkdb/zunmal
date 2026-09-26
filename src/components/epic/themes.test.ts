import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../data/characters';
import { isEpicRarity } from './epicRarity';
import { EPIC_THEMES, epicMotifFor, epicThemeFor } from './themes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('epic themes', () => {
  const epics = CHARACTERS.filter((c) => isEpicRarity(c.rarity));

  it('신화·시크릿 말랑이는 모두 서로 다른 모티프를 가진다', () => {
    const motifs = epics.map((c) => epicMotifFor(c));
    expect(epics.length).toBeGreaterThan(0);
    expect(new Set(motifs).size).toBe(epics.length);
  });

  it('모든 테마 색은 6자리 hex이고 입자 색/모양이 비어 있지 않다', () => {
    for (const theme of Object.values(EPIC_THEMES)) {
      const colors = [
        theme.bgInner,
        theme.bgOuter,
        ...theme.nebula,
        theme.capsuleTop,
        theme.capsuleBottom,
        theme.core,
        theme.crack,
        ...theme.palette,
        ...theme.rayColors,
        ...(theme.fadeTo ? [theme.fadeTo] : []),
      ];
      for (const c of colors) expect(c).toMatch(HEX);
      expect(theme.palette.length).toBeGreaterThan(0);
      expect(theme.shapes.length).toBeGreaterThan(0);
      expect(theme.rayColors.length).toBeGreaterThan(0);
      expect(theme.tagline.length).toBeGreaterThan(0);
    }
  });

  it('목록에 없는 캐릭터는 효과, 그다음 등급으로 테마를 정한다', () => {
    expect(epicMotifFor({ id: 'new', effect: 'fire', rarity: 'mythic' })).toBe('phoenix');
    expect(epicMotifFor({ id: 'new', effect: 'none', rarity: 'secret' })).toBe('ocean');
    expect(epicMotifFor({ id: 'new', effect: 'none', rarity: 'mythic' })).toBe('galaxy');
    expect(epicThemeFor({ id: 'phoenix', effect: 'none', rarity: 'mythic' }).motif).toBe('phoenix');
  });
});
