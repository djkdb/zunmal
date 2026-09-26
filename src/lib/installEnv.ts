/**
 * 홈 화면 추가(PWA 설치)에 필요한 실행 환경 판별 — 순수 함수 (UA 문자열을 주입받아 테스트 가능).
 *
 * 인스타그램·카카오톡 같은 앱 안 브라우저(웹뷰)는 홈 화면에 추가할 수 없고,
 * 저장 공간도 일반 브라우저와 따로라서 먼저 "브라우저로 열기"를 안내해야 한다.
 */

export type InAppName = 'instagram' | 'facebook' | 'threads' | 'kakaotalk' | 'naver' | 'line' | 'other';

export type InstallEnv =
  | { kind: 'standalone' }
  | { kind: 'in-app'; app: InAppName; os: 'ios' | 'android' | 'other' }
  | { kind: 'ios' }
  | { kind: 'android' }
  | { kind: 'desktop' };

export interface EnvInput {
  userAgent: string;
  /** display-mode: standalone 또는 iOS navigator.standalone */
  standalone: boolean;
  /** iPadOS는 데스크톱 UA를 쓰므로 터치 지점 수로 구분 */
  maxTouchPoints?: number;
}

const IN_APP_PATTERNS: [InAppName, RegExp][] = [
  ['instagram', /Instagram/i],
  // Threads 앱의 내부 이름
  ['threads', /Barcelona/i],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['kakaotalk', /KAKAOTALK/i],
  ['naver', /NAVER\(inapp|NaverMatome|; wv\).*NAVER/i],
  ['line', /\bLine\//i],
  ['other', /DaumApps|everytimeApp|Twitter|; wv\)/i],
];

export function detectInstallEnv({ userAgent, standalone, maxTouchPoints = 0 }: EnvInput): InstallEnv {
  if (standalone) return { kind: 'standalone' };
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  for (const [app, re] of IN_APP_PATTERNS) {
    if (re.test(userAgent)) return { kind: 'in-app', app, os: ios ? 'ios' : android ? 'android' : 'other' };
  }
  if (ios) return { kind: 'ios' };
  if (android) return { kind: 'android' };
  return { kind: 'desktop' };
}

export const IN_APP_LABEL: Record<InAppName, string> = {
  instagram: '인스타그램',
  facebook: '페이스북',
  threads: '스레드',
  kakaotalk: '카카오톡',
  naver: '네이버',
  line: '라인',
  other: '앱',
};

/**
 * 앱 안 브라우저에서 외부 브라우저를 여는 주소.
 * - 안드로이드: Chrome intent (Chrome이 없으면 fallback 주소로)
 * - iOS 17+: x-safari-https 스킴 (이전 버전은 아무 일도 없으므로 안내 문구를 함께 보여 준다)
 * 해시 라우터의 #은 intent 문법과 겹치므로 첫 화면 주소로 연다.
 */
export function externalBrowserUrl(pageUrl: string, os: 'ios' | 'android' | 'other'): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const base = `${url.host}${url.pathname}${url.search}`;
  if (os === 'android') {
    const fallback = encodeURIComponent(`https://${base}`);
    return `intent://${base}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }
  if (os === 'ios') return `x-safari-https://${base}`;
  return null;
}

/** 앱 안 브라우저의 "외부 브라우저로 열기" 메뉴 위치 안내 */
export function openInBrowserSteps(app: InAppName, os: 'ios' | 'android' | 'other'): string[] {
  if (app === 'kakaotalk') return ['오른쪽 아래 점 세 개 버튼을 눌러요', "'다른 브라우저로 열기'를 눌러요"];
  const menu = os === 'android' ? '오른쪽 위 점 세 개(세로) 버튼을 눌러요' : '오른쪽 위 점 세 개 버튼을 눌러요';
  const item = os === 'android' ? "'Chrome에서 열기' 또는 '외부 브라우저에서 열기'를 눌러요" : "'외부 브라우저에서 열기'를 눌러요";
  return [menu, item];
}
