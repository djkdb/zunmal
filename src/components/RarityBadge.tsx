import { RARITY_META, type Rarity } from '../data/rarity';

/** 희귀도별 모양 기호 (색만으로 구분하지 않도록). 글꼴에 없는 문자 대신 SVG로 그린다. */
function RarityShape({ rarity }: { rarity: Rarity }) {
  const common = { fill: 'currentColor' };
  switch (rarity) {
    case 'common':
      return <circle cx="6" cy="6" r="3.6" {...common} />;
    case 'rare':
      return <path d="M6 1.2 L10.8 6 L6 10.8 L1.2 6 Z" {...common} />;
    case 'epic':
      return <path d="M6 0.6 Q7 5 11.4 6 Q7 7 6 11.4 Q5 7 0.6 6 Q5 5 6 0.6 Z" {...common} />;
    case 'legendary':
      return <path d="M1 9.8 L1 3.2 L3.8 5.6 L6 1.6 L8.2 5.6 L11 3.2 L11 9.8 Z" {...common} strokeLinejoin="round" />;
    case 'mythic':
      return (
        <path
          d="M6 0.4 L7.2 4.1 L11 3.2 L8.4 6 L11 8.8 L7.2 7.9 L6 11.6 L4.8 7.9 L1 8.8 L3.6 6 L1 3.2 L4.8 4.1 Z"
          {...common}
        />
      );
    case 'secret':
      // 초승달 + 작은 별
      return (
        <>
          <path d="M7.6 1.2 A5 5 0 1 0 10.8 8.4 A4 4 0 1 1 7.6 1.2 Z" {...common} />
          <path d="M9.6 1 L10.2 2.6 L11.8 3.2 L10.2 3.8 L9.6 5.4 L9 3.8 L7.4 3.2 L9 2.6 Z" {...common} />
        </>
      );
  }
}

/** 희귀도 표시: 색 + 모양 + 텍스트 */
export function RarityBadge({ rarity, compact = false }: { rarity: Rarity; compact?: boolean }) {
  const meta = RARITY_META[rarity];
  return (
    <span className={`rarity-badge rarity-badge--${rarity}${compact ? ' rarity-badge--compact' : ''}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <RarityShape rarity={rarity} />
      </svg>
      <span>{meta.label}</span>
      {!compact && (
        <span className="rarity-badge__stars" aria-label={`별 ${meta.stars}개`}>
          {'★'.repeat(meta.stars)}
        </span>
      )}
    </span>
  );
}
