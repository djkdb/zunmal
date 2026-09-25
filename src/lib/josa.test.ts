import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { hasFinalConsonant, josa } from './josa';

describe('josa', () => {
  it('받침 유무에 따라 조사를 고른다', () => {
    expect(josa('소다 방울', '과/와')).toBe('소다 방울과');
    expect(josa('복숭아 모찌', '과/와')).toBe('복숭아 모찌와');
    expect(josa('말차 콩', '이/가')).toBe('말차 콩이');
    expect(josa('포도 젤리', '이/가')).toBe('포도 젤리가');
    expect(josa('은하 말랑', '을/를')).toBe('은하 말랑을');
    expect(josa('버블티', '은/는')).toBe('버블티는');
  });

  it("'으로/로'는 ㄹ 받침 뒤에 '로'", () => {
    expect(josa('소다 방울', '으로/로')).toBe('소다 방울로');
    expect(josa('말차 콩', '으로/로')).toBe('말차 콩으로');
    expect(josa('포도 젤리', '으로/로')).toBe('포도 젤리로');
  });

  it('한글이 아니거나 빈 문자열이면 받침 없음으로 본다', () => {
    expect(hasFinalConsonant('')).toBe(false);
    expect(hasFinalConsonant('ABC')).toBe(false);
  });

  it('모든 말랑이 이름에 대해 동작한다', () => {
    for (const c of CHARACTERS) expect(josa(c.name, '과/와').length).toBe(c.name.length + 1);
  });
});
