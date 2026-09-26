/**
 * 선물 링크(`?c=코드`)로 들어온 쿠폰 코드를 앱 시작 때 한 번 붙잡아 둔다 (main.tsx에서 렌더 전에 호출).
 * 주소에서는 바로 지워(history.replaceState) 새로고침·링크 공유로 다시 뜨지 않는다.
 * 코드는 저장 데이터가 아니라 이번 실행 동안만 들고 있다 — 받기는 여전히 저장당 한 번(store.redeemCoupon).
 */
import { useSyncExternalStore } from 'react';
import { parseCouponLink } from '../lib/couponLink';

let pending: string | null = null;
const listeners = new Set<() => void>();

export function captureCouponLink(): void {
  if (typeof window === 'undefined') return;
  const { code, cleanUrl } = parseCouponLink(window.location.href);
  if (cleanUrl !== window.location.href) {
    try {
      window.history.replaceState(window.history.state, '', cleanUrl);
    } catch {
      // 주소를 못 바꿔도 코드는 쓸 수 있다
    }
  }
  if (code) pending = code;
}

/** 선물 링크 코드를 다 썼거나(받음·이미 받음) 닫았을 때 */
export function clearPendingCoupon(): void {
  if (pending === null) return;
  pending = null;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function usePendingCoupon(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}
