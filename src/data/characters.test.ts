import { describe, expect, it } from 'vitest';
import { STARTER_BLURBS, STARTER_CHARACTER_IDS, getCharacter } from './characters';

describe('시작 말랑이', () => {
  it('모두 실제 말랑이이고 고르기 화면 소개가 있다', () => {
    for (const id of STARTER_CHARACTER_IDS) {
      expect(getCharacter(id)).toBeDefined();
      expect(STARTER_BLURBS[id]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('소개는 등급 이야기(흔한) 없이 존댓말', () => {
    for (const id of STARTER_CHARACTER_IDS) {
      const text = STARTER_BLURBS[id] ?? '';
      expect(text).not.toMatch(/흔한|일반/);
      expect(text).toMatch(/요\.$/);
    }
  });
});
