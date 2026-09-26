import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import { getCharacter } from '../../data/characters';
import { useGameStore } from '../../store/useGameStore';
import { CoinIcon } from '../icons';
import { Malang } from '../Malang';
import { useShopClaim, useShopLive } from './useShop';
import './ShopCard.css';

/**
 * 홈의 작은 디저트 가게 카드: 차양 아래 일하는 말랑이 얼굴 + 쌓인 코인(몇 초마다 오름) + 가득 참 막대 + 받기.
 * 카드를 누르면 가게 화면(/shop). 받기 버튼은 링크 밖의 따로 된 버튼이다.
 */
export function ShopCard() {
  const { rates, reading, staff } = useShopLive(4000);
  const owned = useGameStore((s) => s.ownedMalangs);
  const claim = useShopClaim();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const perHour = Math.round(rates.perHour);
  const faces = staff
    .map((id) => getCharacter(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .slice(0, 3);
  const empty = faces.length === 0;
  const canClaim = reading.coins >= 1;
  const status = empty ? '일할 말랑이를 골라요' : reading.full ? '가게가 가득 찼어요' : `시간당 ${perHour}코인`;

  return (
    <section className={`shop-card${reading.full ? ' is-full' : ''}`} aria-labelledby="shop-card-title">
      <Link to="/shop" className="shop-card__link" onClick={() => sfx.button()}>
        <span className="shop-card__front" aria-hidden="true">
          <span className="shop-card__awning" />
          <span className={`shop-card__window shop-card__window--${faces.length}`}>
            {faces.map((c) => (
              <span key={c.id} className="shop-card__face">
                <Malang character={c} size={34} animation="none" decorative shiny={(owned[c.id]?.shinyCount ?? 0) > 0} />
              </span>
            ))}
          </span>
        </span>
        <span className="shop-card__text">
          <span className="shop-card__head">
            <span id="shop-card-title" className="shop-card__title">
              말랑 디저트 가게
            </span>
          </span>
          <span className="shop-card__status">{status}</span>
          {!empty && (
            <span
              className="shop-card__bar"
              role="progressbar"
              aria-label="가게에 쌓인 코인"
              aria-valuemin={0}
              aria-valuemax={rates.capCoins}
              aria-valuenow={Math.min(reading.coins, rates.capCoins)}
            >
              <span className="shop-card__fill" style={{ width: `${reading.fill * 100}%` }} />
            </span>
          )}
        </span>
      </Link>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn--small ${reading.full ? 'btn--primary' : 'btn--lemon'} shop-card__claim`}
        disabled={!canClaim}
        aria-label={canClaim ? `가게 코인 ${reading.coins}개 받기` : '아직 받을 코인이 없어요'}
        onClick={() => claim(buttonRef.current)}
      >
        <span className="shop-card__amount">
          <CoinIcon size={16} />
          {reading.coins.toLocaleString()}
        </span>
        <span className="shop-card__claim-label">받기</span>
      </button>
    </section>
  );
}
