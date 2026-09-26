import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { getCharacter } from '../data/characters';
import { PER_GAME_CAP } from '../economy/config';
import { dailyProgress, expectedCoins, todayEarned } from '../economy/playReward';
import { LOBBY_FILTERS, LOBBY_FILTER_LABELS, filterGames, isLobbyFilter, type LobbyFilter } from '../minigames/lobby';
import { MINI_GAMES, RECOMMENDED_GAME_ID } from '../minigames/registry';
import { formatPlayLength } from '../minigames/types';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import { PartnerPicker } from './PartnerPicker';
import './MiniGameLobby.css';

/** 고른 칩은 이번 방문 동안만 기억한다 (게임을 하고 돌아와도 그대로. 저장 데이터 아님) */
const FILTER_KEY = 'malang-lobby-filter';

function readFilter(): LobbyFilter {
  try {
    const v = sessionStorage.getItem(FILTER_KEY);
    return isLobbyFilter(v) ? v : 'all';
  } catch {
    return 'all';
  }
}

function writeFilter(f: LobbyFilter): void {
  try {
    sessionStorage.setItem(FILTER_KEY, f);
  } catch {
    // 저장이 막힌 브라우저: 기억하지 않아도 된다
  }
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 오늘 미니게임으로 받은 코인 / 하루 상한 */
function TodayMeter({ earned }: { earned: number }) {
  const p = dailyProgress(earned);
  return (
    <section className={`lobby-today${p.full ? ' is-full' : ''}`} aria-label="오늘 받은 코인">
      <p className="lobby-today__row">
        <CoinIcon size={22} />
        <span className="lobby-today__label">오늘 받은 코인</span>
        <span className="lobby-today__value">
          <strong>{fmt(p.earned)}</strong> / {fmt(p.cap)}
        </span>
      </p>
      <div
        className="lobby-today__bar"
        role="progressbar"
        aria-label="오늘 받은 코인"
        aria-valuemin={0}
        aria-valuemax={p.cap}
        aria-valuenow={p.earned}
        aria-valuetext={`${fmt(p.earned)}코인, 하루 ${fmt(p.cap)}코인까지`}
      >
        <span style={{ '--p': p.ratio } as CSSProperties} />
      </div>
      {p.full && <p className="lobby-today__note">오늘 코인을 모두 받았어요. 자정에 다시 채워져요.</p>}
    </section>
  );
}

/** 미니게임 로비: 오늘 받은 코인 + 파트너 + 칩으로 거르는 게임 목록 (registry 기반) */
export function MiniGameLobby() {
  const records = useGameStore((s) => s.miniGameRecords);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const lastReset = useGameStore((s) => s.lastDailyResetDate);
  const partnerId = useGameStore((s) => s.partnerId);
  const partnerRarity = partnerId ? getCharacter(partnerId)?.rarity : undefined;
  const earned = todayEarned(dailyEarned, lastReset);
  // 아직 한 판도 안 한 플레이어에게는 게임 하나만 콕 집어 준다
  const firstTime = Object.values(records).every((r) => r.plays === 0);

  const [filter, setFilterState] = useState<LobbyFilter>(readFilter);
  const setFilter = (f: LobbyFilter) => {
    sfx.button();
    setFilterState(f);
    writeFilter(f);
  };
  const games = filterGames(MINI_GAMES, filter);

  return (
    <div className="lobby">
      <TodayMeter earned={earned} />
      <PartnerPicker />

      <div className="lobby__filters" role="group" aria-label="게임 고르기">
        {LOBBY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="lobby__filter"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {LOBBY_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {games.length === 0 ? (
        <p className="card">미니게임을 준비하고 있어요.</p>
      ) : (
        <ul className="lobby__games">
          {games.map((game) => {
            const Icon = game.icon;
            const rec = records[game.id];
            const best = rec?.bestScore ?? 0;
            const played = best > 0;
            const last = rec && rec.plays > 0 ? rec.lastScore : null;
            const expect = expectedCoins({ gameId: game.id, record: rec, partnerRarity, dailyEarned: earned });
            const line = `${formatPlayLength(game.durationMs)} ${game.blurb}`;
            const recommended = firstTime && game.id === RECOMMENDED_GAME_ID;
            const hue = MINI_GAMES.indexOf(game) % 6;
            const label = [
              recommended ? '처음이면 추천.' : '',
              `${game.name}. ${line}.`,
              played ? `최고 ${fmt(best)}점${last !== null ? `, 최근 ${fmt(last)}점` : ''}.` : '아직 해 보지 않았어요.',
              expect.dailyFull ? '오늘 코인은 모두 받았어요.' : `한 판에 약 ${fmt(expect.about)}코인.`,
              game.description,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={game.id}>
                <Link
                  to={`/play/${game.id}`}
                  className={`lobby__tile lobby__tile--${hue}${recommended ? ' is-recommended' : ''}`}
                  onClick={() => sfx.button()}
                  aria-label={label}
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
                  {played ? (
                    <span className="lobby__tile-rec" aria-hidden="true">
                      <span>
                        <small>최고</small>
                        <b>{fmt(best)}</b>
                      </span>
                      <span>
                        <small>최근</small>
                        <b>{last !== null ? fmt(last) : '-'}</b>
                      </span>
                    </span>
                  ) : (
                    <span className="lobby__tile-rec is-empty" aria-hidden="true">
                      첫 도전
                    </span>
                  )}
                  <span className={`lobby__tile-coins${expect.dailyFull ? ' is-full' : ''}`} aria-hidden="true">
                    {expect.dailyFull ? (
                      '오늘은 다 받았어요'
                    ) : (
                      <>
                        <CoinIcon size={16} />약 {fmt(expect.about)}코인
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="lobby__foot">
        예상 코인은 내 기록으로 계산해요. 한 판에 최대 {fmt(PER_GAME_CAP)}코인까지 받아요.
      </p>
    </div>
  );
}
