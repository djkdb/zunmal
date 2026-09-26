/**
 * 도감·컬렉션 진행도 — 순수 모듈 (React/Zustand/DOM 무관). 홈 허브(다음 목표·상태 줄)와 도감 화면이 함께 쓴다.
 *
 * 입력은 저장 데이터의 두 조각뿐이다: 보유 말랑이(`ownedMalangs`, 반짝 수만 본다)와 받은 세트 보상(`claimedSets`).
 * 알 수 없는 id 는 세지 않는다(저장은 sanitize 를 거치지만 여기서도 안전하게).
 *
 * 사용 예:
 * ```ts
 * const summary = summarizeCollection({ owned: s.ownedMalangs, claimedSets: s.claimedSets });
 * summary.owned / summary.total      // 5 / 32
 * summary.percent                     // 16 (0..100, 하나라도 있으면 1 이상, 다 모아야 100)
 * summary.byRarity                    // [{ rarity: 'common', owned: 4, total: 10 }, …] (RARITIES 순서)
 * summary.sets                        // COLLECTIONS 순서의 세트별 진행
 * summary.nearestSet                  // 가장 가까운 미완성 세트 (없으면 null)
 * summary.claimableSets               // 다 모았지만 아직 보상을 안 받은 세트
 * ```
 */
import { CHARACTERS, getCharacter } from './characters';
import { COLLECTIONS, type Collection } from './collections';
import { RARITIES, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL, rarityRank, type Rarity } from './rarity';

/** 보유 기록에서 이 모듈이 읽는 부분 (store/persistence.ts OwnedMalang 과 호환) */
export type OwnedLike = Readonly<Record<string, { shinyCount: number } | undefined>>;

export interface CollectionInput {
  owned: OwnedLike;
  claimedSets: readonly string[];
}

export interface RarityProgress {
  rarity: Rarity;
  owned: number;
  total: number;
}

export interface SetProgress {
  set: Collection;
  owned: number;
  total: number;
  /** total - owned */
  missing: number;
  /** 아직 없는 말랑이 id (세트 목록 순서) */
  missingIds: string[];
  /** 없는 말랑이 중 가장 높은 등급 (다 모았으면 null) */
  hardestMissing: Rarity | null;
  /**
   * 없는 말랑이를 모두 만나기까지 대략의 뽑기 수 = Σ 1/p(그 말랑이). 천장은 무시한 비교용 값이라 화면에 그대로 쓰지 않는다.
   * 다 모았으면 0.
   */
  expectedPulls: number;
  /** 0..1 */
  ratio: number;
  complete: boolean;
  /** 보상을 이미 받았다 */
  claimed: boolean;
  /** 다 모았고 아직 보상을 안 받았다 */
  claimable: boolean;
}

export interface CollectionSummary {
  owned: number;
  total: number;
  /** 0..1 */
  ratio: number;
  /** 화면용 정수 퍼센트. 하나라도 모았으면 1 이상, 모두 모아야 100 */
  percent: number;
  /** 반짝 버전을 하나라도 가진 말랑이 종류 수 */
  shinySpecies: number;
  byRarity: RarityProgress[];
  sets: SetProgress[];
  nearestSet: SetProgress | null;
  claimableSets: SetProgress[];
}

/** 한 번 뽑을 때 이 말랑이가 나올 확률 (등급 확률 ÷ 같은 등급 수). 모르는 id 면 0 */
export function characterPullChance(id: string): number {
  const c = getCharacter(id);
  if (!c) return 0;
  const sameRarity = CHARACTERS.filter((x) => x.rarity === c.rarity).length;
  return RARITY_WEIGHTS[c.rarity] / RARITY_WEIGHT_TOTAL / Math.max(1, sameRarity);
}

/** 화면용 퍼센트: 0 < 비율 < 1 이면 1..99 로 붙잡아 "0%인데 하나 있음"·"100%인데 덜 모음"이 없게 한다 */
export function displayPercent(owned: number, total: number): number {
  if (total <= 0 || owned <= 0) return 0;
  if (owned >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((owned / total) * 100)));
}

export function setProgressOf(set: Collection, owned: OwnedLike, claimedSets: readonly string[]): SetProgress {
  const missingIds = set.memberIds.filter((id) => !owned[id]);
  const total = set.memberIds.length;
  const have = total - missingIds.length;
  let hardest: Rarity | null = null;
  let expected = 0;
  for (const id of missingIds) {
    const c = getCharacter(id);
    if (!c) continue;
    if (hardest === null || rarityRank(c.rarity) > rarityRank(hardest)) hardest = c.rarity;
    const p = characterPullChance(id);
    expected += p > 0 ? 1 / p : 0;
  }
  const complete = missingIds.length === 0;
  const claimed = claimedSets.includes(set.id);
  return {
    set,
    owned: have,
    total,
    missing: missingIds.length,
    missingIds,
    hardestMissing: hardest,
    expectedPulls: expected,
    ratio: total > 0 ? have / total : 0,
    complete,
    claimed,
    claimable: complete && !claimed,
  };
}

/**
 * 가장 가까운 미완성 세트.
 *  1. 한 마리라도 모은 세트 중에서 고른다(시작하지 않은 세트는 "가깝다"고 하지 않는다).
 *  2. 남은 수가 적은 순 → 같으면 덜 비싼 순(expectedPulls, 즉 없는 말랑이 등급이 낮은 쪽) → 더 많이 모은 순 → 목록 순.
 *  아무 세트도 시작하지 않았으면 모든 미완성 세트 중 가장 덜 비싼 세트.
 *  모든 세트를 다 모았으면 null.
 */
export function nearestIncompleteSet(sets: readonly SetProgress[]): SetProgress | null {
  const open = sets.filter((s) => !s.complete);
  const started = open.filter((s) => s.owned > 0);
  const useMissing = started.length > 0;
  const pool = useMissing ? started : open;
  // 앞선 것을 이길 때만 바꾸므로 모두 같으면 목록 순서가 남는다
  const beats = (a: SetProgress, b: SetProgress): boolean => {
    if (useMissing && a.missing !== b.missing) return a.missing < b.missing;
    if (Math.abs(a.expectedPulls - b.expectedPulls) > 1e-9) return a.expectedPulls < b.expectedPulls;
    return a.owned > b.owned;
  };
  let best: SetProgress | null = null;
  for (const s of pool) if (!best || beats(s, best)) best = s;
  return best;
}

export function summarizeCollection({ owned, claimedSets }: CollectionInput): CollectionSummary {
  let have = 0;
  let shiny = 0;
  const byRarity: RarityProgress[] = RARITIES.map((rarity) => ({ rarity, owned: 0, total: 0 }));
  for (const c of CHARACTERS) {
    const entry = byRarity[rarityRank(c.rarity)];
    const o = owned[c.id];
    if (entry) {
      entry.total += 1;
      if (o) entry.owned += 1;
    }
    if (o) {
      have += 1;
      if (o.shinyCount > 0) shiny += 1;
    }
  }
  const total = CHARACTERS.length;
  const sets = COLLECTIONS.map((set) => setProgressOf(set, owned, claimedSets));
  return {
    owned: have,
    total,
    ratio: total > 0 ? have / total : 0,
    percent: displayPercent(have, total),
    shinySpecies: shiny,
    byRarity,
    sets,
    nearestSet: nearestIncompleteSet(sets),
    claimableSets: sets.filter((s) => s.claimable),
  };
}
