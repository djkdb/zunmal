import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import type { Character } from '../data/characters';
import type { MiniGameResultPayload } from '../minigames/types';
import { PULL_PRICE } from '../economy/config';
import { useGameStore, type MiniGameFinishResult } from '../store/useGameStore';
import { Malang } from './Malang';
import { CapsuleIcon, CoinIcon } from './icons';
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
  const isFirst = isNewBest && previousBest === 0;
  const coins = useGameStore((s) => s.coins);
  const canPull = coins >= PULL_PRICE.single;

  useEffect(() => {
    if (reward.grantedCoins > 0) sfx.coin();
    if (isNewBest) window.setTimeout(() => sfx.success(), 250);
  }, [reward.grantedCoins, isNewBest]);

  return (
    <section className="page mg-result" aria-labelledby="mg-result-title">
      <div className="card mg-result__card">
        <p className="small muted">{gameName}</p>
        <h1 id="mg-result-title" className="mg-result__title">
          {isFirst ? '첫 기록이에요!' : isNewBest ? '최고 기록 갱신!' : '다 했어요!'}
        </h1>
        <Malang character={partner} size={122} animation={isNewBest ? 'bounce' : 'idle'} decorative aura="auto" />
        <p className="mg-result__score">
          <span className="small muted">점수</span>
          <strong>{reward.score.toLocaleString()}</strong>
        </p>
        <p className="small muted">
          {isFirst
            ? '다음 판에서 이 기록을 깨 보세요.'
            : isNewBest
              ? `이전 최고 ${previousBest.toLocaleString()}`
              : `최고 기록 ${previousBest.toLocaleString()}`}
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
          <CoinIcon size={34} />
          <strong>+{reward.grantedCoins.toLocaleString()}</strong>
        </div>
        <ul className="mg-result__breakdown small">
          <li>
            점수로 {reward.baseCoins.toLocaleString()}코인
            {reward.partnerBonus > 0 && <>, {partner.name} 덕분에 {reward.partnerBonus.toLocaleString()}코인 더</>}
          </li>
          {reward.cappedByGame && <li>한 판에 받을 수 있는 만큼 다 받았어요.</li>}
          {reward.cappedByDaily && <li>오늘 받을 수 있는 코인을 모두 받았어요. 자정에 다시 채워져요.</li>}
        </ul>
      </div>

      {canPull && (
        <Link to="/gacha" className="btn btn--lemon btn--block mg-result__gacha" onClick={() => sfx.button()}>
          <CapsuleIcon size={26} />
          캡슐 뽑으러 가기
          <span className="mg-result__gacha-coins">
            <CoinIcon size={18} />
            {coins.toLocaleString()}
          </span>
        </Link>
      )}
      <div className="mg-result__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry} autoFocus>
          다시 하기
        </button>
        <Link to="/play" className="btn" onClick={() => sfx.button()}>
          게임 목록
        </Link>
      </div>
    </section>
  );
}
