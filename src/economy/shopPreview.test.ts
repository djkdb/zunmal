import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { assignStaff, computeShopRates, shownPerHour, type ShopContext } from './shop';
import { previewStaffChange } from './shopPreview';

function ctx(opts: { affection?: Record<string, number> } = {}): ShopContext {
  const owned: Record<string, { shinyCount: number }> = {};
  for (const c of CHARACTERS) owned[c.id] = { shinyCount: 0 };
  return { owned, affection: opts.affection ?? {} };
}

describe('디저트 가게: 직원 바꾸기 미리 보기', () => {
  it('가게 화면과 같은 계산 (assignStaff → computeShopRates)', () => {
    const staff = ['peach-mochi', 'soda-drop'];
    const c = ctx({ affection: { 'soda-drop': 180 } });
    const p = previewStaffChange(staff, 1, 'sunset-king', 3, c);
    const expected = computeShopRates(assignStaff(staff, 1, 'sunset-king', 3), c);
    expect(p.staff).toEqual(['peach-mochi', 'sunset-king']);
    expect(p.after.perHour).toBeCloseTo(expected.perHour, 9);
    expect(p.afterPerHour).toBe(shownPerHour(expected.perHour));
    expect(p.beforePerHour).toBe(shownPerHour(computeShopRates(staff, c).perHour));
    expect(p.own?.id).toBe('sunset-king');
    expect(p.own?.perHour).toBeCloseTo(expected.staff[1]?.perHour ?? 0, 9);
    expect(p.trend).toBe('up');
    expect(p.percent).toBe(Math.round(((p.afterPerHour - p.beforePerHour) / p.beforePerHour) * 100));
  });

  it('세트 짝을 빼면 남은 직원의 세트 보너스도 사라진다 (합계에 반영)', () => {
    // 커스터드 빵 + 복숭아 모찌 = 디저트 가게 세트 → 둘 다 +10%
    const staff = ['custard-bun', 'peach-mochi'];
    const before = computeShopRates(staff, ctx());
    expect(before.sets.map((s) => s.name)).toContain('디저트 가게');
    // 모찌 자리에 같은 일반 등급 말차 콩(쭉쭉이) — 자기 기본값은 같지만 빵이 세트 보너스를 잃는다
    const p = previewStaffChange(staff, 1, 'matcha-bean', 3, ctx());
    const bunAfter = p.after.staff.find((s) => s.id === 'custard-bun');
    const bunBefore = before.staff.find((s) => s.id === 'custard-bun');
    expect(bunAfter && bunBefore && bunAfter.perHour < bunBefore.perHour).toBe(true);
    expect(p.sets).toEqual([expect.objectContaining({ name: '디저트 가게', after: 0 })]);
    expect(p.sets[0]?.before).toBeGreaterThan(0);
  });

  it('세트 짝을 들이면 이미 일하던 직원도 오른다', () => {
    const p = previewStaffChange(['custard-bun'], 1, 'strawberry-daifuku', 3, ctx());
    const bun = p.after.staff.find((s) => s.id === 'custard-bun');
    expect(bun?.bonuses.some((b) => b.kind === 'set')).toBe(true);
    expect(p.sets).toEqual([expect.objectContaining({ name: '디저트 가게', before: 0 })]);
    expect(p.trend).toBe('up');
  });

  it('쭉쭉이는 다른 직원을 돕는다 — 빼면 다른 직원이 내려간다', () => {
    const staff = ['soda-drop', 'milk-cloud'];
    const p = previewStaffChange(staff, 1, null, 3, ctx());
    expect(p.staff).toEqual(['soda-drop']);
    expect(p.own).toBeNull();
    const sodaBefore = computeShopRates(staff, ctx()).staff[0]?.perHour ?? 0;
    const sodaAfter = p.after.staff[0]?.perHour ?? 0;
    expect(sodaAfter).toBeLessThan(sodaBefore);
    expect(p.trend).toBe('down');
    expect(p.percent).toBeLessThan(0);
  });

  it('지금 일하는 말랑이를 그대로 고르거나 자리만 바꾸면 그대로', () => {
    const staff = ['soda-drop', 'grape-jelly'];
    expect(previewStaffChange(staff, 0, 'soda-drop', 3, ctx()).trend).toBe('same');
    const swap = previewStaffChange(staff, 0, 'grape-jelly', 3, ctx());
    expect(swap.staff).toEqual(['grape-jelly', 'soda-drop']);
    expect(swap.trend).toBe('same');
    expect(swap.percent).toBe(0);
    expect(swap.sets).toEqual([]);
  });

  it('빈 가게에 처음 들이면 변화율 없음(null), 방향은 up', () => {
    const p = previewStaffChange([], 0, 'soda-drop', 1, ctx());
    expect(p.beforePerHour).toBe(0);
    expect(p.percent).toBeNull();
    expect(p.trend).toBe('up');
  });
});
