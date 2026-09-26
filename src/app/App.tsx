import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from '../pages/HomePage';
import { GachaPage } from '../pages/GachaPage';
import { CollectionPage } from '../pages/CollectionPage';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useSaveGuard } from './useSaveGuard';

// 미니게임 12종, 디저트 가게 화면, 놀이방(물리·3D 준비 코드)은 들어갈 때만 받는다 — 첫 화면(인스타 링크) 로딩을 가볍게
const MiniGamePage = lazy(() => import('../pages/MiniGamePage').then((m) => ({ default: m.MiniGamePage })));
const ShopPage = lazy(() => import('../pages/ShopPage').then((m) => ({ default: m.ShopPage })));
const TouchPage = lazy(() => import('../pages/TouchPage').then((m) => ({ default: m.TouchPage })));

function PageLoading() {
  return <p className="page-loading" role="status">잠시만요…</p>;
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
            <Route path="gacha" element={<GachaPage />} />
            <Route path="collection" element={<CollectionPage />} />
            <Route path="play" element={<Suspense fallback={<PageLoading />}><MiniGamePage /></Suspense>} />
            <Route path="play/:gameId" element={<Suspense fallback={<PageLoading />}><MiniGamePage /></Suspense>} />
            <Route path="shop" element={<Suspense fallback={<PageLoading />}><ShopPage /></Suspense>} />
            <Route path="touch" element={<Suspense fallback={<PageLoading />}><TouchPage /></Suspense>} />
            <Route path="touch/:id" element={<Suspense fallback={<PageLoading />}><TouchPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
