/**
 * 한국어 조사 자동 선택. 앞 단어의 마지막 글자에 받침이 있는지 보고 고른다.
 * 예) josa('소다 방울', '과/와') → '소다 방울과', josa('복숭아 모찌', '과/와') → '복숭아 모찌와'
 */
export type JosaPair = '과/와' | '이/가' | '을/를' | '은/는' | '으로/로';

/** [받침 있을 때, 받침 없을 때] */
const FORMS: Record<JosaPair, readonly [string, string]> = {
  '과/와': ['과', '와'],
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '으로/로': ['으로', '로'],
};

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const RIEUL_FINAL = 8;

/** 마지막 글자의 받침 번호 (0 = 받침 없음). 한글이 아니면 0. */
function finalIndex(word: string): number {
  const last = word.trim().at(-1);
  if (!last) return 0;
  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return 0;
  return (code - HANGUL_START) % 28;
}

export function hasFinalConsonant(word: string): boolean {
  return finalIndex(word) !== 0;
}

export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = FORMS[pair];
  const fin = finalIndex(word);
  // '으로/로'는 ㄹ 받침 뒤에서도 '로'를 쓴다 (예: 방울로)
  if (pair === '으로/로' && fin === RIEUL_FINAL) return word + withoutFinal;
  return word + (fin !== 0 ? withFinal : withoutFinal);
}
