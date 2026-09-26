import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { music, trackForPath } from './music';

/**
 * 지금 경로에 맞는 배경음악을 고른다. AppShell에서 한 번만 부른다.
 * 첫 사용자 입력 전에는 곡만 기억해 두고, 잠금 해제되는 순간 music 엔진이 재생을 시작한다.
 */
export function useRouteMusic(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    music.setTrack(trackForPath(pathname));
  }, [pathname]);
}
