import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import type { HubState } from '../../goals/hubState';
import { todayLoop, type TodayItem, type TodayItemId } from '../../goals/today';
import { CapsuleIcon, CheckIcon, GiftIcon, JoystickIcon, MissionIcon, ShopIcon } from '../icons';
import './TodayStrip.css';

const ICONS: Record<TodayItemId, ComponentType<{ size?: number }>> = {
  gift: GiftIcon,
  missions: MissionIcon,
  shop: ShopIcon,
  play: JoystickIcon,
  pull: CapsuleIcon,
};

/** 같은 홈 화면 안의 카드로: 부드럽게 스크롤하고 그 버튼·제목에 초점 */
function focusOnHome(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  // 제목처럼 원래 초점을 못 받는 곳도 화면 읽기가 따라오게
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/** 칸을 누르면 갈 곳: 화면 안 카드(선물 말풍선·미션·가게) 또는 다른 화면 */
const TARGET: Record<TodayItemId, { focus: string } | { to: string }> = {
  gift: { focus: 'home-gift-open' },
  missions: { focus: 'missions-title' },
  shop: { focus: 'shop-card-title' },
  play: { to: '/play' },
  pull: { to: '/gacha' },
};

function Dot({ item }: { item: TodayItem }) {
  const Icon = ICONS[item.id];
  return (
    <>
      <span className="today__dot" aria-hidden="true">
        <Icon size={24} />
        {item.state === 'done' && (
          <span className="today__check">
            <CheckIcon size={12} />
          </span>
        )}
      </span>
      <span className="today__label" aria-hidden="true">
        {item.state === 'later' ? '내일' : item.label}
      </span>
      <span className="visually-hidden">{item.description}</span>
    </>
  );
}

/**
 * 홈 "오늘" 줄: 선물 → 미션 → 가게 → 미니게임 → 뽑기. 한 칸은 체크, 할 수 있는 칸은 레몬 고리.
 * 출석부가 아니라 하루 흐름 안내라 가볍게 — 상태는 모두 저장 값에서 계산(goals/today.ts).
 */
export function TodayStrip({ hub }: { hub: HubState }) {
  const loop = todayLoop(hub);
  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today__head">
        <h2 id="today-title" className="today__title">
          오늘
        </h2>
        <span className="today__count">
          {loop.done}/{loop.total}
          <span className="visually-hidden">개 했어요</span>
        </span>
      </div>
      <ol className="today__list">
        {loop.items.map((item) => {
          const target = TARGET[item.id];
          const cls = `today__item is-${item.state}`;
          // 할 게 없는 선물 칸(받았거나 내일)은 누를 곳이 아니다
          if (item.id === 'gift' && item.state !== 'ready') {
            return (
              <li key={item.id} className={cls}>
                <span className="today__hit">
                  <Dot item={item} />
                </span>
              </li>
            );
          }
          return (
            <li key={item.id} className={cls}>
              {'to' in target ? (
                <Link to={target.to} className="today__hit" onClick={() => sfx.button()}>
                  <Dot item={item} />
                </Link>
              ) : (
                <button
                  type="button"
                  className="today__hit"
                  onClick={() => {
                    sfx.button();
                    focusOnHome(item.id === 'gift' && !document.getElementById(target.focus) ? 'home-goal' : target.focus);
                  }}
                >
                  <Dot item={item} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
