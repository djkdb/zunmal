import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { CHARACTERS, getCharacter } from '../data/characters';
import { DAILY_CAP, PARTNER_RARITY_BONUS, PER_GAME_CAP } from '../economy/config';
import { MINI_GAMES } from '../minigames/registry';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import { RarityBadge } from './RarityBadge';
import './MiniGameLobby.css';

/** 미니게임 로비: 파트너 선택 + 게임 목록 (registry 기반) */
export function MiniGameLobby() {
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);
  const setPartner = useGameStore((s) => s.setPartner);
  const records = useGameStore((s) => s.miniGameRecords);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const partner = partnerId ? getCharacter(partnerId) : undefined;
  const ownedChars = CHARACTERS.filter((c) => owned[c.id]);
  const dailyLeft = Math.max(0, DAILY_CAP - dailyEarned);

  return (
    <div className="lobby">
      <section className="card card--tight lobby__partner" aria-labelledby="lobby-partner-title">
        <div className="row row--between row--wrap">
          <h2 id="lobby-partner-title" className="lobby__h2">
            함께할 파트너
          </h2>
          {partner && (
            <span className="small">
              <RarityBadge rarity={partner.rarity} compact /> 코인 +{Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100)}%
            </span>
          )}
        </div>
        <div className="lobby__partners" role="radiogroup" aria-label="파트너 말랑이 선택">
          {ownedChars.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={partnerId === c.id}
              aria-label={c.name}
              className={`lobby__partner-btn${partnerId === c.id ? ' is-selected' : ''}`}
              onClick={() => {
                sfx.button();
                setPartner(c.id);
              }}
            >
              <Malang character={c} size={52} animation={partnerId === c.id ? 'idle' : 'none'} decorative />
            </button>
          ))}
        </div>
      </section>

      <p className="lobby__cap small muted">
        오늘 남은 코인 한도 <strong>{dailyLeft.toLocaleString()}</strong> · 한 판 최대 {PER_GAME_CAP} 코인
      </p>

      {MINI_GAMES.length === 0 ? (
        <p className="card">미니게임을 준비하고 있어요!</p>
      ) : (
        <ul className="lobby__games">
          {MINI_GAMES.map((game) => {
            const Icon = game.icon;
            const best = records[game.id]?.bestScore ?? 0;
            return (
              <li key={game.id}>
                <Link to={`/play/${game.id}`} className="lobby__game card" onClick={() => sfx.button()}>
                  <span className="lobby__game-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="lobby__game-body">
                    <span className="lobby__game-name">{game.name}</span>
                    <span className="lobby__game-desc small">{game.description}</span>
                    <span className="lobby__game-best small">최고 기록 {best.toLocaleString()}</span>
                  </span>
                  <span className="lobby__game-play" aria-hidden="true">
                    ▶
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
