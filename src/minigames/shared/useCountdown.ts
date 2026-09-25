import { useEffect, useState } from 'react';
import type { Sfx } from '../../audio/sfx';

/**
 * 게임 시작 전 3-2-1 카운트다운. 0이 되면 done=true.
 * reduced 모드에서는 간격을 줄인다.
 */
export function useCountdown(sfx: Sfx, { from = 3, reduced = false } = {}) {
  const [count, setCount] = useState(from);
  useEffect(() => {
    if (count < 0) return;
    sfx.countdown(count === 0);
    const id = window.setTimeout(() => setCount((c) => c - 1), reduced ? 350 : 700);
    return () => window.clearTimeout(id);
  }, [count, reduced, sfx]);
  return { count, done: count < 0 };
}
