/**
 * 안드로이드 Chrome의 설치 이벤트(beforeinstallprompt)는 페이지가 뜨자마자 한 번 오므로
 * 앱 시작 시(main.tsx) 바로 붙잡아 두고, 홈 화면 카드가 나중에 꺼내 쓴다.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // 브라우저 기본 미니 안내 대신 우리 카드에서 띄운다
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function wasInstalled(): boolean {
  return installed;
}

/** 설치 창을 띄운다. 설치를 고르면 true */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === 'accepted';
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 서비스 워커 등록 (프로덕션 빌드에서만 — 개발 중 캐시가 꼬이지 않도록) */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 등록 실패해도 게임은 그대로 동작
    });
  });
}
