import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { DailyMissions } from '../components/DailyMissions';
import { CouponBox } from '../components/CouponBox';
import { InstallCard } from '../components/InstallCard';
import { CapsuleIcon, CloseIcon, JoystickIcon } from '../components/icons';
import { CHARACTERS, getCharacter } from '../data/characters';
import { RARITY_META } from '../data/rarity';
import { DAILY_CAP, PARTNER_RARITY_BONUS, PULL_COUNT, PULL_PRICE } from '../economy/config';
import { readCoachFlags, writeCoachFlags, type CoachFlags } from '../lib/coachFlags';
import { GUIDE_STEPS, goalKey, nextGoal, type NextGoal } from '../missions/nextGoal';
import { useGameStore } from '../store/useGameStore';
import './HomePage.css';

/** 파트너가 건네는 한마디 (상황에 따라 바뀜) */
function useGreeting(coins: number, dailyLeft: number, bonus: number): string {
  return useMemo(() => {
    if (coins >= PULL_PRICE.multi) return `코인이 잔뜩! ${PULL_COUNT.multi}연 뽑기 하러 갈까요?`;
    if (coins >= PULL_PRICE.single) return '코인이 모였어요. 캡슐 뽑으러 가요!';
    if (dailyLeft <= 0) return '오늘 코인은 다 모았어요. 내일 또 놀아요!';
    if (bonus > 0) return `나랑 놀면 코인이 ${bonus}% 더 나와요!`;
    return '미니게임 하고 코인 모아요!';
  }, [coins, dailyLeft, bonus]);
}

/** 목표 말풍선에 쓸 문구와 갈 곳 */
function goalCopy(goal: NextGoal, coins: number): { text: string; to: string; state?: { tab: 'sets' } } {
  switch (goal.kind) {
    case 'guide':
      if (goal.step === 'pull') return { text: '선물 코인으로 첫 캡슐을 뽑아 봐요!', to: '/gacha' };
      if (goal.step === 'play')
        return {
          text: coins < PULL_PRICE.single ? '미니게임을 하면 코인이 모여요' : '이번엔 미니게임으로 코인을 모아요',
          to: '/play',
        };
      return { text: '만난 말랑이는 도감에 모여요', to: '/collection' };
    case 'set-reward':
      return { text: `${goal.set.name} 세트 보상을 받을 수 있어요`, to: '/collection', state: { tab: 'sets' } };
    case 'set':
      return { text: `${goal.set.name} 세트까지 ${goal.missing}마리 남았어요`, to: '/collection', state: { tab: 'sets' } };
  }
}

/**
 * 다음 목표 말풍선: 파트너가 말하듯 한 가지 할 일만 알려 준다. 누르면 그곳으로 간다.
 * 닫기는 처음 안내 전체(또는 지금 목표)를 숨길 뿐 아무것도 막지 않는다.
 */
function GoalBubble({ goal, coins, onDismiss }: { goal: NextGoal; coins: number; onDismiss(): void }) {
  const { text, to, state } = goalCopy(goal, coins);
  const isGuide = goal.kind === 'guide';
  return (
    <div className={`home__bubble home__goal${isGuide ? ' home__goal--guide' : ''}`}>
      <Link
        to={to}
        state={state}
        className="home__goal-link"
        onClick={() => {
          sfx.button();
          if (goal.kind === 'guide' && goal.step === 'collection') writeCoachFlags({ collectionSeen: true });
        }}
      >
        {isGuide && (
          <span className="home__goal-steps" aria-label={`처음 안내 ${GUIDE_STEPS.length}단계 중 ${goal.index + 1}단계`} role="img">
            {GUIDE_STEPS.map((step, i) => (
              <span key={step} className={`home__goal-dot${i < goal.index ? ' is-done' : i === goal.index ? ' is-now' : ''}`} />
            ))}
          </span>
        )}
        <span className="home__goal-text">{text}</span>
      </Link>
      <button type="button" className="home__goal-close" onClick={onDismiss} aria-label={isGuide ? '처음 안내 닫기' : '이 목표 닫기'}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export function HomePage() {
  const partnerId = useGameStore((s) => s.partnerId);
  const owned = useGameStore((s) => s.ownedMalangs);
  const dailyEarned = useGameStore((s) => s.dailyEarnedCoins);
  const coins = useGameStore((s) => s.coins);
  const partnerShiny = useGameStore((s) => s.partnerShiny);
  const partner = partnerId ? getCharacter(partnerId) : undefined;
  const ownedCount = CHARACTERS.filter((c) => owned[c.id]).length;
  const dailyLeft = Math.max(0, DAILY_CAP - dailyEarned);
  const bonus = partner ? Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100) : 0;
  const greeting = useGreeting(coins, dailyLeft, bonus);

  const totalPulls = useGameStore((s) => s.totalPulls);
  const records = useGameStore((s) => s.miniGameRecords);
  const claimedSets = useGameStore((s) => s.claimedSets);
  const [flags, setFlags] = useState<CoachFlags>(readCoachFlags);
  const plays = Object.values(records).reduce((sum, r) => sum + r.plays, 0);
  const goal = nextGoal({
    coins,
    totalPulls,
    plays,
    ownedIds: new Set(Object.keys(owned)),
    claimedSets,
    collectionSeen: flags.collectionSeen,
    guideDismissed: flags.guideDismissed,
  });
  // 처음 안내가 끝난 뒤에는: 받을 세트 보상 > 뽑을 코인이 있을 때의 인사 > 가장 가까운 세트
  const showGoal =
    goal !== null &&
    (goal.kind === 'guide' || (flags.hiddenGoal !== goalKey(goal) && (goal.kind === 'set-reward' || coins < PULL_PRICE.single)));
  const coachStep = showGoal && goal.kind === 'guide' ? goal.step : null;
  const dismissGoal = () => {
    sfx.button();
    if (!goal) return;
    setFlags(goal.kind === 'guide' ? writeCoachFlags({ guideDismissed: true }) : writeCoachFlags({ hiddenGoal: goalKey(goal) }));
  };

  return (
    <section className="page home" aria-labelledby="home-title">
      <header className="home__sign">
        <div className="home__awning" aria-hidden="true" />
        <h1 id="home-title" className="home__logo">
          <span className="home__logo-small">말랑</span>
          <span className="home__logo-big">뽑기방</span>
        </h1>
      </header>

      {partner && (
        <div className="home__stage">
          {showGoal && goal ? (
            <GoalBubble goal={goal} coins={coins} onDismiss={dismissGoal} />
          ) : (
            <p className="home__bubble">{greeting}</p>
          )}
          <Link to="/touch" className="home__partner" aria-label={`${partner.name} 만지러 가기`}>
            <Malang
              character={partner}
              size={190}
              animation="idle"
              decorative
              aura="auto"
              shiny={partnerShiny && (owned[partner.id]?.shinyCount ?? 0) > 0}
            />
          </Link>
          <div className="home__pedestal" aria-hidden="true" />
          <p className="home__name">
            {partner.name} <RarityBadge rarity={partner.rarity} compact />
          </p>
        </div>
      )}

      <div className="home__actions">
        <Link to="/play" className="btn btn--mint btn--big home__action" onClick={() => sfx.button()}>
          <JoystickIcon size={34} />
          게임하기
          {coachStep === 'play' && <span className="home__sticker">코인 모으기</span>}
        </Link>
        <Link to="/gacha" className="btn btn--primary btn--big home__action" onClick={() => sfx.button()}>
          <CapsuleIcon size={32} />
          뽑기
          {coachStep === 'pull' && <span className="home__sticker">첫 뽑기</span>}
        </Link>
      </div>

      <InstallCard slot="in-app" />

      <DailyMissions />

      <Link to="/collection" className="home__jar" onClick={() => sfx.button()} aria-label={`도감 ${ownedCount}/${CHARACTERS.length}`}>
        <span className="home__slots" aria-hidden="true">
          {CHARACTERS.map((c) => (
            <span
              key={c.id}
              className={`home__slot${owned[c.id] ? ' is-filled' : ''}`}
              style={owned[c.id] ? { background: `var(${RARITY_META[c.rarity].colorVar})` } : undefined}
            />
          ))}
        </span>
        <span className="home__jar-count">
          {ownedCount}/{CHARACTERS.length}
        </span>
      </Link>

      <CouponBox />

      <InstallCard slot="install" />
    </section>
  );
}
