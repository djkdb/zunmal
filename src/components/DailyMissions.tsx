import { useMemo } from 'react';
import { sfx } from '../audio/sfx';
import { MISSION_ALL_CLEAR_BONUS } from '../economy/config';
import { seoulDateKey } from '../economy/daily';
import { canClaimBonus, generateDailyMissions, isMissionDone, missionLabel, rollMissions } from '../missions/missions';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import './DailyMissions.css';

/** 오늘의 미션 카드: 진행 막대 + 보상 받기 */
export function DailyMissions() {
  const stored = useGameStore((s) => s.missions);
  const claimMission = useGameStore((s) => s.claimMission);
  const claimMissionBonus = useGameStore((s) => s.claimMissionBonus);
  // 자정이 지났는데 아직 기록이 없으면 화면에서는 오늘 기준으로 보여준다
  const state = rollMissions(stored, seoulDateKey());
  const missions = useMemo(() => generateDailyMissions(state.date), [state.date]);
  const bonusReady = canClaimBonus(state, missions);
  const claimedCount = state.claimed.length;

  return (
    <section className="missions" aria-labelledby="missions-title">
      <div className="missions__head">
        <h2 id="missions-title" className="missions__title">
          오늘의 미션
        </h2>
        <span className="missions__count">
          {claimedCount}/{missions.length}
        </span>
      </div>
      <ul className="missions__list">
        {missions.map((m) => {
          const progress = Math.min(m.target, state.progress[m.kind] ?? 0);
          const done = isMissionDone(state, m);
          const claimed = state.claimed.includes(m.id);
          return (
            <li key={m.id} className={`missions__item${claimed ? ' is-claimed' : done ? ' is-done' : ''}`}>
              <div className="missions__body">
                <p className="missions__label">{missionLabel(m)}</p>
                <div
                  className="missions__bar"
                  role="progressbar"
                  aria-label={`${missionLabel(m)} 진행`}
                  aria-valuemin={0}
                  aria-valuemax={m.target}
                  aria-valuenow={progress}
                >
                  <span className="missions__fill" style={{ width: `${(progress / m.target) * 100}%` }} />
                </div>
                <p className="missions__progress">
                  {progress.toLocaleString()}/{m.target.toLocaleString()}
                </p>
              </div>
              {claimed ? (
                <span className="missions__claimed">받았어요</span>
              ) : (
                <button
                  type="button"
                  className={`btn btn--small ${done ? 'btn--lemon' : ''} missions__claim`}
                  disabled={!done}
                  onClick={() => {
                    const r = claimMission(m.id);
                    if (r.ok) sfx.coin();
                  }}
                  aria-label={`${missionLabel(m)} 보상 ${m.reward}코인 받기`}
                >
                  <CoinIcon size={18} />
                  {m.reward}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {state.bonusClaimed ? (
        <p className="missions__bonus is-claimed">오늘 미션을 모두 끝냈어요. 내일 또 만나요!</p>
      ) : (
        <button
          type="button"
          className={`btn btn--block missions__bonus-btn ${bonusReady ? 'btn--primary' : ''}`}
          disabled={!bonusReady}
          onClick={() => {
            if (claimMissionBonus() > 0) {
              sfx.coin();
              sfx.success();
            }
          }}
        >
          <CoinIcon size={22} />
          {bonusReady ? `보너스 ${MISSION_ALL_CLEAR_BONUS}코인 받기` : `모두 끝내면 +${MISSION_ALL_CLEAR_BONUS}`}
        </button>
      )}
    </section>
  );
}
