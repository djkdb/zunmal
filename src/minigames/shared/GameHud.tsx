import type { ReactNode } from 'react';
import './GameHud.css';

interface GameHudProps {
  timeLeft: number;
  totalTime: number;
  score: number;
  extra?: ReactNode;
  onExit(): void;
}

/** 미니게임 공통 상단 HUD: 남은 시간 / 점수 / 나가기 */
export function GameHud({ timeLeft, totalTime, score, extra, onExit }: GameHudProps) {
  const ratio = Math.max(0, Math.min(1, timeLeft / totalTime));
  const secs = Math.ceil(timeLeft);
  return (
    <div className="game-hud">
      <button type="button" className="icon-btn" aria-label="게임 그만하기" onClick={onExit}>
        <span aria-hidden="true">✕</span>
      </button>
      <div className="game-hud__time" aria-label={`남은 시간 ${secs}초`}>
        <div className={`game-hud__bar${ratio < 0.25 ? ' is-low' : ''}`} style={{ transform: `scaleX(${ratio})` }} />
        <span className="game-hud__secs" aria-hidden="true">
          ⏱ {secs}
        </span>
      </div>
      <div className="game-hud__score" aria-live="off">
        <span className="small muted">점수</span>
        <strong>{score.toLocaleString()}</strong>
      </div>
      {extra}
    </div>
  );
}
