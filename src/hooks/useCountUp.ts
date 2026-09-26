import { useEffect, useState } from 'react';
import { countUpDuration, countUpValue } from '../lib/coinFx';
import { useReducedMotion } from './useReducedMotion';

interface CountUpOptions {
  from?: number;
  delay?: number;
  /** true면 굴리지 않고 바로 target (결과 화면을 톡 눌러 건너뛸 때) */
  skip?: boolean;
}

/**
 * 0(또는 from)에서 target까지 굴러 올라가는 정수. 결과 화면 점수 등에 쓴다.
 * 길이는 늘어난 양의 로그에 비례(0.4~1.2초), 움직임 줄이기나 skip이면 바로 target.
 */
export function useCountUp(target: number, { from = 0, delay = 0, skip = false }: CountUpOptions = {}): number {
  const reduced = useReducedMotion();
  const instant = reduced || skip;
  const [value, setValue] = useState(instant ? target : from);

  useEffect(() => {
    if (instant || target === from) {
      setValue(target);
      return;
    }
    const duration = countUpDuration(Math.abs(target - from));
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t + delay;
      const v = countUpValue(from, target, t - start, duration);
      setValue(v);
      if (v !== target) raf = requestAnimationFrame(tick);
    };
    setValue(from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, from, delay, instant]);

  return value;
}
