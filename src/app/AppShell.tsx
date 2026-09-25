import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { installAudioUnlock, sfx } from '../audio/sfx';
import { BottomNav } from '../components/BottomNav';
import { StarterPicker } from '../components/StarterPicker';
import { TopBar } from '../components/TopBar';
import { useGameStore } from '../store/useGameStore';

export function AppShell() {
  const needsStarter = useGameStore((s) => Object.keys(s.ownedMalangs).length === 0);
  const muted = useGameStore((s) => s.settings.muted);
  const refreshDaily = useGameStore((s) => s.refreshDaily);

  // 첫 사용자 입력 이후에만 AudioContext 생성
  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    sfx.setMuted(muted);
  }, [muted]);

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
      <main className="app-main" id="main" tabIndex={-1}>
        {needsStarter ? <StarterPicker /> : <Outlet />}
      </main>
      {!needsStarter && <BottomNav />}
    </div>
  );
}
