import { useEffect } from 'react';
import { browserStores, mirrorSave } from '../lib/saveBackup';
import { SAVE_KEY } from '../store/persistence';
import { useGameStore, type GameState } from '../store/useGameStore';

/** 뽑기나 미니게임을 한 번이라도 했는지 — 이때부터 지켜야 할 기록이 된다 */
function hasProgress(s: GameState): boolean {
  return s.totalPulls > 0 || Object.values(s.miniGameRecords).some((r) => r.plays > 0);
}

let persistAsked = false;

/** 브라우저에 "이 사이트 저장소는 지우지 말아 주세요"를 한 번 요청한다 (지원하는 곳만). */
function askPersistentStorage(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // 지원하지 않으면 그대로 둔다
  }
}

/**
 * 저장이 바뀔 때마다 백업을 새로 쓰고(lib/saveBackup), 첫 기록이 생기면 영구 저장을 요청한다.
 * persist 미들웨어는 구독자에게 알린 "뒤에" localStorage에 쓰므로 한 틱 미뤄 읽는다.
 */
export function useSaveGuard(): void {
  useEffect(() => {
    const stores = browserStores();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        mirrorSave(SAVE_KEY, stores);
      }, 0);
    };
    const check = (s: GameState) => {
      if (hasProgress(s)) askPersistentStorage();
    };

    schedule();
    check(useGameStore.getState());
    const unsubscribe = useGameStore.subscribe((s) => {
      schedule();
      check(s);
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') mirrorSave(SAVE_KEY, stores);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);
}
