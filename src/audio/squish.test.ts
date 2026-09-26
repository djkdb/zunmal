import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng } from '../lib/rng';
import { sfx } from './sfx';
import {
  activeVoiceCount,
  clamp01,
  decayTime,
  envelopeAt,
  giggle,
  happy,
  jitter,
  poke,
  releaseParams,
  setSquishRandom,
  squelchParams,
  squishPress,
  squishRelease,
  startStretch,
  stretchTargets,
} from './squish';

describe('squish pure helpers', () => {
  it('clamp01 handles range and non-finite', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('jitter stays within ±amount', () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = jitter(100, 0.2, rng);
      expect(v).toBeGreaterThanOrEqual(80);
      expect(v).toBeLessThanOrEqual(120);
    }
  });

  it('envelope rises then decays below -60dB by decayTime', () => {
    expect(envelopeAt(0, 0.01, 0.1)).toBe(0);
    expect(envelopeAt(0.005, 0.01, 0.1)).toBeCloseTo(0.5);
    expect(envelopeAt(0.01, 0.01, 0.1)).toBeCloseTo(1);
    expect(envelopeAt(0.01 + decayTime(0.1), 0.01, 0.1)).toBeCloseTo(0.001, 5);
  });

  it('squelch params vary between calls but stay in a comfortable range', () => {
    const rng = createSeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const p = squelchParams(i % 2 ? 1 : 0, rng);
      seen.add(Math.round(p.filterStart));
      expect(p.gain).toBeLessThanOrEqual(0.5);
      expect(p.gain).toBeGreaterThan(0);
      expect(p.filterStart).toBeGreaterThan(p.filterEnd);
      expect(p.bubbles.length).toBeGreaterThanOrEqual(2);
      expect(p.bubbles.length).toBeLessThanOrEqual(5);
      for (const b of p.bubbles) {
        expect(b.drop).toBeLessThan(1);
        expect(b.gain).toBeLessThan(0.1);
        expect(b.freq).toBeGreaterThan(0);
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('squelch is deterministic for the same seed', () => {
    expect(squelchParams(0.5, createSeededRng(3))).toEqual(squelchParams(0.5, createSeededRng(3)));
  });

  it('stretch gets brighter and louder with amount and speed', () => {
    const still = stretchTargets(0.2, 0);
    const pulled = stretchTargets(1, 0);
    const fast = stretchTargets(1, 1);
    expect(pulled.cutoff).toBeGreaterThan(still.cutoff);
    expect(pulled.noiseGain).toBeGreaterThan(still.noiseGain);
    expect(fast.noiseGain).toBeGreaterThan(pulled.noiseGain);
    expect(fast.creakRate).toBeGreaterThan(pulled.creakRate);
    expect(fast.noiseGain).toBeLessThanOrEqual(0.2);
    expect(stretchTargets(Number.NaN, 5)).toEqual(stretchTargets(0, 1));
  });

  it('release params: stronger release is lower, louder and wobblier', () => {
    const soft = releaseParams(0, () => 0.5);
    const hard = releaseParams(1, () => 0.5);
    expect(hard.baseFreq).toBeLessThan(soft.baseFreq);
    expect(hard.gain).toBeGreaterThan(soft.gain);
    expect(hard.vibratoDepth / hard.baseFreq).toBeGreaterThan(soft.vibratoDepth / soft.baseFreq);
    expect(hard.endFreq).toBeLessThan(hard.baseFreq);
    expect(releaseParams(0.5, () => 0.5, 3).vibratoRate).toBeCloseTo(3);
  });
});

// ── 오디오 그래프 (가짜 WebAudio) ──────────────────────────

const problems: string[] = [];
let starts = 0;
let created = 0;

class FakeParam {
  value = 1;
  private check(name: string, v: number, t: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) problems.push(`${name}: non-finite ${v} @ ${t}`);
  }
  setValueAtTime(v: number, t: number) {
    this.check('setValueAtTime', v, t);
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.check('exponentialRamp', v, t);
    if (v <= 0) problems.push(`exponentialRamp to ${v}`);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.check('linearRamp', v, t);
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.check('setTarget', v, t);
    if (!(tau > 0)) problems.push(`setTarget tau ${tau}`);
  }
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  detune = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  curve: unknown = null;
  type = '';
  loop = false;
  buffer: unknown = null;
  connect(target: unknown) {
    if (!target) problems.push('connect to nothing');
  }
  disconnect() {}
  start() {
    starts++;
  }
  stop() {}
}
class FakeAudioContext {
  currentTime = 1;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  constructor() {
    created++;
  }
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }
  createDynamicsCompressor() {
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createWaveShaper() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer(_c: number, len: number) {
    return { duration: len / 8000, getChannelData: () => new Float32Array(len) };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('squish audio graph', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    problems.length = 0;
    starts = 0;
    created = 0;
    setSquishRandom(createSeededRng(42));
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setSquishRandom(Math.random);
  });

  it('does nothing before the audio is unlocked', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    // 전역 sfx 는 이 테스트 파일에서 아직 unlock 되지 않았다
    squishPress(1);
    squishRelease(1);
    poke();
    giggle();
    happy();
    const h = startStretch();
    h.update(1, 1);
    h.stop();
    expect(created).toBe(0);
    expect(starts).toBe(0);
  });

  it('builds valid graphs after unlock without creating extra contexts', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    expect(created).toBe(1);
    squishPress(0);
    squishPress(1);
    squishRelease(0.2);
    squishRelease(1, 2.6);
    poke(1);
    giggle();
    happy();
    const h = startStretch();
    for (let i = 0; i <= 10; i++) h.update(i / 10, 1 - i / 10);
    h.stop();
    h.stop();
    h.update(1, 1); // 멈춘 뒤 호출해도 안전
    expect(problems).toEqual([]);
    expect(starts).toBeGreaterThan(20);
    expect(created).toBe(1);
  });

  it('caps simultaneous one-shot voices', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    vi.runAllTimers();
    for (let i = 0; i < 30; i++) squishPress(1);
    expect(activeVoiceCount()).toBeLessThanOrEqual(8);
    vi.runAllTimers();
    expect(activeVoiceCount()).toBe(0);
  });
});
