/**
 * 희귀도 정의와 가챠 확률 규칙.
 *
 * 확률은 부동소수 오차를 피하기 위해 basis point(1/10000) 정수 가중치로 관리한다.
 * 62% = 6200, 0.5% = 50. 합계는 반드시 RARITY_WEIGHT_TOTAL(10000)이어야 한다.
 */
export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_WEIGHT_TOTAL = 10_000;

export const RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  common: 6195, // 61.95% (시크릿 0.05%를 일반에서 떼어 옴)
  rare: 2500, // 25%
  epic: 950, // 9.5%
  legendary: 300, // 3%
  mythic: 50, // 0.5%
  secret: 5, // 0.05% — 약 2000번에 1번. 블라인드박스의 "시크릿"
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
  /** 어떤 등급이든 "반짝"(홀로그램) 버전으로 나올 확률. 등급 추첨과 독립. */
  shinyRate: 0.01,
} as const satisfies {
  pityThreshold: number;
  pityMinRarity: Rarity;
  multiPullCount: number;
  multiGuaranteeMinRarity: Rarity;
  shinyRate: number;
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
  /** 결과 연출 강도 단계 (0~4) */
  fanfare: 0 | 1 | 2 | 3 | 4;
}

export const RARITY_META: Readonly<Record<Rarity, RarityMeta>> = {
  common: { label: '일반', stars: 1, icon: '●', colorVar: '--rarity-common', fanfare: 0 },
  rare: { label: '레어', stars: 2, icon: '◆', colorVar: '--rarity-rare', fanfare: 1 },
  epic: { label: '에픽', stars: 3, icon: '✦', colorVar: '--rarity-epic', fanfare: 2 },
  legendary: { label: '전설', stars: 4, icon: '♛', colorVar: '--rarity-legendary', fanfare: 3 },
  mythic: { label: '신화', stars: 5, icon: '✺', colorVar: '--rarity-mythic', fanfare: 3 },
  secret: { label: '시크릿', stars: 6, icon: '✧', colorVar: '--rarity-secret', fanfare: 4 },
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

// ── 말랑 만지기: 등급별 손맛 단계 ─────────────────────────────

/**
 * 만질 때 튀는 입자 종류. motif 는 신화·시크릿 캐릭터마다 다른 모티프(epic/themes.ts)를 쓴다.
 * 일반 = 몽글 거품, 레어 = 반짝이, 에픽 = 반짝이 + 끌기 꼬리, 전설 = 금별 + 몸 뒤 빛.
 */
export type TouchParticle = 'bubble' | 'sparkle' | 'star' | 'motif';

/** 찌를 때 얹는 방울 소리 층. none 은 젤리 소리만. heavenly 는 천상의 반짝 울림까지. */
export type TouchChime = 'none' | 'ping' | 'sparkle' | 'bell' | 'celestial' | 'heavenly';

/** 진동 종류 (lib/haptics.ts 의 HapticKind 중 일부와 같은 이름) */
export type TouchHaptic = 'tap' | 'success' | 'rare' | 'legendary' | 'epic';

export interface TouchFxSpec {
  particle: TouchParticle;
  /** 콕 찌르기 한 번에 나오는 입자 수 (연달아 세게 찌르면 최대 1.5배) */
  poke: number;
  /** 꾹 눌러 깊어질 때 나오는 입자 수 */
  press: number;
  /** 놓을 때 나오는 입자 수 (가장 세게 늘렸다 놓았을 때) */
  release: number;
  /** 끄는 동안 손가락이 이만큼(px) 움직일 때마다 꼬리 입자 1개. 0 이면 꼬리 없음 */
  trailPx: number;
  /** 3D 몸 뒤 빛 세기 (0~1). 0 이면 없음 */
  aura: number;
  /** 만질 때 몸 뒤 빛이 부푸는 양 (0~1) */
  auraPulse: number;
  chime: TouchChime;
  /** 찌르기·깊이 누르기 진동 */
  pokeHaptic: TouchHaptic;
  /** 애정 단계가 오를 때 진동 */
  milestoneHaptic: TouchHaptic;
  /** 가만히 있어도 초당 떠다니는 모티프 입자 수 (0 = 없음) */
  ambientPerSec: number;
  /** 애정 단계가 오를 때 터지는 입자 수 */
  milestone: number;
  /** 애정 단계 축하 하트 수 (DOM 하트) */
  milestoneHearts: number;
}

/** 등급이 오를수록 입자·빛·소리·진동이 한 칸씩 커진다. 컴포넌트는 이 표만 읽는다. */
export const TOUCH_FX: Readonly<Record<Rarity, TouchFxSpec>> = {
  common: {
    particle: 'bubble',
    poke: 3,
    press: 2,
    release: 3,
    trailPx: 0,
    aura: 0,
    auraPulse: 0,
    chime: 'none',
    pokeHaptic: 'tap',
    milestoneHaptic: 'success',
    ambientPerSec: 0,
    milestone: 10,
    milestoneHearts: 5,
  },
  rare: {
    particle: 'sparkle',
    poke: 5,
    press: 3,
    release: 4,
    trailPx: 0,
    aura: 0,
    auraPulse: 0,
    chime: 'ping',
    pokeHaptic: 'tap',
    milestoneHaptic: 'success',
    ambientPerSec: 0,
    milestone: 14,
    milestoneHearts: 5,
  },
  epic: {
    particle: 'sparkle',
    poke: 7,
    press: 4,
    release: 5,
    trailPx: 26,
    aura: 0,
    auraPulse: 0,
    chime: 'sparkle',
    pokeHaptic: 'success',
    milestoneHaptic: 'rare',
    ambientPerSec: 0,
    milestone: 18,
    milestoneHearts: 6,
  },
  legendary: {
    particle: 'star',
    poke: 8,
    press: 5,
    release: 6,
    trailPx: 22,
    aura: 0.55,
    auraPulse: 0.45,
    chime: 'bell',
    pokeHaptic: 'rare',
    milestoneHaptic: 'legendary',
    ambientPerSec: 0,
    milestone: 26,
    milestoneHearts: 7,
  },
  mythic: {
    particle: 'motif',
    poke: 10,
    press: 6,
    release: 8,
    trailPx: 18,
    aura: 0.7,
    auraPulse: 0.5,
    chime: 'celestial',
    pokeHaptic: 'rare',
    milestoneHaptic: 'legendary',
    ambientPerSec: 0,
    milestone: 32,
    milestoneHearts: 8,
  },
  secret: {
    particle: 'motif',
    poke: 12,
    press: 7,
    release: 9,
    trailPx: 16,
    aura: 0.85,
    auraPulse: 0.6,
    chime: 'heavenly',
    pokeHaptic: 'rare',
    milestoneHaptic: 'epic',
    ambientPerSec: 1.4,
    milestone: 40,
    milestoneHearts: 8,
  },
};

/** 반짝 말랑이는 등급과 상관없이 무지개 반짝이를 더 뿌리고 몸에 무지갯빛이 돈다 */
export const SHINY_TOUCH_FX = {
  /** 찌르기·놓기마다 더하는 무지개 반짝이 수 */
  sparkles: 3,
  /** 3D 몸 무지갯빛(박막 간섭) 세기 0~1 */
  iridescence: 0.9,
  /** 빛이 없는 등급도 반짝이면 이만큼은 몸 뒤가 은은하게 빛난다 */
  aura: 0.3,
} as const;
