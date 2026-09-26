import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { homeAlerts } from '../goals/alerts';
import { useHub } from './home/useHub';
import { BookIcon, CapsuleIcon, JoystickIcon, PetIcon, ShopIcon } from './icons';

const NAV_ITEMS: { to: string; label: string; Icon: ComponentType<{ size?: number }>; end: boolean }[] = [
  { to: '/', label: '홈', Icon: ShopIcon, end: true },
  { to: '/play', label: '미니게임', Icon: JoystickIcon, end: false },
  { to: '/touch', label: '만지기', Icon: PetIcon, end: false },
  { to: '/gacha', label: '뽑기', Icon: CapsuleIcon, end: false },
  { to: '/collection', label: '도감', Icon: BookIcon, end: false },
];

/** 홈 탭 알림 점: 받을 선물·미션·세트 보상, 가득 찬 가게, 열지 않은 캡슐 (goals/alerts.ts) */
export function BottomNav() {
  const alerts = homeAlerts(useHub(30_000));
  const homeAlert = alerts.any;
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}>
          <span className="bottom-nav__icon">
            <Icon size={22} />
            {to === '/' && homeAlert && <span className="bottom-nav__dot" />}
          </span>
          <span>
            {label}
            {to === '/' && homeAlert && <span className="visually-hidden">, {alerts.label}</span>}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
