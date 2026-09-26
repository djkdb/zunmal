/**
 * 뽑기 결과 공개 타이밍/상태 — 순수 모듈 (React/DOM 의존 없음, 테스트 있음).
 *
 * 결과 카드는 모두 뒷면(캡슐)으로 깔리고, 플레이어가 한 장씩 눌러 연다.
 * 누르면 등급에 따라 "모으기"(charge: 떨림) → "숨 멈춤"(hold, 히트스톱) → 뒤집기(face) 순서로 진행한다.
 * "모두 열기"는 남은 카드를 앞에서부터 짧은 간격(OPEN_ALL_STAGGER)으로 열되, 전설 이상은 모으기·숨 멈춤을 지킨다.
 * 여기 숫자는 연출 타이밍(ms)일 뿐 밸런스 숫자가 아니다.
 */
import { rarityRank, type Rarity } from '../data/rarity';

/** 카드 한 장의 상태: 뒷면 → (모으기 → 숨 멈춤) → 앞면 */
export type CardPhase = 'back' | 'charge' | 'hold' | 'face';

export interface OpenTiming {
  /** 뒷면이 등급 색으로 빛나며 떨리는 시간 (0이면 바로 뒤집음) */
  charge: number;
  /** 뒤집기 직전 모든 움직임이 멈추는 시간 (히트스톱) */
  hold: number;
  /** 뒤집힌 뒤 튀어 오르는 세기 (1 = 기본) */
  pop: number;
}

const OPEN_BY_RARITY: Readonly<Record<Rarity, OpenTiming>> = {
  common: { charge: 0, hold: 0, pop: 1 },
  rare: { charge: 0, hold: 0, pop: 1.08 },
  epic: { charge: 260, hold: 0, pop: 1.16 },
  legendary: { charge: 520, hold: 120, pop: 1.28 },
  mythic: { charge: 620, hold: 160, pop: 1.34 },
  secret: { charge: 720, hold: 200, pop: 1.4 },
};

/** "모두 열기"에서 카드 사이 간격 */
export const OPEN_ALL_STAGGER = 80;

/** "모두 열기"에서 전설 이상이 뒤집힌 뒤 다음 카드까지 더 쉬는 시간 (결과를 볼 틈) */
const OPEN_ALL_AFTER_BIG = 360;

export interface OpenOptions {
  /** 이미 전체 화면 연출로 본 카드(신화 이상)는 모으기를 생략한다 */
  seen?: boolean;
  /** 움직임 줄이기: 모으기 없이 바로 */
  reduced?: boolean;
  /** "모두 열기"로 여는 중: 에픽의 짧은 떨림은 생략하고 전설 이상만 뜸을 들인다 */
  quick?: boolean;
}

/** 카드 한 장을 열 때의 타이밍 */
export function openTiming(rarity: Rarity, { seen = false, reduced = false, quick = false }: OpenOptions = {}): OpenTiming {
  const base = OPEN_BY_RARITY[rarity];
  if (seen || reduced) return { charge: 0, hold: 0, pop: reduced ? 1 : base.pop };
  if (quick && rarityRank(rarity) < rarityRank('legendary')) return { charge: 0, hold: 0, pop: base.pop };
  return base;
}

/**
 * 카드를 눌렀을 때 거치는 단계와 각 단계에 머무는 시간. 마지막은 항상 ['face', 0].
 * 예: 전설 → [['charge', 520], ['hold', 120], ['face', 0]]
 */
export function openSequence(rarity: Rarity, opts: OpenOptions = {}): Array<[CardPhase, number]> {
  const t = openTiming(rarity, opts);
  const seq: Array<[CardPhase, number]> = [];
  if (t.charge > 0) seq.push(['charge', t.charge]);
  if (t.hold > 0) seq.push(['hold', t.hold]);
  seq.push(['face', 0]);
  return seq;
}

/** 이 카드를 지금 눌러서 열 수 있는가 (뒷면일 때만. 여는 중이거나 이미 열린 카드는 아님) */
export function canOpen(phase: CardPhase | undefined): boolean {
  return phase === 'back';
}

export function allOpen(phases: readonly CardPhase[]): boolean {
  return phases.every((p) => p === 'face');
}

export function openedCount(phases: readonly CardPhase[]): number {
  return phases.filter((p) => p === 'face').length;
}

/** 처음 상태: 모두 뒷면. 전체 화면 연출로 이미 본 카드는 앞면으로 시작한다. */
export function initialPhases(n: number, seenIndex?: number): CardPhase[] {
  return Array.from({ length: n }, (_, i) => (i === seenIndex ? 'face' : 'back'));
}

export interface OpenAllStep {
  index: number;
  /** "모두 열기"를 누른 뒤 이 카드가 열리기 시작하는(모으기 시작) 시각 */
  at: number;
}

/**
 * "모두 열기" 일정: 아직 뒷면인 카드만 앞에서부터 OPEN_ALL_STAGGER 간격으로.
 * 전설 이상은 모으기·숨 멈춤이 끝나 뒤집힌 뒤 조금 더 쉬었다가 다음 카드로 넘어간다.
 * 움직임 줄이기면 모두 0ms (한 번에).
 */
export function openAllSchedule(
  rarities: readonly Rarity[],
  phases: readonly CardPhase[],
  { seenIndex, reduced = false }: { seenIndex?: number; reduced?: boolean } = {},
): OpenAllStep[] {
  const steps: OpenAllStep[] = [];
  let t = 0;
  rarities.forEach((rarity, index) => {
    if (!canOpen(phases[index])) return;
    if (reduced) {
      steps.push({ index, at: 0 });
      return;
    }
    if (steps.length > 0) t += OPEN_ALL_STAGGER;
    steps.push({ index, at: t });
    const timing = openTiming(rarity, { seen: index === seenIndex, quick: true });
    if (timing.charge + timing.hold > 0) t += timing.charge + timing.hold + OPEN_ALL_AFTER_BIG;
  });
  return steps;
}

/** "모두 열기"가 끝나기까지 걸리는 시간 (마지막 카드가 뒤집히는 시각) */
export function openAllDuration(
  rarities: readonly Rarity[],
  phases: readonly CardPhase[],
  opts: { seenIndex?: number; reduced?: boolean } = {},
): number {
  const steps = openAllSchedule(rarities, phases, opts);
  const last = steps[steps.length - 1];
  if (!last) return 0;
  const rarity = rarities[last.index] ?? 'common';
  const t = openTiming(rarity, { seen: last.index === opts.seenIndex, quick: true, reduced: opts.reduced });
  return last.at + t.charge + t.hold;
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
  /** 새로 만난 말랑이 중 가장 좋은 결과의 위치 ("지금 만지러 가기"), 없으면 -1 */
  bestNewIndex: number;
}

export function summarizePulls(items: readonly PullItemLike[]): PullSummary {
  let bestIndex = 0;
  let newCount = 0;
  let shinyCount = 0;
  let refund = 0;
  let bestNewIndex = -1;
  items.forEach((it, i) => {
    if (it.isNew) {
      const cur = items[bestNewIndex];
      const d = cur ? rarityRank(it.rarity) - rarityRank(cur.rarity) : 1;
      if (d > 0 || (d === 0 && cur && it.shiny && !cur.shiny)) bestNewIndex = i;
    }
    if (it.isNew) newCount++;
    if (it.shiny) shinyCount++;
    refund += it.refund;
    const best = items[bestIndex];
    if (!best) return;
    const diff = rarityRank(it.rarity) - rarityRank(best.rarity);
    if (diff > 0 || (diff === 0 && it.shiny && !best.shiny)) bestIndex = i;
  });
  return { newCount, shinyCount, refund, bestIndex, bestNewIndex };
}

/** 가장 높은 등급 (빈 배열이면 common) */
export function topRarity(rarities: readonly Rarity[]): Rarity {
  return rarities.reduce<Rarity>((acc, r) => (rarityRank(r) > rarityRank(acc) ? r : acc), 'common');
}
