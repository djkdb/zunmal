import type { MaterialId } from '../../data/materialIds';
import { SHOP_MATERIAL_PERKS } from '../../economy/config';
import type { ShopBonus } from '../../economy/shop';

const pct = (v: number) => Math.round(v * 100);

/**
 * 가게 화면 글자 — 가게 화면 전용이라 첫 화면 번들 밖(가게 청크)에 둔다. 순수 모듈.
 */

/** 보너스 칩 글자 ("친밀도 +10%", "디저트 가게 세트 +20%") */
export function bonusLabel(b: ShopBonus): string {
  const p = `+${pct(b.amount)}%`;
  switch (b.kind) {
    case 'affection':
      return `친밀도 ${p}`;
    case 'shiny':
      return `반짝 ${p}`;
    case 'jelly':
      return `탱탱 ${p}`;
    case 'help':
      return `쭉쭉 도움 ${p}`;
    case 'set':
      return `${b.setName ?? ''} 세트 ${p}`;
  }
}

/** 촉감별 특기 한 줄 (가게 화면에 그대로 보인다) */
export const MATERIAL_PERK_TEXT: Readonly<Record<MaterialId, string>> = {
  slowRise: `느긋하게 버텨서 가게가 ${SHOP_MATERIAL_PERKS.slowRiseExtraHours}시간 더 늦게 차요`,
  jelly: `통통 튀며 일해서 수입 +${pct(SHOP_MATERIAL_PERKS.jellyBonus)}%`,
  stretchy: `팔을 쭉 뻗어 다른 직원 수입 +${pct(SHOP_MATERIAL_PERKS.stretchyHelpBonus)}%`,
  sticky: `딱 붙어 정이 들어서 친밀도 보너스가 ${SHOP_MATERIAL_PERKS.stickyAffectionMultiplier}배`,
};

