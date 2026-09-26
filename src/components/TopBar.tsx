import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { useCoinCounter } from '../hooks/useCoinCounter';
import { setCoinTarget } from '../lib/coinFx';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import { SoundSettings } from './SoundSettings';
import './TopBar.css';

/** 게임 HUD: 코인(큰 아이콘 + 숫자 + 벌러 가기 버튼)과 소리 켜기/끄기 */
export function TopBar() {
  const coins = useGameStore((s) => s.coins);
  // 코인: 굴러 올라가는 숫자 + 날아오는 코인의 목표 (lib/coinFx)
  const pillRef = useRef<HTMLDivElement>(null);
  const coinCounter = useCoinCounter(coins, pillRef);
  useEffect(() => {
    setCoinTarget(pillRef.current);
    return () => setCoinTarget(null);
  }, []);

  return (
    <header className="hud">
      <div className="hud__wallet">
        <div ref={pillRef} className={`hud__pill${coinCounter.short ? ' is-short' : ''}`}>
          <span className="hud__icon" aria-hidden="true">
            <CoinIcon size={40} />
          </span>
          <span className="hud__value" aria-hidden="true">
            {coinCounter.display.toLocaleString()}
          </span>
          <span className="visually-hidden">코인 {coins.toLocaleString()}개</span>
          <Link to="/play" className="hud__plus" aria-label="미니게임으로 코인 벌러 가기" onClick={() => sfx.button()}>
            +
          </Link>
        </div>
      </div>
      <SoundSettings />
    </header>
  );
}
