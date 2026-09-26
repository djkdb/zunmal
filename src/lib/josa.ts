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

/** 숫자를 한국어로 읽을 때 마지막 소리의 받침 번호: 영(ㅇ) 일(ㄹ) 이 삼(ㅁ) 사 오 육(ㄱ) 칠(ㄹ) 팔(ㄹ) 구 */
const DIGIT_FINAL = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0] as const;
/** 끝이 0 인 수: 십(ㅂ) 백(ㄱ) 천(ㄴ) 만(ㄴ) */
const TENS_FINAL = [17, 1, 4, 4] as const;

/** 끝 숫자들의 받침 번호 ("Lv.5" → 오, "10" → 십, "300" → 백). 숫자로 끝나지 않으면 null */
function digitFinal(word: string): number | null {
  const m = /(\d+)$/.exec(word.trim().replace(/,/g, ''));
  if (!m?.[1]) return null;
  const digits = m[1];
  const zerosAt = digits.search(/0+$/);
  // 0 으로 끝나지 않거나 전부 0 이면 마지막 숫자 소리 그대로
  if (zerosAt <= 0) return DIGIT_FINAL[Number(digits.at(-1))] ?? 0;
  const zeros = digits.length - zerosAt;
  return TENS_FINAL[Math.min(zeros, TENS_FINAL.length) - 1] ?? 0;
}

/** 마지막 글자의 받침 번호 (0 = 받침 없음). 한글이 아니면 0. 숫자로 끝나면 읽는 소리로. */
function finalIndex(word: string): number {
  const digit = digitFinal(word);
  if (digit !== null) return digit;
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
