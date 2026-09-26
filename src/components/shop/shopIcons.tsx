/**
 * 가게 화면 전용 아이콘 (icons.tsx 와 같은 결: 둥근 선 + 파스텔 채움, 선은 currentColor).
 * 가게 청크에만 들어가도록 따로 둔다.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
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

/** 자물쇠: 아직 열리지 않은 칸 */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 14 v-3.5 a5 5 0 0 1 10 0 v3.5" />
      <rect x="7.5" y="14" width="17" height="13" rx="3.5" fill="#dcebff" />
      <path d="M16 19 v3" strokeWidth={2.6} />
    </Svg>
  );
}

/** 더하기 (빈 칸에 넣기) */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 8 v16 M8 16 h16" strokeWidth={3} />
    </Svg>
  );
}
