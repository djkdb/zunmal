import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Character, MalangAccessory, MalangEyes, MalangPattern, MalangShape } from '../data/characters';
import { darken, isDark, lighten } from '../lib/color';
import './Malang.css';

const INK = '#2b2233';

// ── 몸통 실루엣 (viewBox 0 0 120 120) ─────────────────────────

function roundedStarPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const verts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const n = verts.length;
  const start = mid(verts[0]!, verts[1]!);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const v = verts[i % n]!;
    const m = mid(v, verts[(i + 1) % n]!);
    d += ` Q${v[0].toFixed(1)} ${v[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

interface ShapeSpec {
  body: string;
  /** 얼굴 중심 y */
  faceY: number;
  /** 머리 꼭대기 y (장식 위치) */
  top: number;
  /** 눈 사이 반간격 */
  eyeGap: number;
}

const SHAPES: Record<MalangShape, ShapeSpec> = {
  round: {
    body: 'M60 30 C88 30 106 48 106 72 C106 96 86 108 60 108 C34 108 14 96 14 72 C14 48 32 30 60 30 Z',
    faceY: 70,
    top: 30,
    eyeGap: 15,
  },
  drop: {
    body: 'M60 16 C74 36 102 54 102 80 C102 100 84 110 60 110 C36 110 18 100 18 80 C18 54 46 36 60 16 Z',
    faceY: 78,
    top: 22,
    eyeGap: 14,
  },
  bun: {
    body: 'M14 90 C14 54 34 34 60 34 C86 34 106 54 106 90 C106 104 92 108 60 108 C28 108 14 104 14 90 Z',
    faceY: 74,
    top: 34,
    eyeGap: 16,
  },
  bean: {
    body: 'M22 72 C18 46 42 30 64 32 C90 34 108 54 102 80 C98 102 74 110 52 106 C32 102 24 92 22 72 Z',
    faceY: 70,
    top: 32,
    eyeGap: 15,
  },
  cloud: {
    body: 'M28 106 C10 106 8 82 22 76 C16 56 36 44 48 52 C52 34 80 32 86 50 C100 44 114 62 102 76 C116 84 110 106 92 106 Z',
    faceY: 80,
    top: 38,
    eyeGap: 15,
  },
  heart: {
    body: 'M60 108 C40 96 12 80 12 56 C12 40 24 30 40 30 C50 30 56 36 60 42 C64 36 70 30 80 30 C96 30 108 40 108 56 C108 80 80 96 60 108 Z',
    faceY: 64,
    top: 30,
    eyeGap: 15,
  },
  crystal: {
    // 둥근 모서리의 보석 실루엣
    body: 'M60 14 Q64 14 67 17 L100 50 Q104 54 102 59 L68 107 Q60 116 52 107 L18 59 Q16 54 20 50 L53 17 Q56 14 60 14 Z',
    faceY: 64,
    top: 16,
    eyeGap: 13,
  },
  star: {
    body: roundedStarPath(60, 66, 54, 32),
    faceY: 70,
    top: 14,
    eyeGap: 12,
  },
};

// ── 얼굴 ───────────────────────────────────────────────────

function Eye({ kind, x, y, color, glint }: { kind: MalangEyes; x: number; y: number; color: string; glint: string }) {
  switch (kind) {
    case 'happy':
      return <path d={`M${x - 6} ${y + 2} Q${x} ${y - 7} ${x + 6} ${y + 2}`} className="malang-stroke" stroke={color} />;
    case 'sleepy':
      return <path d={`M${x - 6} ${y} Q${x} ${y + 6} ${x + 6} ${y}`} className="malang-stroke" stroke={color} />;
    case 'sparkle':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={5.6} ry={6.6} fill={color} />
          <circle cx={x + 1.8} cy={y - 2.4} r={2.2} fill={glint} />
          <circle cx={x - 2} cy={y + 2.4} r={1} fill={glint} />
        </g>
      );
    case 'wide':
      return (
        <g>
          <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={2.4} />
          <circle cx={x + 1} cy={y + 1} r={3.6} fill={color} />
          <circle cx={x + 2} cy={y - 0.5} r={1.1} fill="#fff" />
        </g>
      );
    case 'wink':
    case 'dot':
    default:
      return (
        <g>
          <circle cx={x} cy={y} r={4.5} fill={color} />
          <circle cx={x + 1.5} cy={y - 1.6} r={1.5} fill={glint} />
        </g>
      );
  }
}

function Face({ shape, eyes, dark }: { shape: ShapeSpec; eyes: MalangEyes; dark: boolean }) {
  const { faceY: y, eyeGap } = shape;
  const featureColor = dark ? '#fff6e6' : INK;
  const glint = dark ? INK : '#fff';
  const left = 60 - eyeGap;
  const right = 60 + eyeGap;
  return (
    <g className="malang-face">
      <ellipse cx={left - 8} cy={y + 9} rx={7} ry={4} fill="#ff7a9c" opacity={0.45} />
      <ellipse cx={right + 8} cy={y + 9} rx={7} ry={4} fill="#ff7a9c" opacity={0.45} />
      <Eye kind={eyes} x={left} y={y} color={featureColor} glint={glint} />
      {eyes === 'wink' ? (
        <Eye kind="happy" x={right} y={y} color={featureColor} glint={glint} />
      ) : (
        <Eye kind={eyes} x={right} y={y} color={featureColor} glint={glint} />
      )}
      <path
        d={`M${55} ${y + 7} Q${57.5} ${y + 11} ${60} ${y + 7.5} Q${62.5} ${y + 11} ${65} ${y + 7}`}
        className="malang-stroke"
        stroke={featureColor}
        strokeWidth={2.4}
      />
    </g>
  );
}

// ── 장식 ───────────────────────────────────────────────────

function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r} Z`}
      fill={fill}
      stroke={INK}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}

function Accessory({ kind, shape, gradId }: { kind: MalangAccessory; shape: ShapeSpec; gradId: string }) {
  const t = shape.top;
  const y = shape.faceY;
  switch (kind) {
    case 'leaf':
      return (
        <g className="malang-acc">
          <path d={`M60 ${t + 2} q-1 -8 2 -12`} className="malang-stroke" stroke={INK} />
          <path d={`M62 ${t - 10} q10 -10 20 -4 q-8 12 -20 4 Z`} fill="#7cc46b" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        </g>
      );
    case 'sprout':
      return (
        <g className="malang-acc">
          <path d={`M60 ${t + 2} v-12`} className="malang-stroke" stroke={INK} />
          <path d={`M60 ${t - 8} q-12 -8 -16 2 q10 6 16 -2 Z`} fill="#8fd67a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d={`M60 ${t - 10} q12 -10 18 0 q-10 7 -18 0 Z`} fill="#a6e38f" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        </g>
      );
    case 'bow':
      return (
        <g className="malang-acc" transform={`translate(80 ${t + 6}) rotate(18)`}>
          <path d="M0 0 L-16 -10 Q-20 0 -16 10 Z" fill="#ff5d8f" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d="M0 0 L16 -10 Q20 0 16 10 Z" fill="#ff5d8f" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <circle r={4.5} fill="#ff8fab" stroke={INK} strokeWidth={2.4} />
        </g>
      );
    case 'glasses': {
      const gap = shape.eyeGap;
      return (
        <g className="malang-acc" fill="rgba(255,255,255,0.25)" stroke={INK} strokeWidth={2.4}>
          <circle cx={60 - gap} cy={y} r={9.5} />
          <circle cx={60 + gap} cy={y} r={9.5} />
          <path d={`M${60 - gap + 9.5} ${y - 1} Q60 ${y - 5} ${60 + gap - 9.5} ${y - 1}`} fill="none" />
        </g>
      );
    }
    case 'stars':
      return (
        <g className="malang-acc malang-twinkle">
          <Sparkle x={18} y={t + 8} r={7} fill="#ffe27a" />
          <Sparkle x={102} y={t + 2} r={5} fill="#fff4b8" />
          <Sparkle x={106} y={y + 26} r={4} fill="#ffe27a" />
        </g>
      );
    case 'horns':
      return (
        <g className="malang-acc" fill="#fff2d6" stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
          <path d={`M42 ${t + 8} Q38 ${t - 6} 44 ${t - 12} Q48 ${t - 2} 52 ${t + 4} Z`} />
          <path d={`M78 ${t + 8} Q82 ${t - 6} 76 ${t - 12} Q72 ${t - 2} 68 ${t + 4} Z`} />
        </g>
      );
    case 'scarf':
      return (
        <g className="malang-acc" stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
          <path d={`M22 ${y + 18} Q60 ${y + 30} 98 ${y + 18} L98 ${y + 26} Q60 ${y + 38} 22 ${y + 26} Z`} fill="#ff6b6b" />
          <path d={`M78 ${y + 26} l4 18 l10 -3 l-4 -17 Z`} fill="#ff8a8a" />
          <path d={`M30 ${y + 22} v6 M40 ${y + 25} v6 M50 ${y + 27} v6`} stroke="#fff" strokeWidth={2} opacity={0.7} />
        </g>
      );
    case 'crown':
      return (
        <g className="malang-acc" transform={`translate(0 ${t - 20})`}>
          <path
            d="M40 22 L38 4 L50 14 L60 0 L70 14 L82 4 L80 22 Z"
            fill={`url(#${gradId}-gold)`}
            stroke={INK}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <circle cx={60} cy={15} r={3} fill="#ff5d8f" stroke={INK} strokeWidth={1.5} />
          <circle cx={47} cy={17} r={2} fill="#5fa8ff" />
          <circle cx={73} cy={17} r={2} fill="#5fa8ff" />
        </g>
      );
    case 'halo':
      return (
        <g className="malang-acc malang-float">
          <ellipse cx={60} cy={t - 8} rx={20} ry={6} fill="none" stroke={INK} strokeWidth={5.5} />
          <ellipse cx={60} cy={t - 8} rx={20} ry={6} fill="none" stroke={`url(#${gradId}-gold)`} strokeWidth={3} />
        </g>
      );
    case 'cosmos':
      return (
        <g className="malang-acc">
          <g className="malang-float">
            <ellipse cx={60} cy={t - 2} rx={16} ry={5} fill="none" stroke={INK} strokeWidth={5} />
            <ellipse cx={60} cy={t - 2} rx={16} ry={5} fill="none" stroke={`url(#${gradId}-gold)`} strokeWidth={2.6} />
          </g>
          <ellipse
            cx={60}
            cy={78}
            rx={58}
            ry={12}
            fill="none"
            stroke="#ffd966"
            strokeWidth={2.4}
            strokeDasharray="4 6"
            transform="rotate(-14 60 78)"
            opacity={0.9}
          />
          <g className="malang-twinkle">
            <Sparkle x={10} y={40} r={6} fill="#fff4b8" />
            <Sparkle x={108} y={46} r={5} fill="#c3a6ff" />
            <Sparkle x={104} y={104} r={4} fill="#8ecdf7" />
          </g>
          <circle cx={112} cy={70} r={5} fill="#ff8fab" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

function PatternDef({ id, kind, color }: { id: string; kind: MalangPattern; color: string }) {
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
    case 'none':
    default:
      return null;
  }
}

// ── 컴포넌트 ────────────────────────────────────────────────

export type MalangAnimation = 'none' | 'idle' | 'bounce' | 'wiggle' | 'squish';

export interface MalangProps {
  character: Pick<Character, 'name' | 'color' | 'shape' | 'eyes' | 'accessory' | 'pattern'>;
  /** 픽셀 크기 (정사각형). 기본 120 */
  size?: number;
  animation?: MalangAnimation;
  /** 미보유 실루엣 표시 */
  silhouette?: boolean;
  /** 장식용(스크린리더 숨김). 기본값: false → 이름을 title로 노출 */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 말랑이 SVG. gradient/clipPath/pattern id는 useId로 인스턴스마다 고유하게 생성해
 * 여러 말랑이를 동시에 렌더링해도 충돌하지 않는다.
 */
export function Malang({
  character,
  size = 120,
  animation = 'idle',
  silhouette = false,
  decorative = false,
  className,
  style,
}: MalangProps) {
  const uid = `m${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ids = {
    grad: `${uid}-body`,
    gold: `${uid}-gold`,
    clip: `${uid}-clip`,
    pattern: `${uid}-pattern`,
    title: `${uid}-title`,
  };
  const shape = SHAPES[character.shape];
  const color = character.color;
  const dark = isDark(color);
  const hasPattern = !silhouette && character.pattern !== 'none';

  return (
    <svg
      className={['malang', `malang--${silhouette ? 'none' : animation}`, className].filter(Boolean).join(' ')}
      style={style}
      width={size}
      height={size}
      viewBox="-6 -8 132 128"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : ids.title}
      focusable="false"
    >
      {!decorative && <title id={ids.title}>{silhouette ? '아직 만나지 못한 말랑이' : character.name}</title>}
      <defs>
        <radialGradient id={ids.grad} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={lighten(color, 0.55)} />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.22)} />
        </radialGradient>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1a8" />
          <stop offset="100%" stopColor="#ffb627" />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={shape.body} />
        </clipPath>
        {hasPattern && <PatternDef id={ids.pattern} kind={character.pattern} color={color} />}
      </defs>

      <g className="malang-body-group">
        <ellipse cx={60} cy={112} rx={36} ry={5} fill={INK} opacity={0.14} />
        <path
          d={shape.body}
          fill={silhouette ? '#d9cfc0' : `url(#${ids.grad})`}
          stroke={INK}
          strokeWidth={3.6}
          strokeLinejoin="round"
        />
        {hasPattern && <path d={shape.body} fill={`url(#${ids.pattern})`} />}
        {!silhouette && (
          <g clipPath={`url(#${ids.clip})`}>
            {/* 젤리 광택: 몸통 모양에 맞게 잘라낸 하이라이트 */}
            <ellipse cx={42} cy={shape.top + 18} rx={16} ry={9} fill="#fff" opacity={0.55} transform={`rotate(-24 42 ${shape.top + 18})`} />
            <ellipse cx={60} cy={122} rx={60} ry={18} fill={INK} opacity={0.08} />
          </g>
        )}
        {silhouette ? (
          <text x={60} y={shape.faceY + 8} textAnchor="middle" className="malang-question">
            ?
          </text>
        ) : (
          <>
            <Face shape={shape} eyes={character.eyes} dark={dark} />
            <Accessory kind={character.accessory} shape={shape} gradId={uid} />
          </>
        )}
      </g>
    </svg>
  );
}
