import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import { SoundSettings } from './SoundSettings';
import './TopBar.css';

/** 값이 증가할 때마다 바뀌는 key → CSS 애니메이션 재생 */
function useBumpKey(value: number): number {
  const prev = useRef(value);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (value > prev.current) setKey((k) => k + 1);
    prev.current = value;
  }, [value]);
  return key;
}

/** 게임 HUD: 코인(큰 아이콘 + 숫자 + 벌러 가기 버튼)과 소리 켜기/끄기 */
export function TopBar() {
  const coins = useGameStore((s) => s.coins);
  const coinKey = useBumpKey(coins);

  return (
    <header className="hud">
      <div className="hud__wallet">
        <div className="hud__pill">
          <span className="hud__icon" aria-hidden="true">
            <CoinIcon size={40} />
          </span>
          <span key={coinKey} className="hud__value bump" aria-label={`코인 ${coins.toLocaleString()}개`}>
            {coins.toLocaleString()}
          </span>
          <Link to="/play" className="hud__plus" aria-label="미니게임으로 코인 벌러 가기" onClick={() => sfx.button()}>
            +
          </Link>
        </div>
      </div>
      <SoundSettings />
    </header>
  );
}
