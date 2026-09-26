import { describe, expect, it } from 'vitest';
import {
  CAPSULE_TUNING,
  holdProgress,
  ratchetIndex,
  readTwoFinger,
  registerCapsuleTap,
  wrapAngle,
} from './capsule';
import { PERF_TUNING, createPerf, looksLikePhone, samplePerf, type PerfState } from './perfGovernor';
import { buildShelf, shelfAction, shelfOrder } from './shelf';

function feed(state: PerfState, gapMs: number, n: number): PerfState {
  let s = state;
  for (let i = 0; i < n; i++) s = samplePerf(s, gapMs);
  return s;
}

describe('perf governor', () => {
  it('폰은 3마리로 시작해 55fps 이상을 지키면 5마리까지 연다 (한 번만)', () => {
    let s = createPerf({ phone: true, quality: '3d' });
    expect(s.cap).toBe(3);
    s = feed(s, 16.6, PERF_TUNING.minSamples + 5);
    expect(s.cap).toBe(5);
    expect(s.upgraded).toBe(true);
    s = feed(s, 16.6, 500);
    expect(s.cap).toBe(5);
  });

  it('데스크톱은 5마리로 시작', () => {
    expect(createPerf({ phone: false, quality: '3d' }).cap).toBe(5);
  });

  it('3D 가 계속 느리면 2D 로, 2D 도 느리면 상한을 2까지 줄인다', () => {
    let s = createPerf({ phone: true, quality: '3d' });
    s = feed(s, 40, PERF_TUNING.minSamples + 1);
    expect(s.quality).toBe('2d');
    expect(s.cap).toBe(3);
    s = feed(s, 45, PERF_TUNING.minSamples + 1);
    expect(s.cap).toBe(2);
    s = feed(s, 45, PERF_TUNING.minSamples * 3);
    expect(s.cap).toBe(PERF_TUNING.minCap);
  });

  it('아주 느린 기기(3fps)도 몇 초 안에 2D 로 내린다', () => {
    let s = createPerf({ phone: true, quality: '3d' });
    s = feed(s, 350, 12);
    expect(s.quality).toBe('2d');
  });

  it('보통 속도(45fps)면 그대로, 멈췄다 다시 그린 긴 간격은 버린다', () => {
    let s = createPerf({ phone: true, quality: '3d' });
    s = feed(s, 22, PERF_TUNING.minSamples * 2);
    expect(s).toMatchObject({ cap: 3, quality: '3d' });
    const before = s;
    expect(samplePerf(before, 5000)).toBe(before);
    expect(samplePerf(before, Number.NaN)).toBe(before);
    expect(samplePerf(before, -1)).toBe(before);
  });

  it('폰 판별', () => {
    expect(looksLikePhone(true, 1200, 900)).toBe(true);
    expect(looksLikePhone(false, 390, 844)).toBe(true);
    expect(looksLikePhone(false, 1440, 900)).toBe(false);
  });
});

describe('capsule open gestures', () => {
  const a0 = { x: 100, y: 100 };
  const b0 = { x: 160, y: 100 };

  it('두 손가락 비틀기 70° 면 다 열린다 (방향 무관)', () => {
    const turn = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: 130 + Math.cos(r) * 30, y: 100 + Math.sin(r) * 30 };
    };
    const half = readTwoFinger(a0, b0, turn(180 + 35), turn(35));
    expect(half.progress).toBeGreaterThan(0.45);
    expect(half.progress).toBeLessThan(0.55);
    expect(readTwoFinger(a0, b0, turn(180 + 72), turn(72)).progress).toBe(1);
    expect(readTwoFinger(a0, b0, turn(180 - 72), turn(-72)).progress).toBe(1);
  });

  it('반쪽을 벌리면 열린다', () => {
    const r = readTwoFinger(a0, b0, { x: 85, y: 100 }, { x: 175, y: 100 });
    expect(r.spread).toBeCloseTo(0.5);
    expect(r.progress).toBe(1);
    // 오므리는 건 진행이 아니다
    expect(readTwoFinger(a0, b0, { x: 110, y: 100 }, { x: 150, y: 100 }).progress).toBe(0);
  });

  it('각도는 −π..π 로 감싼다 (한 바퀴 넘겨 잡아도 튀지 않는다)', () => {
    expect(wrapAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1);
    expect(wrapAngle(-Math.PI * 2 - 0.1)).toBeCloseTo(-0.1);
    expect(wrapAngle(Number.NaN)).toBe(0);
  });

  it('비틀 때 톱니 칸이 바뀐다', () => {
    expect(ratchetIndex(0)).toBe(0);
    expect(ratchetIndex(CAPSULE_TUNING.ratchetStep * 2.5)).toBe(2);
    expect(ratchetIndex(-CAPSULE_TUNING.ratchetStep * 1.2)).toBe(1);
  });

  it('톡 세 번이면 열리고, 천천히(앞 톡에서 2.2초 안) 눌러도 금이 쌓인다', () => {
    let taps: number[] = [];
    let p = 0;
    for (const t of [0, 400, 800]) ({ taps, progress: p } = registerCapsuleTap(taps, t));
    expect(p).toBe(1);
    taps = [];
    // 1.5초 간격 — 예전(1.4초 창)에는 열리지 않던 느린 톡
    for (const t of [0, 1500, 3000]) ({ taps, progress: p } = registerCapsuleTap(taps, t));
    expect(p).toBe(1);
    taps = [];
    ({ taps, progress: p } = registerCapsuleTap(taps, 0));
    ({ taps, progress: p } = registerCapsuleTap(taps, 2000));
    expect(p).toBeCloseTo(2 / 3);
  });

  it('오래 쉬면 금 간 단계가 처음부터', () => {
    let taps: number[] = [];
    let p = 0;
    ({ taps, progress: p } = registerCapsuleTap(taps, 0));
    ({ taps, progress: p } = registerCapsuleTap(taps, 1000));
    ({ taps, progress: p } = registerCapsuleTap(taps, 1000 + CAPSULE_TUNING.tapWindowMs + 1));
    expect(p).toBeCloseTo(1 / 3);
    expect(taps).toHaveLength(1);
  });

  it('꾹 0.9초면 열린다', () => {
    expect(holdProgress(0)).toBe(0);
    expect(holdProgress(450)).toBeCloseTo(0.5);
    expect(holdProgress(5000)).toBe(1);
    expect(holdProgress(Number.NaN)).toBe(0);
  });
});

describe('shelf', () => {
  const items = [
    { id: 'a', rarity: 'common' as const, firstObtainedAt: 5 },
    { id: 'b', rarity: 'legendary' as const, firstObtainedAt: 1 },
    { id: 'c', rarity: 'common' as const, firstObtainedAt: 9 },
    { id: 'd', rarity: 'epic' as const, firstObtainedAt: 3 },
  ];

  it('등급 높은 순 → 최근 얻은 순', () => {
    expect(shelfOrder(items).map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('열지 않은 말랑이는 봉인, 매트에 있거나 캡슐로 놓인 것은 나와 있음', () => {
    const shelf = buildShelf(items, new Set(['a', 'b']), new Set(['a']), new Set(['d']));
    expect(shelf.find((e) => e.id === 'd')).toMatchObject({ sealed: true, out: true });
    expect(shelf.find((e) => e.id === 'c')).toMatchObject({ sealed: true, out: false });
    expect(shelf.find((e) => e.id === 'a')).toMatchObject({ sealed: false, out: true });
    expect(shelf.find((e) => e.id === 'b')).toMatchObject({ sealed: false, out: false });
  });

  it('누르면: 나와 있으면 넣고, 자리가 있으면 꺼내고, 꽉 찼으면 알린다', () => {
    expect(shelfAction({ out: true }, 3, 3)).toBe('put-back');
    expect(shelfAction({ out: false }, 2, 3)).toBe('take-out');
    expect(shelfAction({ out: false }, 3, 3)).toBe('full');
  });
});
