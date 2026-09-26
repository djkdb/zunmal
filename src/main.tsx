import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 글꼴(번들 포함, 유니코드 범위 조각이라 화면에 나온 글자 조각만 받는다): 제목 주아.
// 본문 나눔스퀘어라운드는 global.css @font-face, Pretendard는 드문 글자 대신 그리기용
import '@fontsource/jua/400.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
// 전역 스타일을 먼저 불러와야 컴포넌트 CSS가 같은 우선순위에서 전역 규칙을 덮어쓸 수 있다
import './styles/global.css';
// 저장이 지워졌으면 스토어가 읽기 전에 백업으로 되돌린다 (App보다 먼저 import)
import './app/restoreSave';
import { App } from './app/App';
import { captureInstallPrompt, registerServiceWorker } from './app/installPrompt';
import { captureCouponLink } from './app/couponLink';

// 홈 화면 추가: 설치 이벤트는 앱이 뜨자마자 오므로 렌더 전에 붙잡는다
captureInstallPrompt();
// 선물 링크(?c=코드): 라우터가 주소를 읽기 전에 코드를 꺼내고 주소에서 지운다
captureCouponLink();
registerServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
