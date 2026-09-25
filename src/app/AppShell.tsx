import { Outlet } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';

export function AppShell() {
  return (
    <div className="app">
      <main className="app-main" id="main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
