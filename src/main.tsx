import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 글꼴(번들 포함, 유니코드 범위 조각이라 화면에 나온 글자 조각만 받는다): 제목 고운돋움, 본문 Pretendard
import '@fontsource/gowun-dodum/400.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
// 전역 스타일을 먼저 불러와야 컴포넌트 CSS가 같은 우선순위에서 전역 규칙을 덮어쓸 수 있다
import './styles/global.css';
// 저장이 지워졌으면 스토어가 읽기 전에 백업으로 되돌린다 (App보다 먼저 import)
import './app/restoreSave';
import { App } from './app/App';
import { captureInstallPrompt, registerServiceWorker } from './app/installPrompt';

// 홈 화면 추가: 설치 이벤트는 앱이 뜨자마자 오므로 렌더 전에 붙잡는다
captureInstallPrompt();
registerServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
