import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { BookIcon, CapsuleIcon, JoystickIcon, ShopIcon } from './icons';

const NAV_ITEMS: { to: string; label: string; Icon: ComponentType<{ size?: number }>; end: boolean }[] = [
  { to: '/', label: '가게', Icon: ShopIcon, end: true },
  { to: '/play', label: '미니게임', Icon: JoystickIcon, end: false },
  { to: '/gacha', label: '뽑기', Icon: CapsuleIcon, end: false },
  { to: '/collection', label: '도감', Icon: BookIcon, end: false },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}>
          <span className="bottom-nav__icon">
            <Icon size={26} />
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
