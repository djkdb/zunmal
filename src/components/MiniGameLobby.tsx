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
      <section className="lobby__partner" aria-labelledby="lobby-partner-title">
        <h2 id="lobby-partner-title" className="lobby__h2">
          누구랑 놀까요?
        </h2>
        <div className="lobby__partners" role="radiogroup" aria-labelledby="lobby-partner-title">
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
              <Malang character={c} size={48} animation="none" decorative />
            </button>
          ))}
        </div>
        {partner && (
          <p className="lobby__partner-info small">
            <strong>{partner.name}</strong> <RarityBadge rarity={partner.rarity} compact />{' '}
            {PARTNER_RARITY_BONUS[partner.rarity] > 0
              ? `같이 하면 코인 +${Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100)}%`
              : '희귀한 말랑이와 함께하면 코인을 더 받아요'}
          </p>
        )}
      </section>

      {MINI_GAMES.length === 0 ? (
        <p className="card">미니게임을 준비하고 있어요.</p>
      ) : (
        <ul className="lobby__games">
          {MINI_GAMES.map((game) => {
            const Icon = game.icon;
            const best = records[game.id]?.bestScore ?? 0;
            return (
              <li key={game.id}>
                <Link to={`/play/${game.id}`} className="lobby__game" onClick={() => sfx.button()}>
                  <span className="lobby__game-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="lobby__game-body">
                    <span className="lobby__game-name">{game.name}</span>
                    <span className="lobby__game-desc">{game.description}</span>
                  </span>
                  {best > 0 && (
                    <span className="lobby__best" aria-label={`최고 기록 ${best}점`}>
                      최고 {best.toLocaleString()}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="lobby__cap small muted">
        한 판에 최대 {PER_GAME_CAP}코인, 오늘은 <strong>{dailyLeft.toLocaleString()}</strong>코인 더 받을 수 있어요.
      </p>
    </div>
  );
}
