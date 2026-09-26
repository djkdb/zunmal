import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { DAILY_CAP, PER_GAME_CAP } from '../economy/config';
import { MINI_GAMES, RECOMMENDED_GAME_ID } from '../minigames/registry';
import { formatPlayLength } from '../minigames/types';
import { useGameStore } from '../store/useGameStore';
import { PartnerPicker } from './PartnerPicker';
import './MiniGameLobby.css';

/** 미니게임 로비: 파트너 선택 + 게임 목록 (registry 기반) */
export function MiniGameLobby() {
  const records = useGameStore((s) => s.miniGameRecords);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const dailyLeft = Math.max(0, DAILY_CAP - dailyEarned);
  // 아직 한 판도 안 한 플레이어에게는 게임 하나만 콕 집어 준다
  const firstTime = Object.values(records).every((r) => r.plays === 0);

  return (
    <div className="lobby">
      <PartnerPicker />

      {MINI_GAMES.length === 0 ? (
        <p className="card">미니게임을 준비하고 있어요.</p>
      ) : (
        <ul className="lobby__games">
          {MINI_GAMES.map((game, i) => {
            const Icon = game.icon;
            const best = records[game.id]?.bestScore ?? 0;
            const line = `${formatPlayLength(game.durationMs)} ${game.blurb}`;
            const recommended = firstTime && game.id === RECOMMENDED_GAME_ID;
            return (
              <li key={game.id}>
                <Link
                  to={`/play/${game.id}`}
                  className={`lobby__tile lobby__tile--${i % 6}${recommended ? ' is-recommended' : ''}`}
                  onClick={() => sfx.button()}
                  aria-label={`${recommended ? '처음이면 추천. ' : ''}${game.name}. ${line}. ${game.description}${best > 0 ? ` 최고 기록 ${best}점.` : ''}`}
                >
                  {recommended && (
                    <span className="lobby__tile-pick" aria-hidden="true">
                      처음이면 이거!
                    </span>
                  )}
                  <span className="lobby__tile-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="lobby__tile-name">{game.name}</span>
                  <span className="lobby__tile-line">{line}</span>
                  {best > 0 && <span className="lobby__tile-best">최고 {best.toLocaleString()}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="lobby__cap small muted">
        한 판 최대 {PER_GAME_CAP}코인, 오늘 남은 코인 {dailyLeft.toLocaleString()}
      </p>
    </div>
  );
}
