import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';
import {
  COIN_FX,
  arrivalTime,
  coinCountFor,
  coinPath,
  countUpDuration,
  countUpValue,
  easeOutCubic,
  flyCoins,
  quadBezier,
  subscribeCoinFx,
  type CoinFxEvent,
} from './coinFx';

describe('count-up', () => {
  it('easeOutCubic: 0→0, 1→1, 단조 증가, 범위 밖은 자른다', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = easeOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // 앞쪽이 빠르다
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.8);
  });

  it('길이는 늘어난 양의 로그에 비례하고 400~1200ms로 제한된다', () => {
    expect(countUpDuration(1)).toBe(400);
    expect(countUpDuration(10)).toBe(550);
    expect(countUpDuration(100)).toBe(800);
    expect(countUpDuration(1000)).toBe(1050);
    expect(countUpDuration(1_000_000)).toBe(1200);
    expect(countUpDuration(100)).toBeLessThan(countUpDuration(900));
  });

  it('줄어들 때는 짧다', () => {
    expect(countUpDuration(0)).toBe(COIN_FX.countDownMs);
    expect(countUpDuration(-900)).toBe(COIN_FX.countDownMs);
  });

  it('값: 시작/끝은 정확하고 중간은 정수이며 범위 안', () => {
    expect(countUpValue(100, 350, 0, 500)).toBe(100);
    expect(countUpValue(100, 350, 500, 500)).toBe(350);
    expect(countUpValue(100, 350, 9999, 500)).toBe(350);
    expect(countUpValue(100, 350, 10, 0)).toBe(350);
    const mid = countUpValue(100, 350, 250, 500);
    expect(Number.isInteger(mid)).toBe(true);
    expect(mid).toBeGreaterThan(100 + 125);
    expect(mid).toBeLessThan(350);
    // 내려갈 때도
    const down = countUpValue(1000, 100, 150, 300);
    expect(down).toBeLessThan(1000);
    expect(down).toBeGreaterThan(100);
  });
});

describe('coin flight', () => {
  it('코인 수는 금액과 무관하게 5~12개', () => {
    expect(coinCountFor(0)).toBe(0);
    expect(coinCountFor(-5)).toBe(0);
    expect(coinCountFor(Number.NaN)).toBe(0);
    expect(coinCountFor(1)).toBe(5);
    expect(coinCountFor(100)).toBe(7);
    expect(coinCountFor(1000)).toBe(9);
    expect(coinCountFor(10 ** 9)).toBe(12);
  });

  it('도착 시각은 50~70ms 간격, 비행 450~550ms', () => {
    expect(COIN_FX.staggerMs).toBeGreaterThanOrEqual(50);
    expect(COIN_FX.staggerMs).toBeLessThanOrEqual(70);
    expect(COIN_FX.flightMs).toBeGreaterThanOrEqual(450);
    expect(COIN_FX.flightMs).toBeLessThanOrEqual(550);
    expect(arrivalTime(1) - arrivalTime(0)).toBe(COIN_FX.staggerMs);
  });

  it('베지어: 양 끝점을 지난다', () => {
    const a = { x: 0, y: 0 };
    const c = { x: 50, y: -100 };
    const b = { x: 100, y: 0 };
    expect(quadBezier(a, c, b, 0)).toEqual(a);
    expect(quadBezier(a, c, b, 1)).toEqual(b);
    expect(quadBezier(a, c, b, 0.5).y).toBeLessThan(0); // 위로 휜다
  });

  it('경로: 원점에서 시작해 목표에서 끝나고, offset은 0→1 증가, 목표보다 높이 떠오른다', () => {
    const rng = createSeededRng(7);
    const from = { x: 180, y: 500 };
    const to = { x: 70, y: 28 };
    for (let i = 0; i < 12; i++) {
      const kf = coinPath(i, 12, from, to, rng);
      const first = kf[0];
      const last = kf[kf.length - 1];
      expect(first).toMatchObject({ offset: 0, x: from.x, y: from.y });
      expect(last?.offset).toBeCloseTo(1, 10);
      expect(last?.x).toBeCloseTo(to.x, 6);
      expect(last?.y).toBeCloseTo(to.y, 6);
      for (let k = 1; k < kf.length; k++) {
        expect(kf[k]!.offset).toBeGreaterThan(kf[k - 1]!.offset);
      }
      // 흩어지는 반지름 범위 안
      const scatter = kf[1]!;
      const r = Math.hypot(scatter.x - from.x, (scatter.y - from.y) / 0.8);
      expect(r).toBeGreaterThanOrEqual(COIN_FX.burstRadius[0] - 1e-6);
      expect(r).toBeLessThanOrEqual(COIN_FX.burstRadius[1] + 1e-6);
    }
  });

  it('flyCoins: 목표가 없으면(노드) 계획과 도착 1번만 알린다', () => {
    const events: CoinFxEvent[] = [];
    const off = subscribeCoinFx((e) => events.push(e));
    flyCoins({ x: 0, y: 0 }, 120);
    flyCoins({ x: 0, y: 0 }, 0);
    off();
    expect(events.map((e) => e.type)).toEqual(['plan', 'arrive']);
  });
});
