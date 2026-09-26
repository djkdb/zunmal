import { describe, expect, it } from 'vitest';
import type { Rarity } from '../data/rarity';
import { REVEAL_LEAD_IN, revealStep, summarizePulls, topRarity, totalRevealTime } from './pullReveal';

const item = (rarity: Rarity, extra: Partial<{ shiny: boolean; isNew: boolean; isNewShiny: boolean; refund: number }> = {}) => ({
  rarity,
  shiny: false,
  isNew: false,
  isNewShiny: false,
  refund: 0,
  ...extra,
});

describe('revealStep', () => {
  it('첫 카드는 모달 등장을 기다린다', () => {
    expect(revealStep(['common'], 0).gap).toBe(REVEAL_LEAD_IN);
  });

  it('등급이 높을수록 모으기·숨 멈춤·튀어오름이 커진다', () => {
    const rs: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
    const steps = rs.map((_, i) => revealStep(rs, i));
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1]!;
      const b = steps[i]!;
      expect(b.charge).toBeGreaterThanOrEqual(a.charge);
      expect(b.hold).toBeGreaterThanOrEqual(a.hold);
      expect(b.pop).toBeGreaterThan(a.pop);
    }
    expect(revealStep(rs, 0).charge).toBe(0);
    expect(revealStep(rs, 3).hold).toBeGreaterThan(0);
  });

  it('일반 카드 사이 간격은 90~120ms', () => {
    const rs: Rarity[] = ['common', 'common', 'rare', 'rare'];
    for (let i = 1; i < rs.length; i++) {
      const g = revealStep(rs, i).gap;
      expect(g).toBeGreaterThanOrEqual(90);
      expect(g).toBeLessThanOrEqual(120);
    }
  });

  it('큰 결과 다음 카드는 조금 더 쉰다', () => {
    const rs: Rarity[] = ['common', 'legendary', 'common'];
    expect(revealStep(rs, 2).gap).toBeGreaterThan(revealStep(['common', 'common', 'common'], 2).gap);
  });

  it('이미 전체 화면 연출로 본 카드는 모으기를 생략한다', () => {
    const s = revealStep(['mythic'], 0, true);
    expect(s.charge).toBe(0);
    expect(s.hold).toBe(0);
  });

  it('10연 전체 공개는 몇 초 안에 끝난다', () => {
    const rs: Rarity[] = ['common', 'rare', 'common', 'common', 'epic', 'common', 'common', 'rare', 'common', 'legendary'];
    const t = totalRevealTime(rs);
    expect(t).toBeGreaterThan(1500);
    expect(t).toBeLessThan(4000);
  });
});

describe('summarizePulls', () => {
  it('새 말랑이, 반짝, 환급을 센다', () => {
    const s = summarizePulls([
      item('common', { isNew: true }),
      item('rare', { refund: 30 }),
      item('common', { shiny: true, isNewShiny: true }),
      item('epic', { refund: 80 }),
    ]);
    expect(s.newCount).toBe(1);
    expect(s.shinyCount).toBe(1);
    expect(s.refund).toBe(110);
    expect(s.bestIndex).toBe(3);
  });

  it('같은 등급이면 반짝을, 그다음 앞선 결과를 최고로 고른다', () => {
    expect(summarizePulls([item('rare'), item('rare')]).bestIndex).toBe(0);
    expect(summarizePulls([item('rare'), item('rare', { shiny: true })]).bestIndex).toBe(1);
  });

  it('topRarity', () => {
    expect(topRarity([])).toBe('common');
    expect(topRarity(['rare', 'secret', 'legendary'])).toBe('secret');
  });
});
