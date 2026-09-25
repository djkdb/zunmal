import { useState } from 'react';
import { sfx } from '../audio/sfx';
import { TICKET_PACKS, type TicketPackId } from '../economy/economy';
import { TICKET_PRICE } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import './Shop.css';

const PACK_ORDER: TicketPackId[] = ['single', 'bundle'];

/** 뽑기권 상점. 가격은 economy/config에서 가져온다. */
export function Shop() {
  const coins = useGameStore((s) => s.coins);
  const buyTickets = useGameStore((s) => s.buyTickets);
  const [message, setMessage] = useState('');

  const buy = (id: TicketPackId) => {
    const result = buyTickets(id);
    if (result.ok) {
      sfx.coin();
      setMessage(`뽑기권 ${TICKET_PACKS[id].tickets}장을 샀어요!`);
    } else {
      sfx.fail();
      setMessage('코인이 부족해요. 미니게임으로 코인을 모아보세요.');
    }
  };

  return (
    <section className="card shop" aria-labelledby="shop-title">
      <h2 id="shop-title" className="shop__title">
        🎫 뽑기권 상점
      </h2>
      <ul className="shop__packs">
        {PACK_ORDER.map((id) => {
          const pack = TICKET_PACKS[id];
          const bonus = pack.tickets * TICKET_PRICE - pack.price;
          const affordable = coins >= pack.price;
          return (
            <li key={id} className="shop__pack">
              <div className="shop__pack-info">
                <span className="shop__pack-name">뽑기권 {pack.tickets}장</span>
                {bonus > 0 && <span className="chip shop__bonus">+{bonus / TICKET_PRICE}장 보너스</span>}
              </div>
              <button
                type="button"
                className={`btn btn--small ${affordable ? 'btn--lemon' : ''}`}
                disabled={!affordable}
                onClick={() => buy(id)}
                aria-label={`뽑기권 ${pack.tickets}장, ${pack.price.toLocaleString()} 코인에 구매${affordable ? '' : ' (코인 부족)'}`}
              >
                <span aria-hidden="true">C</span> {pack.price.toLocaleString()}
              </button>
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
