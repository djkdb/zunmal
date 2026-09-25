import { describe, expect, it } from 'vitest';
import { MINI_GAMES, getMiniGame } from './registry';

describe('minigame registry', () => {
  it('id는 고유한 kebab-case', () => {
    const ids = MINI_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('모든 게임은 이름/설명/컴포넌트/아이콘을 가진다', () => {
    for (const g of MINI_GAMES) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.description.length).toBeGreaterThan(0);
      expect(g.Component).toBeTruthy();
      expect(g.icon).toBeTruthy();
    }
  });

  it('알 수 없는 id는 undefined', () => {
    expect(getMiniGame('nope')).toBeUndefined();
    expect(getMiniGame(undefined)).toBeUndefined();
  });
});
