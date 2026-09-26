import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  activeFlightPlan,
  counterHeldUntil,
  countUpDuration,
  countUpValue,
  subscribeCoinFx,
  type CoinFlightPlan,
} from '../lib/coinFx';
import { useReducedMotion } from './useReducedMotion';

interface Anim {
  from: number;
  to: number;
  /** performance.now() 기준 */
  start: number;
  duration: number;
}

const POP: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.12, 1.06)', offset: 0.4 },
  { transform: 'scale(1)' },
];

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-4px)' },
  { transform: 'translateX(2px)' },
  { transform: 'translateX(0)' },
];

/**
 * TopBar 코인 숫자: 실제 값(coins)을 따라 굴러 올라가는 표시 값을 돌려준다.
 * - 늘면 easeOutCubic 카운트업(Δ의 로그에 비례, 0.4~1.2초) + 알약 톡.
 * - 코인이 날아오는 중이면(coinFx 계획) 첫 코인 도착부터 올라가고, 코인이 닿을 때마다 알약이 톡.
 * - 줄면 0.3초 만에 내려간다. 움직임 줄이기면 즉시.
 */
export function useCoinCounter(coins: number, pillRef: RefObject<HTMLElement | null>): { display: number; short: boolean } {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(coins);
  const [short, setShort] = useState(false);
  const shown = useRef(coins);
  const target = useRef(coins);
  const anim = useRef<Anim | null>(null);
  const raf = useRef(0);
  const holdTimer = useRef(0);

  const pop = () => {
    if (reduced) return;
    pillRef.current?.animate?.(POP, { duration: 180, easing: 'ease-out' });
  };

  const tick = () => {
    const a = anim.current;
    if (!a) return;
    const t = performance.now();
    const v = countUpValue(a.from, a.to, t - a.start, a.duration);
    if (v !== shown.current) {
      shown.current = v;
      setDisplay(v);
    }
    if (t - a.start < a.duration) raf.current = requestAnimationFrame(tick);
    else anim.current = null;
  };

  const run = (to: number, start: number, duration: number) => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(holdTimer.current);
    anim.current = { from: shown.current, to, start, duration };
    raf.current = requestAnimationFrame(tick);
  };

  const runWithPlan = (plan: CoinFlightPlan) => {
    const to = target.current;
    const span = plan.lastArrival - plan.firstArrival;
    run(to, plan.firstArrival, Math.max(span + 120, countUpDuration(to - shown.current) * 0.6));
  };

  // 실제 값이 바뀜
  useEffect(() => {
    const prev = target.current;
    target.current = coins;
    if (coins === prev) return;
    if (reduced) {
      cancelAnimationFrame(raf.current);
      anim.current = null;
      shown.current = coins;
      setDisplay(coins);
      return;
    }
    const t = performance.now();
    if (coins < prev) {
      run(coins, t, countUpDuration(coins - shown.current));
      return;
    }
    const plan = activeFlightPlan();
    if (plan) {
      runWithPlan(plan);
      return;
    }
    const held = counterHeldUntil();
    if (held > t) {
      // 코인 비행이 곧 시작된다: 계획이 오면 거기에 맞추고, 안 오면 시간이 다 된 뒤 그냥 올린다
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        if (target.current !== shown.current) {
          run(target.current, performance.now(), countUpDuration(target.current - shown.current));
          pop();
        }
      }, held - t);
      return;
    }
    run(coins, t, countUpDuration(coins - shown.current));
    pop();
  }, [coins, reduced]);

  // 코인 비행 이벤트
  useEffect(
    () =>
      subscribeCoinFx((e) => {
        if (e.type === 'plan') {
          if (!reduced && target.current !== shown.current) runWithPlan(e.plan);
        } else if (e.type === 'arrive') {
          pop();
        } else if (e.type === 'insufficient') {
          setShort(true);
          if (!reduced) pillRef.current?.animate?.(SHAKE, { duration: 360, easing: 'ease-out' });
          window.setTimeout(() => setShort(false), 600);
        }
      }),
    [reduced],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(holdTimer.current);
    },
    [],
  );

  return { display, short };
}
