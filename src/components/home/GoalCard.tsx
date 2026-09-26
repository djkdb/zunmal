import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import type { Goal, GoalIcon } from '../../goals/nextGoal';
import { flyCoins } from '../../lib/coinFx';
import { haptic } from '../../lib/haptics';
import { useGameStore } from '../../store/useGameStore';
import { useShopClaim } from '../shop/useShop';
import { BookIcon, CapsuleIcon, GiftIcon, JoystickIcon, MissionIcon, PetIcon, ShopIcon, StarIcon } from '../icons';
import './GoalCard.css';

const ICONS: Record<GoalIcon, ComponentType<{ size?: number }>> = {
  gift: GiftIcon,
  mission: MissionIcon,
  book: BookIcon,
  shop: ShopIcon,
  capsule: CapsuleIcon,
  star: StarIcon,
  game: JoystickIcon,
  pet: PetIcon,
};

/** 받기 목표(선물·미션·세트·가게)를 바로 실행한다. ref 로 즉시 잠가 연타해도 한 번만. 받은 코인(없으면 0) */
function useGoalClaim(): (goal: Goal, from: HTMLElement | null) => number {
  const claimGift = useGameStore((s) => s.claimGift);
  const claimMission = useGameStore((s) => s.claimMission);
  const claimMissionBonus = useGameStore((s) => s.claimMissionBonus);
  const claimSet = useGameStore((s) => s.claimSet);
  const claimShop = useShopClaim();
  const lockRef = useRef(false);
  return (goal, from) => {
    if (lockRef.current) return 0;
    lockRef.current = true;
    window.setTimeout(() => {
      lockRef.current = false;
    }, 600);
    const a = goal.action;
    // 가게는 useShopClaim 이 소리·진동·코인 날리기까지 한다
    if (a.type === 'claim-shop') return claimShop(from);
    let coins = 0;
    if (a.type === 'claim-gift') {
      const r = claimGift();
      coins = r.ok ? r.coins : 0;
    } else if (a.type === 'claim-mission') {
      const r = claimMission(a.id);
      coins = r.ok ? r.coins : 0;
    } else if (a.type === 'claim-mission-bonus') {
      coins = claimMissionBonus();
    } else if (a.type === 'claim-set') {
      const r = claimSet(a.id);
      coins = r.ok ? r.coins : 0;
    }
    if (coins <= 0) {
      sfx.fail();
      return 0;
    }
    sfx.coin();
    sfx.success();
    haptic('success');
    if (from) flyCoins(from, coins);
    return coins;
  };
}

function Meter({ goal }: { goal: Goal }) {
  const fr = goal.firstRun?.progress;
  if (fr) {
    // 첫걸음: 단계 수만큼 나눈 막대 (차례가 있는 일이라 칸으로 보여 준다)
    return (
      <span className="goal-card__meter">
        <span className="goal-card__steps" aria-hidden="true">
          {fr.steps.map((s) => (
            <span key={s.id} className={`goal-card__step${s.done ? ' is-done' : s.id === fr.current ? ' is-now' : ''}`} />
          ))}
        </span>
        <span className="goal-card__count">
          첫걸음 {fr.done}/{fr.total}
        </span>
      </span>
    );
  }
  if (goal.progress === undefined) return null;
  return (
    <span className="goal-card__meter">
      <span className="goal-card__bar" aria-hidden="true">
        <span className="goal-card__fill" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
      </span>
      {goal.progressText && <span className="goal-card__count">{goal.progressText}</span>}
    </span>
  );
}

/**
 * 홈 "다음 목표" 카드: 지금 할 한 가지(goals/nextGoal.ts). 카드 전체가 버튼 하나 — 오른쪽 딸기우유 알약이 그 행동 이름.
 * 이동 목표는 링크, 받기 목표는 그 자리에서 받고(코인이 위 알약으로 날아감) 바로 다음 목표로 바뀐다.
 */
export function GoalCard({ goal }: { goal: Goal }) {
  const claim = useGoalClaim();
  const ref = useRef<HTMLElement | null>(null);
  const [said, setSaid] = useState('');
  const Icon = ICONS[goal.icon];
  const a = goal.action;
  // 목표가 바뀌었을 때만 폴짝 (처음 그릴 때는 가만히)
  const shownKey = useRef(goal.key);
  const changed = shownKey.current !== goal.key;
  useEffect(() => {
    shownKey.current = goal.key;
  }, [goal.key]);
  const className = `goal-card goal-card--${goal.icon}${changed ? ' is-new' : ''}`;

  const inner: ReactNode = (
    <>
      <span className="goal-card__icon" aria-hidden="true">
        <Icon size={30} />
      </span>
      <span className="goal-card__body">
        <span className="goal-card__title">{goal.title}</span>
        <span className="goal-card__detail">{goal.detail}</span>
        <Meter goal={goal} />
      </span>
      <span className="goal-card__cta">{goal.cta}</span>
    </>
  );

  return (
    <section className="goal" aria-labelledby="goal-heading">
      <h2 id="goal-heading" className="visually-hidden">
        다음 목표
      </h2>
      {/* key: 목표가 바뀌면 새로 그린다 (링크 ↔ 버튼이 섞이지 않게) */}
      {a.type === 'route' ? (
        <Link
          key={goal.key}
          id="home-goal"
          ref={(el) => {
            ref.current = el;
          }}
          to={a.to}
          state={a.tab ? { tab: a.tab } : undefined}
          className={className}
          onClick={() => sfx.button()}
        >
          {inner}
        </Link>
      ) : (
        <button
          key={goal.key}
          id="home-goal"
          ref={(el) => {
            ref.current = el;
          }}
          type="button"
          className={className}
          onClick={() => {
            const coins = claim(goal, ref.current?.querySelector<HTMLElement>('.goal-card__cta') ?? ref.current);
            if (coins > 0) setSaid(`${coins.toLocaleString()}코인을 받았어요`);
          }}
        >
          {inner}
        </button>
      )}
      <p className="visually-hidden" role="status">
        {said}
      </p>
    </section>
  );
}
