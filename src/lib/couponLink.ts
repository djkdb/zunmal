/**
 * 선물 링크의 쿠폰 코드 읽기 — 순수 함수 (DOM 없음).
 *
 * 인스타 DM·공지로 `https://zunmal.pages.dev/?c=zun` 을 보내면 앱이 켜질 때 코드를 꺼내
 * 홈에서 "선물 쿠폰이 도착했어요"를 보여 준다. HashRouter라 `#/?c=zun` 처럼 해시 안 쿼리도 받는다.
 * 읽은 뒤에는 주소에서 `c`만 지운 URL(`cleanUrl`)로 바꿔 새로고침·공유해도 다시 뜨지 않게 한다.
 */

/** 쿠폰 코드를 담는 쿼리 이름 */
export const COUPON_PARAM = 'c';

/** 코드로 받아 줄 글자 (쿠폰 입력 칸 maxLength와 같은 길이 제한) */
const CODE_RE = /^[\p{L}\p{N}\s-]{1,24}$/u;

export interface CouponLink {
  /** 찾은 코드 (앞뒤 공백 제거). 없거나 이상하면 null */
  code: string | null;
  /** `c`를 뺀 주소. 바꿀 것이 없으면 입력과 같다 */
  cleanUrl: string;
}

function stripParam(query: string): { value: string | null; rest: string } {
  // query는 '?' 없이 'a=1&c=zun' 모양
  const params = new URLSearchParams(query);
  const value = params.get(COUPON_PARAM);
  if (value === null) return { value: null, rest: query };
  params.delete(COUPON_PARAM);
  return { value, rest: params.toString() };
}

export function parseCouponLink(href: string): CouponLink {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { code: null, cleanUrl: href };
  }

  let found: string | null = null;
  let changed = false;

  // 1) 해시 앞 쿼리: https://host/?c=zun#/
  const main = stripParam(url.search.replace(/^\?/, ''));
  if (main.value !== null) {
    found = main.value;
    url.search = main.rest ? `?${main.rest}` : '';
    changed = true;
  }

  // 2) 해시 안 쿼리: https://host/#/?c=zun
  const hash = url.hash.replace(/^#/, '');
  const q = hash.indexOf('?');
  if (q >= 0) {
    const inner = stripParam(hash.slice(q + 1));
    if (inner.value !== null) {
      found ??= inner.value;
      const path = hash.slice(0, q);
      url.hash = inner.rest ? `${path}?${inner.rest}` : path;
      changed = true;
    }
  }

  const trimmed = found?.trim() ?? '';
  const code = trimmed !== '' && CODE_RE.test(trimmed) ? trimmed : null;
  let cleanUrl = changed ? url.toString() : href;
  // 해시를 다 비웠으면 끝의 '#'도 떼지 않는다 — HashRouter가 '/'로 다시 붙인다. 빈 '?'만 없앤다.
  if (changed) cleanUrl = cleanUrl.replace(/\?(?=#|$)/, '');
  return { code, cleanUrl };
}
