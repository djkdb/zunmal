import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sfx } from './sfx';
import { trackForPath, type TrackId } from './tracks';

/**
 * 곡을 만드는 music.ts(악절 생성·음색·스케줄러)는 첫 화면 번들에 넣지 않는다 — 첫 사용자 입력으로 소리가 풀리고
 * 음악이 켜져 있을 때 한 번 받는다. 그때까지는 원하는 곡만 기억해 둔다(예전에도 잠금 해제 전에는 기억만 했다).
 */
let desired: TrackId | null = null;
let engine: { setTrack(id: TrackId | null): void } | null = null;
let loading = false;

function ensureMusic(): void {
  if (engine || loading || !sfx.isUnlocked() || !sfx.isMusicEnabled()) return;
  loading = true;
  import('./music')
    .then(({ music }) => {
      engine = music;
      music.setTrack(desired);
    })
    .catch(() => {
      loading = false; // 연결이 끊겼으면 다음 입력·설정 변경 때 다시
    });
}

let subscribed = false;

/**
 * 지금 경로에 맞는 배경음악을 고른다. AppShell에서 한 번만 부른다.
 */
export function useRouteMusic(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (subscribed) return;
    subscribed = true;
    sfx.onChange(ensureMusic);
    ensureMusic();
  }, []);
  useEffect(() => {
    desired = trackForPath(pathname);
    engine?.setTrack(desired);
  }, [pathname]);
}
