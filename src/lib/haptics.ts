/**
 * 진동(햅틱) — 선택적 향상.
 *
 * - 안드로이드 Chrome: navigator.vibrate(패턴). 사용자가 한 번이라도 화면을 만진 뒤에만 동작한다.
 * - iOS Safari·데스크톱 Firefox 등 Vibration API가 없는 곳: 아무것도 하지 않는다.
 * - 움직임 줄이기를 켠 사용자에게는 진동도 보내지 않는다.
 *
 * 버튼마다 붙이지 말고 의미 있는 순간(코인 획득, 결과 발표, 높은 등급)에만 쓴다.
 * 패턴 값은 연구 노트(game_feel.md §6)의 시작값이며, 기기마다 모터가 달라 실기기에서 조정한다.
 */

export type HapticKind = 'tap' | 'success' | 'fail' | 'rare' | 'legendary' | 'epic';

/** [진동, 쉼, 진동, …] ms. 10ms 미만은 많은 기기에서 느껴지지 않는다. */
export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  /** 가벼운 확인 (선택, 작은 획득) */
  tap: [12],
  /** 성공: 톡-톡 */
  success: [12, 60, 18],
  /** 실패: 짧게 세 번 부르르 */
  fail: [30, 40, 30, 40, 30],
  /** 레어·에픽 결과 */
  rare: [20, 50, 40],
  /** 전설 결과: 두 번 두드린 뒤 길게 */
  legendary: [30, 60, 30, 60, 80],
  /** 신화·시크릿 폭발 순간: 길게 한 번 + 여운 */
  epic: [120, 60, 40],
};

export function hapticPattern(kind: HapticKind): number[] {
  return [...HAPTIC_PATTERNS[kind]];
}

/** 테스트에서 주입할 수 있는 환경. 기본값은 브라우저 전역. */
export interface HapticEnv {
  vibrate?: (pattern: number[]) => boolean;
  reducedMotion: boolean;
  /** 사용자가 이미 페이지와 상호작용했는가 (Chrome은 그 전 진동을 무시하고 경고를 남긴다) */
  hasBeenActive: boolean;
}

let enabled = true;

/** 설정의 "진동 끄기"용. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

function browserEnv(): HapticEnv {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { reducedMotion: true, hasBeenActive: false };
  }
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  return {
    vibrate: typeof nav.vibrate === 'function' ? (p) => nav.vibrate(p) : undefined,
    reducedMotion: !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    // userActivation이 없는 브라우저는 알 수 없으므로 시도는 해 본다
    hasBeenActive: nav.userActivation ? nav.userActivation.hasBeenActive : true,
  };
}

/** 진동을 한 번 보낸다. 보냈으면 true. 지원하지 않거나 꺼져 있으면 조용히 false. */
export function haptic(kind: HapticKind, env: HapticEnv = browserEnv()): boolean {
  if (!enabled || env.reducedMotion || !env.hasBeenActive || !env.vibrate) return false;
  try {
    return env.vibrate(hapticPattern(kind));
  } catch {
    return false;
  }
}
