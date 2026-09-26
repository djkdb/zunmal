import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { DailyMissions } from '../components/DailyMissions';
import { InstallCard } from '../components/InstallCard';
import { CouponBox } from '../components/CouponBox';
import { CapsuleIcon, GiftIcon, JoystickIcon, TapIcon } from '../components/icons';
import { GoalCard } from '../components/home/GoalCard';
import { HubStatus } from '../components/home/HubStatus';
import { TodayStrip } from '../components/home/TodayStrip';
import { useHub } from '../components/home/useHub';
import { ShopCard } from '../components/shop/ShopCard';
import { giftCoins } from '../economy/gift';
import { josa } from '../lib/josa';
import { clearPendingCoupon, usePendingCoupon } from '../app/couponLink';
import { checkCoupon } from '../economy/coupons';
import { flyCoins } from '../lib/coinFx';
import { haptic } from '../lib/haptics';
import { getCharacter } from '../data/characters';
import { PARTNER_RARITY_BONUS } from '../economy/config';
import { nextGoal } from '../goals/nextGoal';
import { useGameStore } from '../store/useGameStore';
import './HomePage.css';


/**
 * 파트너가 건네는 한마디. 할 일은 아래 "다음 목표" 카드가 알려 주므로 여기서는 파트너 이야기만 한다.
 */
function greetingFor(dailyLeft: number, bonus: number): string {
  if (dailyLeft <= 0) return '오늘 게임 코인은 다 모았어요. 내일 또 놀아요!';
  if (bonus > 0) return `나랑 놀면 게임 코인이 ${bonus}% 더 나와요!`;
  return '오늘도 와 줘서 반가워요!';
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
        id="home-gift-open"
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
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerShiny = useGameStore((s) => s.partnerShiny);
  const hub = useHub();
  const partner = hub.partner;
  const bonus = partner ? Math.round(PARTNER_RARITY_BONUS[partner.rarity] * 100) : 0;
  const canPull = hub.canPull;

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
  const dailyGiver = hub.gift.available ? hub.gift.giver : null;
  const showCoupon = !!pendingCoupon && giftReady;
  // 말풍선 자리: 선물 쿠폰 > 말랑 선물 > (받은 뒤 한 줄) > 인사
  const showDailyGift = !showCoupon && !giftDone && dailyGiver !== null;
  // 놀이방에 아직 안 가 본(아무도 안 쓰다듬은) 플레이어: 파트너를 누르면 만질 수 있다고 알려 준다.
  // 선물 말풍선이 떠 있으면 "꾹 눌러 봐요"는 잠깐 쉰다 (한 번에 하나만 말을 건다)
  const touchHint = !hub.petted && !showCoupon && !showDailyGift;
  useEffect(() => {
    if (!giftDone) return;
    const t = window.setTimeout(() => setGiftDone(null), 3200);
    return () => window.clearTimeout(t);
  }, [giftDone]);

  // 다음 목표: 말풍선이 이미 말랑 선물을 보여 주면 카드는 그다음 할 일을 보여 준다
  const goal = nextGoal(hub, showDailyGift ? ['gift'] : []);

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
          ) : (
            <p className="home__bubble">{greetingFor(hub.dailyLeft, bonus)}</p>
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

      {goal && <GoalCard goal={goal} />}

      {/* 뽑을 코인이 없으면 "코인 벌기"가 주인공(딸기우유) — 누를 수 있는 다음 행동이 먼저 보이게 */}
      <div className="home__actions">
        {canPull ? (
          <>
            <Link to="/gacha" className="btn btn--primary home__action" onClick={() => sfx.button()}>
              <CapsuleIcon size={24} />
              캡슐 뽑기
            </Link>
            <Link to="/play" className="btn btn--secondary home__action" onClick={() => sfx.button()}>
              <JoystickIcon size={24} />
              미니게임
            </Link>
          </>
        ) : (
          <>
            <Link to="/play" className="btn btn--primary home__action home__action--earn" onClick={() => sfx.button()}>
              <JoystickIcon size={24} />
              <span>미니게임으로 코인 벌기</span>
            </Link>
            <Link to="/gacha" className="btn btn--secondary home__action" onClick={() => sfx.button()}>
              <CapsuleIcon size={24} />
              캡슐 뽑기
            </Link>
          </>
        )}
      </div>

      <InstallCard slot="in-app" />

      <HubStatus hub={hub} />

      <TodayStrip hub={hub} />

      <DailyMissions />

      <ShopCard />

      <CouponBox />

      <InstallCard slot="install" />
    </section>
  );
}
