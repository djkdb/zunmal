import type { ReactNode } from 'react';
import type { MalangAccessory } from '../../data/characters';
import { darken, lighten, mix } from '../../lib/color';
import { INK, sparklePath } from './helpers';
import type { ShapeSpec } from './shapes';

/**
 * 머리/몸 장식. 몸통 뒤(back: 날개·귀·꼬리)와 앞(front: 왕관·꽃·뿔)으로 나눠 그린다.
 * 모든 장식은 VIEWBOX(-14..134, -18..130) 안에 들어와야 한다.
 */

export interface AccessoryPaint {
  color: string;
  accent: string;
  /** 인스턴스 고유 id 접두사 */
  uid: string;
}

interface AccProps {
  kind: MalangAccessory;
  shape: ShapeSpec;
  paint: AccessoryPaint;
}

const SW = 2.6; // 장식 외곽선 기본 두께

function Spark({ x, y, r, fill, sw = 1.6 }: { x: number; y: number; r: number; fill: string; sw?: number }) {
  return <path d={sparklePath(x, y, r)} fill={fill} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
}

/** 좌우 대칭 장식: x=cx 축으로 뒤집은 사본을 함께 그린다. */
function Mirror({ cx = 60, children }: { cx?: number; children: ReactNode }) {
  return (
    <>
      {children}
      <g transform={`translate(${cx * 2} 0) scale(-1 1)`}>{children}</g>
    </>
  );
}

/** 벚꽃 한 송이 (중심 0,0 / 반지름 약 8) */
function Blossom({ x, y, s, fill, rot = 0 }: { x: number; y: number; s: number; fill: string; rot?: number }) {
  const petal = 'M0 -1 C-4.2 -3 -4.6 -8.2 -1.8 -9.4 L0 -7.8 L1.8 -9.4 C4.6 -8.2 4.2 -3 0 -1 Z';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={petal} transform={`rotate(${a})`} fill={fill} stroke={INK} strokeWidth={1.5 / s} strokeLinejoin="round" />
      ))}
      <circle r={2.2} fill="#ffe27a" stroke={INK} strokeWidth={1.1 / s} />
    </g>
  );
}

// ── 몸통 뒤 ─────────────────────────────────────────────────

export function AccessoryBack({ kind, shape, paint }: AccProps) {
  const t = shape.top;
  const { accent, color, uid } = paint;
  switch (kind) {
    case 'tentacles': {
      const xs = [30, 44, 58, 72, 86];
      const b = shape.bottom - 8;
      return (
        <g className="malang-acc malang-sway">
          {xs.map((x, i) => {
            const len = i % 2 === 0 ? 24 : 19;
            const w = i % 2 === 0 ? 1 : -1;
            const d = `M${x} ${b} q${-5 * w} ${len * 0.3} 0 ${len * 0.55} q${5 * w} ${len * 0.3} ${-1 * w} ${len * 0.45}`;
            return (
              <g key={x}>
                <path d={d} fill="none" stroke={INK} strokeWidth={8.4} strokeLinecap="round" />
                <path d={d} fill="none" stroke={i % 2 === 0 ? accent : lighten(color, 0.35)} strokeWidth={3.8} strokeLinecap="round" />
              </g>
            );
          })}
        </g>
      );
    }
    case 'bunnyEars': {
      const ear = 'M-8.5 6 C-13 -12 -12 -40 0 -42 C12 -40 13 -12 8.5 6 Z';
      const inner = 'M-4.2 2 C-7 -12 -6 -32 0 -34 C6 -32 7 -12 4.2 2 Z';
      const fill = lighten(color, 0.4);
      return (
        <g className="malang-acc">
          <g transform={`translate(46 ${t + 8}) rotate(-14)`}>
            <path d={ear} fill={fill} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
            <path d={inner} fill="#ffc4d8" />
          </g>
          {/* 오른쪽 귀는 조금 짧고 바깥으로 기울었다 */}
          <g transform={`translate(76 ${t + 6}) rotate(22)`}>
            <path d={ear} fill={fill} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" transform="scale(1 0.86)" />
            <path d={inner} fill="#ffc4d8" transform="scale(1 0.86)" />
          </g>
        </g>
      );
    }
    case 'fins': {
      const y = shape.sideY - 2;
      const L = shape.left;
      const fin = `M${L + 6} ${y - 5} C${L - 4} ${y - 14} ${L - 16} ${y - 14} ${L - 20} ${y - 8} A5 5 0 0 0 ${L - 19} ${y + 1} A5 5 0 0 0 ${L - 14} ${y + 8} C${L - 8} ${y + 10} ${L} ${y + 8} ${L + 6} ${y + 5} Z`;
      const rib = `M${L + 2} ${y - 1} L${L - 13} ${y - 7} M${L + 2} ${y + 2} L${L - 11} ${y + 4}`;
      return (
        <g className="malang-acc">
          <Mirror>
            <path d={fin} fill={accent} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d={rib} stroke={lighten(accent, 0.5)} strokeWidth={1.8} strokeLinecap="round" fill="none" />
          </Mirror>
          {/* 작은 꼬리: 오른쪽 아래로 살짝 튀어나와 팔랑인다 */}
          <g transform={`translate(90 ${shape.bottom - 8}) rotate(16)`}>
            <g className="malang-flap">
            <path d="M-12 2 C-2 0 6 -2 10 -6 C12 -14 20 -18 28 -16 C22 -12 21 -7 23 -2 C28 2 29 10 24 14 C18 8 12 6 6 7 C0 9 -6 10 -12 10 Z" fill={accent} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d="M12 -4 L22 -10 M13 2 L22 8" stroke={lighten(accent, 0.5)} strokeWidth={1.8} strokeLinecap="round" />
            </g>
          </g>
        </g>
      );
    }
    case 'dragonWings': {
      const membrane = lighten(accent, 0.45);
      const wing = 'M34 56 C22 40 8 28 -6 26 C-3 34 -4 42 -8 50 C-1 49 3 53 2 59 C8 57 13 60 15 67 C20 63 26 65 31 70 Z';
      const bones = 'M32 58 L0 30 M32 60 L-4 49 M32 62 L4 58 M32 64 L14 65';
      return (
        <g className="malang-acc malang-flap-wings">
          <Mirror cx={62}>
            <path d={wing} fill={membrane} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d={bones} stroke={darken(membrane, 0.25)} strokeWidth={1.6} strokeLinecap="round" />
            <path d="M-6 26 l-1 -5 l4 3 Z" fill={INK} />
          </Mirror>
        </g>
      );
    }
    case 'flameWings': {
      const g = `url(#${uid}-flame)`;
      const wing =
        'M34 74 C20 74 6 68 -4 56 C4 56 8 54 8 50 C-2 44 -8 34 -9 22 C0 30 8 33 14 33 C10 26 10 16 13 6 C20 20 28 30 38 44 Z';
      const crest =
        'M50 26 C44 16 48 6 53 0 C53 8 56 11 58 8 C57 0 60 -8 66 -12 C66 -2 72 4 70 12 C73 10 75 6 76 4 C79 12 76 22 70 26 Z';
      return (
        <g className="malang-acc">
          <g className="malang-flicker">
            <path d={crest} fill={g} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          </g>
          <g className="malang-flap-wings">
            <Mirror>
              <path d={wing} fill={g} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
              <path d="M30 64 C18 62 8 56 2 48 M32 56 C22 48 14 40 10 30 M34 48 C28 38 22 26 18 16" stroke="#fff3b0" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.85} />
            </Mirror>
          </g>
        </g>
      );
    }
    case 'unicorn': {
      const wing =
        'M22 63 C14 53 2 47 -8 49 A5.5 5.5 0 0 0 -6 59 A5.5 5.5 0 0 0 -1 68 A5.5 5.5 0 0 0 7 74 C13 75 18 74 22 72 Z';
      const mane = ['#ff9fb8', '#ffc98f', '#fff08c', '#a6e3a0', '#9fd3ff', '#c3a6ff'];
      const locks = mane.map((c, i) => {
        const a = ((-78 - i * 19) * Math.PI) / 180;
        const r = 45;
        return { c, x: 60 + r * Math.cos(a), y: 70 + r * Math.sin(a), rot: (-78 - i * 19) + 90 };
      });
      return (
        <g className="malang-acc">
          <g>
            {locks.map((l) => (
              <ellipse key={l.c} cx={l.x} cy={l.y} rx={12} ry={8} transform={`rotate(${l.rot} ${l.x} ${l.y})`} fill={l.c} stroke={INK} strokeWidth={2.4} />
            ))}
          </g>
          <g className="malang-flap-wings">
          <Mirror>
            <path d={wing} fill={`url(#${uid}-wing)`} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d="M18 64 C10 59 4 57 -2 57 M18 69 C12 67 7 66 2 66" stroke={lighten(accent, 0.3)} strokeWidth={1.6} strokeLinecap="round" fill="none" />
          </Mirror>
          </g>
        </g>
      );
    }
    case 'whaleTail':
      return (
        <g className="malang-acc">
          <g className="malang-flap">
            <path d="M88 92 C100 88 108 76 108 60 L115 60 C117 78 110 94 94 101 Z" fill={color} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path
              d="M111.5 62 C104 62 96 58 93 49 C101 51 107 52 111.5 56 C116 52 122 51 130 49 C127 58 119 62 111.5 62 Z"
              fill={color}
              stroke={INK}
              strokeWidth={SW}
              strokeLinejoin="round"
            />
            <path d="M99 52 C104 55 108 57 111 58 M124 52 C119 55 115 57 112 58" stroke={accent} strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.9} />
          </g>
        </g>
      );
    case 'seraphWings': {
      const feather =
        'M0 0 C-12 -10 -30 -14 -46 -10 A5.5 5.5 0 0 0 -44 -1 A5.5 5.5 0 0 0 -38 7 A5.5 5.5 0 0 0 -30 13 C-20 13 -8 8 0 0 Z';
      const vein = 'M-4 0 C-16 -2 -28 -3 -40 -3 M-4 2 C-14 4 -24 6 -32 8';
      const wings: { x: number; y: number; r: number; s: number }[] = [
        { x: 42, y: 42, r: 38, s: 0.92 },
        { x: 34, y: 56, r: 4, s: 1 },
        { x: 38, y: 72, r: -30, s: 0.86 },
      ];
      return (
        <g className="malang-acc malang-flap-wings">
          <Mirror>
            {wings.map((w, i) => (
              <g key={i} transform={`translate(${w.x} ${w.y}) rotate(${w.r}) scale(${w.s})`}>
                <path d={feather} fill={`url(#${uid}-seraph)`} stroke={INK} strokeWidth={SW / w.s} strokeLinejoin="round" />
                <path d={vein} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.9} />
              </g>
            ))}
          </Mirror>
        </g>
      );
    }
    default:
      return null;
  }
}

// ── 몸통 앞 ─────────────────────────────────────────────────

export function AccessoryFront({ kind, shape, paint }: AccProps) {
  const t = shape.top;
  const y = shape.faceY;
  const { accent, uid } = paint;
  const gold = `url(#${uid}-gold)`;
  switch (kind) {
    case 'leaf':
      return (
        <g className="malang-acc">
          <path d={`M60 ${t + 2} q-1 -8 2 -12`} className="malang-stroke" stroke={INK} />
          <path d={`M62 ${t - 10} q10 -10 20 -4 q-8 12 -20 4 Z`} fill="#7cc46b" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={`M64 ${t - 9} q8 -3 15 -3`} stroke="#b6e8a3" strokeWidth={1.6} strokeLinecap="round" fill="none" />
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
          <path d="M-13 -5 Q-10 -3 -8 -2 M13 -5 Q10 -3 8 -2" stroke="#ffc2d4" strokeWidth={1.6} strokeLinecap="round" />
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
          <path d={`M${60 - gap - 5} ${y - 5} l3 -2`} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    }
    case 'stars':
      return (
        <g className="malang-acc malang-twinkle">
          <Spark x={16} y={t + 8} r={8} fill="#ffe27a" />
          <Spark x={104} y={t + 2} r={6} fill="#fff4b8" />
          <Spark x={108} y={y + 26} r={5} fill="#ffe27a" />
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
          <path d="M40 22 L38 4 L50 14 L60 0 L70 14 L82 4 L80 22 Z" fill={gold} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
          <circle cx={38} cy={4} r={2.4} fill="#fff1a8" stroke={INK} strokeWidth={1.4} />
          <circle cx={60} cy={0} r={2.6} fill="#fff1a8" stroke={INK} strokeWidth={1.4} />
          <circle cx={82} cy={4} r={2.4} fill="#fff1a8" stroke={INK} strokeWidth={1.4} />
          <circle cx={60} cy={15} r={3} fill="#ff5d8f" stroke={INK} strokeWidth={1.5} />
          <circle cx={47} cy={17} r={2} fill="#5fa8ff" />
          <circle cx={73} cy={17} r={2} fill="#5fa8ff" />
        </g>
      );
    case 'halo':
      return (
        <g className="malang-acc malang-float">
          <ellipse cx={60} cy={t - 8} rx={20} ry={6} fill="none" stroke={INK} strokeWidth={5.5} />
          <ellipse cx={60} cy={t - 8} rx={20} ry={6} fill="none" stroke={gold} strokeWidth={3} />
        </g>
      );
    case 'cosmos':
      return (
        <g className="malang-acc">
          <g className="malang-float">
            <ellipse cx={60} cy={t - 2} rx={16} ry={5} fill="none" stroke={INK} strokeWidth={5} />
            <ellipse cx={60} cy={t - 2} rx={16} ry={5} fill="none" stroke={gold} strokeWidth={2.6} />
          </g>
          <ellipse cx={60} cy={78} rx={58} ry={12} fill="none" stroke="#ffd966" strokeWidth={2.4} strokeDasharray="4 6" transform="rotate(-14 60 78)" opacity={0.9} />
          <g className="malang-twinkle">
            <Spark x={8} y={40} r={6} fill="#fff4b8" />
            <Spark x={110} y={44} r={5} fill="#c3a6ff" />
            <Spark x={106} y={106} r={4} fill="#8ecdf7" />
          </g>
          <circle cx={114} cy={70} r={5} fill="#ff8fab" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'strawberryTop': {
      const cy = t - 4;
      const berry = `M60 ${cy + 13} C49 ${cy + 9} 44 ${cy - 2} 47 ${cy - 8} C50 ${cy - 13} 70 ${cy - 13} 73 ${cy - 8} C76 ${cy - 2} 71 ${cy + 9} 60 ${cy + 13} Z`;
      const seeds: [number, number][] = [
        [53, cy - 4],
        [60, cy - 5],
        [67, cy - 4],
        [56, cy + 2],
        [64, cy + 2],
        [60, cy + 7],
      ];
      return (
        <g className="malang-acc">
          <path d={berry} fill={accent} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <ellipse cx={52.5} cy={cy - 6} rx={2.4} ry={1.4} fill="#fff" opacity={0.7} transform={`rotate(-30 52.5 ${cy - 6})`} />
          {seeds.map(([sx, sy]) => (
            <ellipse key={`${sx}-${sy}`} cx={sx} cy={sy} rx={0.9} ry={1.4} fill="#fff1b8" />
          ))}
          <path
            d={`M60 ${cy - 10} L50 ${cy - 13} L55 ${cy - 16} L52 ${cy - 21} L59 ${cy - 17} L60 ${cy - 23} L63 ${cy - 17} L69 ${cy - 21} L66 ${cy - 16} L71 ${cy - 13} Z`}
            fill="#6cc35a"
            stroke={INK}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          <path d={`M60 ${cy - 18} q0 -6 3 -8`} className="malang-stroke" stroke={INK} strokeWidth={2.6} />
        </g>
      );
    }
    case 'tangerineLeaf': {
      if (shape.key === 'heart') {
        // 체리: 두 봉우리에서 올라온 꼭지가 위에서 만난다
        return (
          <g className="malang-acc">
            <path d="M44 33 C46 20 54 10 61 4 M76 33 C74 22 68 12 61 4" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
            <path d="M44 33 C46 20 54 10 61 4 M76 33 C74 22 68 12 61 4" fill="none" stroke="#7fb24a" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M62 4 q12 -12 24 -6 q-10 13 -24 6 Z" fill="#6cc35a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
            <path d="M65 3 q9 -4 17 -5" stroke="#b6e8a3" strokeWidth={1.5} strokeLinecap="round" fill="none" />
          </g>
        );
      }
      return (
        <g className="malang-acc">
          <path d={`M56 ${t + 3} Q55 ${t - 5} 60 ${t - 6} Q65 ${t - 5} 64 ${t + 3} Z`} fill="#6b8f3a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d={`M62 ${t - 4} q12 -13 25 -7 q-10 14 -25 7 Z`} fill="#6cc35a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={`M65 ${t - 5} q9 -4 18 -5`} stroke="#b6e8a3" strokeWidth={1.5} strokeLinecap="round" fill="none" />
          <path d={`M58 ${t - 3} q-9 -9 -18 -4 q7 10 18 4 Z`} fill="#8fd67a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        </g>
      );
    }
    case 'straw': {
      const straw = '#ff8fb5';
      return (
        <g className="malang-acc">
          {/* 뚜껑 비닐 */}
          <path d={`M24 ${t + 16} Q60 ${t + 4} 96 ${t + 16}`} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />
          <g transform={`translate(70 ${t + 12}) rotate(14)`}>
            <rect x={-4.5} y={-40} width={9} height={42} rx={3} fill={straw} stroke={INK} strokeWidth={2.4} />
            <path d="M-4.5 -32 l9 -4 M-4.5 -22 l9 -4 M-4.5 -12 l9 -4" stroke="#fff" strokeWidth={2.4} />
            <ellipse cx={0} cy={-40} rx={4.5} ry={1.6} fill={darken(straw, 0.3)} stroke={INK} strokeWidth={1.6} />
          </g>
        </g>
      );
    }
    case 'umbrella': {
      const canopy =
        'M-26 0 Q-26 -22 0 -24 Q26 -22 26 0 Q19.5 -5 13 0 Q6.5 -5 0 0 Q-6.5 -5 -13 0 Q-19.5 -5 -26 0 Z';
      return (
        <g className="malang-acc">
          <g transform="translate(84 8) rotate(12)">
            <path d="M0 0 L0 34 Q0 40 -5 40 Q-9 40 -9 36" fill="none" stroke={INK} strokeWidth={5.2} strokeLinecap="round" />
            <path d="M0 0 L0 34 Q0 40 -5 40 Q-9 40 -9 36" fill="none" stroke="#c98b4a" strokeWidth={2.2} strokeLinecap="round" />
            <path d={canopy} fill={accent} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d="M0 -24 Q-8 -12 -13 0 M0 -24 Q8 -12 13 0" fill="none" stroke={darken(accent, 0.2)} strokeWidth={1.8} />
            <path d="M-18 -12 Q-14 -18 -8 -20" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.8} />
            <circle cx={0} cy={-25.5} r={2.6} fill={accent} stroke={INK} strokeWidth={1.6} />
          </g>
          <g fill="#8ecdf7" stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
            <path d="M18 4 q-3 5 0 6 q3 -1 0 -6 Z" />
            <path d="M6 22 q-3 5 0 6 q3 -1 0 -6 Z" />
            <path d="M30 -8 q-3 5 0 6 q3 -1 0 -6 Z" />
          </g>
        </g>
      );
    }
    case 'bunnyEars': {
      // 귀 뿌리의 초승달 머리핀
      const cx = 86;
      const cy = t + 8;
      return (
        <g className="malang-acc">
          <path
            d={`M${cx} ${cy - 7} A7 7 0 1 0 ${cx + 5} ${cy + 5} A5.6 5.6 0 1 1 ${cx} ${cy - 7} Z`}
            fill={accent}
            stroke={INK}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path d={sparklePath(cx + 7, cy - 5, 3)} fill="#fff8d6" />
        </g>
      );
    }
    case 'flowerCrown': {
      const petal = lighten(accent, 0.25);
      const spots: { x: number; y: number; s: number; r: number; f: string }[] = [
        { x: 24, y: 45, s: 0.82, r: -20, f: petal },
        { x: 39, y: 34, s: 0.95, r: 10, f: accent },
        { x: 60, y: 29, s: 1.1, r: 0, f: petal },
        { x: 81, y: 34, s: 0.95, r: -12, f: accent },
        { x: 96, y: 45, s: 0.82, r: 18, f: petal },
      ];
      return (
        <g className="malang-acc">
          <path d="M18 52 Q26 34 44 31 M76 31 Q94 34 102 52" fill="none" stroke={INK} strokeWidth={5.4} strokeLinecap="round" />
          <path d="M18 52 Q26 34 44 31 M76 31 Q94 34 102 52" fill="none" stroke="#7cc46b" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M49 33 q-4 -8 -11 -7 q2 7 11 7 Z M71 33 q4 -8 11 -7 q-2 7 -11 7 Z" fill="#8fd67a" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          {spots.map((s) => (
            <Blossom key={s.x} x={s.x} y={s.y} s={s.s} rot={s.r} fill={s.f} />
          ))}
        </g>
      );
    }
    case 'dragonWings': {
      const hornFill = accent;
      return (
        <g className="malang-acc">
          <path d={`M46 ${t + 7} Q44 ${t - 4} 50 ${t - 10} Q51 ${t - 2} 54 ${t + 4} Z`} fill={hornFill} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={`M76 ${t + 5} Q80 ${t - 6} 76 ${t - 12} Q72 ${t - 4} 68 ${t + 3} Z`} fill={hornFill} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <g className="malang-twinkle">
            <path d="M104 12 L96 26 L102 26 L98 38 L110 21 L104 21 L108 12 Z" fill={accent} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          </g>
          <path d={`M${60 + shape.eyeGap + 12} ${y - 10} l3 -4 l0 4 l3 -4`} fill="none" stroke={darken(accent, 0.15)} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    case 'tiara': {
      return (
        <g className="malang-acc" transform={`translate(60 ${t + 1})`}>
          <path
            d="M-22 3 Q-22 -2 -18 -4 L-13 -12 L-8 -5 L0 -19 L8 -5 L13 -12 L18 -4 Q22 -2 22 3 Q0 -1 -22 3 Z"
            fill={`url(#${uid}-tiara)`}
            stroke={INK}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path d="M0 -14 L3.6 -8.5 L0 -3 L-3.6 -8.5 Z" fill={accent} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={-13} cy={-8} r={2} fill="#9fd8ff" stroke={INK} strokeWidth={1.2} />
          <circle cx={13} cy={-8} r={2} fill="#9fd8ff" stroke={INK} strokeWidth={1.2} />
          <path d={sparklePath(-1.2, -10, 1.8)} fill="#fff" />
          <g className="malang-twinkle">
            <path d={sparklePath(20, -18, 5)} fill="#fff" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
          </g>
        </g>
      );
    }
    case 'unicorn': {
      return (
        <g className="malang-acc">
          {/* 앞머리 두 가닥 */}
          <path d="M50 33 C42 32 36 38 36 46 C40 41 45 40 50 42 Z" fill="#ff9fb8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M56 34 C50 36 47 42 49 49 C51 44 55 42 59 42 Z" fill="#c3a6ff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <g>
            <path d="M52 34 Q57 10 59 2 Q60 -1 61 2 Q63 10 68 34 Q60 38 52 34 Z" fill={`url(#${uid}-horn)`} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
            <path d="M54.6 26 L65.4 21 M56.2 18 L63.8 14 M57.6 11 L62 9" stroke={INK} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
          </g>
          <g className="malang-twinkle">
            <path d={sparklePath(76, 6, 5)} fill="#fff" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
          </g>
        </g>
      );
    }
    case 'whaleTail': {
      const spray = mix(accent, '#ffffff', 0.35);
      return (
        <g className="malang-acc">
          <path d={`M60 ${t + 2} C60 ${t - 10} 54 ${t - 18} 45 ${t - 22} M60 ${t + 2} C60 ${t - 10} 66 ${t - 18} 75 ${t - 22} M60 ${t + 2} L60 ${t - 22}`} fill="none" stroke={INK} strokeWidth={6.4} strokeLinecap="round" />
          <path d={`M60 ${t + 2} C60 ${t - 10} 54 ${t - 18} 45 ${t - 22} M60 ${t + 2} C60 ${t - 10} 66 ${t - 18} 75 ${t - 22} M60 ${t + 2} L60 ${t - 22}`} fill="none" stroke={spray} strokeWidth={3} strokeLinecap="round" />
          <g className="malang-twinkle">
            <Spark x={42} y={t - 27} r={5.5} fill="#fff4b8" sw={1.4} />
            <Spark x={78} y={t - 27} r={5.5} fill={spray} sw={1.4} />
            <Spark x={60} y={t - 31} r={6.5} fill="#fff" sw={1.4} />
          </g>
          <g className="malang-twinkle malang-twinkle--late">
            <Spark x={32} y={t - 12} r={3.6} fill={spray} sw={1.2} />
            <Spark x={88} y={t - 12} r={3.6} fill="#fff4b8" sw={1.2} />
          </g>
        </g>
      );
    }
    case 'seraphWings':
      return (
        <g className="malang-acc malang-float">
          <ellipse cx={60} cy={t - 11} rx={19} ry={5.5} fill="none" stroke={INK} strokeWidth={5.6} />
          <ellipse cx={60} cy={t - 11} rx={19} ry={5.5} fill="none" stroke={gold} strokeWidth={3} />
          <path d={sparklePath(79, t - 13, 3.4)} fill="#fff" />
        </g>
      );
    case 'flameWings':
    case 'fins':
    case 'tentacles':
    case 'none':
    default:
      return null;
  }
}

/** 장식이 쓰는 그라데이션 정의 (필요한 것만) */
export function AccessoryDefs({ kind, paint }: { kind: MalangAccessory; paint: AccessoryPaint }) {
  const { uid, accent, color } = paint;
  switch (kind) {
    case 'flameWings':
      return (
        <linearGradient id={`${uid}-flame`} x1="0.9" y1="1" x2="0.1" y2="0">
          <stop offset="0%" stopColor={lighten(accent, 0.3)} />
          <stop offset="45%" stopColor={accent} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      );
    case 'unicorn':
      return (
        <>
          <linearGradient id={`${uid}-wing`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={lighten(accent, 0.55)} />
          </linearGradient>
          <linearGradient id={`${uid}-horn`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffd98a" />
            <stop offset="55%" stopColor="#fff6c8" />
            <stop offset="100%" stopColor="#ffe0f4" />
          </linearGradient>
        </>
      );
    case 'seraphWings':
      return (
        <linearGradient id={`${uid}-seraph`} x1="1" y1="0.5" x2="0" y2="0.5">
          <stop offset="0%" stopColor={lighten(accent, 0.2)} />
          <stop offset="55%" stopColor="#fffbe8" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      );
    case 'tiara':
      return (
        <linearGradient id={`${uid}-tiara`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#d6efff" />
          <stop offset="100%" stopColor={lighten(accent, 0.2)} />
        </linearGradient>
      );
    default:
      return null;
  }
}
