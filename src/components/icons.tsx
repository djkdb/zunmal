/**
 * 둥근 선 아이콘 세트 (스카이 소다). 이모지 대신 쓴다.
 * 선은 currentColor — 놓인 자리의 글자색(잉크/보조색)을 따른다. 채움은 옅은 파스텔.
 * 모두 장식용(aria-hidden) — 의미는 주변 텍스트나 aria-label이 전달한다.
 */
import type { SVGProps } from 'react';

const INK = 'currentColor';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={INK}
      strokeWidth={2.2}
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
    <Svg stroke="#d99a1e" {...props}>
      <circle cx="16" cy="16" r="12.5" fill="#ffd35c" />
      <circle cx="16" cy="16" r="8.5" fill="#ffe597" strokeWidth={1.6} />
      <circle cx="13" cy="15.5" r="1.2" fill="#a86f0c" stroke="none" />
      <circle cx="19" cy="15.5" r="1.2" fill="#a86f0c" stroke="none" />
      <path d="M14.5 18.6 q1.5 1.2 3 0" stroke="#a86f0c" strokeWidth={1.5} />
    </Svg>
  );
}

/** 홈: 줄무늬 차양이 달린 가게 */
export function ShopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 14 v12 h20 v-12" fill="#fff" />
      <path d="M4 8 h24 l-1.5 6 q-2.2 2.4 -4.4 0 q-2.2 2.4 -4.4 0 q-1.7 2.4 -3.4 0 q-2.2 2.4 -4.4 0 q-2.2 2.4 -4.4 0 Z" fill="#ffc4d3" />
      <path d="M13 26 v-6 h6 v6" />
    </Svg>
  );
}

/** 미니게임: 조이스틱 */
export function JoystickIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 22 h22 v5 h-22 Z" fill="#bfeccf" />
      <path d="M16 22 v-9" />
      <circle cx="16" cy="9" r="4.5" fill="#ff9fb8" />
      <circle cx="23" cy="19" r="1.6" fill={INK} stroke="none" />
    </Svg>
  );
}

/** 뽑기: 캡슐 */
export function CapsuleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 16 a11 11 0 0 1 22 0 Z" fill="#b6d9ff" />
      <path d="M5 16 a11 11 0 0 0 22 0 Z" fill="#fff" />
      <path d="M10 10.5 q2 -2 4.5 -2.6" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

/** 도감: 펼친 책 */
export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 9 q-5 -3.5 -12 -2 v17 q7 -1.5 12 2 q5 -3.5 12 -2 v-17 q-7 -1.5 -12 2 Z" fill="#fff" />
      <path d="M16 9 v17" />
      <circle cx="10" cy="15" r="2.2" fill="#ffe08a" strokeWidth={1.6} />
    </Svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 h5 l6 -5 v17 l-6 -5 h-5 Z" fill="#fff" />
      <path d="M20.5 12 q2.5 4 0 8" />
      <path d="M24 9 q4.5 7 0 14" />
    </Svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 h5 l6 -5 v17 l-6 -5 h-5 Z" fill="#fff" />
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
      <path d="M11 7.5 l14 8.5 l-14 8.5 Z" fill="#ffe08a" />
    </Svg>
  );
}

/** 만지기: 말랑이를 쓰다듬는 손 + 하트 */
export function PetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21 q0 -8 11 -8 q11 0 11 8 q0 5 -11 5 q-11 0 -11 -5 Z" fill="#ffd0dc" />
      <circle cx="12.5" cy="20" r="1.2" fill={INK} stroke="none" />
      <circle cx="19.5" cy="20" r="1.2" fill={INK} stroke="none" />
      <path d="M22 3.5 c-1.6 -1.8 -4.5 -0.6 -4 1.8 c0.4 1.7 4 4 4 4 s3.6 -2.3 4 -4 c0.5 -2.4 -2.4 -3.6 -4 -1.8 Z" fill="#ff9fb8" strokeWidth={2} />
    </Svg>
  );
}

/** 톡 누르는 손가락: 위를 가리키는 검지 + 끝의 누름 표시 — "눌러 봐요" 안내용 */
export function TapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M13 17 V7.5 a2.6 2.6 0 0 1 5.2 0 V15 l4.6 0.9 a2.8 2.8 0 0 1 2.3 3.1 l-0.8 5.4 a4.6 4.6 0 0 1 -4.6 4 h-4.6 a4.6 4.6 0 0 1 -3.7 -1.9 l-4.2 -5.6 a2.3 2.3 0 0 1 3.5 -3 Z"
        fill="#fff"
      />
      <path d="M9.5 6 l-2.6 -1.4 M21.7 6 l2.6 -1.4 M8.6 10.5 h-2.8" strokeWidth={1.8} />
    </Svg>
  );
}

/** iOS 공유 버튼 모양 (네모 + 위 화살표) — 홈 화면 추가 안내용 */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 13 h-3 v14 h16 v-14 h-3" fill="#fff" />
      <path d="M16 20 v-15 M11 9.5 l5 -5 l5 5" />
    </Svg>
  );
}

/** 홈 화면 추가: 휴대폰 + 더하기 */
export function HomeAddIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="3.5" width="16" height="25" rx="3.5" fill="#fff" />
      <path d="M16 11 v8 M12 15 h8" stroke="#f27a9a" strokeWidth={3} />
      <path d="M14 24.5 h4" />
    </Svg>
  );
}

/** 점 세 개 메뉴 버튼 모양 */
export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="16" r="2.4" fill={INK} stroke="none" />
      <circle cx="16" cy="16" r="2.4" fill={INK} stroke="none" />
      <circle cx="24" cy="16" r="2.4" fill={INK} stroke="none" />
    </Svg>
  );
}

/** 음표 두 개 (배경음악) */
export function MusicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 23 V8 l13 -3 v15" />
      <path d="M12 12 l13 -3" />
      <ellipse cx="8.8" cy="23.2" rx="3.6" ry="2.9" fill="#fff" />
      <ellipse cx="21.8" cy="20.2" rx="3.6" ry="2.9" fill="#fff" />
    </Svg>
  );
}

/** 선물 상자: 딸기우유 상자 + 레몬 리본 */
export function GiftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 14 h20 v12.5 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 Z" fill="#ffc4d3" />
      <rect x="4" y="9.5" width="24" height="5" rx="1.5" fill="#ffe3ec" />
      <path d="M16 9.5 v18.5" stroke="#d99a1e" strokeWidth={3} />
      <path d="M16 9.5 c-2 -4.5 -7.5 -5 -7 -1.5 c0.3 2 4.5 1.5 7 1.5 c2.5 0 6.7 0.5 7 -1.5 c0.5 -3.5 -5 -3 -7 1.5 Z" fill="#ffd66b" />
    </Svg>
  );
}
