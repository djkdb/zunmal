import { useEffect } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { installAudioUnlock, sfx } from '../audio/sfx';
import { useRouteMusic } from '../audio/useRouteMusic';
import { BottomNav } from '../components/BottomNav';
import { StarterPicker } from '../components/StarterPicker';
import { TopBar } from '../components/TopBar';
import { useGameStore } from '../store/useGameStore';

export function AppShell() {
  const needsStarter = useGameStore((s) => Object.keys(s.ownedMalangs).length === 0);
  const sfxOn = useGameStore((s) => s.settings.sfxOn);
  const musicOn = useGameStore((s) => s.settings.musicOn);
  const refreshDaily = useGameStore((s) => s.refreshDaily);
  // 게임 플레이 중에는 하단 내비게이션을 숨겨 조작 영역을 확보한다
  const inGame = useMatch('/play/:gameId') !== null;

  // 화면을 옮기면 항상 맨 위에서 시작 (이전 화면의 스크롤 위치가 남지 않도록)
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
      <TopBar />
      <main className={`app-main${inGame ? ' app-main--game' : ''}`} id="main" tabIndex={-1}>
        {needsStarter ? <StarterPicker /> : <Outlet />}
      </main>
      {!needsStarter && !inGame && <BottomNav />}
    </div>
  );
}
