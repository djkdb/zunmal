import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import type { Character } from '../data/characters';
import type { MiniGameResultPayload } from '../minigames/types';
import type { MiniGameFinishResult } from '../store/useGameStore';
import { Malang } from './Malang';
import './MiniGameResult.css';

interface MiniGameResultProps {
  gameName: string;
  partner: Character;
  payload: MiniGameResultPayload;
  result: MiniGameFinishResult;
  onRetry(): void;
}

/** 모든 미니게임 공통 결과 화면 */
export function MiniGameResult({ gameName, partner, payload, result, onRetry }: MiniGameResultProps) {
  const { reward, isNewBest, previousBest } = result;

  useEffect(() => {
    if (reward.grantedCoins > 0) sfx.coin();
    if (isNewBest) window.setTimeout(() => sfx.success(), 250);
  }, [reward.grantedCoins, isNewBest]);

  return (
    <section className="page mg-result" aria-labelledby="mg-result-title">
      <div className="card mg-result__card">
        <p className="small muted">{gameName}</p>
        <h1 id="mg-result-title" className="mg-result__title">
          {isNewBest ? '🎉 최고 기록 갱신!' : '게임 종료!'}
        </h1>
        <Malang character={partner} size={110} animation={isNewBest ? 'bounce' : 'idle'} decorative />
        <p className="mg-result__score">
          <span className="small muted">점수</span>
          <strong>{reward.score.toLocaleString()}</strong>
        </p>
        <p className="small muted">
          {isNewBest ? `이전 최고 ${previousBest.toLocaleString()}` : `최고 기록 ${previousBest.toLocaleString()}`}
        </p>

        {payload.stats && Object.keys(payload.stats).length > 0 && (
          <dl className="mg-result__stats">
            {Object.entries(payload.stats).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mg-result__coins" aria-label={`획득 코인 ${reward.grantedCoins}`}>
          <span className="mg-result__coin-icon" aria-hidden="true">
            C
          </span>
          <strong>+{reward.grantedCoins.toLocaleString()}</strong>
        </div>
        <ul className="mg-result__breakdown small">
          <li>
            기본 {reward.baseCoins.toLocaleString()} + 파트너 보너스 {reward.partnerBonus.toLocaleString()}
          </li>
          {reward.cappedByGame && <li>한 판 최대치에 도달했어요.</li>}
          {reward.cappedByDaily && <li>오늘의 코인 한도에 도달했어요. 내일 다시 만나요!</li>}
        </ul>
      </div>

      <div className="mg-result__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry} autoFocus>
          다시 하기
        </button>
        <Link to="/play" className="btn" onClick={() => sfx.button()}>
          로비로
        </Link>
      </div>
    </section>
  );
}
