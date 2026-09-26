import type { FillingKind, MaterialId } from '../../data/materials';

interface MaterialIconProps {
  material: MaterialId;
  size?: number;
  className?: string;
}

const INK = '#2b2233';

/**
 * 촉감 작은 그림 (잉크 외곽선 스티커). 색만이 아니라 모양으로 구분한다:
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

/** 몸속 특별한 속 작은 그림 */
export function FillingIcon({ kind, colors, size = 18 }: { kind: FillingKind; colors: readonly [string, string]; size?: number }) {
  const [a, b] = colors;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx={16} cy={16} r={12.5} fill="#fffdf8" stroke={INK} strokeWidth={2.4} />
      {kind === 'glitter' && (
        <>
          <path d="M16 7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 l7 -2 Z" fill={a} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          <circle cx={9} cy={11} r={1.6} fill={b} />
          <circle cx={23} cy={22} r={1.6} fill={b} />
        </>
      )}
      {kind === 'starBeads' && (
        <>
          <circle cx={12} cy={13} r={5} fill={a} stroke={INK} strokeWidth={1.4} />
          <circle cx={20.5} cy={20} r={4.2} fill={a} stroke={INK} strokeWidth={1.4} />
          <path d="M12 10.4 l0.9 1.8 2 0.3 -1.45 1.4 0.35 2 -1.8 -0.95 -1.8 0.95 0.35 -2 -1.45 -1.4 2 -0.3 Z" fill={b} stroke={INK} strokeWidth={0.8} />
        </>
      )}
      {kind === 'galaxy' && (
        <>
          <path d="M16 16 m-8 0 a8 8 0 0 1 12 -6 M16 16 m8 0 a8 8 0 0 1 -12 6" fill="none" stroke={a} strokeWidth={3} strokeLinecap="round" />
          <circle cx={16} cy={16} r={3} fill={b} stroke={INK} strokeWidth={1.2} />
        </>
      )}
      {kind === 'rainbowGel' && (
        <>
          <path d="M7 20 a9 9 0 0 1 18 0" fill="none" stroke="#ff8fb1" strokeWidth={3} strokeLinecap="round" />
          <path d="M10.5 20 a5.5 5.5 0 0 1 11 0" fill="none" stroke="#ffd84d" strokeWidth={3} strokeLinecap="round" />
          <path d="M14 20 a2 2 0 0 1 4 0" fill="none" stroke="#7ad7ff" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
