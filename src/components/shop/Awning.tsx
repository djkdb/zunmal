import { useId } from 'react';

/**
 * 가게 차양: 딸기우유·흰 줄무늬 + 아래 물결 가장자리. 폭에 맞춰 늘어난다(viewBox 기준 줄 수 고정).
 * 홈 카드의 작은 가게와 가게 화면 간판에 함께 쓴다. 색은 모두 속성(토큰과 같은 값).
 */
export function Awning({ stripes = 8, className }: { stripes?: number; className?: string }) {
  const clip = useId();
  const w = stripes * 10;
  const scallops = stripes;
  // 아래 물결: 줄마다 반원 하나
  let d = `M0 0 H${w} V12`;
  for (let i = scallops - 1; i >= 0; i--) {
    const x0 = (i + 1) * 10;
    d += ` Q${x0 - 5} 20 ${x0 - 10} 12`;
  }
  d += ' Z';
  return (
    <svg className={className} viewBox={`0 0 ${w} 20`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={w} height="20" fill="#ffffff" />
        {Array.from({ length: stripes }, (_, i) =>
          i % 2 === 0 ? <rect key={i} x={i * 10} width="10" height="20" fill="#ff9fb8" /> : null,
        )}
        {/* 위쪽 그늘 한 줄 — 천이 말려 들어간 느낌 */}
        <rect width={w} height="2.2" fill="rgba(184, 69, 111, 0.18)" />
      </g>
    </svg>
  );
}
