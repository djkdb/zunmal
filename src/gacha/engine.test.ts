import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTERS_BY_RARITY } from '../data/characters';
import { GACHA_RULES, RARITIES, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL, isAtLeast, type Rarity } from '../data/rarity';
import { DUPLICATE_REFUND } from '../economy/config';
import { createSeededRng, type RNG } from '../lib/rng';
import {
  DEFAULT_GACHA_CONFIG,
  effectivePityRate,
  pickCharacter,
  pullMulti,
  pullOne,
  pullSingle,
  resolveDuplicates,
  rollRarity,
  type OwnedSnapshot,
  type PullResult,
} from './engine';

const SEEDS = [1, 20240601, 987654321];
const N = 100_000;

/** 희귀도별 허용 오차: 5σ (이항분포 표준편차) */
function tolerance(p: number, n: number): number {
  return 5 * Math.sqrt((p * (1 - p)) / n);
}

function emptyCounts(): Record<Rarity, number> {
  return { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, secret: 0 };
}

/** 항상 같은 값을 반환하는 RNG */
const constRng =
  (v: number): RNG =>
  () =>
    v;

/** 전설 이상이 절대 나오지 않는 RNG: 첫 희귀도 추첨 구간(0)에 고정 → 일반 */
const alwaysCommonRng = constRng(0);

describe('확률 테이블', () => {
  it('희귀도 확률 합계는 정확히 100%', () => {
    const sum = RARITIES.reduce((s, r) => s + RARITY_WEIGHTS[r], 0);
    expect(sum).toBe(RARITY_WEIGHT_TOTAL);
    expect(RARITY_WEIGHT_TOTAL).toBe(10_000);
  });

  it('목표 확률과 일치', () => {
    expect(RARITY_WEIGHTS).toEqual({ common: 6195, rare: 2500, epic: 950, legendary: 300, mythic: 50, secret: 5 });
  });

  it('희귀도별 캐릭터 수: 일반10 레어7 에픽6 전설4 신화2 시크릿3', () => {
    expect(CHARACTERS).toHaveLength(32);
    expect(CHARACTERS_BY_RARITY.common).toHaveLength(10);
    expect(CHARACTERS_BY_RARITY.rare).toHaveLength(7);
    expect(CHARACTERS_BY_RARITY.epic).toHaveLength(6);
    expect(CHARACTERS_BY_RARITY.legendary).toHaveLength(4);
    expect(CHARACTERS_BY_RARITY.mythic).toHaveLength(2);
    expect(CHARACTERS_BY_RARITY.secret).toHaveLength(3);
  });

  it('시크릿은 극악 확률(0.05%)이고 신화보다 낮다', () => {
    expect(RARITY_WEIGHTS.secret / RARITY_WEIGHT_TOTAL).toBe(0.0005);
    expect(RARITY_WEIGHTS.secret).toBeLessThan(RARITY_WEIGHTS.mythic);
  });

  it('캐릭터 id는 고유하다', () => {
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
  });
});

describe.each(SEEDS)('희귀도 확률 10만 회 검증 (seed %i)', (seed) => {
  it('각 희귀도 출현율이 목표 확률 ±5σ 이내', () => {
    const rng = createSeededRng(seed);
    const counts = emptyCounts();
    for (let i = 0; i < N; i++) counts[rollRarity(rng)]++;

    for (const r of RARITIES) {
      const p = RARITY_WEIGHTS[r] / RARITY_WEIGHT_TOTAL;
      expect(Math.abs(counts[r] / N - p), `${r}: ${counts[r] / N} vs ${p}`).toBeLessThan(tolerance(p, N));
    }
  });
});

describe.each(SEEDS)('캐릭터 균등 분포 (seed %i)', (seed) => {
  it.each(RARITIES)('%s 풀 내부 균등', (rarity) => {
    const rng = createSeededRng(seed + rarity.length);
    const pool = CHARACTERS_BY_RARITY[rarity];
    const counts = new Map<string, number>();
    const n = 30_000;
    for (let i = 0; i < n; i++) {
      const c = pickCharacter(rng, rarity);
      expect(c.rarity).toBe(rarity);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const p = 1 / pool.length;
    expect(counts.size).toBe(pool.length);
    for (const count of counts.values()) {
      expect(Math.abs(count / n - p)).toBeLessThan(tolerance(p, n) + 1e-9);
    }
  });
});

describe('천장', () => {
  it('49회 연속 전설 미만 후 50번째 pull은 전설 이상 확정', () => {
    let pity = 0;
    for (let i = 1; i < GACHA_RULES.pityThreshold; i++) {
      const { result, pityCount } = pullOne(pity, alwaysCommonRng);
      expect(result.rarity).toBe('common');
      expect(result.byPity).toBe(false);
      expect(pityCount).toBe(i);
      pity = pityCount;
    }
    expect(pity).toBe(49);
    const { result, pityCount } = pullOne(pity, alwaysCommonRng);
    expect(isAtLeast(result.rarity, 'legendary')).toBe(true);
    expect(result.byPity).toBe(true);
    expect(pityCount).toBe(0);
  });

  it('전설/신화 등장 시 천장 카운트 0으로 초기화', () => {
    // rng=0.999 → 가중치 마지막 구간 = 신화
    const mythic = pullOne(30, constRng(0.999));
    expect(mythic.result.rarity).toBe('mythic');
    expect(mythic.pityCount).toBe(0);
    // 전설 구간: (6200+2500+950)/10000 = 0.965 ~ 0.995
    const legendary = pullOne(12, constRng(0.97));
    expect(legendary.result.rarity).toBe('legendary');
    expect(legendary.pityCount).toBe(0);
  });

  it('에픽 이하는 천장 카운트를 1 증가시킨다', () => {
    expect(pullOne(10, constRng(0.95)).result.rarity).toBe('epic');
    expect(pullOne(10, constRng(0.95)).pityCount).toBe(11);
  });

  it.each(SEEDS)('천장 확정 시 전설:신화 = 6:1, 시크릿도 원래 비율로 포함 (seed %i)', (seed) => {
    const rng = createSeededRng(seed);
    const counts = emptyCounts();
    const n = 70_000;
    for (let i = 0; i < n; i++) counts[pullOne(49, rng).result.rarity]++;
    expect(counts.common + counts.rare + counts.epic).toBe(0);
    const pSecret = 5 / 355;
    expect(Math.abs(counts.secret / n - pSecret)).toBeLessThan(tolerance(pSecret, n));
    const pMythic = 50 / 355;
    expect(Math.abs(counts.mythic / n - pMythic)).toBeLessThan(tolerance(pMythic, n));
    expect(counts.legendary / counts.mythic).toBeGreaterThan(5.5);
    expect(counts.legendary / counts.mythic).toBeLessThan(6.5);
  });

  it('손상된 pity 값(음수/NaN/과대)은 안전하게 정규화', () => {
    expect(pullOne(-5, alwaysCommonRng).pityCount).toBe(1);
    expect(pullOne(Number.NaN, alwaysCommonRng).pityCount).toBe(1);
    expect(pullOne(9999, alwaysCommonRng).result.byPity).toBe(true);
  });

  it.each(SEEDS)('장기 시뮬레이션: 전설 이상 간격이 50을 넘지 않는다 (seed %i)', (seed) => {
    const rng = createSeededRng(seed);
    let pity = 0;
    let sinceLast = 0;
    let maxGap = 0;
    let legendaryPlus = 0;
    const n = N;
    for (let i = 0; i < n; i++) {
      const out = pullOne(pity, rng);
      pity = out.pityCount;
      sinceLast++;
      if (isAtLeast(out.result.rarity, 'legendary')) {
        maxGap = Math.max(maxGap, sinceLast);
        sinceLast = 0;
        legendaryPlus++;
      }
    }
    expect(maxGap).toBeLessThanOrEqual(GACHA_RULES.pityThreshold);
    // 천장 포함 실질 확률과 일치 (≈ 4.2%)
    const eff = effectivePityRate();
    expect(eff).toBeGreaterThan(0.041);
    expect(eff).toBeLessThan(0.043);
    expect(Math.abs(legendaryPlus / n - eff)).toBeLessThan(tolerance(eff, n) * 1.5);
  });
});

describe.each(SEEDS)('반짝 확률 (seed %i)', (seed) => {
  it('약 1%, 등급과 무관', () => {
    const rng = createSeededRng(seed);
    let shiny = 0;
    let pity = 0;
    for (let i = 0; i < N; i++) {
      const out = pullOne(pity, rng);
      pity = out.pityCount;
      if (out.result.shiny) shiny++;
    }
    expect(Math.abs(shiny / N - GACHA_RULES.shinyRate)).toBeLessThan(tolerance(GACHA_RULES.shinyRate, N));
  });
});

describe('단일 뽑기', () => {
  it('결과 1개와 다음 천장 카운트를 반환', () => {
    const out = pullSingle(0, createSeededRng(5));
    expect(out.results).toHaveLength(1);
  });
});

describe('10연 뽑기', () => {
  it('결과는 항상 정확히 10개', () => {
    const rng = createSeededRng(11);
    for (let i = 0; i < 2000; i++) expect(pullMulti(i % 50, rng).results).toHaveLength(10);
  });

  it('레어 이상이 없으면 10번째를 레어 이상으로 교체', () => {
    // 처음 10번의 희귀도/캐릭터 추첨은 모두 0 → 일반. 이후 교체 추첨.
    // pull 1회 = 희귀도·캐릭터·반짝 3번 추첨
    const seq = [...Array(30).fill(0), 0.0, 0.0, 0.5];
    let i = 0;
    const rng: RNG = () => seq[i++] ?? 0;
    const out = pullMulti(0, rng);
    expect(out.results).toHaveLength(10);
    out.results.slice(0, 9).forEach((r) => expect(r.rarity).toBe('common'));
    const last = out.results[9] as PullResult;
    expect(last.rarity).toBe('rare');
    expect(last.byGuarantee).toBe(true);
    expect(out.pityCount).toBe(10);
  });

  it('교체 결과가 전설 이상이면 천장 카운트 0', () => {
    // 레어 이상 풀(2500:950:300:50:5)에서 0.995 → 신화 구간
    const seq = [...Array(30).fill(0), 0.995, 0, 0.5];
    let i = 0;
    const rng: RNG = () => seq[i++] ?? 0;
    const out = pullMulti(5, rng);
    expect(out.results[9]?.rarity).toBe('mythic');
    expect(out.pityCount).toBe(0);
  });

  it('이미 레어 이상이 있으면 교체하지 않는다', () => {
    const rng = createSeededRng(3);
    for (let k = 0; k < 3000; k++) {
      const out = pullMulti(0, rng);
      const guaranteed = out.results.filter((r) => r.byGuarantee);
      const naturalRare = out.results.slice(0, 9).some((r) => isAtLeast(r.rarity, 'rare'));
      if (naturalRare) expect(guaranteed).toHaveLength(0);
    }
  });

  it.each(SEEDS)('모든 10연에 레어 이상이 최소 1개 (seed %i)', (seed) => {
    const rng = createSeededRng(seed);
    let pity = 0;
    for (let k = 0; k < 10_000; k++) {
      const out = pullMulti(pity, rng);
      pity = out.pityCount;
      expect(out.results.some((r) => isAtLeast(r.rarity, 'rare'))).toBe(true);
    }
  });

  it('10연 도중 천장이 개별 pull에 적용된다', () => {
    // pity 45 → 5번째 pull이 50번째가 되어 확정
    const out = pullMulti(45, alwaysCommonRng);
    out.results.slice(0, 4).forEach((r) => expect(r.rarity).toBe('common'));
    expect(out.results[4]?.byPity).toBe(true);
    expect(isAtLeast(out.results[4]?.rarity ?? 'common', 'legendary')).toBe(true);
    // 이후 5회는 다시 일반, 전설이 이미 있으므로 교체 없음
    out.results.slice(5).forEach((r) => expect(r.rarity).toBe('common'));
    expect(out.results.some((r) => r.byGuarantee)).toBe(false);
    expect(out.pityCount).toBe(5);
  });

  it('10연 천장 카운트는 개별 pull 누적과 일치', () => {
    const rng = createSeededRng(77);
    let pity = 0;
    for (let k = 0; k < 2000; k++) {
      const out = pullMulti(pity, rng);
      // 마지막 전설 이상 이후의 개수 = pity
      let expected = pity;
      out.results.forEach((r) => {
        expected = isAtLeast(r.rarity, 'legendary') ? 0 : expected + 1;
      });
      expect(out.pityCount).toBe(Math.min(expected, 49));
      pity = out.pityCount;
    }
  });
});

describe('중복 환급', () => {
  const byId = (id: string) => {
    const c = CHARACTERS.find((x) => x.id === id);
    if (!c) throw new Error(id);
    return { character: c, rarity: c.rarity, byPity: false, byGuarantee: false, shiny: false } satisfies PullResult;
  };
  const shinyOf = (id: string): PullResult => ({ ...byId(id), shiny: true });
  const owned = (...ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { count: 1, shinyCount: 0 }])) as Record<string, OwnedSnapshot>;

  it('미보유는 신규, 보유는 희귀도별 환급', () => {
    const results = [byId('peach-mochi'), byId('ribbon-berry'), byId('galaxy-malang')];
    const { items, totalRefund } = resolveDuplicates(results, owned('ribbon-berry', 'galaxy-malang'));
    expect(items.map((x) => x.isNew)).toEqual([true, false, false]);
    expect(items.map((x) => x.refund)).toEqual([0, DUPLICATE_REFUND.rare, DUPLICATE_REFUND.mythic]);
    expect(totalRefund).toBe(30 + 1000);
  });

  it('같은 묶음 안의 두 번째 등장은 중복', () => {
    const results = [byId('soda-drop'), byId('soda-drop'), byId('sunset-king'), byId('sunset-king')];
    const { items, totalRefund } = resolveDuplicates(results, {});
    expect(items.map((x) => x.isNew)).toEqual([true, false, true, false]);
    expect(totalRefund).toBe(10 + 300);
  });

  it('환급 테이블 값', () => {
    expect(DUPLICATE_REFUND).toEqual({ common: 10, rare: 30, epic: 80, legendary: 300, mythic: 1000, secret: 5000 });
  });

  it('이미 가진 말랑이라도 반짝을 처음 얻으면 환급 대신 새 수집', () => {
    const { items, totalRefund } = resolveDuplicates([shinyOf('soda-drop'), shinyOf('soda-drop')], owned('soda-drop'));
    expect(items.map((x) => [x.isNew, x.isNewShiny, x.refund])).toEqual([
      [false, true, 0],
      [false, false, 10],
    ]);
    expect(totalRefund).toBe(10);
  });

  it('처음 만난 말랑이가 반짝이면 신규이면서 반짝 신규', () => {
    const { items } = resolveDuplicates([shinyOf('phoenix')], {});
    expect(items[0]).toMatchObject({ isNew: true, isNewShiny: true, refund: 0 });
  });
});

describe('설정 주입', () => {
  it('config를 주입해 천장 기준을 바꿀 수 있다', () => {
    const config = { ...DEFAULT_GACHA_CONFIG, pityThreshold: 3 };
    let pity = 0;
    pity = pullOne(pity, alwaysCommonRng, config).pityCount;
    pity = pullOne(pity, alwaysCommonRng, config).pityCount;
    expect(pullOne(pity, alwaysCommonRng, config).result.byPity).toBe(true);
  });
});
