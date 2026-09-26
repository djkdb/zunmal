import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { getCharacter } from '../data/characters';
import { MATERIAL_LABELS } from '../data/materialIds';
import { SHOP_SLOT_UNLOCKS } from '../economy/config';
import {
  malangsUntilNextSlot,
  nextSlotAt,
  shownPerHour,
  unlockedSlots,
  SHOP_MAX_SLOTS,
  type StaffRate,
} from '../economy/shop';
import { MATERIAL_PERK_TEXT, formatDuration } from '../components/shop/perks';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CoinIcon } from '../components/icons';
import { LockIcon, PlusIcon } from '../components/shop/shopIcons';
import { Malang } from '../components/Malang';
import { RarityBadge } from '../components/RarityBadge';
import { BonusChips } from '../components/shop/BonusChips';
import { ShopFront } from '../components/shop/ShopFront';
import { StaffPicker } from '../components/shop/StaffPicker';
import { useShopClaim, useShopLive } from '../components/shop/useShop';
import { useGameStore } from '../store/useGameStore';
import './ShopPage.css';

/** 일하는 직원 한 칸: 그림 + 이름·등급 + 시간당 코인 + 보너스 칩 + 촉감 특기 한 줄. 누르면 바꾸기 */
function StaffSlot({ rate, onPick }: { rate: StaffRate; onPick(): void }) {
  const c = getCharacter(rate.id);
  const shiny = useGameStore((s) => (s.ownedMalangs[rate.id]?.shinyCount ?? 0) > 0);
  if (!c) return null;
  const perHour = shownPerHour(rate.perHour);
  return (
    <button type="button" className="shop-slot" onClick={onPick} aria-label={`${c.name}, 시간당 ${perHour}코인, 바꾸기`}>
      <span className="shop-slot__art" aria-hidden="true">
        <Malang character={c} size={56} animation="none" decorative shiny={shiny} />
      </span>
      <span className="shop-slot__text" aria-hidden="true">
        <span className="shop-slot__name">
          {c.name} <RarityBadge rarity={c.rarity} compact />
        </span>
        <BonusChips bonuses={rate.bonuses} base={rate.base} />
        <span className="shop-slot__perk">
          <span>
            <b>{MATERIAL_LABELS[rate.material]}</b> {MATERIAL_PERK_TEXT[rate.material]}
          </span>
        </span>
      </span>
      <span className="shop-slot__rate" aria-hidden="true">
        <strong>{perHour}</strong>
        <span>시간당</span>
        <span className="shop-slot__change">바꾸기</span>
      </span>
    </button>
  );
}

/** 말랑 디저트 가게 화면 (/shop) */
export function ShopPage() {
  const reduced = useReducedMotion();
  const { rates, reading, untilFull } = useShopLive(2000);
  const ownedMalangs = useGameStore((s) => s.ownedMalangs);
  const ownedCount = Object.keys(ownedMalangs).length;
  const slots = unlockedSlots(ownedCount);
  const next = nextSlotAt(ownedCount);
  const moreForSlot = malangsUntilNextSlot(ownedCount);
  const claim = useShopClaim();
  const claimRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);

  const front = rates.staff
    .map((r) => {
      const character = getCharacter(r.id);
      return character ? { character, shiny: (ownedMalangs[r.id]?.shinyCount ?? 0) > 0 } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const perHour = shownPerHour(rates.perHour);
  const empty = front.length === 0;
  const canClaim = reading.coins >= 1;

  const openPicker = (slot: number) => {
    sfx.button();
    setPicking(slot);
  };

  return (
    <section className="page shop" aria-labelledby="shop-title">
      <div className="shop__stage">
        {/* 화면 제목이 곧 가게 간판 */}
        <h1 id="shop-title" className="shop-front__sign">
          말랑 디저트 가게
        </h1>
        <ShopFront staff={front} reduced={reduced} />
        {empty && (
          <button type="button" className="shop__hire" onClick={() => openPicker(0)}>
            <PlusIcon size={20} />
            일할 말랑이 고르기
          </button>
        )}
      </div>

      {/* 계산대: 모인 코인 / 가득 참 + 막대 + 받기, 그 아래 가게 요약(시간당·직원 칸·가득 참 시간)과 다음 칸 */}
      <div className={`shop__till${reading.full ? ' is-full' : ''}`}>
        <div className="shop__till-row">
          {/* 4초마다 오르는 숫자라 알림 영역이 아니다 — 받았을 때만 아래 상태 줄이 읽어 준다 */}
          <p className="shop__amount">
            <CoinIcon size={30} />
            <span className="shop__amount-num">{reading.coins.toLocaleString()}</span>
            {!empty && (
              <span className="shop__amount-cap">
                <span className="visually-hidden">코인 모였어요, 가득 차면</span> / {rates.capCoins.toLocaleString()}
              </span>
            )}
            {empty && <span className="visually-hidden">코인이 모였어요</span>}
          </p>
          <button
            ref={claimRef}
            type="button"
            className="btn btn--primary shop__claim"
            disabled={!canClaim}
            onClick={() => {
              const got = claim(claimRef.current);
              if (got > 0) setClaimed(got);
            }}
          >
            받기
          </button>
        </div>
        <div
          className="shop__bar"
          role="progressbar"
          aria-label="가게에 쌓인 코인"
          aria-valuemin={0}
          aria-valuemax={rates.capCoins}
          aria-valuenow={Math.min(reading.coins, rates.capCoins)}
        >
          <span className="shop__fill" style={{ width: `${reading.fill * 100}%` }} />
        </div>
        <p className="visually-hidden" role="status">
          {claimed !== null ? `${claimed.toLocaleString()}코인을 받았어요` : ''}
        </p>
        <p className="shop__till-note">
          {empty
            ? '말랑이가 일하면 코인이 쌓여요'
            : reading.full
              ? '가게가 가득 찼어요. 받으면 다시 쌓여요'
              : claimed !== null && reading.coins < 1
                ? `${claimed.toLocaleString()}코인을 받았어요`
                : untilFull !== null
                  ? `${formatDuration(untilFull)} 뒤에 가득 차요`
                  : ''}
        </p>
        <dl className="shop-stats">
          <div>
            <dt>시간당</dt>
            <dd>
              <CoinIcon size={16} />
              {perHour.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>일하는 말랑이</dt>
            <dd>
              {front.length}/{slots}칸
            </dd>
          </div>
          <div>
            <dt>가득 참</dt>
            <dd>{rates.capHours}시간</dd>
          </div>
        </dl>
        {moreForSlot !== null && (
          <p className="shop__next">
            <LockIcon size={18} />
            말랑이 {moreForSlot}마리 더 모으면 한 칸 더 열려요
          </p>
        )}
        {rates.sets.length > 0 && (
          <p className="shop__sets">
            {rates.sets.map((s) => (
              <span key={s.id} className="chip chip--lemon">
                {s.name} 세트 +{Math.round(s.bonus * 100)}%
              </span>
            ))}
          </p>
        )}
      </div>

      <h2 className="section-title shop__staff-title">일하는 말랑이</h2>
      <ul className="shop__slots">
        {Array.from({ length: SHOP_MAX_SLOTS }, (_, i) => {
          const rate = rates.staff[i];
          if (rate) {
            return (
              <li key={rate.id}>
                <StaffSlot rate={rate} onPick={() => openPicker(i)} />
              </li>
            );
          }
          if (i < slots) {
            // 빈칸은 첫 빈칸 하나만 누를 수 있게 보여 준다 (칸은 앞에서부터 채워진다)
            if (i > rates.staff.length) return null;
            return (
              <li key={`empty-${i}`}>
                <button type="button" className="shop-slot shop-slot--empty" onClick={() => openPicker(i)}>
                  <span className="shop-slot__plus" aria-hidden="true">
                    <PlusIcon size={22} />
                  </span>
                  <span className="shop-slot__text">
                    <span className="shop-slot__name">빈 자리</span>
                    <span className="shop-slot__perk">누르면 일할 말랑이를 골라요</span>
                  </span>
                </button>
              </li>
            );
          }
          const need = SHOP_SLOT_UNLOCKS[i] ?? 0;
          return (
            <li key={`locked-${i}`} className="shop-slot shop-slot--locked">
              <span className="shop-slot__plus" aria-hidden="true">
                <LockIcon size={22} />
              </span>
              <span className="shop-slot__text">
                <span className="shop-slot__name">말랑이 {need}마리 모으면 열려요</span>
                {need === next && <span className="shop-slot__perk">지금 {ownedCount}마리</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="shop__foot">
        캡슐을 연 말랑이만 일할 수 있어요. 앱을 닫아 둬도 가게는 열려 있어요.{' '}
        <Link to="/gacha" className="shop__link" onClick={() => sfx.button()}>
          캡슐 뽑으러 가기
        </Link>
      </p>

      {picking !== null && <StaffPicker slot={picking} slots={slots} onClose={() => setPicking(null)} />}
    </section>
  );
}
