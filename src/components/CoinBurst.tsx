import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import { haptic } from '../lib/haptics';
import { subscribeCoinFx, type CoinFlight } from '../lib/coinFx';
import { CoinIcon } from './icons';
import './CoinBurst.css';

const COIN_SIZE = 26;

function FlyingCoin({ flight, onDone }: { flight: CoinFlight; onDone(id: number): void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') {
      onDone(flight.id);
      return;
    }
    const half = COIN_SIZE / 2;
    const frames: Keyframe[] = flight.keyframes.map((k) => ({
      offset: k.offset,
      opacity: k.opacity,
      transform: `translate(${(k.x - half).toFixed(1)}px, ${(k.y - half).toFixed(1)}px) scale(${k.scale.toFixed(3)})`,
    }));
    const a = el.animate(frames, { duration: flight.duration, delay: flight.delay, fill: 'both' });
    a.onfinish = () => onDone(flight.id);
    return () => a.cancel();
  }, [flight, onDone]);
  return (
    <span ref={ref} className="coin-burst__coin">
      <CoinIcon size={COIN_SIZE} />
    </span>
  );
}

/**
 * 화면 전체에 깔리는 코인 비행 층 (AppShell에 한 번). `flyCoins()` 호출을 받아 코인을 그리고,
 * 코인이 카운터에 닿을 때마다 코인 소리를 낸다. 숫자·알약 반응은 TopBar(useCoinCounter)가 맡는다.
 */
export function CoinBurst() {
  const [flights, setFlights] = useState<CoinFlight[]>([]);
  const doneRef = useRef((id: number) => setFlights((fs) => fs.filter((f) => f.id !== id)));

  useEffect(
    () =>
      subscribeCoinFx((e) => {
        if (e.type === 'spawn') setFlights((fs) => [...fs, ...e.flights]);
        else if (e.type === 'arrive') {
          sfx.coin();
          if (e.index === e.count - 1) haptic('tap');
        }
      }),
    [],
  );

  if (flights.length === 0) return null;
  return (
    <div className="coin-burst" aria-hidden="true">
      {flights.map((f) => (
        <FlyingCoin key={f.id} flight={f} onDone={doneRef.current} />
      ))}
    </div>
  );
}
