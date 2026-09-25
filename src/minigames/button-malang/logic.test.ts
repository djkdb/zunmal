import { describe, expect, it } from 'vitest';
import { BUTTON_MALANG_CONFIG as C, applyHit, applyMiss, comboBonus, createButtonMalangState, isComboAlive } from './logic';

function tapSequence(times: number[]) {
  let s = createButtonMalangState();
  for (const t of times) s = applyHit(s, t).state;
  return s;
}

describe('말랑 누르기 로직', () => {
  it('첫 타격은 1점, 콤보 1', () => {
    const { state, points } = applyHit(createButtonMalangState(), 1000);
    expect(points).toBe(1);
    expect(state.combo).toBe(1);
    expect(state.hits).toBe(1);
  });

  it('콤보 창 안에서 연속 타격하면 콤보 증가', () => {
    const s = tapSequence([0, 200, 400, 600]);
    expect(s.combo).toBe(4);
    expect(s.maxCombo).toBe(4);
  });

  it('콤보 창을 넘기면 콤보가 1로 재시작', () => {
    const s = tapSequence([0, 200, 200 + C.comboWindowMs + 1]);
    expect(s.combo).toBe(1);
    expect(s.maxCombo).toBe(2);
  });

  it('콤보 보너스는 comboStep마다 +1, 최대 maxComboBonus', () => {
    expect(comboBonus(C.comboStep - 1)).toBe(0);
    expect(comboBonus(C.comboStep)).toBe(1);
    expect(comboBonus(C.comboStep * 10)).toBe(C.maxComboBonus);
  });

  it('긴 콤보는 점수를 더 많이 준다', () => {
    const steady = tapSequence(Array.from({ length: 60 }, (_, i) => i * 150));
    const broken = tapSequence(Array.from({ length: 60 }, (_, i) => i * (C.comboWindowMs + 10)));
    expect(steady.hits).toBe(60);
    expect(broken.hits).toBe(60);
    expect(steady.score).toBeGreaterThan(broken.score);
    expect(broken.score).toBe(60);
  });

  it('너무 빠른 입력은 무시', () => {
    const s0 = applyHit(createButtonMalangState(), 0).state;
    const out = applyHit(s0, C.minIntervalMs - 1);
    expect(out.accepted).toBe(false);
    expect(out.state).toBe(s0);
  });

  it('실수하면 콤보 초기화, 실수 횟수 증가', () => {
    const s = applyMiss(tapSequence([0, 100, 200]));
    expect(s.combo).toBe(0);
    expect(s.misses).toBe(1);
    expect(s.maxCombo).toBe(3);
    expect(applyHit(s, 250).state.combo).toBe(1);
  });

  it('콤보 유지 여부', () => {
    const s = tapSequence([1000]);
    expect(isComboAlive(s, 1000 + C.comboWindowMs)).toBe(true);
    expect(isComboAlive(s, 1001 + C.comboWindowMs)).toBe(false);
  });

  it('현실적인 플레이(초당 6회, 20초)의 점수 범위', () => {
    const s = tapSequence(Array.from({ length: 120 }, (_, i) => i * (1000 / 6)));
    expect(s.score).toBeGreaterThan(200);
    expect(s.score).toBeLessThan(400);
  });
});
