import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 전역 스타일을 먼저 불러와야 컴포넌트 CSS가 같은 우선순위에서 전역 규칙을 덮어쓸 수 있다
import './styles/global.css';
import { App } from './app/App';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
