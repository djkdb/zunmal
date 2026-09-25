/**
 * 희귀도 정의와 가챠 확률 규칙.
 *
 * 확률은 부동소수 오차를 피하기 위해 basis point(1/10000) 정수 가중치로 관리한다.
 * 62% = 6200, 0.5% = 50. 합계는 반드시 RARITY_WEIGHT_TOTAL(10000)이어야 한다.
 */
export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_WEIGHT_TOTAL = 10_000;

export const RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  common: 6200, // 62%
  rare: 2500, // 25%
  epic: 950, // 9.5%
  legendary: 300, // 3%
  mythic: 50, // 0.5%
};

export const GACHA_RULES = {
  /** 전설 이상 없이 이 횟수째가 되는 pull은 전설 이상 확정. */
  pityThreshold: 50,
  /** 천장 확정 시 선택 가능한 최소 희귀도. */
  pityMinRarity: 'legendary',
  /** 10연 뽑기 개수. */
  multiPullCount: 10,
  /** 10연에서 최소 1개 보장되는 희귀도. */
  multiGuaranteeMinRarity: 'rare',
} as const satisfies {
  pityThreshold: number;
  pityMinRarity: Rarity;
  multiPullCount: number;
  multiGuaranteeMinRarity: Rarity;
};

export interface RarityMeta {
  /** 한국어 표시 이름 */
  label: string;
  /** 색 이외의 구분 수단: 별 개수 */
  stars: number;
  /** 색 이외의 구분 수단: 기호 */
  icon: string;
  /** CSS 변수 이름 (global.css) */
  colorVar: string;
  /** 결과 연출 강도 단계 (0~3) */
  fanfare: 0 | 1 | 2 | 3;
}

export const RARITY_META: Readonly<Record<Rarity, RarityMeta>> = {
  common: { label: '일반', stars: 1, icon: '●', colorVar: '--rarity-common', fanfare: 0 },
  rare: { label: '레어', stars: 2, icon: '◆', colorVar: '--rarity-rare', fanfare: 1 },
  epic: { label: '에픽', stars: 3, icon: '✦', colorVar: '--rarity-epic', fanfare: 2 },
  legendary: { label: '전설', stars: 4, icon: '♛', colorVar: '--rarity-legendary', fanfare: 3 },
  mythic: { label: '신화', stars: 5, icon: '✺', colorVar: '--rarity-mythic', fanfare: 3 },
};

/** 희귀도 순위 (common = 0). */
export function rarityRank(rarity: Rarity): number {
  return RARITIES.indexOf(rarity);
}

/** a가 b 이상의 희귀도인가. */
export function isAtLeast(a: Rarity, b: Rarity): boolean {
  return rarityRank(a) >= rarityRank(b);
}

export function isRarity(value: unknown): value is Rarity {
  return typeof value === 'string' && (RARITIES as readonly string[]).includes(value);
}

/** 퍼센트 문자열 (예: 6200 → "62%", 50 → "0.5%"). */
export function formatWeightPercent(weight: number, total = RARITY_WEIGHT_TOTAL): string {
  const percent = (weight / total) * 100;
  return `${Number(percent.toFixed(2))}%`;
}
