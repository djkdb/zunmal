/**
 * 잉크 외곽선 아이콘 세트. 이모지 대신 사용해 말랑이/머신과 같은 선 굵기·톤을 유지한다.
 * 모두 장식용(aria-hidden) — 의미는 주변 텍스트나 aria-label이 전달한다.
 */
import type { SVGProps } from 'react';

const INK = '#2b2233';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={INK}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 코인: 테두리 톱니 + 가운데 말랑 얼굴 각인 */
export function CoinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="16" cy="16" r="12.5" fill="#ffd84d" />
      <circle cx="16" cy="16" r="8.5" fill="#ffe89a" strokeWidth={1.8} />
      <circle cx="13" cy="15.5" r="1.2" fill={INK} stroke="none" />
      <circle cx="19" cy="15.5" r="1.2" fill={INK} stroke="none" />
      <path d="M14.5 18.6 q1.5 1.2 3 0" strokeWidth={1.6} />
    </Svg>
  );
}

/** 홈: 줄무늬 차양이 달린 가게 */
export function ShopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 14 v12 h20 v-12" fill="#fff9ee" />
      <path d="M4 8 h24 l-1.5 6 q-2.2 2.4 -4.4 0 q-2.2 2.4 -4.4 0 q-1.7 2.4 -3.4 0 q-2.2 2.4 -4.4 0 q-2.2 2.4 -4.4 0 Z" fill="#ff9db4" />
      <path d="M13 26 v-6 h6 v6" />
    </Svg>
  );
}

/** 미니게임: 조이스틱 */
export function JoystickIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 22 h22 v5 h-22 Z" fill="#8ed081" />
      <path d="M16 22 v-9" />
      <circle cx="16" cy="9" r="4.5" fill="#ff6f91" />
      <circle cx="23" cy="19" r="1.6" fill={INK} stroke="none" />
    </Svg>
  );
}

/** 뽑기: 캡슐 */
export function CapsuleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 16 a11 11 0 0 1 22 0 Z" fill="#6ec6ff" />
      <path d="M5 16 a11 11 0 0 0 22 0 Z" fill="#fff9ee" />
      <path d="M10 10.5 q2 -2 4.5 -2.6" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

/** 도감: 펼친 책 */
export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 9 q-5 -3.5 -12 -2 v17 q7 -1.5 12 2 q5 -3.5 12 -2 v-17 q-7 -1.5 -12 2 Z" fill="#fff9ee" />
      <path d="M16 9 v17" />
      <circle cx="10" cy="15" r="2.2" fill="#ffd84d" strokeWidth={1.6} />
    </Svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 h5 l6 -5 v17 l-6 -5 h-5 Z" fill="#fff9ee" />
      <path d="M20.5 12 q2.5 4 0 8" />
      <path d="M24 9 q4.5 7 0 14" />
    </Svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 h5 l6 -5 v17 l-6 -5 h-5 Z" fill="#fff9ee" />
      <path d="M21 12.5 l6 7 M27 12.5 l-6 7" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 9 l14 14 M23 9 l-14 14" strokeWidth={3.2} />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 7.5 l14 8.5 l-14 8.5 Z" fill="#ffd84d" />
    </Svg>
  );
}

/** 만지기: 말랑이를 쓰다듬는 손 + 하트 */
export function PetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21 q0 -8 11 -8 q11 0 11 8 q0 5 -11 5 q-11 0 -11 -5 Z" fill="#ffb8c9" />
      <circle cx="12.5" cy="20" r="1.2" fill={INK} stroke="none" />
      <circle cx="19.5" cy="20" r="1.2" fill={INK} stroke="none" />
      <path d="M22 3.5 c-1.6 -1.8 -4.5 -0.6 -4 1.8 c0.4 1.7 4 4 4 4 s3.6 -2.3 4 -4 c0.5 -2.4 -2.4 -3.6 -4 -1.8 Z" fill="#ff6f91" strokeWidth={2} />
    </Svg>
  );
}
