import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import type { Character } from '../data/characters';
import { moodCharacter } from '../minigames/shared/partner';
import type { MiniGameResultPayload } from '../minigames/types';
import { DAILY_CAP, PER_GAME_CAP, PULL_PRICE } from '../economy/config';
import { dailyProgress, earnedAfter, rewardNote, rewardTrims } from '../economy/playReward';
import { useCountUp } from '../hooks/useCountUp';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { countUpDuration, flyCoins, holdCounter } from '../lib/coinFx';
import { haptic } from '../lib/haptics';
import { useGameStore, type MiniGameFinishResult } from '../store/useGameStore';
import { Malang } from './Malang';
import { RarityBadge } from './RarityBadge';
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

/**
 * 발표 순서: 점수가 굴러 올라가고 → 받은 코인이 굴러 올라가고 → 코인이 상단 알약으로 날아간다.
 * 카드를 톡 누르면 모두 바로 끝난다. 움직임 줄이기면 처음부터 끝난 값.
 */
const SCORE_DELAY_MS = 150;
const STEP_GAP_MS = 120;
const CONFETTI_COUNT = 28;
const CONFETTI_COLORS = ['var(--primary)', 'var(--sky)', 'var(--lemon)', 'var(--mint)', 'var(--grape)', 'var(--peach)'];

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 최고 기록 축하: 점수 뒤에서 터지는 별·색종이 (CSS transform/opacity만, 28개) */
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

function StarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M6 0.8 L7.5 4.2 L11.2 4.5 L8.4 6.9 L9.3 10.6 L6 8.6 L2.7 10.6 L3.6 6.9 L0.8 4.5 L4.5 4.2 Z"
        fill="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 모든 미니게임 공통 결과 화면: 점수 → 보상 영수증 → 오늘 받은 코인 → 다음 행동 */
export function MiniGameResult({ gameName, partner, partnerShiny = false, payload, result, onRetry }: MiniGameResultProps) {
  const { reward, isNewBest, previousBest } = result;
  const isFirst = isNewBest && previousBest === 0;
  const coins = useGameStore((s) => s.coins);
  const canPull = coins >= PULL_PRICE.single;
  const trims = rewardTrims(reward);
  const note = rewardNote(reward);
  const bonusPct = Math.round(reward.partnerBonusRate * 100);
  // 오늘 합계는 store의 computeReward 결과(남은 한도)에서 거꾸로 — 받은 코인과 항상 같은 계산
  const todayAfter = earnedAfter(reward);
  const todayBefore = todayAfter - reward.grantedCoins;

  const reduced = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;

  // 발표 시간표 (한 번 정한다)
  const plan = useMemo(() => {
    const scoreMs = reward.score > 0 ? countUpDuration(reward.score) : 0;
    const coinsDelay = SCORE_DELAY_MS + scoreMs + STEP_GAP_MS;
    const coinsMs = reward.grantedCoins > 0 ? countUpDuration(reward.grantedCoins) : 0;
    return { scoreMs, coinsDelay, flyAt: coinsDelay + coinsMs + STEP_GAP_MS };
  }, [reward.score, reward.grantedCoins]);

  const score = useCountUp(reward.score, { delay: SCORE_DELAY_MS, skip: skipped });
  const granted = useCountUp(reward.grantedCoins, { delay: plan.coinsDelay, skip: skipped });
  const today = dailyProgress(todayBefore + granted);

  const coinsRef = useRef<HTMLSpanElement>(null);
  const flown = useRef(false);
  const celebrated = useRef(false);

  const fly = () => {
    if (flown.current || reward.grantedCoins <= 0) return;
    flown.current = true;
    const from = coinsRef.current;
    if (from) flyCoins(from, reward.grantedCoins);
    else sfx.coin();
  };

  // 결과 발표: 진동 + 소리, 받은 코인은 굴러 올라간 뒤 상단 알약으로 날아간다 (한 번만)
  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    if (reward.grantedCoins > 0 || isNewBest) haptic('success');
    if (isNewBest) window.setTimeout(() => sfx.success(), 250);
  }, [reward.grantedCoins, isNewBest]);

  useEffect(() => {
    if (reward.grantedCoins <= 0 || flown.current) return;
    if (instant) {
      fly();
      return;
    }
    // 상단 숫자는 코인이 닿을 때까지 기다린다 (MiniGamePage가 지급 직전에 잡아 둔 것을 발표 끝까지 늘린다)
    holdCounter(plan.flyAt + 600);
    const t = window.setTimeout(fly, plan.flyAt);
    return () => window.clearTimeout(t);
    // fly는 ref와 바뀌지 않는 reward만 읽는다
  }, [instant, plan.flyAt, reward.grantedCoins]);

  const skip = () => {
    if (!skipped && !reduced) setSkipped(true);
  };

  const summary = [
    `${gameName} 점수 ${fmt(reward.score)}점.`,
    isFirst ? '첫 기록이에요.' : isNewBest ? `최고 기록! 이전 최고 ${fmt(previousBest)}점.` : `최고 기록은 ${fmt(previousBest)}점.`,
    `${fmt(reward.grantedCoins)}코인을 받았어요.`,
    note ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="page mg-result" aria-labelledby="mg-result-title">
      {/* 카드 아무 데나 누르면 숫자 굴리기를 건너뛴다 (버튼은 카드 밖) */}
      <div className="card mg-result__card" onClick={skip}>
        <h1 id="mg-result-title" className="mg-result__title">
          {gameName}
        </h1>
        <p className="visually-hidden" role="status">
          {summary}
        </p>

        <div className="mg-result__hero" aria-hidden="true">
          <div className={`mg-result__partner${isNewBest ? ' is-cheering' : ''}`}>
            <Malang
              character={isNewBest ? moodCharacter(partner, 'happy') : partner}
              size={92}
              animation={isNewBest ? 'bounce' : 'idle'}
              shiny={partnerShiny}
              decorative
              aura="auto"
            />
            {isNewBest && <CheerHearts />}
          </div>
          <div className="mg-result__score">
            {isNewBest && !reduced && <Confetti />}
            <span className="mg-result__score-label">점수</span>
            <strong>{fmt(score)}</strong>
            {isNewBest ? (
              <span className="mg-result__best-badge" style={{ '--badge-delay': `${SCORE_DELAY_MS + plan.scoreMs}ms` } as CSSProperties}>
                <StarGlyph />
                {isFirst ? '첫 기록!' : '최고 기록!'}
              </span>
            ) : (
              <span className="mg-result__prev">최고 {fmt(previousBest)}</span>
            )}
            {isNewBest && !isFirst && <span className="mg-result__prev">이전 {fmt(previousBest)}</span>}
          </div>
        </div>

        {payload.stats && Object.keys(payload.stats).length > 0 && (
          <dl className="mg-result__stats">
            {Object.entries(payload.stats).map(([k, v], i) => (
              <div key={k} style={{ '--i': i } as CSSProperties}>
                <dt>{k}</dt>
                <dd>{fmt(v)}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* 보상 영수증: 점수 코인 + 파트너 보너스 − 상한 = 받은 코인 (모두 store가 준 computeReward 값) */}
        <dl className="mg-receipt">
          <div>
            <dt>점수 보상</dt>
            <dd>+{fmt(reward.baseCoins)}</dd>
          </div>
          <div className="mg-receipt__partner">
            <dt>
              <Malang character={partner} size={28} shiny={partnerShiny} decorative />
              <RarityBadge rarity={partner.rarity} compact />
              <span>{bonusPct > 0 ? `보너스 +${bonusPct}%` : '보너스 없음'}</span>
            </dt>
            <dd>+{fmt(reward.partnerBonus)}</dd>
          </div>
          {trims.gameTrim > 0 && (
            <div className="mg-receipt__trim">
              <dt>한 판 상한 {fmt(PER_GAME_CAP)}코인</dt>
              <dd>-{fmt(trims.gameTrim)}</dd>
            </div>
          )}
          {trims.dailyTrim > 0 && (
            <div className="mg-receipt__trim">
              <dt>오늘 상한 {fmt(DAILY_CAP)}코인</dt>
              <dd>-{fmt(trims.dailyTrim)}</dd>
            </div>
          )}
          <div className="mg-receipt__total">
            <dt>
              <span ref={coinsRef} className="mg-receipt__coin">
                <CoinIcon size={30} />
              </span>
              받은 코인
            </dt>
            <dd>+{fmt(granted)}</dd>
          </div>
        </dl>
        {note && <p className="mg-result__note">{note}</p>}

        <div className={`mg-today${today.full ? ' is-full' : ''}`}>
          <p className="mg-today__row">
            <span>오늘 받은 코인</span>
            <span className="mg-today__value">
              <strong>{fmt(today.earned)}</strong> / {fmt(today.cap)}
            </span>
          </p>
          <div
            className="mg-today__bar"
            role="progressbar"
            aria-label="오늘 받은 코인"
            aria-valuemin={0}
            aria-valuemax={today.cap}
            aria-valuenow={dailyProgress(todayAfter).earned}
          >
            <span style={{ '--p': today.ratio } as CSSProperties} />
          </div>
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--big btn--block" onClick={onRetry} autoFocus>
        다시 하기
      </button>
      <div className={`mg-result__more${canPull ? '' : ' is-single'}`}>
        {canPull && (
          <Link to="/gacha" className="btn mg-result__gacha" onClick={() => sfx.button()}>
            <CapsuleIcon size={24} />
            캡슐 뽑기
            <span className="mg-result__gacha-tag">뽑기 가능!</span>
          </Link>
        )}
        <Link to="/play" className="btn" onClick={() => sfx.button()}>
          다른 게임
        </Link>
      </div>
      {!canPull && (
        <p className="mg-result__hint">{fmt(PULL_PRICE.single - coins)}코인 더 모으면 캡슐을 뽑을 수 있어요.</p>
      )}
    </section>
  );
}
