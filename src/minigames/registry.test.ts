import { describe, expect, it } from 'vitest';
import { MINI_GAMES, RECOMMENDED_GAME_ID, getMiniGame } from './registry';
import { formatPlayLength } from './types';

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

  it('로비 카드 한 줄: 길이와 짧은 동작', () => {
    for (const g of MINI_GAMES) {
      expect(g.durationMs).toBeGreaterThan(0);
      expect(g.blurb.length).toBeGreaterThan(0);
      // "2분 떨어뜨려 합치기" 정도까지 — 360px 두 칸 카드에서 한 줄
      expect(`${formatPlayLength(g.durationMs)} ${g.blurb}`.length).toBeLessThanOrEqual(11);
    }
  });

  it('추천 게임은 목록에 있다', () => {
    expect(getMiniGame(RECOMMENDED_GAME_ID)).toBeDefined();
  });

  it('길이 글자', () => {
    expect(formatPlayLength(20_000)).toBe('20초');
    expect(formatPlayLength(60_000)).toBe('60초');
    expect(formatPlayLength(90_000)).toBe('90초');
    expect(formatPlayLength(120_000)).toBe('2분');
  });

  it('알 수 없는 id는 undefined', () => {
    expect(getMiniGame('nope')).toBeUndefined();
    expect(getMiniGame(undefined)).toBeUndefined();
  });
});
