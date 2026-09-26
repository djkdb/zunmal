import { useId } from 'react';
import { PROPS, type PropId } from '../../data/playroomDecor';

/**
 * 매트 위 소품 그림 (코드로 그린 SVG). 폭 100 기준, 아래 가운데가 바닥에 닿는 점.
 * 파스텔 채움 + 같은 색 계열의 진한 선 (UI 잉크 테두리 없음). 사진 카드에 그대로 굽도록 색은 모두 속성으로 적는다.
 */
export function PropArt({ id, className, size }: { id: PropId; className?: string; size?: number }) {
  const uid = `prop${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const def = PROPS[id];
  const h = Math.round(100 * def.aspect);
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 100 ${h}`}
      width={size ?? '100%'}
      height={size ? Math.round(size * def.aspect) : '100%'}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      {id === 'cushion' && <Cushion />}
      {id === 'plant' && <Plant />}
      {id === 'star-lamp' && <StarLamp uid={uid} />}
      {id === 'gift-box' && <GiftBox />}
    </svg>
  );
}

/** 쿠션 (100×62): 네 모서리가 볼록한 딸기우유 방석 + 가운데 단추 */
function Cushion() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M9 22 Q7 9 21 10 Q50 3 79 10 Q93 9 91 22 Q97 36 91 48 Q93 60 79 58 Q50 64 21 58 Q7 60 9 48 Q3 36 9 22 Z"
        fill="#ffc6d5"
        stroke="#ef8fab"
        strokeWidth={2.6}
      />
      <path d="M21 13 Q50 7 79 13" fill="none" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={3} />
      <path d="M50 34 L28 22 M50 34 L72 22 M50 34 L30 50 M50 34 L70 50" fill="none" stroke="#ef8fab" strokeOpacity={0.5} strokeWidth={1.8} />
      <circle cx={50} cy={34} r={4} fill="#f27a9a" />
      <circle cx={48.6} cy={32.6} r={1.2} fill="#ffffff" fillOpacity={0.8} />
    </g>
  );
}

/** 작은 화분 (100×130): 흰 화분(작은 얼굴) + 하늘 테 + 민트 잎 세 장 */
function Plant() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M50 76 C44 60 30 50 16 52 C18 66 32 76 50 76 Z" fill="#9fe0b8" stroke="#56b27f" strokeWidth={2.4} />
      <path d="M50 76 C56 58 72 48 86 50 C84 66 68 76 50 76 Z" fill="#b5eac9" stroke="#56b27f" strokeWidth={2.4} />
      <path d="M50 78 C42 56 44 30 52 16 C62 32 60 58 50 78 Z" fill="#9fe0b8" stroke="#56b27f" strokeWidth={2.4} />
      <path d="M51 70 C50 54 51 38 52 24" fill="none" stroke="#56b27f" strokeOpacity={0.6} strokeWidth={1.6} />
      <path d="M26 82 H74 L68 124 Q67 128 62 128 H38 Q33 128 32 124 Z" fill="#ffffff" stroke="#bcd3ee" strokeWidth={2.4} />
      <rect x={20} y={70} width={60} height={14} rx={5} fill="#dcebff" stroke="#a9c9ef" strokeWidth={2.4} />
      <circle cx={42} cy={101} r={2.2} fill="#22304a" />
      <circle cx={58} cy={101} r={2.2} fill="#22304a" />
      <path d="M46.5 107 Q50 110 53.5 107" fill="none" stroke="#22304a" strokeWidth={1.8} />
      <ellipse cx={36} cy={106} rx={3.6} ry={2.2} fill="#ffc6d5" />
      <ellipse cx={64} cy={106} rx={3.6} ry={2.2} fill="#ffc6d5" />
    </g>
  );
}

/** 별 조명 (100×136): 은은한 빛 + 레몬 별 (조는 얼굴) + 가는 기둥 + 흰 받침 */
function StarLamp({ uid }: { uid: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor="#fff3c2" stopOpacity={0.95} />
          <stop offset="0.55" stopColor="#ffe08a" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffe08a" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={50} cy={46} r={50} fill={`url(#${uid}-glow)`} />
      <rect x={47} y={74} width={6} height={52} rx={3} fill="#e3edf8" stroke="#bcd3ee" strokeWidth={1.6} />
      <ellipse cx={50} cy={128} rx={24} ry={6.5} fill="#ffffff" stroke="#bcd3ee" strokeWidth={2.2} />
      <path
        d="M50 12 L59.4 32.1 L81.4 34.7 L65.2 49.8 L69.4 71.6 L50 60.8 L30.6 71.6 L34.8 49.8 L18.6 34.7 L40.6 32.1 Z"
        fill="#ffd66b"
        stroke="#e9ad2f"
        strokeWidth={4}
      />
      <path d="M42 30 L46 22" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={3} />
      <path d="M40 46 Q43 49 46 46 M54 46 Q57 49 60 46" fill="none" stroke="#22304a" strokeWidth={1.9} />
      <ellipse cx={38} cy={52} rx={3.4} ry={2} fill="#ffb0a0" fillOpacity={0.8} />
      <ellipse cx={62} cy={52} rx={3.4} ry={2} fill="#ffb0a0" fillOpacity={0.8} />
    </g>
  );
}

/** 리본 상자 (100×100): 하늘 상자 + 뚜껑 + 딸기우유 리본 */
function GiftBox() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <rect x={16} y={42} width={68} height={54} rx={7} fill="#cfe6ff" stroke="#93bff0" strokeWidth={2.4} />
      <rect x={10} y={30} width={80} height={16} rx={6} fill="#e6f2ff" stroke="#93bff0" strokeWidth={2.4} />
      <rect x={44} y={30} width={12} height={66} fill="#ff9fb8" />
      <path d="M44 30 V96 M56 30 V96" stroke="#ef8fab" strokeWidth={1.6} />
      <path d="M50 28 C40 12 22 14 26 24 C28 30 40 30 50 28 Z" fill="#ffb3c8" stroke="#ef8fab" strokeWidth={2.4} />
      <path d="M50 28 C60 12 78 14 74 24 C72 30 60 30 50 28 Z" fill="#ffb3c8" stroke="#ef8fab" strokeWidth={2.4} />
      <circle cx={50} cy={28} r={5.5} fill="#ff9fb8" stroke="#ef8fab" strokeWidth={2.2} />
      <path d="M22 50 V64" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={3.2} />
    </g>
  );
}
