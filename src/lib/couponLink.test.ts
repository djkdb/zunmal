import { describe, expect, it } from 'vitest';
import { parseCouponLink } from './couponLink';

describe('parseCouponLink', () => {
  it('해시 앞 ?c= 를 읽고 주소에서 지운다', () => {
    expect(parseCouponLink('https://zunmal.pages.dev/?c=zun')).toEqual({
      code: 'zun',
      cleanUrl: 'https://zunmal.pages.dev/',
    });
  });

  it('해시는 그대로 두고 다른 쿼리도 남긴다', () => {
    expect(parseCouponLink('https://zunmal.pages.dev/?utm=ig&c=ZUN#/gacha')).toEqual({
      code: 'ZUN',
      cleanUrl: 'https://zunmal.pages.dev/?utm=ig#/gacha',
    });
  });

  it('HashRouter 해시 안 쿼리 #/?c= 도 받는다', () => {
    expect(parseCouponLink('https://zunmal.pages.dev/#/?c=zun')).toEqual({
      code: 'zun',
      cleanUrl: 'https://zunmal.pages.dev/#/',
    });
    expect(parseCouponLink('https://zunmal.pages.dev/#/play?x=1&c=zun').cleanUrl).toBe(
      'https://zunmal.pages.dev/#/play?x=1',
    );
  });

  it('인코딩된 한글·공백 코드', () => {
    expect(parseCouponLink('https://a.dev/?c=%EC%84%A0%EB%AC%BC%20%EC%BD%94%EB%93%9C').code).toBe('선물 코드');
  });

  it('없으면 null, 주소는 그대로', () => {
    const href = 'https://zunmal.pages.dev/#/collection';
    expect(parseCouponLink(href)).toEqual({ code: null, cleanUrl: href });
  });

  it('빈 값·너무 긴 값·이상한 글자는 코드로 보지 않지만 주소에서는 지운다', () => {
    expect(parseCouponLink('https://a.dev/?c=')).toEqual({ code: null, cleanUrl: 'https://a.dev/' });
    expect(parseCouponLink(`https://a.dev/?c=${'a'.repeat(30)}`).code).toBeNull();
    expect(parseCouponLink('https://a.dev/?c=%3Cscript%3E').code).toBeNull();
  });

  it('잘못된 주소도 던지지 않는다', () => {
    expect(parseCouponLink('not a url')).toEqual({ code: null, cleanUrl: 'not a url' });
  });
});
