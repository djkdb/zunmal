import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { BookIcon, CapsuleIcon, JoystickIcon } from '../components/icons';
import { CHARACTERS, getCharacter } from '../data/characters';
import { RARITY_META } from '../data/rarity';
import { DAILY_CAP, PARTNER_RARITY_BONUS } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import './HomePage.css';

/** 파트너가 건네는 한마디 (상황에 따라 바뀜) */
function useGreeting(tickets: number, dailyLeft: number, bonus: number): string {
  return useMemo(() => {
    if (tickets >= 10) return '뽑기권이 잔뜩! 10연 뽑기 하러 갈까요?';
    if (tickets > 0) return '뽑기권이 있어요. 캡슐 뽑으러 가요!';
    if (dailyLeft <= 0) return '오늘 코인은 다 모았어요. 내일 또 놀아요!';
    if (bonus > 0) return `나랑 놀면 코인이 ${bonus}% 더 나와요!`;
    return '미니게임 하고 코인 모아요!';
  }, [tickets, dailyLeft, bonus]);
}

export function HomePage() {
  const partnerId = useGameStore((s) => s.partnerId);
  const owned = useGameStore((s) => s.ownedMalangs);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const tickets = useGameStore((s) => s.gachaTickets);
  const partnerShiny = useGameStore((s) => s.partnerShiny);
  const partner = partnerId ? getCharacter(partnerId) : undefined;
  const ownedCount = CHARACTERS.filter((c) => owned[c.id]).length;
  const dailyLeft = Math.max(0, DAILY_CAP - dailyEarned);
  const bonus = partner ? Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100) : 0;
  const greeting = useGreeting(tickets, dailyLeft, bonus);

  return (
    <section className="page home" aria-labelledby="home-title">
      <header className="home__sign">
        <div className="home__awning" aria-hidden="true" />
        <h1 id="home-title" className="home__logo">
          <span className="home__logo-small">말랑</span>
          <span className="home__logo-big">뽑기방</span>
        </h1>
      </header>

      {partner && (
        <div className="home__stage">
          <p className="home__bubble">{greeting}</p>
          <Link to="/touch" className="home__partner" aria-label={`${partner.name} 만지러 가기`}>
            <Malang
              character={partner}
              size={190}
              animation="idle"
              decorative
              aura="auto"
              shiny={partnerShiny && (owned[partner.id]?.shinyCount ?? 0) > 0}
            />
          </Link>
          <div className="home__pedestal" aria-hidden="true" />
          <p className="home__name">
            {partner.name} <RarityBadge rarity={partner.rarity} compact />
          </p>
        </div>
      )}

      <div className="home__actions">
        <Link to="/play" className="btn btn--mint btn--big btn--block" onClick={() => sfx.button()}>
          <JoystickIcon size={34} />
          게임하기
        </Link>
        <div className="home__row">
          <Link to="/gacha" className="btn btn--primary btn--block" onClick={() => sfx.button()}>
            <CapsuleIcon size={28} />
            뽑기
            {tickets > 0 && <span className="home__count">{tickets}</span>}
          </Link>
          <Link to="/collection" className="btn btn--lemon btn--block" onClick={() => sfx.button()}>
            <BookIcon size={28} />
            도감
          </Link>
        </div>
      </div>

      <Link to="/collection" className="home__jar" onClick={() => sfx.button()} aria-label={`도감 ${ownedCount}/${CHARACTERS.length}`}>
        <span className="home__slots" aria-hidden="true">
          {CHARACTERS.map((c) => (
            <span
              key={c.id}
              className={`home__slot${owned[c.id] ? ' is-filled' : ''}`}
              style={owned[c.id] ? { background: `var(${RARITY_META[c.rarity].colorVar})` } : undefined}
            />
          ))}
        </span>
        <span className="home__jar-count">
          {ownedCount}/{CHARACTERS.length}
        </span>
      </Link>
    </section>
  );
}
