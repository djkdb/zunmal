import { lazy, type ComponentType } from 'react';

/**
 * 홈을 뺀 화면은 들어갈 때 받는 청크다 — 첫 화면(인스타 링크) 로딩을 가볍게.
 * 대신 다음에 갈 것 같은 화면은 미리 받아 둬서(`prefetchRoute`) 누르는 순간 바로 뜬다.
 * 같은 import()를 다시 부르면 브라우저·번들러가 같은 모듈을 돌려주므로 미리 받기와 lazy가 한 번만 받는다.
 */
interface RouteChunk {
  load(): Promise<unknown>;
  Page: ComponentType;
}

function chunk<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): RouteChunk {
  let pending: Promise<M> | null = null;
  const once = () => {
    // 실패(연결 끊김)는 기억하지 않는다 — 다음에 다시 시도
    pending ??= load().catch((e: unknown) => {
      pending = null;
      throw e;
    });
    return pending;
  };
  return { load: once, Page: lazy(() => once().then((m) => ({ default: pick(m) }))) };
}

export const ROUTE_CHUNKS = {
  gacha: chunk(() => import('../pages/GachaPage'), (m) => m.GachaPage),
  collection: chunk(() => import('../pages/CollectionPage'), (m) => m.CollectionPage),
  play: chunk(() => import('../pages/MiniGamePage'), (m) => m.MiniGamePage),
  shop: chunk(() => import('../pages/ShopPage'), (m) => m.ShopPage),
  touch: chunk(() => import('../pages/TouchPage'), (m) => m.TouchPage),
} as const;

export type RouteChunkName = keyof typeof ROUTE_CHUNKS;

/** '/gacha', '/play/stack', '#/touch/x' → 청크 이름 (홈·모르는 경로는 null) */
export function chunkForPath(path: string): RouteChunkName | null {
  const first = path.replace(/^#?\/?/, '').split(/[/?#]/)[0] ?? '';
  return Object.hasOwn(ROUTE_CHUNKS, first) ? (first as RouteChunkName) : null;
}

/** 그 화면 청크를 조용히 미리 받는다 (실패해도 조용히 — 실제로 들어갈 때 다시 시도) */
export function prefetchRoute(path: string): void {
  const name = chunkForPath(path);
  if (name) ROUTE_CHUNKS[name].load().catch(() => undefined);
}

/** 브라우저가 한가할 때 미리 받기 (데이터 절약 모드면 건너뛴다) */
export function prefetchWhenIdle(paths: readonly string[]): () => void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => undefined;
  const run = () => paths.forEach(prefetchRoute);
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(run, 1500);
  return () => window.clearTimeout(t);
}
