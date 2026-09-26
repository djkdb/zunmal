import type { ShopBonus } from '../../economy/shop';
import { bonusLabel } from './perks';

/**
 * 직원 보너스 칩 줄 (친밀도·반짝·탱탱·쭉쭉 도움·세트).
 * base 를 주면 맨 앞에 희귀도 기본값 칩("기본 20")을 둔다 — 시간당 = 기본 × (1 + 보너스 합)을 한눈에.
 * 보여 줄 칩이 없으면 아무것도 그리지 않는다.
 */
export function BonusChips({ bonuses, base }: { bonuses: readonly ShopBonus[]; base?: number }) {
  if (bonuses.length === 0 && base === undefined) return null;
  return (
    <span className="shop-bonuses">
      {base !== undefined && <span className="shop-bonus shop-bonus--base">기본 {base}</span>}
      {bonuses.map((b) => (
        <span key={b.kind} className={`shop-bonus shop-bonus--${b.kind}`}>
          {bonusLabel(b)}
        </span>
      ))}
    </span>
  );
}
