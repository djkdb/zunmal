import { describe, expect, it } from 'vitest';
import type { Rarity } from '../data/rarity';
import {
  OPEN_ALL_STAGGER,
  allOpen,
  canOpen,
  initialPhases,
  openAllDuration,
  openAllSchedule,
  openSequence,
  openTiming,
  openedCount,
  summarizePulls,
  topRarity,
  type CardPhase,
} from './pullReveal';

const item = (rarity: Rarity, extra: Partial<{ shiny: boolean; isNew: boolean; isNewShiny: boolean; refund: number }> = {}) => ({
  rarity,
  shiny: false,
  isNew: false,
  isNewShiny: false,
  refund: 0,
  ...extra,
});

const ALL: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'];

describe('openTiming / openSequence', () => {
  it('등급이 높을수록 모으기·숨 멈춤·튀어오름이 커진다', () => {
    const ts = ALL.map((r) => openTiming(r));
    for (let i = 1; i < ts.length; i++) {
      const a = ts[i - 1]!;
      const b = ts[i]!;
      expect(b.charge).toBeGreaterThanOrEqual(a.charge);
      expect(b.hold).toBeGreaterThanOrEqual(a.hold);
      expect(b.pop).toBeGreaterThan(a.pop);
    }
    expect(openTiming('common').charge).toBe(0);
    expect(openTiming('epic').charge).toBeGreaterThan(0);
    expect(openTiming('epic').hold).toBe(0);
    expect(openTiming('legendary').hold).toBeGreaterThan(0);
  });

  it('일반·레어는 누르자마자 뒤집힌다', () => {
    expect(openSequence('common')).toEqual([['face', 0]]);
    expect(openSequence('rare')).toEqual([['face', 0]]);
  });

  it('에픽은 떨린 뒤, 전설 이상은 떨림 → 숨 멈춤 → 뒤집기', () => {
    expect(openSequence('epic').map(([p]) => p)).toEqual(['charge', 'face']);
    for (const r of ['legendary', 'mythic', 'secret'] as const) {
      expect(openSequence(r).map(([p]) => p)).toEqual(['charge', 'hold', 'face']);
    }
  });

  it('이미 전체 화면 연출로 본 카드와 움직임 줄이기는 바로 뒤집힌다', () => {
    expect(openSequence('mythic', { seen: true })).toEqual([['face', 0]]);
    expect(openSequence('secret', { reduced: true })).toEqual([['face', 0]]);
    expect(openTiming('secret', { reduced: true }).pop).toBe(1);
  });

  it('모두 열기(quick)에서는 에픽 떨림만 생략하고 전설 이상은 뜸을 들인다', () => {
    expect(openSequence('epic', { quick: true })).toEqual([['face', 0]]);
    expect(openSequence('legendary', { quick: true })).toEqual(openSequence('legendary'));
  });
});

describe('카드 상태', () => {
  it('처음에는 모두 뒷면, 전체 화면 연출로 본 카드만 앞면', () => {
    expect(initialPhases(3)).toEqual(['back', 'back', 'back']);
    expect(initialPhases(3, 1)).toEqual(['back', 'face', 'back']);
  });

  it('뒷면만 열 수 있다 (여는 중·열린 카드는 다시 열지 않음)', () => {
    expect(canOpen('back')).toBe(true);
    expect(canOpen('charge')).toBe(false);
    expect(canOpen('hold')).toBe(false);
    expect(canOpen('face')).toBe(false);
    expect(canOpen(undefined)).toBe(false);
  });

  it('allOpen / openedCount', () => {
    const ps: CardPhase[] = ['face', 'charge', 'back', 'face'];
    expect(openedCount(ps)).toBe(2);
    expect(allOpen(ps)).toBe(false);
    expect(allOpen(['face', 'face'])).toBe(true);
  });
});

describe('openAllSchedule', () => {
  it('남은 뒷면 카드만 앞에서부터 짧은 간격으로 연다', () => {
    const rs: Rarity[] = ['common', 'rare', 'common', 'common'];
    const ps: CardPhase[] = ['face', 'back', 'charge', 'back'];
    expect(openAllSchedule(rs, ps)).toEqual([
      { index: 1, at: 0 },
      { index: 3, at: OPEN_ALL_STAGGER },
    ]);
  });

  it('전설 이상은 모으기·숨 멈춤을 지키고, 뒤집힌 뒤 조금 더 쉰다', () => {
    const rs: Rarity[] = ['common', 'legendary', 'common'];
    const steps = openAllSchedule(rs, initialPhases(3));
    const leg = openTiming('legendary');
    expect(steps[1]!.at).toBe(OPEN_ALL_STAGGER);
    expect(steps[2]!.at).toBeGreaterThan(steps[1]!.at + leg.charge + leg.hold + OPEN_ALL_STAGGER);
  });

  it('에픽은 모두 열기에서 기다리지 않는다', () => {
    const steps = openAllSchedule(['epic', 'common'], initialPhases(2));
    expect(steps[1]!.at).toBe(OPEN_ALL_STAGGER);
  });

  it('이미 본 신화 카드는 건너뛰고, 움직임 줄이기는 한 번에 연다', () => {
    const rs: Rarity[] = ['common', 'mythic', 'common'];
    expect(openAllSchedule(rs, initialPhases(3, 1), { seenIndex: 1 }).map((s) => s.index)).toEqual([0, 2]);
    expect(openAllSchedule(rs, initialPhases(3), { reduced: true }).every((s) => s.at === 0)).toBe(true);
    expect(openAllDuration(rs, initialPhases(3), { reduced: true })).toBe(0);
  });

  it('10연 모두 열기는 금방 끝난다', () => {
    const rs: Rarity[] = ['common', 'rare', 'common', 'common', 'epic', 'common', 'common', 'rare', 'common', 'legendary'];
    const t = openAllDuration(rs, initialPhases(10));
    expect(t).toBeGreaterThan(9 * OPEN_ALL_STAGGER);
    expect(t).toBeLessThan(2000);
    expect(openAllDuration(rs, Array<CardPhase>(10).fill('face'))).toBe(0);
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
