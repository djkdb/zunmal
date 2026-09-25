import { INK, sparklePath } from './helpers';
import { RainbowStops } from './effects';
import type { ShapeSpec } from './shapes';

/**
 * "반짝" 변종: 몸통 테두리 안쪽 무지개 림 + 대각선으로 지나가는 호일 광택 + 주변 네 갈래 반짝이.
 * 색상 회전(shinyColor)은 Malang에서 몸통 색에 적용한다.
 */

export function ShinyDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-shiny-rim`} x1="0" y1="0" x2="1" y2="1">
        <RainbowStops />
      </linearGradient>
      <linearGradient id={`${uid}-shiny-sheen`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="30%" stopColor="#bff3ff" stopOpacity={0.55} />
        <stop offset="50%" stopColor="#ffffff" stopOpacity={0.95} />
        <stop offset="70%" stopColor="#ffd6f2" stopOpacity={0.55} />
        <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
    </>
  );
}

/** 몸통 clip 안 */
export function ShinyOverlay({ uid, shape }: { uid: string; shape: ShapeSpec }) {
  const midY = (shape.top + shape.bottom) / 2;
  return (
    <g className="malang-shiny">
      <path d={shape.body} fill="none" stroke={`url(#${uid}-shiny-rim)`} strokeWidth={11} />
      <g transform={`rotate(24 60 ${midY})`}>
        <rect className="malang-sheen" x={30} y={-40} width={26} height={220} fill={`url(#${uid}-shiny-sheen)`} />
      </g>
    </g>
  );
}

/** 몸통 바깥 반짝이 (viewBox 안) */
export function ShinySparkles() {
  const items: [number, number, number, string, string][] = [
    [-2, 30, 9.5, '#fffbe0', ''],
    [120, 36, 7, '#e3d4ff', 'malang-pop--late'],
    [116, 110, 7.5, '#d4f6ff', 'malang-pop--mid'],
    [2, 108, 5.5, '#ffe0f2', 'malang-pop--late'],
  ];
  return (
    <g className="malang-shiny-sparkles">
      {items.map(([x, y, r, fill, cls]) => (
        <path
          key={`${x}-${y}`}
          className={`malang-pop ${cls}`}
          d={sparklePath(x, y, r, 0.16)}
          fill={fill}
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
