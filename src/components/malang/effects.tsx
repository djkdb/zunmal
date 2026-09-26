import type { MalangEffect } from '../../data/characters';
import { darken, lighten, mix } from '../../lib/color';
import { deepen, sparklePath } from './helpers';
import type { ShapeSpec } from './shapes';

/**
 * 몸통 재질 효과. 전부 그라데이션 + 몸통 clipPath로 처리한다(블러 필터 없음) →
 * 도감에서 40마리가 동시에 떠도 가볍다. 움직임은 CSS transform/opacity 애니메이션.
 */

export interface EffectPaint {
  uid: string;
  color: string;
  accent: string;
}

/** 무지개 스톱 (반복 무늬용: 처음과 끝이 같은 색) */
export const RAINBOW = ['#ff9fc8', '#ffd59a', '#fff3a0', '#a8f0c6', '#9fd8ff', '#c9a8ff', '#ff9fc8'];

export function RainbowStops() {
  return (
    <>
      {RAINBOW.map((c, i) => (
        <stop key={i} offset={`${(i / (RAINBOW.length - 1)) * 100}%`} stopColor={c} />
      ))}
    </>
  );
}

/** 몸통 채우기 그라데이션. id는 `${uid}-body` */
export function BodyFillDef({ effect, paint }: { effect: MalangEffect; paint: EffectPaint }) {
  const { uid, color, accent } = paint;
  const id = `${uid}-body`;
  switch (effect) {
    case 'fire':
      return (
        <linearGradient id={id} x1="0.3" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={lighten(color, 0.25)} />
          <stop offset="40%" stopColor={color} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      );
    case 'crystal':
      return (
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={lighten(color, 0.6)} />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={mix(color, accent, 0.7)} />
        </linearGradient>
      );
    case 'galaxy':
      return (
        <radialGradient id={id} cx="42%" cy="40%" r="75%">
          <stop offset="0%" stopColor={lighten(color, 0.22)} />
          <stop offset="50%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.55)} />
        </radialGradient>
      );
    case 'holo':
      return (
        <radialGradient id={id} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={lighten(color, 0.3)} />
          <stop offset="100%" stopColor={mix(lighten(color, 0.1), accent, 0.35)} />
        </radialGradient>
      );
    case 'aurora':
      return (
        <radialGradient id={id} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={lighten(color, 0.5)} />
          <stop offset="50%" stopColor={color} />
          <stop offset="100%" stopColor={mix(darken(color, 0.2), accent, 0.35)} />
        </radialGradient>
      );
    case 'glow':
      return (
        <radialGradient id={id} cx="42%" cy="40%" r="72%">
          <stop offset="0%" stopColor={lighten(color, 0.75)} />
          <stop offset="50%" stopColor={lighten(color, 0.1)} />
          <stop offset="100%" stopColor={darken(color, 0.15)} />
        </radialGradient>
      );
    case 'none':
    default:
      return (
        // 왼쪽 위(광원 쪽)가 밝고, 가장자리로 갈수록 채도가 오른 진한 색 → 속이 찬 젤리
        <radialGradient id={id} cx="44%" cy="40%" r="68%" fx="34%" fy="26%">
          <stop offset="0%" stopColor={lighten(color, 0.55)} />
          <stop offset="24%" stopColor={lighten(color, 0.22)} />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor={deepen(color, 0.16)} />
        </radialGradient>
      );
  }
}

/** 효과 전용 보조 그라데이션 */
export function EffectDefs({ effect, paint }: { effect: MalangEffect; paint: EffectPaint }) {
  const { uid, color, accent } = paint;
  switch (effect) {
    case 'glow':
      return (
        <radialGradient id={`${uid}-glow`}>
          <stop offset="55%" stopColor={lighten(accent, 0.2)} stopOpacity={0.75} />
          <stop offset="100%" stopColor={lighten(accent, 0.2)} stopOpacity={0} />
        </radialGradient>
      );
    case 'fire':
      return (
        <>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="55%" stopColor={accent} stopOpacity={0.55} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-tongue`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fffbe0" stopOpacity={0.95} />
            <stop offset="100%" stopColor={lighten(accent, 0.3)} stopOpacity={0.1} />
          </linearGradient>
        </>
      );
    case 'crystal':
      return (
        <linearGradient id={`${uid}-rainbow`} x1="0" y1="0" x2="1" y2="1">
          <RainbowStops />
        </linearGradient>
      );
    case 'holo':
      return (
        <linearGradient id={`${uid}-holo`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={80} y2={0} spreadMethod="repeat">
          <RainbowStops />
        </linearGradient>
      );
    case 'galaxy':
      return (
        <>
          <radialGradient id={`${uid}-neb1`}>
            <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-neb2`}>
            <stop offset="0%" stopColor={mix(accent, '#7fd8ff', 0.6)} stopOpacity={0.7} />
            <stop offset="100%" stopColor="#7fd8ff" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="55%" stopColor={mix(color, accent, 0.5)} stopOpacity={0.5} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </radialGradient>
        </>
      );
    default:
      return null;
  }
}

/** 몸통 뒤에 깔리는 발광 (glow/fire/galaxy) */
export function EffectBehind({ effect, shape, uid }: { effect: MalangEffect; shape: ShapeSpec; uid: string }) {
  if (effect !== 'glow' && effect !== 'fire' && effect !== 'galaxy') return null;
  const cy = (shape.top + shape.bottom) / 2 + 4;
  return (
    <ellipse
      className="malang-glow-pulse"
      cx={60}
      cy={cy}
      rx={66}
      ry={(shape.bottom - shape.top) / 2 + 20}
      fill={`url(#${uid}-glow)`}
    />
  );
}

const GALAXY_STARS: [number, number, number][] = [
  [30, 50, 1.2],
  [48, 40, 0.9],
  [74, 44, 1.4],
  [90, 60, 1],
  [24, 76, 1],
  [38, 92, 1.4],
  [58, 100, 1],
  [80, 94, 1.2],
  [96, 82, 0.9],
  [66, 58, 0.8],
  [20, 62, 0.8],
  [86, 30, 1],
  [44, 64, 0.7],
  [100, 70, 1.1],
  [70, 84, 0.8],
  [52, 24, 1],
];

function wave(y: number, amp: number, period: number): string {
  let d = `M-70 ${y} Q${-70 + period / 4} ${y - amp} ${-70 + period / 2} ${y}`;
  for (let x = -70 + period / 2; x < 190; x += period / 2) d += ` T${x + period / 2} ${y}`;
  return d;
}

/** 몸통 clipPath 안에 그려지는 효과 레이어 */
export function EffectOverlay({ effect, shape, paint }: { effect: MalangEffect; shape: ShapeSpec; paint: EffectPaint }) {
  const { uid, accent } = paint;
  const top = shape.top;
  const bottom = shape.bottom;
  const midY = (top + bottom) / 2;
  switch (effect) {
    case 'glow':
      return (
        <g className="malang-fx">
          <ellipse cx={60} cy={midY + 10} rx={34} ry={24} fill="#fff" opacity={0.28} />
          <ellipse cx={60} cy={midY + 12} rx={20} ry={13} fill="#fff" opacity={0.25} />
        </g>
      );
    case 'fire': {
      const tongue = 'M-9 0 C-10 -10 -3 -14 -2 -24 C2 -18 3 -22 2 -30 C9 -20 11 -10 9 0 Z';
      return (
        <g className="malang-fx">
          {[
            [34, 0.9, 0],
            [60, 1.2, 1],
            [86, 0.95, 2],
          ].map(([x, s, i]) => (
            <g key={i} transform={`translate(${x} ${bottom + 2}) scale(${s})`}>
              <path
                className={`malang-flicker malang-flicker--${i}`}
                d={tongue}
                fill={`url(#${uid}-tongue)`}
                opacity={0.8}
              />
            </g>
          ))}
          <path
            d={`M34 ${top + 18} Q46 ${top + 6} 60 ${top + 8}`}
            fill="none"
            stroke="#fff6d6"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.8}
          />
        </g>
      );
    }
    case 'crystal':
      return (
        <g className="malang-fx">
          <polygon points="44,22 76,22 70,40 50,40" fill="#fff" opacity={0.4} />
          <polygon points="30,26 44,22 50,40 14,50" fill={accent} opacity={0.4} />
          <polygon points="76,22 90,26 106,48 70,40" fill="#fff" opacity={0.22} />
          <polygon points="50,40 70,40 82,56 60,52 38,56" fill="#fff" opacity={0.12} />
          <polygon points="8,54 38,56 60,114" fill={accent} opacity={0.35} />
          <polygon points="38,56 60,52 82,56 60,114" fill="#fff" opacity={0.18} />
          <polygon points="82,56 112,54 60,114" fill="#2b2233" opacity={0.08} />
          <path
            d="M44 22 L50 40 L70 40 L76 22 M50 40 L38 56 L60 52 L82 56 L70 40 M14 50 L50 40 M106 48 L70 40 M38 56 L60 114 L82 56 M60 52 L60 114"
            fill="none"
            stroke="#fff"
            strokeWidth={1.1}
            opacity={0.65}
          />
          <path className="malang-glint" d={sparklePath(38, 36, 7, 0.14)} fill="#fff" />
          <path className="malang-glint malang-glint--late" d={sparklePath(84, 74, 4.5, 0.14)} fill="#fff" />
          <path d={shape.body} fill="none" stroke={`url(#${uid}-rainbow)`} strokeWidth={8} opacity={0.85} />
        </g>
      );
    case 'aurora': {
      const bands = [
        { y: top + 22, c: '#7dffb2', w: 13 },
        { y: top + 40, c: '#5fe0e6', w: 11 },
        { y: top + 58, c: accent, w: 12 },
      ];
      return (
        <g className="malang-fx">
          <g transform={`rotate(-16 60 ${midY})`}>
            {bands.map((b, i) => (
              <path
                key={i}
                className={`malang-drift malang-drift--${i}`}
                d={wave(b.y, 7, 60)}
                fill="none"
                stroke={b.c}
                strokeWidth={b.w}
                strokeLinecap="round"
                opacity={0.5}
              />
            ))}
          </g>
        </g>
      );
    }
    case 'galaxy':
      return (
        <g className="malang-fx">
          <ellipse cx={44} cy={midY + 16} rx={42} ry={22} fill={`url(#${uid}-neb1)`} transform={`rotate(-24 44 ${midY + 16})`} />
          <ellipse cx={82} cy={midY - 10} rx={30} ry={16} fill={`url(#${uid}-neb2)`} transform={`rotate(20 82 ${midY - 10})`} />
          {/* 성운 소용돌이: 얼굴을 피해 아래쪽에 */}
          <path
            d={`M40 ${bottom - 16} m-3 0 a3 2 0 1 1 6 0 a8 5 0 1 1 -16 0 a14 9 0 1 1 28 0`}
            fill="none"
            stroke={lighten(accent, 0.35)}
            strokeWidth={1.8}
            strokeLinecap="round"
            opacity={0.5}
            transform={`rotate(-18 40 ${bottom - 16})`}
          />
          <g className="malang-twinkle">
            {GALAXY_STARS.filter((_, i) => i % 2 === 0).map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" />
            ))}
          </g>
          <g className="malang-twinkle malang-twinkle--late">
            {GALAXY_STARS.filter((_, i) => i % 2 === 1).map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" />
            ))}
          </g>
          <path className="malang-glint" d={sparklePath(84, midY + 22, 4, 0.15)} fill="#fff" />
          <path className="malang-glint malang-glint--late" d={sparklePath(30, midY - 12, 3.2, 0.15)} fill="#fffbe0" />
        </g>
      );
    case 'holo':
      return (
        <g className="malang-fx">
          <g transform={`rotate(-28 60 ${midY})`}>
            <rect className="malang-holo-shift" x={-150} y={-40} width={360} height={200} fill={`url(#${uid}-holo)`} opacity={0.5} />
          </g>
          <path d={shape.body} fill="none" stroke="#fff" strokeWidth={6} opacity={0.55} />
        </g>
      );
    default:
      return null;
  }
}
