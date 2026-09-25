import type { ReactNode } from 'react';
import { AURA_CENTER, INK, rayPaths, sparklePath, type AuraLevel } from './helpers';
import { RAINBOW, RainbowStops } from './effects';

/**
 * 희귀도 오라. SVG 안(몸통 뒤)에 그려지고 viewBox 밖으로 살짝 넘칠 수 있지만
 * SVG의 overflow:visible 로 그림만 넘치므로 레이아웃 크기는 size 그대로다.
 * 블러 필터는 이 레이어(신화/시크릿 1~2개 노드)에서만 쓴다.
 */

const { x: CX, y: CY } = AURA_CENTER;

function LightSpark({ x, y, r, fill, className }: { x: number; y: number; r: number; fill: string; className?: string }) {
  return (
    <g className={className}>
      <path d={sparklePath(x, y, r, 0.16)} fill={fill} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <circle cx={x} cy={y} r={r * 0.18} fill="#fff" />
    </g>
  );
}

/** 회전 레이어: fill-box 중심으로 돌도록 보이지 않는 원으로 bbox를 대칭으로 맞춘다. */
function Spin({ r, className, children }: { r: number; className: string; children: ReactNode }) {
  return (
    <g className={className}>
      <circle r={r} fill="none" />
      {children}
    </g>
  );
}

export function AuraDefs({ level, uid }: { level: AuraLevel; uid: string }) {
  const fade = (
    <mask id={`${uid}-aura-mask`} maskUnits="userSpaceOnUse" x={-100} y={-100} width={200} height={200}>
      <circle r={96} fill={`url(#${uid}-aura-fade)`} />
    </mask>
  );
  const fadeGrad = (
    <radialGradient id={`${uid}-aura-fade`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={96}>
      <stop offset="25%" stopColor="#fff" />
      <stop offset="100%" stopColor="#000" />
    </radialGradient>
  );
  switch (level) {
    case 'epic':
      return (
        <radialGradient id={`${uid}-aura-glow`}>
          <stop offset="40%" stopColor="#c9a2ff" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#c9a2ff" stopOpacity={0} />
        </radialGradient>
      );
    case 'legendary':
      return (
        <>
          <radialGradient id={`${uid}-aura-glow`}>
            <stop offset="35%" stopColor="#ffe27a" stopOpacity={0.75} />
            <stop offset="100%" stopColor="#ffd23f" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-aura-ray`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={92}>
            <stop offset="20%" stopColor="#ffe27a" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#ffb627" stopOpacity={0} />
          </radialGradient>
        </>
      );
    case 'mythic':
      return (
        <>
          {fadeGrad}
          {fade}
          <radialGradient id={`${uid}-aura-glow`}>
            <stop offset="30%" stopColor="#ffffff" stopOpacity={0.8} />
            <stop offset="60%" stopColor="#ffd6f2" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#c9a8ff" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-aura-rainbow`} x1="0" y1="0" x2="1" y2="1">
            <RainbowStops />
          </linearGradient>
          <filter id={`${uid}-aura-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={3} />
          </filter>
        </>
      );
    case 'secret':
      return (
        <>
          {fadeGrad}
          {fade}
          <radialGradient id={`${uid}-aura-cosmos`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={92}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
            <stop offset="34%" stopColor="#ffd9fb" stopOpacity={0.9} />
            <stop offset="52%" stopColor="#7b4fd6" stopOpacity={0.92} />
            <stop offset="74%" stopColor="#2b1a6e" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#140b3a" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-aura-rainbow`} x1="0" y1="0" x2="1" y2="1">
            <RainbowStops />
          </linearGradient>
          <radialGradient id={`${uid}-aura-mote`}>
            <stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <stop offset="45%" stopColor="#fff2b8" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#fff2b8" stopOpacity={0} />
          </radialGradient>
          <filter id={`${uid}-aura-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={2.5} />
          </filter>
        </>
      );
    default:
      return null;
  }
}

/** 몸통 뒤 오라 */
export function AuraBack({ level, uid }: { level: AuraLevel; uid: string }) {
  switch (level) {
    case 'epic':
      return (
        <g className="malang-aura" transform={`translate(${CX} ${CY})`}>
          <circle r={78} fill={`url(#${uid}-aura-glow)`} />
        </g>
      );
    case 'legendary':
      return (
        <g className="malang-aura" transform={`translate(${CX} ${CY})`}>
          <circle r={84} fill={`url(#${uid}-aura-glow)`} />
          <Spin r={92} className="malang-spin">
            {rayPaths(0, 0, 12, 18, 92, 6).map((d, i) => (
              <path key={i} d={d} fill={`url(#${uid}-aura-ray)`} opacity={i % 2 === 0 ? 0.9 : 0.55} />
            ))}
          </Spin>
        </g>
      );
    case 'mythic':
      return (
        <g className="malang-aura" transform={`translate(${CX} ${CY})`}>
          <circle r={86} fill={`url(#${uid}-aura-glow)`} />
          <g mask={`url(#${uid}-aura-mask)`}>
            <Spin r={96} className="malang-spin">
              {rayPaths(0, 0, 14, 16, 96, 5).map((d, i) => (
                <path key={i} d={d} fill={RAINBOW[i % (RAINBOW.length - 1)]} opacity={0.75} />
              ))}
            </Spin>
          </g>
          <Spin r={74} className="malang-spin malang-spin--rev">
            <circle r={70} fill="none" stroke={`url(#${uid}-aura-rainbow)`} strokeWidth={9} opacity={0.7} filter={`url(#${uid}-aura-blur)`} />
            <circle r={70} fill="none" stroke={`url(#${uid}-aura-rainbow)`} strokeWidth={3.2} />
          </Spin>
        </g>
      );
    case 'secret':
      return (
        <g className="malang-aura" transform={`translate(${CX} ${CY})`}>
          <circle r={92} fill={`url(#${uid}-aura-cosmos)`} />
          <g mask={`url(#${uid}-aura-mask)`}>
            <Spin r={96} className="malang-spin">
              {rayPaths(0, 0, 18, 30, 96, 2.6).map((d, i) => (
                <path key={i} d={d} fill={RAINBOW[i % (RAINBOW.length - 1)]} opacity={0.9} />
              ))}
            </Spin>
            <Spin r={96} className="malang-spin malang-spin--rev">
              {rayPaths(0, 0, 9, 30, 90, 7).map((d, i) => (
                <path key={i} d={d} fill="#fff" opacity={0.28} />
              ))}
            </Spin>
          </g>
          {/* 우주 속 별 */}
          <g className="malang-twinkle">
            {[
              [-58, -40, 1.6],
              [62, -48, 1.4],
              [70, 30, 1.8],
              [-66, 36, 1.4],
              [-20, 70, 1.2],
              [30, 72, 1.6],
            ].map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" />
            ))}
          </g>
          <g className="malang-twinkle malang-twinkle--late">
            {[
              [-72, -6, 1.2],
              [74, -8, 1.3],
              [-40, -66, 1.2],
              [44, -64, 1.1],
              [-50, 60, 1.3],
              [56, 56, 1.1],
            ].map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fffbe0" />
            ))}
          </g>
          <Spin r={84} className="malang-spin malang-spin--slow">
            <circle r={80} fill="none" stroke={`url(#${uid}-aura-rainbow)`} strokeWidth={6} opacity={0.8} filter={`url(#${uid}-aura-blur)`} />
            <circle r={80} fill="none" stroke={`url(#${uid}-aura-rainbow)`} strokeWidth={2.2} strokeDasharray="10 5 2 5" />
          </Spin>
        </g>
      );
    default:
      return null;
  }
}

/** 몸통 앞(바깥쪽) 반짝이/입자 */
export function AuraFront({ level, uid }: { level: AuraLevel; uid: string }) {
  switch (level) {
    case 'rare':
      return (
        <g className="malang-aura">
          <LightSpark x={110} y={18} r={8} fill="#6fb4ff" className="malang-blink" />
          <LightSpark x={6} y={40} r={5.5} fill="#9fd0ff" className="malang-blink malang-blink--late" />
        </g>
      );
    case 'epic':
      return (
        <g className="malang-aura" transform={`translate(${CX} ${CY})`}>
          <Spin r={70} className="malang-orbit">
            <LightSpark x={66} y={0} r={7.5} fill="#b07cff" />
            <LightSpark x={-33} y={57} r={5.5} fill="#d6b8ff" />
            <LightSpark x={-33} y={-57} r={6} fill="#c69aff" />
            <circle cx={47} cy={-47} r={2.2} fill="#b07cff" />
            <circle cx={-64} cy={16} r={1.8} fill="#b07cff" />
          </Spin>
        </g>
      );
    case 'legendary':
      return (
        <g className="malang-aura">
          <LightSpark x={-4} y={20} r={8} fill="#ffd23f" className="malang-blink" />
          <LightSpark x={122} y={10} r={6} fill="#ffe27a" className="malang-blink malang-blink--late" />
          <LightSpark x={120} y={104} r={7} fill="#ffc53d" className="malang-blink malang-blink--mid" />
        </g>
      );
    case 'mythic':
      return (
        <g className="malang-aura">
          <LightSpark x={-8} y={24} r={8} fill="#ff9fc8" className="malang-blink" />
          <LightSpark x={124} y={16} r={7} fill="#9fd8ff" className="malang-blink malang-blink--late" />
          <LightSpark x={122} y={106} r={6.5} fill="#fff3a0" className="malang-blink malang-blink--mid" />
          <LightSpark x={-4} y={104} r={5.5} fill="#c9a8ff" className="malang-blink malang-blink--late" />
        </g>
      );
    case 'secret': {
      const motes: [number, number, number][] = [
        [-10, 96, 5],
        [8, 116, 4],
        [112, 112, 5],
        [128, 84, 4],
        [30, 122, 3.5],
        [96, 124, 3.5],
        [-18, 60, 3.5],
        [136, 50, 4],
      ];
      return (
        <g className="malang-aura">
          {motes.map(([x, y, r], i) => (
            <circle key={i} className={`malang-rise malang-rise--${i % 4}`} cx={x} cy={y} r={r} fill={`url(#${uid}-aura-mote)`} />
          ))}
          <LightSpark x={-10} y={14} r={9} fill="#ffffff" className="malang-blink" />
          <LightSpark x={128} y={4} r={7.5} fill="#ffd6f7" className="malang-blink malang-blink--late" />
          <LightSpark x={130} y={120} r={6} fill="#c9f2ff" className="malang-blink malang-blink--mid" />
        </g>
      );
    }
    default:
      return null;
  }
}
