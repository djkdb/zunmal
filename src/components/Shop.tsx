import { useState } from 'react';
import { sfx } from '../audio/sfx';
import { TICKET_PACKS, type TicketPackId } from '../economy/economy';
import { TICKET_PRICE } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import './Shop.css';

const PACK_ORDER: TicketPackId[] = ['single', 'bundle'];

/** 뽑기권 판매대. 각 묶음은 절취선이 있는 티켓 모양이며 가격은 economy/config에서 가져온다. */
export function Shop() {
  const coins = useGameStore((s) => s.coins);
  const buyTickets = useGameStore((s) => s.buyTickets);
  const [message, setMessage] = useState('');

  const buy = (id: TicketPackId) => {
    const result = buyTickets(id);
    if (result.ok) {
      sfx.coin();
      setMessage(`뽑기권 ${TICKET_PACKS[id].tickets}장을 샀어요.`);
    } else {
      sfx.fail();
      setMessage('코인이 모자라요. 미니게임에서 코인을 더 모아 오세요.');
    }
  };

  return (
    <section className="shop" aria-labelledby="shop-title">
      <h2 id="shop-title" className="shop__title">
        뽑기권 사기
      </h2>
      <ul className="shop__packs">
        {PACK_ORDER.map((id) => {
          const pack = TICKET_PACKS[id];
          const bonus = (pack.tickets * TICKET_PRICE - pack.price) / TICKET_PRICE;
          const affordable = coins >= pack.price;
          return (
            <li key={id} className={`ticket ticket--${id}`}>
              <div className="ticket__body">
                <span className="ticket__count">
                  <strong>{pack.tickets}</strong>장
                </span>
                {bonus > 0 && <span className="ticket__bonus">{bonus}장 덤</span>}
              </div>
              <div className="ticket__stub">
                <button
                  type="button"
                  className="btn btn--small btn--lemon ticket__buy"
                  disabled={!affordable}
                  onClick={() => buy(id)}
                  aria-label={`뽑기권 ${pack.tickets}장을 ${pack.price.toLocaleString()} 코인에 사기${affordable ? '' : ', 코인 부족'}`}
                >
                  <CoinIcon size={20} />
                  {pack.price.toLocaleString()}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="shop__message small" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
