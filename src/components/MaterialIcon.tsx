import type { MaterialId } from '../data/materialIds';

interface MaterialIconProps {
  material: MaterialId;
  size?: number;
  className?: string;
}

const INK = '#22304a';

/**
 * 첫 화면 번들(첫 말랑이 고르기)·도감·뽑기 결과용 촉감 그림. 놀이방의 `playroom/MaterialIcon` 과 같은 그림을 따로 둔다 —
 * 놀이방 청크와 모듈을 나눠 쓰면 번들러가 첫 화면을 조각 9개로 쪼갠다(측정). 그림을 고치면 두 곳을 함께 고친다.
 *
 * 촉감 작은 그림 (둥근 선 + 파스텔 채움, icons.tsx 와 같은 결). 색만이 아니라 모양으로 구분한다:
 * 슬로우 라이징 = 손가락 자국이 남은 식빵, 탱탱 젤리 = 반짝 튀는 방울, 쭉쭉이 = 양쪽으로 늘어난 떡, 찐득이 = 흘러내리는 방울.
 */
export function MaterialIcon({ material, size = 18, className }: MaterialIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {material === 'slowRise' && (
        <>
          <path
            d="M5 26 V14 C5 7 10 5 16 5 C22 5 27 7 27 14 V26 Z"
            fill="#ffe2b8"
            stroke={INK}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <ellipse cx={16} cy={14} rx={5} ry={3} fill="#f2c48f" stroke={INK} strokeWidth={1.6} />
          <path d="M9 21 h14" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2 3" />
        </>
      )}
      {material === 'jelly' && (
        <>
          <path
            d="M16 4 C23 12 27 16 27 21 A11 9 0 0 1 5 21 C5 16 9 12 16 4 Z"
            fill="#9fe8ff"
            stroke={INK}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path d="M10.5 18 q1.5 -4 5 -6" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <path d="M3 9 l3 2 M29 9 l-3 2" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {material === 'stretchy' && (
        <>
          <path
            d="M3 16 C3 10 9 10 11 13 C13 15 19 15 21 13 C23 10 29 10 29 16 C29 22 23 22 21 19 C19 17 13 17 11 19 C9 22 3 22 3 16 Z"
            fill="#ffd0e0"
            stroke={INK}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          <path d="M6 7 l-3 -2 M26 7 l3 -2 M6 25 l-3 2 M26 25 l3 2" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {material === 'sticky' && (
        <>
          <path
            d="M5 12 C5 6 10 4 16 4 C22 4 27 6 27 12 C27 16 26 17 25 19 C24 22 25 27 22.5 27 C20 27 21 22 19 21 C17 20 16 26 13 26 C10 26 11.5 21 9.5 20 C7 19 5 17 5 12 Z"
            fill="#c8f08a"
            stroke={INK}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          <path d="M10 10 q2 -3 5 -3" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
}

