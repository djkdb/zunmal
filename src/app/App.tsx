import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from '../pages/HomePage';
import { GachaPage } from '../pages/GachaPage';
import { CollectionPage } from '../pages/CollectionPage';
import { MiniGamePage } from '../pages/MiniGamePage';
import { TouchPage } from '../pages/TouchPage';

/**
 * GitHub Pages는 SPA 경로 새로고침 시 404를 반환하므로 HashRouter를 사용한다.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="gacha" element={<GachaPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="play" element={<MiniGamePage />} />
          <Route path="play/:gameId" element={<MiniGamePage />} />
          <Route path="touch" element={<TouchPage />} />
          <Route path="touch/:id" element={<TouchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
