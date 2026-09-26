import { describe, expect, it } from 'vitest';
import { DAILY_CAP, GAME_MULTIPLIERS, GAME_TYPICAL_SCORES, PER_GAME_CAP } from './config';
import { seoulDateKey } from './daily';
import { computeReward } from './economy';
import {
  dailyProgress,
  earnedAfter,
  expectedCoins,
  expectedScore,
  rewardNote,
  rewardTrims,
  roundAbout,
  todayEarned,
  typicalScore,
} from './playReward';

describe('보통 점수', () => {
  it('배율이 있는 게임은 모두 보통 점수도 있다', () => {
    expect(Object.keys(GAME_TYPICAL_SCORES).sort()).toEqual(Object.keys(GAME_MULTIPLIERS).sort());
  });

  it('보통 점수로 한 판 ≈ 100~150코인 (config 설계 목표)', () => {
    for (const id of Object.keys(GAME_TYPICAL_SCORES)) {
      const r = computeReward({ gameId: id, score: typicalScore(id), partnerRarity: undefined, dailyEarned: 0 });
      expect(r.grantedCoins, id).toBeGreaterThanOrEqual(100);
      expect(r.grantedCoins, id).toBeLessThanOrEqual(150);
    }
  });

  it('모르는 게임도 보통 점수가 있다', () => {
    expect(typicalScore('nope')).toBeGreaterThan(0);
  });
});

describe('expectedScore', () => {
  it('안 해 본 게임은 보통 점수', () => {
    expect(expectedScore('stack', undefined)).toEqual({ score: GAME_TYPICAL_SCORES.stack, basis: 'typical' });
    expect(expectedScore('stack', { bestScore: 0, lastScore: 0, plays: 3 }).basis).toBe('typical');
  });

  it('해 본 게임은 최고와 최근의 가운데', () => {
    expect(expectedScore('stack', { bestScore: 400, lastScore: 101, plays: 5 })).toEqual({ score: 251, basis: 'mine' });
  });

  it('옛 저장에서 옮긴 기록(최고만)은 최고 기록', () => {
    expect(expectedScore('stack', { bestScore: 300, lastScore: 0, plays: 0 })).toEqual({ score: 300, basis: 'mine' });
  });
});

describe('roundAbout', () => {
  it('10 단위 반올림, 받을 게 있으면 최소 10', () => {
    expect(roundAbout(0)).toBe(0);
    expect(roundAbout(-5)).toBe(0);
    expect(roundAbout(NaN)).toBe(0);
    expect(roundAbout(3)).toBe(10);
    expect(roundAbout(124)).toBe(120);
    expect(roundAbout(125)).toBe(130);
    expect(roundAbout(200)).toBe(200);
  });
});

describe('expectedCoins', () => {
  it('computeReward와 같은 값 (파트너 보너스 포함)', () => {
    const record = { bestScore: 600, lastScore: 200, plays: 4 };
    const e = expectedCoins({ gameId: 'button-malang', record, partnerRarity: 'epic', dailyEarned: 0 });
    const r = computeReward({ gameId: 'button-malang', score: 400, partnerRarity: 'epic', dailyEarned: 0 });
    expect(e.exact).toBe(r.grantedCoins);
    expect(e.about).toBe(roundAbout(r.grantedCoins));
    expect(e.basis).toBe('mine');
  });

  it('판당 상한을 넘지 않는다', () => {
    const e = expectedCoins({
      gameId: 'button-malang',
      record: { bestScore: 99_999, lastScore: 99_999, plays: 9 },
      partnerRarity: 'secret',
      dailyEarned: 0,
    });
    expect(e.exact).toBe(PER_GAME_CAP);
  });

  it('오늘 남은 한도만큼만, 다 쓰면 dailyFull', () => {
    const near = expectedCoins({ gameId: 'stack', record: undefined, partnerRarity: undefined, dailyEarned: DAILY_CAP - 30 });
    expect(near.exact).toBe(30);
    expect(near.dailyFull).toBe(false);
    const full = expectedCoins({ gameId: 'stack', record: undefined, partnerRarity: undefined, dailyEarned: DAILY_CAP });
    expect(full.exact).toBe(0);
    expect(full.about).toBe(0);
    expect(full.dailyFull).toBe(true);
  });
});

describe('오늘 받은 코인', () => {
  const now = new Date('2026-09-26T03:00:00Z');
  it('같은 서울 날짜면 저장값, 날짜가 바뀌었으면 0', () => {
    expect(todayEarned(1240, seoulDateKey(now), now)).toBe(1240);
    expect(todayEarned(1240, '2026-09-25', now)).toBe(0);
    expect(todayEarned(-3, seoulDateKey(now), now)).toBe(0);
  });

  it('막대 비율과 남은 코인', () => {
    expect(dailyProgress(1500)).toEqual({ earned: 1500, cap: DAILY_CAP, left: DAILY_CAP - 1500, ratio: 1500 / DAILY_CAP, full: false });
    expect(dailyProgress(DAILY_CAP + 50).full).toBe(true);
    expect(dailyProgress(DAILY_CAP + 50).ratio).toBe(1);
    expect(dailyProgress(-1).earned).toBe(0);
  });

  it('판이 끝난 뒤 오늘 합계 = 전 + 받은 코인', () => {
    const r = computeReward({ gameId: 'stack', score: 300, partnerRarity: 'rare', dailyEarned: 1000 });
    expect(earnedAfter(r)).toBe(1000 + r.grantedCoins);
  });
});

describe('결과 화면 영수증', () => {
  it('점수 코인 + 보너스 − 깎인 코인 = 받은 코인 (여러 경우)', () => {
    const cases = [
      { score: 100, rarity: 'common' as const, daily: 0 },
      { score: 380, rarity: 'legendary' as const, daily: 0 },
      { score: 2000, rarity: 'secret' as const, daily: 0 },
      { score: 2000, rarity: 'secret' as const, daily: DAILY_CAP - 70 },
      { score: 300, rarity: 'epic' as const, daily: DAILY_CAP },
    ];
    for (const c of cases) {
      const r = computeReward({ gameId: 'stack', score: c.score, partnerRarity: c.rarity, dailyEarned: c.daily });
      const t = rewardTrims(r);
      expect(r.baseCoins + r.partnerBonus - t.gameTrim - t.dailyTrim).toBe(r.grantedCoins);
      expect(t.gameTrim > 0).toBe(r.cappedByGame);
      expect(t.dailyTrim > 0).toBe(r.cappedByDaily);
    }
  });

  it('보너스 비율이 결과에 담긴다', () => {
    expect(computeReward({ gameId: 'stack', score: 100, partnerRarity: 'epic', dailyEarned: 0 }).partnerBonusRate).toBe(0.1);
    expect(computeReward({ gameId: 'stack', score: 100, partnerRarity: undefined, dailyEarned: 0 }).partnerBonusRate).toBe(0);
  });

  it('상한 설명 한 줄', () => {
    const normal = computeReward({ gameId: 'stack', score: 100, partnerRarity: undefined, dailyEarned: 0 });
    expect(rewardNote(normal)).toBeNull();
    const perGame = computeReward({ gameId: 'stack', score: 5000, partnerRarity: undefined, dailyEarned: 0 });
    expect(rewardNote(perGame)).toBe(`한 판에는 ${PER_GAME_CAP}코인까지 받아요.`);
    const daily = computeReward({ gameId: 'stack', score: 300, partnerRarity: undefined, dailyEarned: DAILY_CAP - 40 });
    expect(rewardNote(daily)).toBe('오늘 상한에 닿아 40코인만 받았어요.');
    const none = computeReward({ gameId: 'stack', score: 300, partnerRarity: undefined, dailyEarned: DAILY_CAP });
    expect(rewardNote(none)).toBe('오늘 받을 코인을 모두 받았어요. 자정에 다시 채워져요.');
  });
});
