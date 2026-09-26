import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { seoulDateKey } from '../economy/daily';
import { generateDailyMissions, hasClaimable, rollMissions } from '../missions/missions';
import { useGameStore } from '../store/useGameStore';
import { BookIcon, CapsuleIcon, JoystickIcon, PetIcon, ShopIcon } from './icons';

const NAV_ITEMS: { to: string; label: string; Icon: ComponentType<{ size?: number }>; end: boolean }[] = [
  { to: '/', label: '홈', Icon: ShopIcon, end: true },
  { to: '/play', label: '미니게임', Icon: JoystickIcon, end: false },
  { to: '/touch', label: '만지기', Icon: PetIcon, end: false },
  { to: '/gacha', label: '뽑기', Icon: CapsuleIcon, end: false },
  { to: '/collection', label: '도감', Icon: BookIcon, end: false },
];

/** 받을 수 있는 미션 보상이 있는가 → 홈 탭에 알림 점 */
function useMissionAlert(): boolean {
  const missions = useGameStore((s) => s.missions);
  const state = rollMissions(missions, seoulDateKey());
  return hasClaimable(state, generateDailyMissions(state.date));
}

export function BottomNav() {
  const missionAlert = useMissionAlert();
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}>
          <span className="bottom-nav__icon">
            <Icon size={22} />
            {to === '/' && missionAlert && <span className="bottom-nav__dot" />}
          </span>
          <span>
            {label}
            {to === '/' && missionAlert && <span className="visually-hidden">, 받을 미션 보상 있음</span>}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
