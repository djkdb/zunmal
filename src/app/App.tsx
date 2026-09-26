import { Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from '../pages/HomePage';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PageLoading } from '../components/PageLoading';
import { useSaveGuard } from './useSaveGuard';
import { ROUTE_CHUNKS } from './routeChunks';

// 홈만 첫 화면 번들에 두고 나머지 화면(뽑기·도감·미니게임 12종·가게·놀이방)은 들어갈 때 받는다 (app/routeChunks.ts).
// 홈과 하단 탭이 다음 화면을 한가할 때·손가락이 닿을 때 미리 받아 두므로 전환은 그대로 빠르다.
const { gacha: Gacha, collection: Collection, play: Play, shop: Shop, touch: Touch } = ROUTE_CHUNKS;

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

/**
 * GitHub Pages는 SPA 경로 새로고침 시 404를 반환하므로 HashRouter를 사용한다.
 */
export function App() {
  useSaveGuard();
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="gacha" element={<Lazy><Gacha.Page /></Lazy>} />
            <Route path="collection" element={<Lazy><Collection.Page /></Lazy>} />
            <Route path="play" element={<Lazy><Play.Page /></Lazy>} />
            <Route path="play/:gameId" element={<Lazy><Play.Page /></Lazy>} />
            <Route path="shop" element={<Lazy><Shop.Page /></Lazy>} />
            <Route path="touch" element={<Lazy><Touch.Page /></Lazy>} />
            <Route path="touch/:id" element={<Lazy><Touch.Page /></Lazy>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
