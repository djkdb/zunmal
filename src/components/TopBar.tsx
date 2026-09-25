import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { useGameStore } from '../store/useGameStore';
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

export function TopBar() {
  const coins = useGameStore((s) => s.coins);
  const tickets = useGameStore((s) => s.gachaTickets);
  const muted = useGameStore((s) => s.settings.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  const coinKey = useBumpKey(coins);
  const ticketKey = useBumpKey(tickets);

  return (
    <header className="top-bar">
      <Link to="/" className="top-bar__logo" aria-label="말랑 뽑기방 홈">
        <span aria-hidden="true">🍮</span>
        <span className="top-bar__title">말랑 뽑기방</span>
      </Link>
      <div className="top-bar__stats">
        <span className="stat-pill" aria-label={`코인 ${coins.toLocaleString()}개`}>
          <span aria-hidden="true" className="stat-pill__icon stat-pill__icon--coin">
            C
          </span>
          <span key={coinKey} className="stat-pill__value bump">
            {coins.toLocaleString()}
          </span>
        </span>
        <span className="stat-pill" aria-label={`뽑기권 ${tickets}장`}>
          <span aria-hidden="true" className="stat-pill__icon">
            🎫
          </span>
          <span key={ticketKey} className="stat-pill__value bump">
            {tickets}
          </span>
        </span>
        <button
          type="button"
          className="icon-btn top-bar__mute"
          aria-pressed={muted}
          aria-label={muted ? '소리 켜기' : '소리 끄기'}
          onClick={() => {
            setMuted(!muted);
            if (muted) {
              sfx.setMuted(false);
              sfx.button();
            }
          }}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>
    </header>
  );
}
