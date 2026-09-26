/**
 * 친밀도 진행 — 순수 모듈. 도감 상세·놀이방 정보 카드·단계 축하 딱지가 같은 값을 읽는다.
 *
 * 새 규칙을 만들지 않는다. 이미 있는 셋을 한곳에 모을 뿐이다:
 *  - 단계·반응 표: `data/affection.ts` (`levelOf`, `REACTION_UNLOCKS`)
 *  - 가게 친밀도 보너스: `economy/shop.ts` `affectionBonus` (찐득이는 두 배)
 *  - 말랑 선물 코인: `economy/gift.ts` `giftCoins`
 * (가게·선물 공식이 economy 에 있어 data → economy 역방향 import 를 피하려고 여기 둔다.)
 *
 * 사용 예:
 * ```ts
 * const p = affectionProgress(affection[id] ?? 0, { material: materialIdFor(id) });
 * p.level, p.xp, p.needed       // Lv.4, 18 / 50
 * p.hearts                      // [1, 0.8, 0, 0, 0] — 하트 5개 채움
 * p.next?.reactions[0]?.label   // "녹아내리기" (다음 단계에서 열리는 반응)
 * p.next?.shopBonus             // 0.2 (다음 단계 가게 보너스, 오르지 않으면 null)
 * ```
 */
import { AFFECTION_HEARTS, AFFECTION_PER_LEVEL, REACTION_UNLOCKS, levelOf, nextUnlock, unlocksAt, type ReactionUnlock } from '../data/affection';
import type { MaterialId } from '../data/materialIds';
import { giftCoins } from './gift';
import { affectionBonus } from './shop';

/** 한 단계에서 받는 것 */
export interface AffectionPerks {
  level: number;
  /** 가게에서 일할 때 시간당 코인 보너스 (0.2 = +20%) */
  shopBonus: number;
  /** 이 말랑이가 말랑 선물을 가져올 때 코인 */
  giftCoins: number;
}

/** 단계가 오를 때 새로 생기는 것 — 값이 오르지 않은 항목은 null */
export interface LevelUpPerks {
  level: number;
  /** 이 단계에서 열리는 반응 */
  reactions: ReactionUnlock[];
  /** 새 가게 보너스 (올랐을 때만) */
  shopBonus: number | null;
  /** 새 선물 코인 (올랐을 때만) */
  giftCoins: number | null;
  /** 선물이 몇 코인 늘었나 (0 이면 그대로) */
  giftGain: number;
}

export interface AffectionProgress {
  /** 애정 값 (0 이상 정수) */
  value: number;
  level: number;
  /** 이번 단계에서 모은 애정 (0..needed-1) */
  xp: number;
  /** 한 단계 = AFFECTION_PER_LEVEL */
  needed: number;
  /** 다음 단계까지 남은 애정 */
  toNext: number;
  /** 0..1 */
  ratio: number;
  /** 하트 AFFECTION_HEARTS 개의 채움 (0..1, 앞에서부터) */
  hearts: number[];
  /** 지금 받는 것 */
  perks: AffectionPerks;
  /** 다음 단계에서 새로 생기는 것. 더 열릴 것이 없으면(maxed) null */
  next: LevelUpPerks | null;
  /** 아직 안 열린 반응 중 가장 가까운 것 (다 열었으면 null) */
  nextReaction: ReactionUnlock | null;
  /** 반응·가게 보너스·선물이 모두 끝까지 올랐다 (단계 숫자는 계속 오른다) */
  maxed: boolean;
}

export interface AffectionOptions {
  /** 촉감 — 찐득이는 가게 친밀도 보너스가 두 배 (`SHOP_MATERIAL_PERKS`) */
  material?: MaterialId;
}

/** 애정 값을 받는 쪽에서 쓰는 모양으로 (음수·NaN = 0, 소수 버림) */
function clean(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** 단계 → 그 단계가 되는 가장 작은 애정 */
export function affectionForLevel(level: number): number {
  return Math.max(0, Math.floor(level) - 1) * AFFECTION_PER_LEVEL;
}

export function perksAt(level: number, material: MaterialId = 'jelly'): AffectionPerks {
  const a = affectionForLevel(level);
  return { level, shopBonus: affectionBonus(a, material), giftCoins: giftCoins(a) };
}

/** level 이 되는 순간 새로 생기는 것 (level-1 과 비교) */
export function levelUpPerks(level: number, material: MaterialId = 'jelly'): LevelUpPerks {
  const now = perksAt(level, material);
  const before = perksAt(Math.max(1, level - 1), material);
  const up = level > 1;
  return {
    level,
    reactions: unlocksAt(level),
    shopBonus: up && now.shopBonus > before.shopBonus + 1e-9 ? now.shopBonus : null,
    giftCoins: up && now.giftCoins > before.giftCoins ? now.giftCoins : null,
    giftGain: up ? Math.max(0, now.giftCoins - before.giftCoins) : 0,
  };
}

/** 이 단계에서 새로 생기는 것이 하나라도 있나 */
export function hasLevelUpPerks(p: LevelUpPerks): boolean {
  return p.reactions.length > 0 || p.shopBonus !== null || p.giftCoins !== null;
}

/**
 * 더 열릴 것이 없는 첫 단계 = 반응·가게 보너스·선물이 마지막으로 오르는 단계.
 * 표·config 를 바꾸면 따라 바뀐다 (지금은 선물 상한 120코인이 닿는 9단계).
 */
const maxLevelCache = new Map<MaterialId, number>();

export function affectionMaxLevel(material: MaterialId = 'jelly'): number {
  const hit = maxLevelCache.get(material);
  if (hit !== undefined) return hit;
  let last = 1;
  const lastReaction = REACTION_UNLOCKS.reduce((m, r) => Math.max(m, r.level), 1);
  // 상한이 없는 공식이 들어와도 멈추도록 넉넉한 끝 (애정 상한 9999 = 200단계)
  for (let lv = 2; lv <= 200; lv += 1) {
    if (hasLevelUpPerks(levelUpPerks(lv, material))) last = lv;
  }
  const max = Math.max(last, lastReaction);
  maxLevelCache.set(material, max);
  return max;
}

/** 이번 단계 안의 애정(xp) → 하트 채움 */
export function heartFills(xp: number, needed = AFFECTION_PER_LEVEL, hearts = AFFECTION_HEARTS): number[] {
  const per = needed / hearts;
  return Array.from({ length: hearts }, (_, i) => Math.min(1, Math.max(0, (xp - i * per) / per)));
}

export type PerkKind = 'reaction' | 'shop' | 'gift';

export interface PerkLine {
  kind: PerkKind;
  /** 짧은 한 줄 ("새 반응 녹아내리기", "가게 보너스 +20%", "선물 +10코인") */
  text: string;
  /** 반응이면 하는 방법 한 줄 */
  howTo?: string;
}

/** 단계가 오를 때 생기는 것 → 화면에 나란히 쓰는 짧은 줄들 (반응 → 가게 → 선물 순) */
export function perkLines(up: LevelUpPerks): PerkLine[] {
  const lines: PerkLine[] = up.reactions.map((r) => ({ kind: 'reaction', text: `새 반응 ${r.label}`, howTo: r.howTo }));
  if (up.shopBonus !== null) lines.push({ kind: 'shop', text: `가게 보너스 +${Math.round(up.shopBonus * 100)}%` });
  if (up.giftGain > 0) lines.push({ kind: 'gift', text: `선물 +${up.giftGain}코인` });
  return lines;
}

export function affectionProgress(value: number, opts: AffectionOptions = {}): AffectionProgress {
  const material = opts.material ?? 'jelly';
  const v = clean(value);
  const level = levelOf(v);
  const needed = AFFECTION_PER_LEVEL;
  const xp = v - affectionForLevel(level);
  const maxed = level >= affectionMaxLevel(material);
  return {
    value: v,
    level,
    xp,
    needed,
    toNext: needed - xp,
    ratio: xp / needed,
    hearts: heartFills(xp, needed),
    perks: perksAt(level, material),
    next: maxed ? null : levelUpPerks(level + 1, material),
    nextReaction: nextUnlock(level),
    maxed,
  };
}
