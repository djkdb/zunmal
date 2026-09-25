/**
 * 가챠 엔진 — 순수 함수 모음.
 * UI, Zustand, DOM에 의존하지 않으며 RNG를 외부에서 주입받는다.
 */
import { CHARACTERS_BY_RARITY, type Character } from '../data/characters';
import { GACHA_RULES, RARITIES, RARITY_WEIGHTS, isAtLeast, type Rarity } from '../data/rarity';
import { DUPLICATE_REFUND } from '../economy/config';
import { pickOne, type RNG } from '../lib/rng';

export type { RNG } from '../lib/rng';

export interface GachaConfig {
  weights: Readonly<Record<Rarity, number>>;
  pools: Readonly<Record<Rarity, readonly Character[]>>;
  pityThreshold: number;
  pityMinRarity: Rarity;
  multiPullCount: number;
  multiGuaranteeMinRarity: Rarity;
}

export const DEFAULT_GACHA_CONFIG: GachaConfig = {
  weights: RARITY_WEIGHTS,
  pools: CHARACTERS_BY_RARITY,
  pityThreshold: GACHA_RULES.pityThreshold,
  pityMinRarity: GACHA_RULES.pityMinRarity,
  multiPullCount: GACHA_RULES.multiPullCount,
  multiGuaranteeMinRarity: GACHA_RULES.multiGuaranteeMinRarity,
};

export interface PullResult {
  character: Character;
  rarity: Rarity;
  /** 천장으로 확정된 결과인가 */
  byPity: boolean;
  /** 10연 레어 이상 보장으로 교체된 결과인가 */
  byGuarantee: boolean;
}

export interface PullOutcome {
  results: PullResult[];
  /** 뽑기 후 천장 카운트 (전설 이상 없이 연속된 횟수) */
  pityCount: number;
}

/**
 * 가중치 테이블에서 희귀도를 추첨한다.
 * minRarity가 주어지면 그 이상 희귀도만 남기고 원래 상대비율을 유지한다.
 * (예: 전설 이상 → 전설:신화 = 300:50 = 6:1)
 */
export function rollRarity(
  rng: RNG,
  weights: Readonly<Record<Rarity, number>> = RARITY_WEIGHTS,
  minRarity: Rarity = 'common',
): Rarity {
  const candidates = RARITIES.filter((r) => isAtLeast(r, minRarity) && weights[r] > 0);
  const total = candidates.reduce((sum, r) => sum + weights[r], 0);
  if (total <= 0) throw new Error(`rollRarity: no weight at or above ${minRarity}`);

  let roll = rng() * total;
  for (const rarity of candidates) {
    roll -= weights[rarity];
    if (roll < 0) return rarity;
  }
  // 부동소수 경계(rng가 1에 극히 근접) 방어: 마지막 후보
  return candidates[candidates.length - 1] as Rarity;
}

/** 같은 희귀도 안에서 캐릭터를 균등 확률로 선택. */
export function pickCharacter(
  rng: RNG,
  rarity: Rarity,
  pools: GachaConfig['pools'] = CHARACTERS_BY_RARITY,
): Character {
  return pickOne(rng, pools[rarity]);
}

/** 천장 카운트를 정규화 (음수/NaN/범위 초과 방어). */
export function normalizePity(pityCount: number, threshold: number = GACHA_RULES.pityThreshold): number {
  if (!Number.isFinite(pityCount) || pityCount < 0) return 0;
  return Math.min(Math.floor(pityCount), threshold - 1);
}

/**
 * 1회 뽑기. 이번 pull이 전설 이상 없이 pityThreshold번째라면 전설 이상을 확정한다.
 */
export function pullOne(
  pityCount: number,
  rng: RNG,
  config: GachaConfig = DEFAULT_GACHA_CONFIG,
): { result: PullResult; pityCount: number } {
  const pity = normalizePity(pityCount, config.pityThreshold);
  const byPity = pity + 1 >= config.pityThreshold;
  const rarity = rollRarity(rng, config.weights, byPity ? config.pityMinRarity : 'common');
  const character = pickCharacter(rng, rarity, config.pools);
  const nextPity = isAtLeast(rarity, config.pityMinRarity) ? 0 : pity + 1;
  return {
    result: { character, rarity, byPity, byGuarantee: false },
    pityCount: nextPity,
  };
}

/** 단일 뽑기 결과를 PullOutcome 형태로. */
export function pullSingle(pityCount: number, rng: RNG, config: GachaConfig = DEFAULT_GACHA_CONFIG): PullOutcome {
  const { result, pityCount: next } = pullOne(pityCount, rng, config);
  return { results: [result], pityCount: next };
}

/**
 * 10연 뽑기.
 * 1) 개별 pull 10회 (각각 천장 판정 적용)
 * 2) 레어 이상이 하나도 없으면 10번째를 레어 이상 풀에서 재추첨해 교체
 *    - 교체 결과가 전설 이상이면 천장 카운트를 0으로 재계산
 * 결과는 항상 정확히 multiPullCount개.
 */
export function pullMulti(pityCount: number, rng: RNG, config: GachaConfig = DEFAULT_GACHA_CONFIG): PullOutcome {
  const results: PullResult[] = [];
  let pity = normalizePity(pityCount, config.pityThreshold);
  let pityBeforeLast = pity;

  for (let i = 0; i < config.multiPullCount; i++) {
    pityBeforeLast = pity;
    const pulled = pullOne(pity, rng, config);
    results.push(pulled.result);
    pity = pulled.pityCount;
  }

  const hasGuaranteed = results.some((r) => isAtLeast(r.rarity, config.multiGuaranteeMinRarity));
  if (!hasGuaranteed && results.length > 0) {
    const rarity = rollRarity(rng, config.weights, config.multiGuaranteeMinRarity);
    const character = pickCharacter(rng, rarity, config.pools);
    results[results.length - 1] = { character, rarity, byPity: false, byGuarantee: true };
    // 교체 전 마지막 결과는 레어 미만(=전설 미만)이었으므로 pity = pityBeforeLast + 1 이었다.
    pity = isAtLeast(rarity, config.pityMinRarity) ? 0 : pityBeforeLast + 1;
  }

  return { results, pityCount: pity };
}

export interface ResolvedPull extends PullResult {
  isNew: boolean;
  refund: number;
}

/**
 * 보유 여부에 따라 신규/중복을 판정하고 환급 코인을 계산한다.
 * 같은 뽑기 묶음 안에서 앞서 나온 캐릭터도 "이미 보유"로 취급한다.
 */
export function resolveDuplicates(
  results: readonly PullResult[],
  ownedIds: ReadonlySet<string>,
  refundTable: Readonly<Record<Rarity, number>> = DUPLICATE_REFUND,
): { items: ResolvedPull[]; totalRefund: number } {
  const seen = new Set(ownedIds);
  let totalRefund = 0;
  const items = results.map((r) => {
    const isNew = !seen.has(r.character.id);
    seen.add(r.character.id);
    const refund = isNew ? 0 : refundTable[r.rarity];
    totalRefund += refund;
    return { ...r, isNew, refund };
  });
  return { items, totalRefund };
}

/**
 * 천장을 포함한 실질 전설 이상 확률 (1 / 기대 시행 횟수).
 * 확률표에 공개하기 위한 해석적 계산.
 */
export function effectivePityRate(config: GachaConfig = DEFAULT_GACHA_CONFIG): number {
  const total = RARITIES.reduce((s, r) => s + config.weights[r], 0);
  const p =
    RARITIES.filter((r) => isAtLeast(r, config.pityMinRarity)).reduce((s, r) => s + config.weights[r], 0) / total;
  const q = 1 - p;
  // 기대 시행 수 = Σ_{k=0}^{T-1} q^k  (T번째에 반드시 성공)
  const expected = (1 - q ** config.pityThreshold) / p;
  return 1 / expected;
}
