import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { CHARACTERS, getCharacter } from '../data/characters';
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

  return (
    <section className="page home" aria-labelledby="home-title">
      <h1 id="home-title" className="visually-hidden">
        말랑 뽑기방 홈
      </h1>

      {partner && (
        <div className="card home__hero">
          <div className="home__stage">
            <Malang character={partner} size={150} animation="idle" />
          </div>
          <div className="home__partner">
            <p className="small muted">나의 파트너</p>
            <p className="home__partner-name">{partner.name}</p>
            <RarityBadge rarity={partner.rarity} />
            <p className="small">
              미니게임 코인 보너스 <strong>+{Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100)}%</strong>
            </p>
          </div>
        </div>
      )}

      <div className="home__loop" aria-label="게임 순서">
        <span>🎮 미니게임</span>
        <span aria-hidden="true">→</span>
        <span>🪙 코인</span>
        <span aria-hidden="true">→</span>
        <span>🎫 뽑기권</span>
        <span aria-hidden="true">→</span>
        <span>📖 도감</span>
      </div>

      <div className="home__actions">
        <Link to="/play" className="btn btn--mint btn--block home__action" onClick={() => sfx.button()}>
          🎮 미니게임 하러 가기
        </Link>
        <Link to="/gacha" className="btn btn--primary btn--block home__action" onClick={() => sfx.button()}>
          🎰 뽑기방 가기 {tickets > 0 && <span className="chip">🎫 {tickets}</span>}
        </Link>
      </div>

      <div className="home__stats">
        <Link to="/collection" className="card card--tight home__stat" onClick={() => sfx.button()}>
          <span className="small muted">도감</span>
          <span className="home__stat-value">
            {ownedCount} / {CHARACTERS.length}
          </span>
        </Link>
        <div className="card card--tight home__stat">
          <span className="small muted">오늘 남은 코인 한도</span>
          <span className="home__stat-value">{dailyLeft.toLocaleString()}</span>
        </div>
      </div>
    </section>
  );
}
