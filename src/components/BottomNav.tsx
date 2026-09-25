import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: '홈', icon: '🏠', end: true },
  { to: '/play', label: '미니게임', icon: '🎮', end: false },
  { to: '/gacha', label: '뽑기', icon: '🎰', end: false },
  { to: '/collection', label: '도감', icon: '📖', end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
