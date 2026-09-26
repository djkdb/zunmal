import { describe, expect, it } from 'vitest';
import {
  DAILY_CAP,
  DEFAULT_GAME_MULTIPLIER,
  GAME_MULTIPLIERS,
  PARTNER_RARITY_BONUS,
  PER_GAME_CAP,
  PULL_COUNT,
  PULL_PRICE,
} from './config';
import { seoulDateKey, isValidDateKey } from './daily';
import { applyDailyReset, computeReward, getGameMultiplier, normalizeScore, payForPull } from './economy';

describe('config', () => {
  it('뽑기 가격: 1회 100, 10연 1000 (할인 없음)', () => {
    expect(PULL_PRICE).toEqual({ single: 100, multi: 1000 });
    // 할인이 없어야 1회씩 바로 뽑아도 손해가 없다
    expect(PULL_PRICE.multi).toBe(PULL_PRICE.single * PULL_COUNT.multi);
  });
  it('모든 배율/보너스는 음이 아닌 유한수', () => {
    for (const v of [...Object.values(GAME_MULTIPLIERS), ...Object.values(PARTNER_RARITY_BONUS)]) {
      expect(Number.isFinite(v) && v >= 0).toBe(true);
    }
    expect(PER_GAME_CAP).toBeLessThanOrEqual(DAILY_CAP);
  });
});

describe('computeReward', () => {
  it('base = floor(score × multiplier), 파트너 보너스 = floor(base × bonus)', () => {
    const r = computeReward({ gameId: 'button-malang', score: 123, partnerRarity: 'epic', dailyEarned: 0 });
    const base = Math.floor(123 * GAME_MULTIPLIERS['button-malang']!);
    expect(r.baseCoins).toBe(base);
    expect(r.partnerBonus).toBe(Math.floor(base * PARTNER_RARITY_BONUS.epic));
    expect(r.earnedCoins).toBe(r.baseCoins + r.partnerBonus);
    expect(r.grantedCoins).toBe(r.earnedCoins);
    expect(r.cappedByGame).toBe(false);
    expect(r.cappedByDaily).toBe(false);
  });

  it('등록되지 않은 게임은 기본 배율', () => {
    expect(getGameMultiplier('unknown-game')).toBe(DEFAULT_GAME_MULTIPLIER);
    const r = computeReward({ gameId: 'unknown-game', score: 101, partnerRarity: undefined, dailyEarned: 0 });
    expect(r.baseCoins).toBe(Math.floor(101 * DEFAULT_GAME_MULTIPLIER));
    expect(r.partnerBonus).toBe(0);
  });

  it('판당 상한 적용', () => {
    const r = computeReward({ gameId: 'button-malang', score: 100_000, partnerRarity: 'mythic', dailyEarned: 0 });
    expect(r.earnedCoins).toBe(PER_GAME_CAP);
    expect(r.cappedByGame).toBe(true);
  });

  it('남은 일일 한도까지만 지급', () => {
    const r = computeReward({
      gameId: 'button-malang',
      score: 100_000,
      partnerRarity: 'common',
      dailyEarned: DAILY_CAP - 37,
    });
    expect(r.grantedCoins).toBe(37);
    expect(r.cappedByDaily).toBe(true);
    expect(r.dailyRemaining).toBe(0);
  });

  it('일일 한도 초과 상태면 0', () => {
    const r = computeReward({ gameId: 'button-malang', score: 500, partnerRarity: 'rare', dailyEarned: DAILY_CAP + 50 });
    expect(r.grantedCoins).toBe(0);
    expect(r.cappedByDaily).toBe(true);
  });

  it('잘못된 점수는 0으로 처리', () => {
    expect(normalizeScore(Number.NaN)).toBe(0);
    expect(normalizeScore(-10)).toBe(0);
    expect(normalizeScore(Infinity)).toBe(0);
    expect(normalizeScore(12.9)).toBe(12);
    expect(computeReward({ gameId: 'x', score: -5, partnerRarity: 'mythic', dailyEarned: 0 }).grantedCoins).toBe(0);
  });
});

describe('payForPull', () => {
  it('1회 뽑기 코인 차감', () => {
    expect(payForPull(250, 'single')).toEqual({ ok: true, coins: 150 });
  });
  it('10연 뽑기 코인 차감', () => {
    expect(payForPull(1000, 'multi')).toEqual({ ok: true, coins: 0 });
  });
  it('코인 부족', () => {
    expect(payForPull(99, 'single')).toEqual({ ok: false, reason: 'insufficient-coins' });
    expect(payForPull(999, 'multi').ok).toBe(false);
  });
});

describe('서울 날짜 / 일일 초기화', () => {
  it('UTC 14:59 → 같은 날, UTC 15:00 → 서울 다음 날', () => {
    expect(seoulDateKey(new Date('2026-03-01T14:59:59Z'))).toBe('2026-03-01');
    expect(seoulDateKey(new Date('2026-03-01T15:00:00Z'))).toBe('2026-03-02');
  });

  it('연말 경계', () => {
    expect(seoulDateKey(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });

  it('형식 검증', () => {
    expect(isValidDateKey('2026-01-02')).toBe(true);
    expect(isValidDateKey('2026/01/02')).toBe(false);
    expect(isValidDateKey(20260102)).toBe(false);
  });

  it('날짜가 바뀌면 일일 획득량 초기화', () => {
    const state = { dailyEarnedCoins: 2500, lastDailyResetDate: '2026-03-01', coins: 10 };
    const same = applyDailyReset(state, new Date('2026-03-01T14:00:00Z'));
    expect(same).toBe(state);
    const next = applyDailyReset(state, new Date('2026-03-01T15:00:00Z'));
    expect(next).toEqual({ dailyEarnedCoins: 0, lastDailyResetDate: '2026-03-02', coins: 10 });
  });
});
