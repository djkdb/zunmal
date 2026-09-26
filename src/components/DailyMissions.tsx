import { useEffect, useMemo, useState } from 'react';
import { sfx } from '../audio/sfx';
import { MISSION_ALL_CLEAR_BONUS } from '../economy/config';
import { seoulDateKey } from '../economy/daily';
import { formatRemaining, msUntilSeoulMidnight } from '../missions/resetClock';
import { canClaimBonus, generateDailyMissions, isMissionDone, missionLabel, rollMissions } from '../missions/missions';
import { useGameStore } from '../store/useGameStore';
import { CoinIcon } from './icons';
import './DailyMissions.css';

/** 새 미션까지 남은 시간 (1분마다 갱신) */
function useUntilReset(active: boolean): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [active]);
  return formatRemaining(msUntilSeoulMidnight(now));
}

/** 오늘의 미션 카드: 진행 막대 + 보상 받기. 모두 끝내면 짧은 완료 카드로 접힌다. */
export function DailyMissions() {
  const stored = useGameStore((s) => s.missions);
  const claimMission = useGameStore((s) => s.claimMission);
  const claimMissionBonus = useGameStore((s) => s.claimMissionBonus);
  // 자정이 지났는데 아직 기록이 없으면 화면에서는 오늘 기준으로 보여준다
  const state = rollMissions(stored, seoulDateKey());
  const missions = useMemo(() => generateDailyMissions(state.date), [state.date]);
  const bonusReady = canClaimBonus(state, missions);
  const claimedCount = state.claimed.length;
  const allDone = state.bonusClaimed;
  const untilReset = useUntilReset(allDone);

  if (allDone) {
    return (
      <section className="missions missions--done" aria-labelledby="missions-title">
        <div className="missions__head">
          <h2 id="missions-title" className="missions__title">
            오늘의 미션
          </h2>
          <span className="missions__count">
            {missions.length}/{missions.length}
          </span>
        </div>
        <div className="missions__done">
          <span className="missions__stamp" aria-hidden="true">
            완료
          </span>
          <div>
            <p className="missions__done-title">오늘 미션을 모두 끝냈어요</p>
            <p className="missions__done-text">새 미션은 {untilReset} 뒤에 나와요.</p>
          </div>
        </div>
      </section>
    );
  }

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
    </section>
  );
}
