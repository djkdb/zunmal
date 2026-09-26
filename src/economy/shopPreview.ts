/**
 * 디저트 가게 직원 바꾸기 미리 보기 — 순수 모듈 (가게 청크 전용이라 economy/shop.ts 에서 떼어 둔다).
 * 고르기 창의 "지금 50 → 54코인/시간 (+8%)"는 가게 화면 합계와 같은 함수(assignStaff → computeShopRates → shownPerHour)로 계산한다.
 */
import { assignStaff, computeShopRates, shownPerHour, type ShopContext, type ShopRates, type StaffRate } from './shop';

export type RateTrend = 'up' | 'down' | 'same';

export interface SetBonusChange {
  id: string;
  name: string;
  /** 바꾸기 전·후 세트 보너스 (없으면 0) */
  before: number;
  after: number;
}

export interface StaffChangePreview {
  /** 바꾼 뒤 직원 목록 (assignStaff 결과 그대로) */
  staff: string[];
  before: ShopRates;
  after: ShopRates;
  /** 화면에 보이는 가게 전체 시간당 (shownPerHour) */
  beforePerHour: number;
  afterPerHour: number;
  /** 보이는 값 기준 방향 */
  trend: RateTrend;
  /** 보이는 값 기준 변화율(%, 반올림). 지금이 0이면 null */
  percent: number | null;
  /** 이 말랑이가 그 자리에서 버는 시간당 (자리를 비우면 null) */
  own: StaffRate | null;
  /** 세트 보너스가 생기거나 사라지거나 바뀌는 세트 (다른 직원에게도 영향) */
  sets: SetBonusChange[];
}

/**
 * "칸 slot 에 id 를 두면(null 이면 비우면)" 가게 전체 시간당이 어떻게 바뀌나.
 * 가게 화면과 똑같이 assignStaff → computeShopRates 로 계산한다(세트 호흡·쭉쭉 도움처럼 다른 직원에게 가는 보너스까지 포함).
 */
export function previewStaffChange(
  staff: readonly string[],
  slot: number,
  id: string | null,
  slots: number,
  ctx: ShopContext,
): StaffChangePreview {
  const before = computeShopRates(staff.slice(0, slots), ctx);
  const nextStaff = assignStaff(staff, slot, id, slots);
  const after = computeShopRates(nextStaff, ctx);
  const beforePerHour = shownPerHour(before.perHour);
  const afterPerHour = shownPerHour(after.perHour);
  const trend: RateTrend = afterPerHour > beforePerHour ? 'up' : afterPerHour < beforePerHour ? 'down' : 'same';
  const percent = beforePerHour > 0 ? Math.round(((afterPerHour - beforePerHour) / beforePerHour) * 100) : null;
  const own = id === null ? null : (after.staff.find((s) => s.id === id) ?? null);

  const sets: SetBonusChange[] = [];
  const setIds = new Set([...before.sets.map((s) => s.id), ...after.sets.map((s) => s.id)]);
  for (const setId of setIds) {
    const b = before.sets.find((s) => s.id === setId);
    const a = after.sets.find((s) => s.id === setId);
    const bv = b?.bonus ?? 0;
    const av = a?.bonus ?? 0;
    if (Math.abs(av - bv) > 1e-9) sets.push({ id: setId, name: a?.name ?? b?.name ?? '', before: bv, after: av });
  }
  return { staff: nextStaff, before, after, beforePerHour, afterPerHour, trend, percent, own, sets };
}
