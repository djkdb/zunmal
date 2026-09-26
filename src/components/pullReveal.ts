/**
 * 뽑기 결과 공개 순서/요약 — 순수 모듈 (React/DOM 의존 없음, 테스트 있음).
 *
 * 10연 결과는 뒷면(캡슐) 상태로 깔린 뒤 한 장씩 뒤집힌다.
 * 등급이 높을수록 뒤집기 전 "모으기"(charge)와 "숨 멈춤"(hold, 히트스톱)이 길고,
 * 뒤집힌 뒤 다음 카드까지 잠깐 더 쉬어 결과를 볼 시간을 준다.
 * 여기 숫자는 연출 타이밍(ms)일 뿐 밸런스 숫자가 아니다.
 */
import { rarityRank, type Rarity } from '../data/rarity';

export interface RevealStep {
  /** 앞 카드가 뒤집힌 뒤 이 카드 차례가 오기까지 */
  gap: number;
  /** 뒷면이 등급 색으로 빛나며 떨리는 시간 (0이면 바로 뒤집음) */
  charge: number;
  /** 뒤집기 직전 모든 움직임이 멈추는 시간 (히트스톱) */
  hold: number;
  /** 뒤집힌 뒤 튀어 오르는 세기 (1 = 기본) */
  pop: number;
}

/** 첫 카드 전 대기 (모달 등장 애니메이션과 겹치지 않게) */
export const REVEAL_LEAD_IN = 380;

const STEP_BY_RARITY: Readonly<Record<Rarity, RevealStep>> = {
  common: { gap: 100, charge: 0, hold: 0, pop: 1 },
  rare: { gap: 120, charge: 0, hold: 0, pop: 1.08 },
  epic: { gap: 150, charge: 260, hold: 0, pop: 1.16 },
  legendary: { gap: 180, charge: 520, hold: 120, pop: 1.28 },
  mythic: { gap: 180, charge: 620, hold: 160, pop: 1.34 },
  secret: { gap: 180, charge: 720, hold: 200, pop: 1.4 },
};

/** 에픽 이상이 뒤집힌 뒤 다음 카드까지 더 쉬는 시간 */
const AFTER_BIG: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 0,
  epic: 160,
  legendary: 380,
  mythic: 420,
  secret: 460,
};

/**
 * i번째 카드의 공개 단계.
 * @param rarities 공개 순서대로의 등급
 * @param seen 이미 전체 화면 연출로 본 카드(신화 이상)는 모으기를 생략한다
 */
export function revealStep(rarities: readonly Rarity[], i: number, seen = false): RevealStep {
  const rarity = rarities[i] ?? 'common';
  const prev = i > 0 ? rarities[i - 1] : undefined;
  const base = STEP_BY_RARITY[rarity];
  const gap = (i === 0 ? REVEAL_LEAD_IN : base.gap) + (prev ? AFTER_BIG[prev] : 0);
  if (seen) return { gap, charge: 0, hold: 0, pop: base.pop };
  return { ...base, gap };
}

/** 전체 공개에 걸리는 시간 (건너뛰지 않았을 때) */
export function totalRevealTime(rarities: readonly Rarity[], seen: ReadonlySet<number> = new Set()): number {
  let t = 0;
  for (let i = 0; i < rarities.length; i++) {
    const s = revealStep(rarities, i, seen.has(i));
    t += s.gap + s.charge + s.hold;
  }
  return t;
}

export interface PullItemLike {
  rarity: Rarity;
  shiny: boolean;
  isNew: boolean;
  isNewShiny: boolean;
  refund: number;
}

export interface PullSummary {
  /** 처음 만난 말랑이 수 */
  newCount: number;
  /** 반짝 결과 수 */
  shinyCount: number;
  /** 중복 환급 합계 */
  refund: number;
  /** 가장 높은 등급 결과의 위치 (같은 등급이면 반짝 우선, 그다음 앞선 것) */
  bestIndex: number;
}

export function summarizePulls(items: readonly PullItemLike[]): PullSummary {
  let bestIndex = 0;
  let newCount = 0;
  let shinyCount = 0;
  let refund = 0;
  items.forEach((it, i) => {
    if (it.isNew) newCount++;
    if (it.shiny) shinyCount++;
    refund += it.refund;
    const best = items[bestIndex];
    if (!best) return;
    const diff = rarityRank(it.rarity) - rarityRank(best.rarity);
    if (diff > 0 || (diff === 0 && it.shiny && !best.shiny)) bestIndex = i;
  });
  return { newCount, shinyCount, refund, bestIndex };
}

/** 가장 높은 등급 (빈 배열이면 common) */
export function topRarity(rarities: readonly Rarity[]): Rarity {
  return rarities.reduce<Rarity>((acc, r) => (rarityRank(r) > rarityRank(acc) ? r : acc), 'common');
}
