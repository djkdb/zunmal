/**
 * 좌우 이동 버튼용 화살표. 글꼴에 ◀▶ 글리프가 없는 기기(iOS)에서 빈 버튼이 되지 않도록 SVG로 그린다.
 */
export function ArrowIcon({ dir, size = 26 }: { dir: 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d={dir === 'left' ? 'M21 6 L9 16 L21 26 Z' : 'M11 6 L23 16 L11 26 Z'}
        fill="#2b2233"
        stroke="#2b2233"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}
