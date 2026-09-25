import type { MalangPattern } from '../../data/characters';
import { isDark, lighten } from '../../lib/color';
import { avoidFace, type Point } from './helpers';
import type { ShapeSpec } from './shapes';

/** 반복 타일 무늬 (dots/stripes/sparkles) — <pattern> 정의 */
export function PatternDef({ id, kind, color }: { id: string; kind: MalangPattern; color: string }) {
  const fg = isDark(color) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)';
  switch (kind) {
    case 'dots':
      return (
        <pattern id={id} width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={4} cy={4} r={2.4} fill={fg} />
          <circle cx={12} cy={12} r={2.4} fill={fg} />
        </pattern>
      );
    case 'stripes':
      return (
        <pattern id={id} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width={6} height={14} fill={fg} />
        </pattern>
      );
    case 'sparkles':
      return (
        <pattern id={id} width={26} height={26} patternUnits="userSpaceOnUse">
          <path d="M6 2 L7 5 L10 6 L7 7 L6 10 L5 7 L2 6 L5 5 Z" fill={fg} />
          <circle cx={19} cy={18} r={1.6} fill={fg} />
        </pattern>
      );
    default:
      return null;
  }
}

export function isTilePattern(kind: MalangPattern): boolean {
  return kind === 'dots' || kind === 'stripes' || kind === 'sparkles';
}

const CHIP_SPOTS: (Point & { r: number })[] = [
  { x: 34, y: 54, r: 20 },
  { x: 56, y: 44, r: -30 },
  { x: 80, y: 50, r: 60 },
  { x: 96, y: 72, r: 10 },
  { x: 22, y: 82, r: -50 },
  { x: 36, y: 98, r: 35 },
  { x: 62, y: 102, r: -10 },
  { x: 86, y: 96, r: 80 },
  { x: 100, y: 90, r: -25 },
  { x: 72, y: 62, r: 45 },
  { x: 44, y: 70, r: 0 },
];

const BOBA_SPOTS: Point[] = [
  { x: 26, y: 96 },
  { x: 38, y: 102 },
  { x: 52, y: 104 },
  { x: 66, y: 104 },
  { x: 80, y: 102 },
  { x: 93, y: 97 },
  { x: 31, y: 88 },
  { x: 45, y: 94 },
  { x: 73, y: 94 },
  { x: 88, y: 88 },
  { x: 59, y: 95 },
  { x: 100, y: 86 },
  { x: 20, y: 86 },
];

/** 몸통 clip 안에 흩뿌리는 무늬 (chips/boba). 얼굴은 비워 둔다. */
export function ScatterPattern({ kind, shape, accent }: { kind: MalangPattern; shape: ShapeSpec; accent: string }) {
  if (kind === 'chips') {
    const spots = avoidFace(CHIP_SPOTS, shape.faceY);
    return (
      <g className="malang-pattern">
        {spots.map((p) => (
          <g key={`${p.x}-${p.y}`} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`}>
            <path d="M-4.6 -2.6 Q-1 -6 3.8 -3.8 Q6.2 0 3.6 3.6 Q-0.6 6 -4 3.4 Q-6.4 0.4 -4.6 -2.6 Z" fill={accent} />
            <path d="M-2.6 -2.4 Q-0.4 -3.8 1.6 -3" stroke={lighten(accent, 0.45)} strokeWidth={1.2} strokeLinecap="round" fill="none" />
          </g>
        ))}
      </g>
    );
  }
  if (kind === 'boba') {
    const spots = avoidFace(BOBA_SPOTS, shape.faceY, 30, 14);
    return (
      <g className="malang-pattern">
        {/* 밀크티 아래쪽이 조금 더 진하다 */}
        <ellipse cx={60} cy={shape.bottom + 4} rx={60} ry={22} fill={accent} opacity={0.12} />
        {spots.map((p) => (
          <g key={`${p.x}-${p.y}`}>
            <circle cx={p.x} cy={p.y} r={5.2} fill={accent} />
            <circle cx={p.x - 1.6} cy={p.y - 1.8} r={1.5} fill="#fff" opacity={0.75} />
          </g>
        ))}
      </g>
    );
  }
  return null;
}
