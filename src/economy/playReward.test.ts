import { describe, expect, it } from 'vitest';
import {
  COINS_PER_PLAY_MINUTE,
  DAILY_CAP,
  GAME_MULTIPLIERS,
  GAME_PLAY_SECONDS,
  GAME_TYPICAL_SCORES,
  GIFT_COINS,
  MISSION_REWARD_COINS,
  PULL_PRICE,
  SHOP_EXPECTED_HOURS_PER_DAY,
  SHOP_RATE_PER_HOUR,
} from './config';
import { seoulDateKey } from './daily';
import { computeReward, gameCap, playMinutes, targetCoinsPerPlay } from './economy';
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

  it('배율이 있는 게임은 모두 플레이 시간도 있다', () => {
    expect(Object.keys(GAME_PLAY_SECONDS).sort()).toEqual(Object.keys(GAME_MULTIPLIERS).sort());
    for (const [id, sec] of Object.entries(GAME_PLAY_SECONDS)) {
      expect(sec.typical, id).toBeGreaterThan(0);
      expect(sec.typical, id).toBeLessThanOrEqual(sec.max);
    }
  });

  it('보통 점수로 한 판 = 분당 코인 목표 ±15% (게임마다 같은 효율)', () => {
    for (const id of Object.keys(GAME_TYPICAL_SCORES)) {
      const r = computeReward({ gameId: id, score: typicalScore(id), partnerRarity: undefined, dailyEarned: 0 });
      const perMin = r.grantedCoins / playMinutes(id)!;
      expect(perMin, id).toBeGreaterThanOrEqual(COINS_PER_PLAY_MINUTE * 0.85);
      expect(perMin, id).toBeLessThanOrEqual(COINS_PER_PLAY_MINUTE * 1.15);
      // 로비 "약 N코인"은 보통 한 판 목표와 ±20% 안
      const e = expectedCoins({ gameId: id, record: undefined, partnerRarity: undefined, dailyEarned: 0 });
      expect(Math.abs(e.about - targetCoinsPerPlay(id)!) / targetCoinsPerPlay(id)!, id).toBeLessThanOrEqual(0.2);
      // 보통 한 판은 상한에 걸리지 않는다
      expect(r.cappedByGame, id).toBe(false);
    }
  });

  it('가장 효율 좋은 게임과 나쁜 게임의 분당 코인 차이는 1.3배 안 (예전 9배)', () => {
    const rates = Object.keys(GAME_TYPICAL_SCORES).map((id) => {
      const r = computeReward({ gameId: id, score: typicalScore(id), partnerRarity: undefined, dailyEarned: 0 });
      return r.grantedCoins / playMinutes(id)!;
    });
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThanOrEqual(1.3);
  });

  it('20초 게임은 약 40~60, 2분 게임은 약 180~220코인', () => {
    const short = expectedCoins({ gameId: 'button-malang', record: undefined, partnerRarity: undefined, dailyEarned: 0 });
    expect(short.exact).toBeGreaterThanOrEqual(40);
    expect(short.exact).toBeLessThanOrEqual(60);
    const long = expectedCoins({ gameId: 'malang-merge', record: undefined, partnerRarity: undefined, dailyEarned: 0 });
    expect(long.exact).toBeGreaterThanOrEqual(180);
    expect(long.exact).toBeLessThanOrEqual(220);
  });

  it('한 판 상한은 가장 긴 판에 비례한다 — 짧은 게임을 아주 잘해도 분당 상한은 같다', () => {
    expect(gameCap('button-malang')).toBe(80);
    expect(gameCap('malang-merge')).toBe(300);
    for (const id of Object.keys(GAME_PLAY_SECONDS)) {
      const capPerMin = gameCap(id) / playMinutes(id, 'max')!;
      expect(capPerMin, id).toBeGreaterThan(COINS_PER_PLAY_MINUTE * 1.3);
      expect(capPerMin, id).toBeLessThan(COINS_PER_PLAY_MINUTE * 1.7);
    }
  });

  it('보통 날(미니게임 15분 + 미션 + 가게 + 선물)이면 10연 뽑기를 하루에, 가볍게 해도 이틀에', () => {
    const shopStarter = SHOP_RATE_PER_HOUR.common * SHOP_EXPECTED_HOURS_PER_DAY; // 일반 직원 하나
    const gift = GIFT_COINS.base + GIFT_COINS.perLevel; // 1단계
    const missions = MISSION_REWARD_COINS.easy + MISSION_REWARD_COINS.normal; // 쉬움·보통만
    const normalDay = 15 * COINS_PER_PLAY_MINUTE + missions + shopStarter + gift;
    expect(normalDay).toBeGreaterThanOrEqual(PULL_PRICE.multi);
    const lightDay = 5 * COINS_PER_PLAY_MINUTE + shopStarter + gift; // 미니게임 5분, 미션 없음
    expect(2 * lightDay).toBeGreaterThanOrEqual(PULL_PRICE.multi);
    // 미니게임만으로는 일일 상한(약 33분)에 닿기 전까지
    expect(15 * COINS_PER_PLAY_MINUTE).toBeLessThan(DAILY_CAP);
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
    expect(e.exact).toBe(gameCap('button-malang'));
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
    expect(rewardNote(perGame)).toBe(`이 게임은 한 판에 ${gameCap('stack')}코인까지 받아요.`);
    const daily = computeReward({ gameId: 'stack', score: 300, partnerRarity: undefined, dailyEarned: DAILY_CAP - 40 });
    expect(rewardNote(daily)).toBe('오늘 상한에 닿아 40코인만 받았어요.');
    const none = computeReward({ gameId: 'stack', score: 300, partnerRarity: undefined, dailyEarned: DAILY_CAP });
    expect(rewardNote(none)).toBe('오늘 받을 코인을 모두 받았어요. 자정에 다시 채워져요.');
  });
});
