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

// ── 도감 화면용 ────────────────────────────────────────────────

/**
 * 없는 말랑이를 모두 만나기까지 평균 뽑기 수 (한 번에 한 마리씩 나오는 수집 문제의 정확한 식).
 *   E = Σ_{공집합 아닌 S} (-1)^{|S|+1} / Σ_{i∈S} p_i
 * 천장·10연 보장은 넣지 않는다(전설 이상은 실제로 조금 더 빨리 나온다). 모르는 id 는 건너뛴다. 없으면 0.
 * 세트 멤버는 최대 6마리라 부분집합 64개로 충분하다(그보다 많으면 기존 Σ 1/p 로 어림).
 */
export function expectedPullsToCollect(ids: readonly string[]): number {
  const ps = ids.map(characterPullChance).filter((p) => p > 0);
  const n = ps.length;
  if (n === 0) return 0;
  if (n > 12) return ps.reduce((s, p) => s + 1 / p, 0);
  let total = 0;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let sum = 0;
    let bits = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        sum += ps[i] ?? 0;
        bits += 1;
      }
    }
    total += (bits % 2 === 1 ? 1 : -1) / sum;
  }
  return total;
}

/**
 * 화면에 쓰는 어림 뽑기 수 — 너무 정확해 보이지 않게 둥글린다.
 * 10 미만 = 올림, 100 미만 = 5 단위, 1000 미만 = 10 단위, 그 이상 = 100 단위. 0 이하·NaN = 0.
 */
export function roughPullCount(expected: number): number {
  if (!Number.isFinite(expected) || expected <= 0) return 0;
  if (expected < 10) return Math.max(1, Math.ceil(expected));
  const step = expected < 100 ? 5 : expected < 1000 ? 10 : 100;
  return Math.max(step, Math.round(expected / step) * step);
}

/**
 * 세트 탭 순서: 받을 수 있는 세트 → 시작한 미완성 세트(남은 수 적은 순 → 덜 비싼 순) → 시작 안 한 세트(덜 비싼 순)
 * → 다 모으고 받은 세트. 같으면 목록 순서.
 */
export function orderSetsForDisplay(sets: readonly SetProgress[]): SetProgress[] {
  const group = (s: SetProgress): number => (s.claimable ? 0 : !s.complete ? (s.owned > 0 ? 1 : 2) : 3);
  return sets
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ga = group(a.s);
      const gb = group(b.s);
      if (ga !== gb) return ga - gb;
      if (ga === 1 && a.s.missing !== b.s.missing) return a.s.missing - b.s.missing;
      if ((ga === 1 || ga === 2) && Math.abs(a.s.expectedPulls - b.s.expectedPulls) > 1e-9) {
        return a.s.expectedPulls - b.s.expectedPulls;
      }
      return a.i - b.i;
    })
    .map((x) => x.s);
}

/** 처음 얻은 뒤 이 시간 동안은 도감 칸에 NEW (캡슐을 아직 안 열었으면 열 때까지 계속) */
export const COLLECTION_NEW_MS = 24 * 3_600_000;

/**
 * 도감 칸의 NEW 딱지: 놀이방 선반에 봉인된 채(캡슐을 아직 안 엶)이거나, 처음 얻은 지 하루가 안 됐다.
 * 시계가 거꾸로 가 얻은 시각이 미래면 NEW 로 본다(곧 풀린다).
 */
export function isNewInCollection(
  entry: { firstObtainedAt: number } | undefined,
  sealed: boolean,
  nowMs: number,
  newMs: number = COLLECTION_NEW_MS,
): boolean {
  if (!entry) return false;
  if (sealed) return true;
  return nowMs - entry.firstObtainedAt < newMs;
}
