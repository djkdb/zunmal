import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../lib/rng';
import {
  COMBO_BASE_FREQ,
  MAX_COMBO_STEP,
  centsToRatio,
  comboOverflow,
  comboPitch,
  comboStep,
  dbToGain,
  gainToDb,
  midiToFreq,
  pentatonicSemitones,
  saturationCurve,
  softClipCurve,
  spread,
} from './tuning';

describe('comboPitch', () => {
  it('레벨 0은 기준음(C5)', () => {
    expect(comboPitch(0)).toBeCloseTo(COMBO_BASE_FREQ, 6);
  });

  it('장조 5음 음계(도 레 미 솔 라)를 한 칸씩 올라간다', () => {
    const semis = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => Math.round(12 * Math.log2(comboPitch(l) / COMBO_BASE_FREQ)));
    expect(semis).toEqual([0, 2, 4, 7, 9, 12, 14, 16, 19]);
  });

  it('항상 증가하다가 1.5옥타브 근처에서 멈춘다', () => {
    for (let l = 1; l <= MAX_COMBO_STEP; l++) expect(comboPitch(l)).toBeGreaterThan(comboPitch(l - 1));
    const top = comboPitch(MAX_COMBO_STEP);
    expect(comboPitch(12)).toBe(top);
    expect(comboPitch(999)).toBe(top);
    const octaves = Math.log2(top / COMBO_BASE_FREQ);
    expect(octaves).toBeGreaterThan(1.4);
    expect(octaves).toBeLessThan(1.7);
  });

  it('이상한 입력은 레벨 0', () => {
    expect(comboStep(-3)).toBe(0);
    expect(comboStep(Number.NaN)).toBe(0);
    expect(comboStep(2.9)).toBe(2);
    expect(comboPitch(Number.POSITIVE_INFINITY)).toBe(comboPitch(0));
  });

  it('상한을 넘었는지 알려 준다', () => {
    expect(comboOverflow(MAX_COMBO_STEP)).toBe(false);
    expect(comboOverflow(MAX_COMBO_STEP + 1)).toBe(true);
  });

  it('다른 기준음도 받는다', () => {
    expect(comboPitch(5, 440)).toBeCloseTo(880, 6);
    expect(pentatonicSemitones(10)).toBe(24);
  });
});

describe('단위 변환', () => {
  it('센트/데시벨/MIDI', () => {
    expect(centsToRatio(1200)).toBeCloseTo(2, 9);
    expect(centsToRatio(-1200)).toBeCloseTo(0.5, 9);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(dbToGain(-12))).toBeCloseTo(-12, 9);
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 2);
  });

  it('spread는 ±amount 안', () => {
    const rng = createSeededRng(3);
    for (let i = 0; i < 1000; i++) {
      expect(Math.abs(spread(30, rng))).toBeLessThanOrEqual(30);
    }
  });
});

describe('클리퍼/포화 곡선', () => {
  it('안전 클리퍼는 0.99를 넘지 않고, 작은 신호는 그대로 둔다', () => {
    const curve = softClipCurve();
    let max = 0;
    for (const v of curve) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(0.99);
    const mid = (curve.length - 1) / 2;
    // 입력 0.5 → 출력 0.5
    expect(curve[Math.round(mid + 0.5 * mid)]).toBeCloseTo(0.5, 2);
    // 단조 증가 + 대칭
    for (let k = 1; k < curve.length; k++) expect((curve[k] ?? 0) >= (curve[k - 1] ?? 0)).toBe(true);
    expect(curve[0]).toBeCloseTo(-(curve[curve.length - 1] ?? 0), 9);
  });

  it('포화 곡선은 ±1로 정규화되어 있다', () => {
    const curve = saturationCurve(5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
    expect(curve[0]).toBeCloseTo(-1, 6);
  });
});
