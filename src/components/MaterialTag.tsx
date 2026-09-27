import { MATERIAL_LABELS, materialIdFor } from '../data/materialIds';
import { MaterialIcon } from './MaterialIcon';
import './MaterialTag.css';

interface MaterialTagProps {
  /** 말랑이 id — 촉감은 id 에서 계산한다 (data/materialIds.ts) */
  characterId: string;
  /** 'full' = 흰 알약 안에 그림 + 이름, 'icon' = 그림만 (좁은 10연 카드 — 이름은 스크린리더·title 로) */
  variant?: 'full' | 'icon';
  /** 부모 이름표가 이미 촉감을 읽어 주면 true (그림·글자 모두 aria-hidden) */
  decorative?: boolean;
  className?: string;
}

/** 촉감 딱지: 모양으로 구분되는 촉감 그림 + 이름 ("슬로우 라이징" 등). 고를 때 어떤 손맛인지 보이게 */
export function MaterialTag({ characterId, variant = 'full', decorative = false, className = '' }: MaterialTagProps) {
  const material = materialIdFor(characterId);
  const label = MATERIAL_LABELS[material];
  if (variant === 'icon') {
    return (
      <span
        className={`material-tag material-tag--icon ${className}`}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : `촉감 ${label}`}
        aria-hidden={decorative ? true : undefined}
        title={label}
      >
        <MaterialIcon material={material} size={16} />
      </span>
    );
  }
  return (
    <span className={`material-tag ${className}`} aria-hidden={decorative ? true : undefined}>
      <MaterialIcon material={material} size={16} />
      <span className="material-tag__name">
        <span className="visually-hidden">촉감 </span>
        {label}
      </span>
    </span>
  );
}
