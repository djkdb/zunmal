import { RARITY_META, type Rarity } from '../data/rarity';

/** 희귀도 표시: 색 + 기호 + 텍스트(색만으로 구분하지 않음) */
export function RarityBadge({ rarity, compact = false }: { rarity: Rarity; compact?: boolean }) {
  const meta = RARITY_META[rarity];
  return (
    <span className={`rarity-badge rarity-badge--${rarity}${compact ? ' rarity-badge--compact' : ''}`}>
      <span aria-hidden="true">{meta.icon}</span>
      <span>{meta.label}</span>
      {!compact && (
        <span className="rarity-badge__stars" aria-label={`별 ${meta.stars}개`}>
          {'★'.repeat(meta.stars)}
        </span>
      )}
    </span>
  );
}
