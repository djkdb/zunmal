import { useEffect, useState } from 'react';

/**
 * 지금 시각(ms)을 intervalMs 마다 새로 준다. 화면이 숨겨져 있으면 멈췄다가 돌아오면 바로 갱신한다.
 * 매 프레임이 아니라 몇 초마다 — 가게 코인처럼 천천히 오르는 숫자용.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id = 0;
    const tick = () => setNow(Date.now());
    const start = () => {
      window.clearInterval(id);
      id = window.setInterval(tick, intervalMs);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      } else window.clearInterval(id);
    };
    tick();
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}
