import { useId } from 'react';
import type { ReactionArea, ReactionGesture } from '../../touch/reactions';

const INK = '#2b2233';
const HOT = '#ff7aa2';

/** 영역 강조 사각형 (64×64 그림 좌표, 몸통 = 원 cx32 cy36 r22) */
const AREA_CLIP: Record<ReactionArea, { x: number; y: number; w: number; h: number }[]> = {
  head: [{ x: 0, y: 0, w: 64, h: 29 }],
  cheek: [
    { x: 0, y: 29, w: 21, h: 40 },
    { x: 43, y: 29, w: 21, h: 40 },
  ],
  belly: [{ x: 21, y: 29, w: 22, h: 40 }],
  body: [{ x: 0, y: 0, w: 64, h: 64 }],
};

/** 손짓 표시가 놓이는 곳 */
const SPOT: Record<ReactionArea, { x: number; y: number }> = {
  head: { x: 32, y: 20 },
  cheek: { x: 16, y: 40 },
  belly: { x: 32, y: 45 },
  body: { x: 32, y: 36 },
};

function Dot({ x, y, r = 4 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={2.2} />;
}

function Marks({ gesture, at }: { gesture: ReactionGesture; at: { x: number; y: number } }) {
  const { x, y } = at;
  const line = { stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (gesture) {
    case 'press':
      return (
        <g>
          <path d={`M${x} ${y - 20} v10 M${x - 4} ${y - 14} l4 4 l4 -4`} {...line} />
          <ellipse cx={x} cy={y + 1} rx={9} ry={3.5} {...line} strokeDasharray="2 3" />
          <Dot x={x} y={y - 3} />
        </g>
      );
    case 'pull':
      return (
        <g>
          <path d={`M${x} ${y - 4} V${y - 26} M${x - 5} ${y - 21} l5 -5 l5 5`} {...line} />
          <Dot x={x} y={y - 2} />
        </g>
      );
    case 'poke':
      return (
        <g>
          <path d={`M${x - 10} ${y - 9} l3 3 M${x + 10} ${y - 9} l-3 3 M${x} ${y - 13} v4`} {...line} />
          <Dot x={x} y={y} />
        </g>
      );
    case 'carry':
      return (
        <g>
          <path d={`M${x} ${y} C${x + 10} ${y - 22} ${x + 22} ${y - 20} ${x + 26} ${y - 6} M${x + 21} ${y - 9} l5 3 l2 -6`} {...line} />
          <Dot x={x} y={y} />
        </g>
      );
    case 'rub':
      return (
        <g>
          <path d={`M${x - 14} ${y} H${x + 14} M${x - 10} ${y - 4} l-4 4 l4 4 M${x + 10} ${y - 4} l4 4 l-4 4`} {...line} />
          <Dot x={x} y={y - 7} r={3.5} />
        </g>
      );
    case 'tap':
      return (
        <g>
          <path d={`M${x - 9} ${y - 7} l3 2 M${x - 10} ${y + 3} l3 -1 M${x - 3} ${y - 11} l1 3`} {...line} />
          <Dot x={x + 1} y={y} />
        </g>
      );
    case 'taps':
      return (
        <g>
          {[-9, -3, 3, 9].map((dx, i) => (
            <circle key={i} cx={x + dx} cy={y + (i % 2 === 0 ? 0 : -4)} r={2.6} fill={i === 3 ? '#fff' : HOT} stroke={INK} strokeWidth={1.8} />
          ))}
        </g>
      );
    case 'hold':
      return (
        <g>
          <circle cx={x} cy={y} r={9} {...line} strokeDasharray="42 60" transform={`rotate(-90 ${x} ${y})`} />
          <Dot x={x} y={y} />
        </g>
      );
    case 'flick':
      return (
        <g>
          <path d={`M${x - 6} ${y} L${x + 20} ${y - 18} M${x + 13} ${y - 18} h7 v7`} {...line} />
          <path d={`M${x - 2} ${y - 9} l6 -4 M${x + 2} ${y + 5} l8 -5`} {...line} strokeWidth={1.6} />
          <Dot x={x - 6} y={y} />
        </g>
      );
    case 'pats':
      return (
        <g>
          {[-10, 0, 10].map((dx, i) => (
            <path key={i} d={`M${x + dx - 4} ${y - 6} q4 -5 8 0`} {...line} />
          ))}
          <text x={x + 17} y={y - 10} fontSize={9} fill={INK} fontFamily="inherit">
            3
          </text>
          <Dot x={x} y={y + 2} r={3.5} />
        </g>
      );
    default:
      return null;
  }
}

/**
 * 반응 방법 그림: 말랑이 실루엣 + 만질 곳 강조 + 손짓 표시 (64×64). 반응 표(reactions.ts)의 gesture·area 만 읽는다.
 */
export function GestureArt({
  gesture,
  area,
  locked = false,
  size = 64,
}: {
  gesture: ReactionGesture;
  area: ReactionArea;
  locked?: boolean;
  size?: number;
}) {
  const clipId = `ga${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`gesture-art${locked ? ' is-locked' : ''}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={`${clipId}-body`}>
          <path d="M10 44 C10 22 20 12 32 12 C44 12 54 22 54 44 C54 54 46 58 32 58 C18 58 10 54 10 44 Z" />
        </clipPath>
      </defs>
      <path d="M10 44 C10 22 20 12 32 12 C44 12 54 22 54 44 C54 54 46 58 32 58 C18 58 10 54 10 44 Z" fill="#ffe1ea" />
      <g clipPath={`url(#${clipId}-body)`}>
        {AREA_CLIP[area].map((r, i) => (
          <rect key={i} {...r} fill={area === 'body' ? '#ffc4d6' : '#ff9dbb'} opacity={0.85} />
        ))}
      </g>
      <path
        d="M10 44 C10 22 20 12 32 12 C44 12 54 22 54 44 C54 54 46 58 32 58 C18 58 10 54 10 44 Z"
        fill="none"
        stroke={INK}
        strokeWidth={2.6}
      />
      <circle cx={25} cy={33} r={2.2} fill={INK} />
      <circle cx={39} cy={33} r={2.2} fill={INK} />
      <Marks gesture={gesture} at={SPOT[area]} />
    </svg>
  );
}
