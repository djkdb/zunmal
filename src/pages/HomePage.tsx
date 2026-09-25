import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { CapsuleIcon, JoystickIcon, TicketIcon } from '../components/icons';
import { CHARACTERS, getCharacter } from '../data/characters';
import { RARITY_META } from '../data/rarity';
import { DAILY_CAP, PARTNER_RARITY_BONUS } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import './HomePage.css';

export function HomePage() {
  const partnerId = useGameStore((s) => s.partnerId);
  const owned = useGameStore((s) => s.ownedMalangs);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const tickets = useGameStore((s) => s.gachaTickets);
  const partner = partnerId ? getCharacter(partnerId) : undefined;
  const ownedCount = CHARACTERS.filter((c) => owned[c.id]).length;
  const dailyLeft = Math.max(0, DAILY_CAP - dailyEarned);
  const bonus = partner ? Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100) : 0;

  return (
    <section className="page home" aria-labelledby="home-title">
      {partner && (
        <div className="home__counter">
          <div className="home__stage">
            <Malang character={partner} size={168} animation="idle" />
          </div>
          <div className="home__plate">
            <h1 id="home-title" className="home__name">
              {partner.name}
            </h1>
            <RarityBadge rarity={partner.rarity} />
            <p className="home__bonus">
              {bonus > 0 ? `함께 놀면 코인 +${bonus}%` : '오늘도 같이 놀자!'}
            </p>
          </div>
        </div>
      )}

      <div className="home__actions">
        <Link to="/play" className="btn btn--mint btn--block home__action" onClick={() => sfx.button()}>
          <JoystickIcon size={30} />
          미니게임으로 코인 벌기
        </Link>
        <Link to="/gacha" className="btn btn--primary btn--block home__action" onClick={() => sfx.button()}>
          <CapsuleIcon size={30} />
          캡슐 뽑으러 가기
          {tickets > 0 && (
            <span className="home__ticket-sticker" aria-label={`뽑기권 ${tickets}장`}>
              <TicketIcon size={18} />
              {tickets}
            </span>
          )}
        </Link>
      </div>

      <Link to="/collection" className="home__shelf" onClick={() => sfx.button()}>
        <span className="home__shelf-text">
          도감 <strong>{ownedCount}</strong>/{CHARACTERS.length}
        </span>
        <span className="home__slots" aria-hidden="true">
          {CHARACTERS.map((c) => (
            <span
              key={c.id}
              className={`home__slot${owned[c.id] ? ' is-filled' : ''}`}
              style={owned[c.id] ? { background: `var(${RARITY_META[c.rarity].colorVar})` } : undefined}
            />
          ))}
        </span>
      </Link>

      <p className="home__daily small muted">
        {dailyLeft > 0
          ? `오늘 미니게임으로 코인을 ${dailyLeft.toLocaleString()}개 더 받을 수 있어요.`
          : '오늘 받을 수 있는 코인을 모두 받았어요. 자정에 다시 채워져요.'}
      </p>
    </section>
  );
}
