import { describe, expect, it } from 'vitest';
import { LOBBY_FILTERS, LOBBY_FILTER_LABELS, SHORT_PLAY_MS, filterGames, isLobbyFilter, matchesFilter } from './lobby';
import { MINI_GAMES, RECOMMENDED_GAME_ID } from './registry';

describe('로비 칩 줄', () => {
  it('처음은 전체, 칩마다 이름이 있다', () => {
    expect(LOBBY_FILTERS[0]).toBe('all');
    for (const f of LOBBY_FILTERS) expect(LOBBY_FILTER_LABELS[f].length).toBeGreaterThan(0);
  });

  it('모든 게임은 딱지가 하나 이상, 겹치지 않는다', () => {
    for (const g of MINI_GAMES) {
      expect(g.tags.length, g.id).toBeGreaterThan(0);
      expect(new Set(g.tags).size, g.id).toBe(g.tags.length);
    }
  });

  it('전체 말고 모든 칩에 게임이 2개 이상, 전체보다 적다 (빈 칸·쓸모없는 칩 없음)', () => {
    for (const f of LOBBY_FILTERS) {
      const n = filterGames(MINI_GAMES, f).length;
      if (f === 'all') expect(n).toBe(MINI_GAMES.length);
      else {
        expect(n, f).toBeGreaterThanOrEqual(2);
        expect(n, f).toBeLessThan(MINI_GAMES.length);
      }
    }
  });

  it('처음 추천 게임은 "추천" 칩에도 있다', () => {
    const picks = filterGames(MINI_GAMES, 'pick').map((g) => g.id);
    expect(picks).toContain(RECOMMENDED_GAME_ID);
  });

  it('"짧게"는 한 판 길이에서 계산한다', () => {
    expect(matchesFilter({ durationMs: SHORT_PLAY_MS, tags: ['focus'] }, 'short')).toBe(true);
    expect(matchesFilter({ durationMs: SHORT_PLAY_MS + 1, tags: ['focus'] }, 'short')).toBe(false);
    expect(matchesFilter({ durationMs: 90_000, tags: ['focus'] }, 'focus')).toBe(true);
    expect(matchesFilter({ durationMs: 90_000, tags: ['focus'] }, 'feel')).toBe(false);
  });

  it('걸러도 registry 순서 유지', () => {
    const all = MINI_GAMES.map((g) => g.id);
    const picked = filterGames(MINI_GAMES, 'record').map((g) => g.id);
    expect(picked).toEqual(all.filter((id) => picked.includes(id)));
  });

  it('저장된 값 검사', () => {
    expect(isLobbyFilter('short')).toBe(true);
    expect(isLobbyFilter('nope')).toBe(false);
    expect(isLobbyFilter(3)).toBe(false);
  });
});
