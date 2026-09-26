import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import type { Character } from '../data/characters';
import { moodCharacter } from '../minigames/shared/partner';
import type { MiniGameResultPayload } from '../minigames/types';
import { PULL_PRICE } from '../economy/config';
import { useCountUp } from '../hooks/useCountUp';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { flyCoins } from '../lib/coinFx';
import { haptic } from '../lib/haptics';
import { useGameStore, type MiniGameFinishResult } from '../store/useGameStore';
import { Malang } from './Malang';
import { CapsuleIcon, CoinIcon } from './icons';
import './MiniGameResult.css';

interface MiniGameResultProps {
  gameName: string;
  partner: Character;
  /** 파트너를 반짝 모습으로 */
  partnerShiny?: boolean;
  payload: MiniGameResultPayload;
  result: MiniGameFinishResult;
  onRetry(): void;
}

/** 점수가 다 올라간 뒤 코인이 상단 알약으로 날아간다 */
const SCORE_DELAY_MS = 150;
const COIN_FLY_DELAY_MS = 650;
const CONFETTI_COUNT = 28;
const CONFETTI_COLORS = ['var(--berry)', 'var(--soda)', 'var(--lemon)', 'var(--matcha)', 'var(--grape)', 'var(--peach)'];

/** 최고 기록 축하: 제목 뒤에서 터지는 별·색종이 (CSS transform/opacity만, 28개) */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 70 + Math.random() * 80;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist * 0.75 - 20,
          rot: Math.round((Math.random() - 0.5) * 540),
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          star: i % 4 === 0,
          delay: Math.round(Math.random() * 90),
        };
      }),
    [],
  );
  return (
    <div className="mg-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`mg-confetti__piece${p.star ? ' mg-confetti__piece--star' : ''}`}
          style={
            {
              '--dx': `${p.dx.toFixed(0)}px`,
              '--dy': `${p.dy.toFixed(0)}px`,
              '--rot': `${p.rot}deg`,
              '--c': p.color,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 최고 기록일 때 파트너 옆에 떠오르는 하트 두 개 */
function CheerHearts() {
  const heart = 'M12 20 C4 14 2 10 4.5 6.5 C7 3.5 10.5 4.5 12 7.5 C13.5 4.5 17 3.5 19.5 6.5 C22 10 20 14 12 20 Z';
  return (
    <>
      {[0, 1].map((i) => (
        <svg key={i} className={`mg-result__heart mg-result__heart--${i}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={heart} fill={i === 0 ? '#ff7aa2' : '#ffd23f'} stroke="#2b2233" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      ))}
    </>
  );
}

/** 모든 미니게임 공통 결과 화면 */
export function MiniGameResult({ gameName, partner, partnerShiny = false, payload, result, onRetry }: MiniGameResultProps) {
  const { reward, isNewBest, previousBest } = result;
  const isFirst = isNewBest && previousBest === 0;
  const coins = useGameStore((s) => s.coins);
  const canPull = coins >= PULL_PRICE.single;

  const reduced = useReducedMotion();
  const score = useCountUp(reward.score, { delay: SCORE_DELAY_MS });
  const coinsRef = useRef<HTMLDivElement>(null);
  const celebrated = useRef(false);

  // 결과 발표: 진동 + 소리, 그리고 받은 코인이 상단 알약으로 날아간다 (한 번만)
  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    if (reward.grantedCoins > 0 || isNewBest) haptic('success');
    if (isNewBest) window.setTimeout(() => sfx.success(), 250);
    if (reward.grantedCoins > 0) {
      const from = coinsRef.current;
      if (from) flyCoins(from, reward.grantedCoins, { delay: COIN_FLY_DELAY_MS });
      else sfx.coin();
    }
  }, [reward.grantedCoins, isNewBest]);

  return (
    <section className="page mg-result" aria-labelledby="mg-result-title">
      <div className="card mg-result__card">
        <p className="small muted">{gameName}</p>
        <div className="mg-result__hero">
          {isNewBest && !reduced && <Confetti />}
          <h1 id="mg-result-title" className="mg-result__title">
            {isFirst ? '첫 기록이에요!' : isNewBest ? '최고 기록 갱신!' : '다 했어요!'}
          </h1>
        </div>
        <div className={`mg-result__partner${isNewBest ? ' is-cheering' : ''}`}>
          <Malang
            character={isNewBest ? moodCharacter(partner, 'happy') : partner}
            size={122}
            animation={isNewBest ? 'bounce' : 'idle'}
            shiny={partnerShiny}
            decorative
            aura="auto"
          />
          {isNewBest && <CheerHearts />}
        </div>
        <p className="mg-result__score">
          <span className="small muted">점수</span>
          <strong aria-hidden="true">{score.toLocaleString()}</strong>
          <span className="visually-hidden">{reward.score.toLocaleString()}점</span>
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
            {Object.entries(payload.stats).map(([k, v], i) => (
              <div key={k} style={{ '--i': i } as CSSProperties}>
                <dt>{k}</dt>
                <dd>{v.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}

        <div ref={coinsRef} className="mg-result__coins" aria-label={`획득 코인 ${reward.grantedCoins}`}>
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
