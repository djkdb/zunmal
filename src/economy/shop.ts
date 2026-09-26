/**
 * 말랑 디저트 가게 — 방치형 수입. 순수 모듈 (React/DOM/Zustand 무관, 시간은 ms 로 주입).
 *
 * 캡슐을 연 말랑이가 가게 직원으로 일하며 실제 시간만큼 코인을 모은다(앱을 닫아 둬도).
 *  - 직원 칸은 모은 말랑이 종류 수로 열린다(`unlockedSlots`).
 *  - 직원 한 마리의 시간당 코인 = 희귀도 기본값 × (1 + 친밀도 + 반짝 + 촉감 특기 + 쭉쭉 도움 + 세트) — 보너스는 더한다.
 *  - 가득 차는 시간(`SHOP_CAP_HOURS`, 슬로우 라이징 직원이 있으면 조금 더)어치를 넘으면 멈춘다.
 *  - 서버가 없어 기기 시계를 쓴다: 경과 시간은 0..가득 참 시간으로 자르고, 시계가 거꾸로 가면 주지 않고 기준을 지금으로.
 *    한 번에 받는 코인은 가득 찬 양을 넘지 않는다.
 * 모든 숫자는 economy/config.ts.
 */
import { levelOf } from '../data/affection';
import { getCharacter } from '../data/characters';
import { COLLECTIONS } from '../data/collections';
import { materialIdFor, type MaterialId } from '../data/materialIds';
import type { Rarity } from '../data/rarity';
import {
  SHOP_AFFECTION_BONUS,
  SHOP_CAP_HOURS,
  SHOP_MATERIAL_PERKS,
  SHOP_RATE_PER_HOUR,
  SHOP_SET_BONUS_PER_MEMBER,
  SHOP_SHINY_BONUS,
  SHOP_SLOT_UNLOCKS,
} from './config';

const HOUR_MS = 3_600_000;

/** 저장되는 가게 상태 (store/persistence.ts SaveData.shop) */
export interface ShopSave {
  /** 일하는 말랑이 id (칸 순서, 빈칸 없이 앞에서부터). 항상 unboxed ∩ 보유, 중복 없음, 열린 칸 수 이하 */
  staff: string[];
  /** 마지막으로 정산한 시각 (epoch ms). 이때부터 지금까지가 새로 쌓인 시간이다 */
  lastTickAt: number;
  /** 정산해 둔 코인 (직원을 바꿀 때 지금까지 번 코인을 여기 넣어 두어 잃지 않는다) */
  banked: number;
}

export const SHOP_MAX_SLOTS = SHOP_SLOT_UNLOCKS.length;

/** 모은 말랑이 종류 수 → 열린 직원 칸 수 (0..SHOP_MAX_SLOTS) */
export function unlockedSlots(ownedCount: number): number {
  return SHOP_SLOT_UNLOCKS.filter((need) => ownedCount >= need).length;
}

/** 다음 칸이 열리는 말랑이 수 (모두 열렸으면 null) */
export function nextSlotAt(ownedCount: number): number | null {
  return SHOP_SLOT_UNLOCKS.find((need) => ownedCount < need) ?? null;
}

export type ShopBonusKind = 'affection' | 'shiny' | 'jelly' | 'help' | 'set';

export interface ShopBonus {
  kind: ShopBonusKind;
  /** 더하는 비율 (0.1 = +10%) */
  amount: number;
  /** 세트 보너스면 세트 이름 (칩 글자는 components/shop/perks.ts bonusLabel) */
  setName?: string;
}

export interface StaffRate {
  id: string;
  rarity: Rarity;
  material: MaterialId;
  /** 희귀도 기본 시간당 코인 */
  base: number;
  bonuses: ShopBonus[];
  /** 1 + 보너스 합 */
  multiplier: number;
  /** 시간당 코인 (소수 그대로 — 화면에는 반올림) */
  perHour: number;
}

export interface ShopSetSynergy {
  id: string;
  name: string;
  /** 이 세트에 속한 직원 수 (2 이상만 목록에 나온다) */
  count: number;
  bonus: number;
}

export interface ShopRates {
  staff: StaffRate[];
  /** 가게 전체 시간당 코인 */
  perHour: number;
  /** 가득 차는 시간 (기본 + 슬로우 라이징 특기) */
  capHours: number;
  /** 가득 찬 코인 양 = floor(시간당 × 가득 참 시간) */
  capCoins: number;
  sets: ShopSetSynergy[];
}

export interface ShopContext {
  /** 보유 말랑이 (반짝 수를 본다) */
  owned: Readonly<Record<string, { shinyCount: number } | undefined>>;
  affection: Readonly<Record<string, number | undefined>>;
}

/** 친밀도 보너스 (찐득이는 두 배) */
export function affectionBonus(affection: number, material: MaterialId): number {
  const mult = material === 'sticky' ? SHOP_MATERIAL_PERKS.stickyAffectionMultiplier : 1;
  const raw = (levelOf(affection) - 1) * SHOP_AFFECTION_BONUS.perLevel * mult;
  return Math.min(SHOP_AFFECTION_BONUS.max * mult, raw);
}

/** 직원 목록 → 직원마다 시간당 코인과 보너스, 가게 합계. 모르는 id 는 건너뛴다. */
export function computeShopRates(staffIds: readonly string[], ctx: ShopContext): ShopRates {
  const members = staffIds
    .map((id) => getCharacter(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  const ids = new Set(members.map((c) => c.id));

  // 세트: 같은 세트 직원이 둘 이상이면 그 직원들에게 (n-1)×10%. 여러 세트에 걸치면 가장 큰 것 하나
  const sets: ShopSetSynergy[] = [];
  for (const col of COLLECTIONS) {
    const count = col.memberIds.filter((id) => ids.has(id)).length;
    if (count >= 2) sets.push({ id: col.id, name: col.name, count, bonus: (count - 1) * SHOP_SET_BONUS_PER_MEMBER });
  }
  sets.sort((a, b) => b.bonus - a.bonus);

  const materials = members.map((c) => materialIdFor(c.id));
  const stretchyCount = materials.filter((m) => m === 'stretchy').length;
  const slowRiseCount = materials.filter((m) => m === 'slowRise').length;

  const staff = members.map((c, i): StaffRate => {
    const material = materials[i] ?? 'jelly';
    const bonuses: ShopBonus[] = [];
    const aff = affectionBonus(ctx.affection[c.id] ?? 0, material);
    if (aff > 0) bonuses.push({ kind: 'affection', amount: aff });
    if ((ctx.owned[c.id]?.shinyCount ?? 0) > 0) {
      bonuses.push({ kind: 'shiny', amount: SHOP_SHINY_BONUS });
    }
    if (material === 'jelly') {
      bonuses.push({ kind: 'jelly', amount: SHOP_MATERIAL_PERKS.jellyBonus });
    }
    // 쭉쭉이 도움은 자기 자신을 뺀 쭉쭉이 수만큼
    const helpers = stretchyCount - (material === 'stretchy' ? 1 : 0);
    if (helpers > 0) {
      bonuses.push({ kind: 'help', amount: helpers * SHOP_MATERIAL_PERKS.stretchyHelpBonus });
    }
    const set = sets.find((s) => getCollectionMembers(s.id).includes(c.id));
    if (set) bonuses.push({ kind: 'set', amount: set.bonus, setName: set.name });

    const base = SHOP_RATE_PER_HOUR[c.rarity];
    const multiplier = 1 + bonuses.reduce((sum, b) => sum + b.amount, 0);
    return { id: c.id, rarity: c.rarity, material, base, bonuses, multiplier, perHour: base * multiplier };
  });

  const perHour = staff.reduce((sum, s) => sum + s.perHour, 0);
  const extra = Math.min(
    SHOP_MATERIAL_PERKS.slowRiseMaxExtraHours,
    slowRiseCount * SHOP_MATERIAL_PERKS.slowRiseExtraHours,
  );
  const capHours = SHOP_CAP_HOURS + extra;
  return { staff, perHour, capHours, capCoins: Math.floor(perHour * capHours), sets };
}

function getCollectionMembers(id: string): readonly string[] {
  return COLLECTIONS.find((c) => c.id === id)?.memberIds ?? [];
}

// ── 쌓이기·정산 ──────────────────────────────────────────────

export interface ShopReading {
  /** 지금 받을 수 있는 코인 (정수) */
  coins: number;
  /** 쌓인 양 (소수) */
  exact: number;
  /** 가득 참 대비 0..1 (가득 찬 코인이 0이면 쌓아 둔 게 있을 때 1) */
  fill: number;
  full: boolean;
}

/** 경과 시간: 0..가득 참 시간으로 자른다 (시계가 거꾸로 가면 0) */
export function elapsedMs(lastTickAt: number, now: number, capHours: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(lastTickAt)) return 0;
  return Math.min(Math.max(0, now - lastTickAt), capHours * HOUR_MS);
}

/** 지금 가게에 쌓인 코인 */
export function readShop(save: ShopSave, rates: ShopRates, now: number): ShopReading {
  const banked = Math.max(0, save.banked);
  const cap = rates.capCoins;
  const earned = (rates.perHour * elapsedMs(save.lastTickAt, now, rates.capHours)) / HOUR_MS;
  // 직원을 바꿔 가득 참 양이 줄어도 이미 쌓아 둔 코인은 줄이지 않는다 (더 쌓이지만 않음)
  const exact = banked >= cap ? banked : Math.min(cap, banked + earned);
  const full = cap > 0 ? exact >= cap : false;
  const fill = cap > 0 ? Math.min(1, exact / cap) : exact >= 1 ? 1 : 0;
  return { coins: Math.floor(exact), exact, fill, full };
}

/**
 * 지금까지 번 코인을 banked 에 넣고 기준 시각을 지금으로 옮긴다 (직원 바꾸기 전에 부른다).
 * 소수 부분은 버리지 않고 기준 시각을 그만큼 앞당겨 남긴다. 시계가 거꾸로 갔으면 주지 않고 기준만 지금으로.
 */
export function settleShop(save: ShopSave, rates: ShopRates, now: number): ShopSave {
  if (!Number.isFinite(now)) return save;
  if (now < save.lastTickAt) return { ...save, lastTickAt: now };
  const r = readShop(save, rates, now);
  const banked = r.coins;
  let lastTickAt = now;
  if (!r.full && rates.perHour > 0) {
    const leftover = r.exact - banked; // 0..1 코인
    lastTickAt = now - Math.floor((leftover / rates.perHour) * HOUR_MS);
  }
  return { ...save, banked, lastTickAt };
}

/** 받기: 쌓인 정수 코인을 모두 내준다. 1코인도 없으면 그대로. */
export function claimShop(save: ShopSave, rates: ShopRates, now: number): { coins: number; save: ShopSave } {
  const settled = settleShop(save, rates, now);
  if (settled.banked < 1) return { coins: 0, save: settled };
  return { coins: settled.banked, save: { ...settled, banked: 0 } };
}

/**
 * 칸 slot 에 id 를 넣는다 (null 이면 비운다). 이미 다른 칸에 있으면 자리를 바꾼다.
 * 결과는 빈칸 없이 앞에서부터, slots 개까지.
 */
export function assignStaff(staff: readonly string[], slot: number, id: string | null, slots: number): string[] {
  const next = staff.slice(0, slots);
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) return next;
  if (id === null) return next.filter((_, i) => i !== slot);
  const from = next.indexOf(id);
  if (from === slot) return next;
  if (slot >= next.length) {
    if (from >= 0) next.splice(from, 1);
    next.push(id);
    return next;
  }
  const prev = next[slot];
  next[slot] = id;
  if (from >= 0) {
    if (prev !== undefined) next[from] = prev;
    else next.splice(from, 1);
  }
  return next;
}
