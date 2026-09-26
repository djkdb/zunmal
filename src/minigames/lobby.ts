import type { MiniGame, MiniGameTag } from './types';

/**
 * 로비 칩 줄 (순수). 게임마다 meta에 적은 딱지(`MiniGame.tags`) + 한 판 길이에서 계산한 "짧게".
 * 칩 순서 = 로비에 보이는 순서. 처음은 항상 "전체".
 */
export type LobbyFilter = 'all' | 'short' | MiniGameTag;

/** 이 길이 이하면 "짧게" (30초 — 버스 한 정거장 사이에 한 판) */
export const SHORT_PLAY_MS = 30_000;

export const LOBBY_FILTERS: readonly LobbyFilter[] = ['all', 'pick', 'short', 'feel', 'record', 'focus'];

export const LOBBY_FILTER_LABELS: Readonly<Record<LobbyFilter, string>> = {
  all: '전체',
  pick: '추천',
  short: '짧게',
  feel: '손맛',
  record: '기록 도전',
  focus: '집중',
};

export function isLobbyFilter(value: unknown): value is LobbyFilter {
  return typeof value === 'string' && (LOBBY_FILTERS as readonly string[]).includes(value);
}

export function matchesFilter(game: Pick<MiniGame, 'durationMs' | 'tags'>, filter: LobbyFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'short') return game.durationMs <= SHORT_PLAY_MS;
  return game.tags.includes(filter);
}

/** 고른 칩에 맞는 게임만 (registry 순서 유지) */
export function filterGames<G extends Pick<MiniGame, 'durationMs' | 'tags'>>(games: readonly G[], filter: LobbyFilter): G[] {
  return games.filter((g) => matchesFilter(g, filter));
}
