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

  it('숫자로 끝나면 읽는 소리로 고른다', () => {
    expect(josa('Lv.5', '이/가')).toBe('Lv.5가');
    expect(josa('Lv.3', '이/가')).toBe('Lv.3이');
    expect(josa('Lv.7', '이/가')).toBe('Lv.7이');
    expect(josa('Lv.9', '이/가')).toBe('Lv.9가');
    expect(josa('Lv.10', '이/가')).toBe('Lv.10이');
    expect(josa('Lv.2', '으로/로')).toBe('Lv.2로');
    expect(josa('Lv.8', '으로/로')).toBe('Lv.8로');
    expect(josa('1,000', '을/를')).toBe('1,000을');
    expect(josa('300', '과/와')).toBe('300과');
    expect(josa('0', '이/가')).toBe('0이');
    expect(josa('24', '은/는')).toBe('24는');
  });

  it('모든 말랑이 이름에 대해 동작한다', () => {
    for (const c of CHARACTERS) expect(josa(c.name, '과/와').length).toBe(c.name.length + 1);
  });
});
