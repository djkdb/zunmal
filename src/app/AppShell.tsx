import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { installAudioUnlock, sfx } from '../audio/sfx';
import { useRouteMusic } from '../audio/useRouteMusic';
import { BottomNav } from '../components/BottomNav';
import { CoinBurst } from '../components/CoinBurst';
import { StarterPicker } from '../components/StarterPicker';
import { TopBar } from '../components/TopBar';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGameStore } from '../store/useGameStore';

/** 화면 전환: 새 화면이 살짝 아래에서 떠오르며 나타난다. transform/opacity만 쓰고, 끝나면 흔적을 남기지 않는다. */
const ROUTE_ENTER: Keyframe[] = [
  { opacity: 0, transform: 'translateY(10px)' },
  { opacity: 1, transform: 'none' },
];
const ROUTE_ENTER_MS = 200;

export function AppShell() {
  const needsStarter = useGameStore((s) => Object.keys(s.ownedMalangs).length === 0);
  const sfxOn = useGameStore((s) => s.settings.sfxOn);
  const musicOn = useGameStore((s) => s.settings.musicOn);
  const refreshDaily = useGameStore((s) => s.refreshDaily);
  // 게임 플레이 중에는 하단 내비게이션을 숨겨 조작 영역을 확보한다
  const inGame = useMatch('/play/:gameId') !== null;
  // 놀이방(만지기)은 화면 전체가 놀이 매트인 독립 창: 위 막대·아래 탭을 모두 숨긴다
  const inPlayroom = useMatch('/touch/*') !== null;

  // 화면을 옮기면 항상 맨 위에서 시작 (이전 화면의 스크롤 위치가 남지 않도록)
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // 화면 전환 연출 (첫 화면은 제외, 움직임 줄이기면 없음). 페이지를 다시 만들지 않고 main만 움직인다.
  const reduced = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const prevPath = useRef(pathname);
  useLayoutEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    const el = mainRef.current;
    if (reduced || !el || typeof el.animate !== 'function') return;
    const a = el.animate(ROUTE_ENTER, { duration: ROUTE_ENTER_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    return () => a.cancel();
  }, [pathname]);

  // iOS Safari는 터치 리스너가 있어야 :active(젤리 눌림)를 켠다
  useEffect(() => {
    const noop = () => undefined;
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  // 첫 사용자 입력 이후에만 AudioContext 생성 (iOS 중단 뒤 재개·화면 숨김 처리 포함)
  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    sfx.setSettings({ sfxOn, musicOn });
  }, [sfxOn, musicOn]);

  // 화면별 배경음악 (첫 입력 뒤에만 재생)
  useRouteMusic();

  // 서울 날짜 변경 시 일일 한도 초기화 (앱 진입 / 탭 복귀 시)
  useEffect(() => {
    refreshDaily();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDaily();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshDaily]);

  return (
    <div className="app">
      {/* HashRouter에서는 #main 링크가 라우트를 바꾸므로 버튼으로 포커스를 이동한다 */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        본문으로 건너뛰기
      </button>
      {!(inPlayroom && !needsStarter) && <TopBar />}
      <main
        ref={mainRef}
        className={`app-main${inGame ? ' app-main--game' : ''}${inPlayroom ? ' app-main--playroom' : ''}`}
        id="main"
        tabIndex={-1}
      >
        {needsStarter ? <StarterPicker /> : <Outlet />}
      </main>
      {!needsStarter && !inGame && !inPlayroom && <BottomNav />}
      <CoinBurst />
    </div>
  );
}
