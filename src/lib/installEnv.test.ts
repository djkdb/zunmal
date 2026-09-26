import { describe, expect, it } from 'vitest';
import { detectInstallEnv, externalBrowserUrl, openInBrowserSteps } from './installEnv';

const UA = {
  instaIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_4; ko_KR; ko; scale=3.00; 1179x2556; 600000000)',
  instaAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.0 Android',
  kakao:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.6.0',
  threads:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 330.0.0.0',
  safari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

describe('detectInstallEnv', () => {
  it('인스타그램 앱 안 브라우저를 OS와 함께 구분한다', () => {
    expect(detectInstallEnv({ userAgent: UA.instaIos, standalone: false })).toEqual({ kind: 'in-app', app: 'instagram', os: 'ios' });
    expect(detectInstallEnv({ userAgent: UA.instaAndroid, standalone: false })).toEqual({ kind: 'in-app', app: 'instagram', os: 'android' });
  });

  it('카카오톡, 스레드도 앱 안 브라우저로 본다', () => {
    expect(detectInstallEnv({ userAgent: UA.kakao, standalone: false })).toMatchObject({ kind: 'in-app', app: 'kakaotalk' });
    expect(detectInstallEnv({ userAgent: UA.threads, standalone: false })).toMatchObject({ kind: 'in-app', app: 'threads' });
  });

  it('일반 브라우저는 OS별로, 설치된 앱은 standalone', () => {
    expect(detectInstallEnv({ userAgent: UA.safari, standalone: false })).toEqual({ kind: 'ios' });
    expect(detectInstallEnv({ userAgent: UA.ipad, standalone: false, maxTouchPoints: 5 })).toEqual({ kind: 'ios' });
    expect(detectInstallEnv({ userAgent: UA.ipad, standalone: false, maxTouchPoints: 0 })).toEqual({ kind: 'desktop' });
    expect(detectInstallEnv({ userAgent: UA.chromeAndroid, standalone: false })).toEqual({ kind: 'android' });
    expect(detectInstallEnv({ userAgent: UA.desktop, standalone: false })).toEqual({ kind: 'desktop' });
    expect(detectInstallEnv({ userAgent: UA.instaIos, standalone: true })).toEqual({ kind: 'standalone' });
  });
});

describe('externalBrowserUrl', () => {
  it('안드로이드는 Chrome intent + 대체 주소, 해시는 버린다', () => {
    const url = externalBrowserUrl('https://malang.pages.dev/app/?ref=ig#/gacha', 'android');
    expect(url).toBe(
      'intent://malang.pages.dev/app/?ref=ig#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fmalang.pages.dev%2Fapp%2F%3Fref%3Dig;end',
    );
  });

  it('iOS는 Safari 스킴, 그 외나 http는 null', () => {
    expect(externalBrowserUrl('https://malang.pages.dev/#/', 'ios')).toBe('x-safari-https://malang.pages.dev/');
    expect(externalBrowserUrl('https://malang.pages.dev/', 'other')).toBeNull();
    expect(externalBrowserUrl('http://localhost:5173/', 'ios')).toBeNull();
    expect(externalBrowserUrl('not a url', 'ios')).toBeNull();
  });
});

describe('openInBrowserSteps', () => {
  it('앱마다 메뉴 위치가 다르다', () => {
    expect(openInBrowserSteps('kakaotalk', 'ios')[1]).toContain('다른 브라우저로 열기');
    expect(openInBrowserSteps('instagram', 'android')[1]).toContain('Chrome');
    expect(openInBrowserSteps('instagram', 'ios')[1]).toContain('외부 브라우저에서 열기');
  });
});
