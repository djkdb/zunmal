import { describe, expect, it } from 'vitest';
import { AFFECTION_PER_LEVEL } from '../data/affection';
import { CHARACTERS } from '../data/characters';
import { MATERIAL_BY_ID } from '../data/materialIds';
import {
  SHOP_CAP_HOURS,
  SHOP_EXPECTED_HOURS_PER_DAY,
  SHOP_MATERIAL_PERKS,
  SHOP_RATE_PER_HOUR,
  SHOP_SLOT_UNLOCKS,
} from './config';
import {
  SHOP_MAX_SLOTS,
  affectionBonus,
  assignStaff,
  claimShop,
  computeShopRates,
  elapsedMs,
  nextSlotAt,
  readShop,
  settleShop,
  unlockedSlots,
  type ShopContext,
  type ShopSave,
} from './shop';

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 26, 0, 0, 0);

function ctx(opts: { affection?: Record<string, number>; shiny?: string[] } = {}): ShopContext {
  const owned: Record<string, { shinyCount: number }> = {};
  for (const c of CHARACTERS) owned[c.id] = { shinyCount: opts.shiny?.includes(c.id) ? 1 : 0 };
  return { owned, affection: opts.affection ?? {} };
}

function perDay(staff: string[], c: ShopContext = ctx()): number {
  return computeShopRates(staff, c).perHour * SHOP_EXPECTED_HOURS_PER_DAY;
}

describe('디저트 가게: 칸', () => {
  it('모은 말랑이 수로 칸이 열린다 (최대 5)', () => {
    expect(unlockedSlots(0)).toBe(0);
    expect(unlockedSlots(1)).toBe(1);
    expect(unlockedSlots(SHOP_SLOT_UNLOCKS[1] ?? 0)).toBe(2);
    expect(unlockedSlots(999)).toBe(SHOP_MAX_SLOTS);
    expect(SHOP_MAX_SLOTS).toBe(5);
    expect(nextSlotAt(1)).toBe(SHOP_SLOT_UNLOCKS[1]);
    expect(nextSlotAt(999)).toBeNull();
  });

  it('칸 넣기: 빈칸 없이 앞에서부터, 이미 있으면 자리를 바꾼다', () => {
    expect(assignStaff([], 0, 'a', 3)).toEqual(['a']);
    expect(assignStaff(['a'], 2, 'b', 3)).toEqual(['a', 'b']);
    expect(assignStaff(['a', 'b'], 0, 'b', 3)).toEqual(['b', 'a']);
    expect(assignStaff(['a', 'b'], 0, 'c', 3)).toEqual(['c', 'b']);
    expect(assignStaff(['a', 'b', 'c'], 1, null, 3)).toEqual(['a', 'c']);
    expect(assignStaff(['a'], 1, 'a', 3)).toEqual(['a']);
    // 열린 칸 밖은 무시
    expect(assignStaff(['a'], 3, 'b', 3)).toEqual(['a']);
    expect(assignStaff(['a', 'b', 'c'], 0, 'd', 2)).toEqual(['d', 'b']);
  });
});

describe('디저트 가게: 시간당 코인', () => {
  it('희귀도 기본값: 일반 1마리 = 10/시간 (모찌는 슬로우 라이징이라 보너스 없음)', () => {
    const r = computeShopRates(['peach-mochi'], ctx());
    expect(r.perHour).toBe(SHOP_RATE_PER_HOUR.common);
    // 슬로우 라이징: 가득 참 +1시간
    expect(r.capHours).toBe(SHOP_CAP_HOURS + SHOP_MATERIAL_PERKS.slowRiseExtraHours);
  });

  it('친밀도: 단계당 +5%, 최대 +25%. 찐득이는 두 배', () => {
    expect(affectionBonus(0, 'jelly')).toBe(0);
    expect(affectionBonus(AFFECTION_PER_LEVEL * 2, 'jelly')).toBeCloseTo(0.1);
    expect(affectionBonus(99_999, 'jelly')).toBeCloseTo(0.25);
    expect(affectionBonus(AFFECTION_PER_LEVEL * 2, 'sticky')).toBeCloseTo(0.2);
    expect(affectionBonus(99_999, 'sticky')).toBeCloseTo(0.5);
  });

  it('반짝 +25%, 탱탱 젤리 +10%', () => {
    const plain = computeShopRates(['soda-drop'], ctx()).staff[0];
    expect(plain?.perHour).toBeCloseTo(10 * 1.1);
    const shiny = computeShopRates(['soda-drop'], ctx({ shiny: ['soda-drop'] })).staff[0];
    expect(shiny?.perHour).toBeCloseTo(10 * 1.35);
    expect(shiny?.bonuses.map((b) => b.label)).toEqual(['반짝 +25%', '탱탱 +10%']);
  });

  it('쭉쭉이는 다른 직원을 +5%씩 돕는다 (자기 자신은 제외)', () => {
    const r = computeShopRates(['matcha-bean', 'milk-cloud', 'peach-mochi'], ctx());
    const [matcha, cloud, mochi] = r.staff;
    expect(matcha?.bonuses.find((b) => b.kind === 'help')?.amount).toBeCloseTo(0.05);
    expect(cloud?.bonuses.find((b) => b.kind === 'help')?.amount).toBeCloseTo(0.05);
    expect(mochi?.bonuses.find((b) => b.kind === 'help')?.amount).toBeCloseTo(0.1);
  });

  it('같은 세트 직원: 한 마리 늘 때마다 +10% ("디저트 가게 세트 +20%")', () => {
    const r = computeShopRates(['peach-mochi', 'custard-bun', 'choco-chip'], ctx());
    expect(r.sets[0]).toMatchObject({ id: 'dessert-shop', count: 3 });
    for (const s of r.staff) expect(s.bonuses.some((b) => b.label === '디저트 가게 세트 +20%')).toBe(true);
    // 슬로우 라이징 셋이어도 가득 참 연장은 최대 +2시간
    expect(r.capHours).toBe(SHOP_CAP_HOURS + SHOP_MATERIAL_PERKS.slowRiseMaxExtraHours);
  });

  it('여러 세트에 걸치면 가장 큰 세트 하나만', () => {
    // 마시멜로·모찌는 디저트 가게와 봄 소풍 둘 다
    const r = computeShopRates(['marshmallow', 'peach-mochi'], ctx());
    for (const s of r.staff) expect(s.bonuses.filter((b) => b.kind === 'set')).toHaveLength(1);
  });

  it('모르는 id 는 건너뛴다', () => {
    expect(computeShopRates(['nope'], ctx()).perHour).toBe(0);
  });

  it('모든 말랑이는 촉감이 있다 (특기 한 줄)', () => {
    for (const c of CHARACTERS) expect(MATERIAL_BY_ID[c.id]).toBeDefined();
  });
});

describe('디저트 가게: 목표 수입 (하루 2~3번 받는 플레이어 = 하루 16시간)', () => {
  it('새 플레이어(일반 시작 말랑이 하나) 하루 150~250', () => {
    for (const id of ['peach-mochi', 'soda-drop', 'matcha-bean']) {
      const d = perDay([id]);
      expect(d, id).toBeGreaterThanOrEqual(150);
      expect(d, id).toBeLessThanOrEqual(250);
    }
    // 조금 쓰다듬은 뒤(2단계)에도 범위 안
    expect(perDay(['soda-drop'], ctx({ affection: { 'soda-drop': 60 } }))).toBeLessThanOrEqual(250);
  });

  it('중반(3칸: 에픽·레어·일반 + 친밀도 조금) 하루 500~800', () => {
    const rosters: [string[], ShopContext][] = [
      [['starry-night', 'bubble-tea', 'peach-mochi'], ctx({ affection: { 'peach-mochi': 120 } })],
      [['moon-bunny', 'mint-scholar', 'soda-drop'], ctx()],
      [['snow-scarf', 'ribbon-berry', 'tangerine'], ctx({ affection: { 'snow-scarf': 60, tangerine: 200 } })],
      // 세트 호흡이 붙은 구성도 범위 안
      [['bubble-tea', 'custard-bun', 'peach-mochi'], ctx({ affection: { 'peach-mochi': 150 } })],
    ];
    for (const [staff, c] of rosters) {
      const d = perDay(staff, c);
      expect(d, staff.join()).toBeGreaterThanOrEqual(500);
      expect(d, staff.join()).toBeLessThanOrEqual(800);
    }
  });

  it('초반(2칸)은 새 플레이어보다 많고 중반보다 적다', () => {
    const d = perDay(['peach-mochi', 'lemon-sprout']);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(500);
  });

  it('후반(5칸 전설·에픽 + 보너스)도 하루 10연 두 번(2000)을 넘지 않는다', () => {
    const all = Object.fromEntries(CHARACTERS.map((c) => [c.id, 400]));
    const d = perDay(['sunset-king', 'crystal-queen', 'starry-night', 'moon-bunny', 'ribbon-berry'], ctx({ affection: all }));
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });
});

describe('디저트 가게: 쌓이기와 받기', () => {
  const staff = ['peach-mochi']; // 10/시간, 가득 참 9시간 = 90
  const rates = computeShopRates(staff, ctx());
  const save = (over: Partial<ShopSave> = {}): ShopSave => ({ staff, lastTickAt: T0, banked: 0, ...over });

  it('시간만큼 쌓인다', () => {
    expect(readShop(save(), rates, T0 + 2 * H).coins).toBe(20);
    expect(readShop(save(), rates, T0 + 2 * H).fill).toBeCloseTo(20 / 90);
  });

  it('가득 차면 멈춘다 (한 번에 가득 찬 양까지만)', () => {
    const r = readShop(save(), rates, T0 + 100 * H);
    expect(r.coins).toBe(rates.capCoins);
    expect(r.full).toBe(true);
    expect(claimShop(save(), rates, T0 + 1000 * H).coins).toBe(rates.capCoins);
  });

  it('시계가 거꾸로 가면 주지 않고 기준을 지금으로', () => {
    expect(readShop(save(), rates, T0 - 5 * H).coins).toBe(0);
    expect(elapsedMs(T0, T0 - H, 8)).toBe(0);
    const s = settleShop(save({ banked: 7 }), rates, T0 - 5 * H);
    expect(s).toEqual(save({ banked: 7, lastTickAt: T0 - 5 * H }));
    // 이후 다시 앞으로 가도 거꾸로 간 시각부터만 센다
    expect(readShop(s, rates, T0 - 4 * H).coins).toBe(7 + 10);
  });

  it('받기: 정수 코인을 모두 주고 자투리 시간은 남긴다', () => {
    const now = T0 + 1.5 * H + 0.5 * (H / 10); // 15.5코인
    const res = claimShop(save(), rates, now);
    expect(res.coins).toBe(15);
    expect(res.save.banked).toBe(0);
    // 남은 0.5코인 → 3분 뒤면 1코인
    expect(readShop(res.save, rates, now + 3 * 60_000).coins).toBe(1);
  });

  it('1코인도 안 쌓였으면 받지 않는다', () => {
    expect(claimShop(save(), rates, T0 + 60_000).coins).toBe(0);
  });

  it('직원이 줄어 가득 참이 작아져도 쌓아 둔 코인은 줄지 않는다', () => {
    const small = computeShopRates(['soda-drop'], ctx());
    const r = readShop(save({ banked: 500 }), small, T0 + 3 * H);
    expect(r.coins).toBe(500);
    expect(r.full).toBe(true);
  });

  it('직원이 없으면 쌓이지 않지만 쌓아 둔 코인은 받을 수 있다', () => {
    const none = computeShopRates([], ctx());
    expect(readShop(save({ staff: [] }), none, T0 + 5 * H).coins).toBe(0);
    expect(claimShop(save({ staff: [], banked: 12 }), none, T0 + H).coins).toBe(12);
  });
});
