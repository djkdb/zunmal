import type { MaterialId } from '../../data/materialIds';
import { SHOP_MATERIAL_PERKS } from '../../economy/config';
import type { ShopBonus } from '../../economy/shop';
import type { SetBonusChange, StaffChangePreview } from '../../economy/shopPreview';

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

const MINUTE_MS = 60_000;

/** 남은 시간 한 덩이: "3시간 20분", "3시간", "45분", 1분 미만은 "1분" (올림) */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil((Number.isFinite(ms) ? ms : 0) / MINUTE_MS));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 바꾸기 미리 보기의 변화 딱지: "+40%", "-6%", "그대로", 빈 가게에 처음 들이면 "+14코인" */
export function trendText(p: Pick<StaffChangePreview, 'trend' | 'percent' | 'afterPerHour' | 'beforePerHour'>): string {
  if (p.trend === 'same') return '그대로';
  if (p.percent === null) return `+${p.afterPerHour - p.beforePerHour}코인`;
  // 반올림으로 0%가 되어도 방향은 보이게 최소 1%
  const v = Math.max(1, Math.abs(p.percent));
  return `${p.trend === 'up' ? '+' : '-'}${v}%`;
}

/** 세트 보너스가 바뀌는 한 줄: "디저트 가게 세트 +10%가 생겨요", "… 세트가 깨져요", "… 세트 +20%로 올라요" */
export function setChangeText(c: SetBonusChange): string {
  const after = pct(c.after);
  if (c.before === 0) return `${c.name} 세트 +${after}%가 생겨요`;
  if (c.after === 0) return `${c.name} 세트가 깨져요`;
  return `${c.name} 세트 +${after}%로 ${c.after > c.before ? '올라요' : '내려가요'}`;
}

