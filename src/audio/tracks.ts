/**
 * 경로 → 배경음악 곡 (순수). 첫 화면 번들에는 이 작은 모듈만 들어가고, 곡을 만드는 `music.ts`는
 * 첫 사용자 입력 뒤 음악이 켜져 있을 때 `useRouteMusic`이 따로 받는다.
 */
export type TrackId = 'home' | 'collection' | 'touch' | 'gacha' | 'minigame';

/** 박자 게임(리듬)은 음악과 박자가 부딪히므로 조용히 둔다. */
export const QUIET_GAME_IDS: readonly string[] = ['rhythm'];

export function trackForPath(pathname: string): TrackId | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path.startsWith('/play')) {
    const gameId = path.split('/')[2];
    return gameId && QUIET_GAME_IDS.includes(gameId) ? null : 'minigame';
  }
  if (path.startsWith('/gacha')) return 'gacha';
  if (path.startsWith('/collection')) return 'collection';
  // 디저트 가게: 도감과 같은 느긋한 곡
  if (path.startsWith('/shop')) return 'collection';
  if (path.startsWith('/touch')) return 'touch';
  return 'home';
}
