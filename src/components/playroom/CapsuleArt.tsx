import { useId } from 'react';
import type { Rarity } from '../../data/rarity';

/** 등급별 캡슐 윗뚜껑 색 (캡슐 머신과 같은 색) */
export const CAPSULE_TOP: Record<Rarity, string> = {
  common: '#dfe7f1',
  rare: '#7fbfff',
  epic: '#c79bff',
  legendary: '#ffc94d',
  mythic: 'rainbow',
  secret: 'cosmic',
};

/**
 * 뽑기 캡슐 그림 (캡슐 머신과 같은 파스텔 캡슐 + 흰 이음새). 윗뚜껑(.cap-top)과 아랫단(.cap-bottom)을 따로 움직일 수 있다 —
 * 놀이방은 CSS 변수(--cap-twist 각도, --cap-gap px, --cap-crack 0..1)로 비틀고 벌린다.
 */
export function CapsuleArt({ rarity, className }: { rarity: Rarity; className?: string }) {
  const id = `cap${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const top = CAPSULE_TOP[rarity];
  const fill = top === 'rainbow' ? `url(#${id}-rainbow)` : top === 'cosmic' ? `url(#${id}-cosmic)` : top;
  return (
    <svg className={className} viewBox="-36 -36 72 72" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-cosmic`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#8f6bff" />
          <stop offset="0.55" stopColor="#2d1b5e" />
          <stop offset="1" stopColor="#120a2e" />
        </radialGradient>
        <linearGradient id={`${id}-rainbow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8fab" />
          <stop offset="0.3" stopColor="#ffd966" />
          <stop offset="0.6" stopColor="#7fd8be" />
          <stop offset="1" stopColor="#c3a6ff" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="40%" cy="80%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#1a4080" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <g className="cap-bottom">
        <path d="M-30 0 A30 30 0 0 0 30 0 Z" fill="#fff" stroke="#1a4080" strokeOpacity="0.16" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-26 2 A26 26 0 0 0 26 2 Z" fill={`url(#${id}-shine)`} />
      </g>
      <g className="cap-top">
        <path d="M-30 0 A30 30 0 0 1 30 0 Z" fill={fill} stroke="#1a4080" strokeOpacity="0.16" strokeWidth="2" strokeLinejoin="round" />
        <ellipse cx="-12" cy="-16" rx="8" ry="4.5" fill="#fff" opacity="0.7" transform="rotate(-30 -12 -16)" />
        {top === 'cosmic' && (
          <g fill="#ffe07a">
            <circle cx="8" cy="-18" r="1.8" />
            <circle cx="16" cy="-8" r="1.2" />
            <circle cx="-4" cy="-6" r="1.4" />
          </g>
        )}
        <rect x="-30" y="-2" width="60" height="4" rx="2" fill="#fff" />
        {/* 비틀면 보이는 금 */}
        <path className="cap-crack" d="M-8 -3 l4 -5 l3 4 l4 -6" fill="none" stroke="#22304a" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
