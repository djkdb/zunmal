import type { ShopBonus } from '../../economy/shop';
import { bonusLabel } from './perks';

/** 직원 보너스 칩 줄 (친밀도·반짝·탱탱·쭉쭉 도움·세트). 보너스가 없으면 아무것도 그리지 않는다. */
export function BonusChips({ bonuses }: { bonuses: readonly ShopBonus[] }) {
  if (bonuses.length === 0) return null;
  return (
    <span className="shop-bonuses">
      {bonuses.map((b) => (
        <span key={b.kind} className={`shop-bonus shop-bonus--${b.kind}`}>
          {bonusLabel(b)}
        </span>
      ))}
    </span>
  );
}
