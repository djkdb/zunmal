import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { DailyMissions } from '../components/DailyMissions';
import { CouponBox } from '../components/CouponBox';
import { InstallCard } from '../components/InstallCard';
import { CloseIcon, GiftIcon, TapIcon } from '../components/icons';
import { ShopCard } from '../components/shop/ShopCard';
import { seoulDateKey } from '../economy/daily';
import { giftAvailable, giftCoins, giftGiver } from '../economy/gift';
import { josa } from '../lib/josa';
import { clearPendingCoupon, usePendingCoupon } from '../app/couponLink';
import { checkCoupon } from '../economy/coupons';
import { flyCoins } from '../lib/coinFx';
import { haptic } from '../lib/haptics';
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

/**
 * 선물 링크(?c=코드)로 들어왔을 때: 파트너 말풍선 자리에 "선물 쿠폰이 도착했어요" + 받기.
 * 받기는 쿠폰 칸과 같은 store.redeemCoupon — 저장당 한 번.
 */
function GiftBubble({ code, onDone }: { code: string; onDone(text: string): void }) {
  const redeemCoupon = useGameStore((s) => s.redeemCoupon);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const redeem = () => {
    const res = redeemCoupon(code);
    clearPendingCoupon();
    if (!res.ok) {
      sfx.fail();
      return;
    }
    sfx.success();
    haptic('success');
    if (buttonRef.current) flyCoins(buttonRef.current, res.coupon.coins);
    onDone(`${res.coupon.title} ${res.coupon.coins.toLocaleString()}코인을 받았어요!`);
  };
  return (
    <div className="home__bubble home__gift" role="status">
      <span className="home__gift-text">선물 쿠폰이 도착했어요</span>
      <button ref={buttonRef} type="button" className="btn btn--lemon btn--small home__gift-btn" onClick={redeem}>
        받기
      </button>
    </div>
  );
}

/** 오늘 말랑 선물을 가져올 말랑이 (받을 수 있을 때만) */
function useDailyGift(): string | null {
  const unboxed = useGameStore((s) => s.unboxed);
  const affection = useGameStore((s) => s.affection);
  const partnerId = useGameStore((s) => s.partnerId);
  const giftDay = useGameStore((s) => s.giftDay);
  const giver = giftGiver({ unboxed, affection, partnerId });
  return giftAvailable(giftDay, seoulDateKey(), giver) ? giver : null;
}

/**
 * 하루 한 번 말랑 선물: 파트너 말풍선 자리에 "○○가 선물을 가져왔어요" + 열기.
 * 누르면 상자가 폭 열리고 코인이 위 코인 알약으로 날아간다. ref 로 바로 잠가 두 번 받지 않는다.
 */
function DailyGiftBubble({ giverId, onDone }: { giverId: string; onDone(text: string): void }) {
  const claimGift = useGameStore((s) => s.claimGift);
  const giver = getCharacter(giverId);
  const coins = giftCoins(useGameStore((s) => s.affection[giverId] ?? 0));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lockRef = useRef(false);
  const [opening, setOpening] = useState(false);
  if (!giver) return null;
  const open = () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setOpening(true);
    sfx.capsuleOpen();
    haptic('success');
    // 상자가 열리는 순간(0.36초 뒤)에 받는다 — 움직임 줄이기면 바로
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.setTimeout(
      () => {
        const res = claimGift();
        if (!res.ok) {
          onDone('선물은 내일 또 가져올게요');
          return;
        }
        sfx.coin();
        sfx.success();
        if (buttonRef.current) flyCoins(buttonRef.current, res.coins);
        onDone(`선물 ${res.coins}코인을 받았어요!`);
      },
      reduced ? 0 : 360,
    );
  };
  return (
    <div className={`home__bubble home__daily-gift${opening ? ' is-opening' : ''}`} role="status">
      <span className="home__daily-gift-box" aria-hidden="true">
        <GiftIcon size={30} />
      </span>
      <span className="home__gift-text">{josa(giver.name, '이/가')} 선물을 가져왔어요</span>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--primary btn--small home__gift-btn"
        onClick={open}
        aria-label={`선물 열기, ${coins}코인`}
      >
        열기
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
  const canPull = coins >= PULL_PRICE.single;

  // 놀이방에 아직 안 가 본(아무도 안 쓰다듬은) 플레이어: 파트너를 누르면 만질 수 있다고 알려 준다
  const affection = useGameStore((s) => s.affection);
  const neverPetted = Object.values(affection).every((v) => v <= 0);

  // 선물 링크 쿠폰: 받을 수 있을 때만 말풍선. 이미 받은 쿠폰이면 조용히 버린다
  const pendingCoupon = usePendingCoupon();
  const redeemed = useGameStore((s) => s.redeemedCoupons);
  const giftCheck = pendingCoupon ? checkCoupon(pendingCoupon, redeemed, new Date()) : null;
  const giftReady = giftCheck?.ok === true;
  const giftUsed = giftCheck !== null && !giftCheck.ok && giftCheck.reason === 'used';
  useEffect(() => {
    if (giftUsed) clearPendingCoupon();
  }, [giftUsed]);
  const [giftDone, setGiftDone] = useState<string | null>(null);
  const dailyGiver = useDailyGift();
  const showCoupon = !!pendingCoupon && giftReady;
  // 말풍선 자리: 선물 쿠폰 > 말랑 선물 > (받은 뒤 한 줄) > 목표 > 인사
  const showDailyGift = !showCoupon && !giftDone && dailyGiver !== null;
  // 선물 말풍선이 떠 있으면 "꾹 눌러 봐요"는 잠깐 쉰다 (한 번에 하나만 말을 건다)
  const touchHint = neverPetted && !showCoupon && !showDailyGift;
  useEffect(() => {
    if (!giftDone) return;
    const t = window.setTimeout(() => setGiftDone(null), 3200);
    return () => window.clearTimeout(t);
  }, [giftDone]);

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
        <p className="eyebrow home__eyebrow" aria-hidden="true">
          Capsule Malang Shop
        </p>
        <h1 id="home-title" className="home__logo">
          말랑 뽑기방
        </h1>
      </header>

      {partner && (
        <div className="home__stage">
          {showCoupon && pendingCoupon ? (
            <GiftBubble code={pendingCoupon} onDone={setGiftDone} />
          ) : showDailyGift && dailyGiver ? (
            <DailyGiftBubble giverId={dailyGiver} onDone={setGiftDone} />
          ) : giftDone ? (
            <p className="home__bubble" role="status">
              {giftDone}
            </p>
          ) : showGoal && goal ? (
            <GoalBubble goal={goal} coins={coins} onDismiss={dismissGoal} />
          ) : (
            <p className="home__bubble">{greeting}</p>
          )}
          <Link
            to="/touch"
            className={`home__partner${touchHint ? ' has-hint' : ''}`}
            aria-label={`말랑이 만지러 가기, ${partner.name}`}
            onClick={() => sfx.button()}
          >
            <Malang
              character={partner}
              size={190}
              animation="idle"
              decorative
              aura="auto"
              shiny={partnerShiny && (owned[partner.id]?.shinyCount ?? 0) > 0}
            />
            {touchHint && (
              <>
                <span className="home__touch-bubble" aria-hidden="true">
                  꾹 눌러 봐요
                </span>
                <span className="home__touch-finger" aria-hidden="true">
                  <TapIcon size={34} />
                </span>
              </>
            )}
          </Link>
          <div className="home__pedestal" aria-hidden="true" />
          <p className="home__name">
            {partner.name} <RarityBadge rarity={partner.rarity} compact />
          </p>
        </div>
      )}

      {/* 뽑을 코인이 없으면 "코인 벌기"가 주인공(딸기우유) — 누를 수 있는 다음 행동이 먼저 보이게 */}
      <div className="home__actions">
        {canPull ? (
          <>
            <Link to="/gacha" className="btn btn--primary btn--big home__action" onClick={() => sfx.button()}>
              캡슐 뽑기
              {coachStep === 'pull' && <span className="home__sticker">첫 뽑기</span>}
            </Link>
            <Link to="/play" className="btn btn--secondary btn--big home__action" onClick={() => sfx.button()}>
              미니게임
              {coachStep === 'play' && <span className="home__sticker">코인 모으기</span>}
            </Link>
          </>
        ) : (
          <>
            <Link to="/play" className="btn btn--primary btn--big home__action home__action--earn" onClick={() => sfx.button()}>
              <span>
                미니게임으로
                <br />
                코인 벌기
              </span>
            </Link>
            <Link to="/gacha" className="btn btn--secondary btn--big home__action" onClick={() => sfx.button()}>
              캡슐 뽑기
              {coachStep === 'pull' && <span className="home__sticker">첫 뽑기</span>}
            </Link>
          </>
        )}
      </div>

      <InstallCard slot="in-app" />

      <ShopCard />

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
