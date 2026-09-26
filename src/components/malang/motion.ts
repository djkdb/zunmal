/**
 * 화면 밖 말랑이의 CSS 애니메이션 멈춤.
 * 모든 인스턴스가 IntersectionObserver 하나를 같이 쓰고, React 상태 대신 data 속성만 바꾼다
 * (다시 그리지 않는다). CSS가 `.malang[data-offscreen] *`의 animation-play-state를 멈춘다.
 * svg 자신이 아니라 자손만 멈추므로, 부모가 svg를 움직여 화면 안으로 들여오는 연출은 막지 않는다.
 */

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as SVGElement;
        if (e.isIntersecting) delete el.dataset.offscreen;
        else el.dataset.offscreen = '';
      }
    },
    { rootMargin: '80px' },
  );
  return observer;
}

/** 관찰을 시작하고 해제 함수를 돌려준다 (useEffect에서 쓴다) */
export function pauseWhenOffscreen(el: SVGSVGElement): () => void {
  const io = getObserver();
  if (!io) return () => {};
  io.observe(el);
  return () => {
    io.unobserve(el);
    delete el.dataset.offscreen;
  };
}

/** 탭 찌그러짐: 0.82배로 눌렸다가 스프링처럼 두세 번 출렁이고 멈춘다 (약 0.62초) */
export const POKE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1, 1)', easing: 'cubic-bezier(0.2, 0, 0.4, 1)' },
  { transform: 'scale(1.18, 0.82)', offset: 0.16, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
  { transform: 'scale(0.9, 1.11)', offset: 0.38, easing: 'ease-in-out' },
  { transform: 'scale(1.05, 0.955)', offset: 0.58, easing: 'ease-in-out' },
  { transform: 'scale(0.985, 1.015)', offset: 0.78, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' },
];
export const POKE_MS = 620;
