import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng } from '../lib/rng';
import { sfx } from './sfx';
import {
  activeVoiceCount,
  chime,
  chimeGate,
  chimeNotes,
  CHIME_MAX_STEP,
  clamp01,
  decayTime,
  envelopeAt,
  giggle,
  happy,
  jitter,
  poke,
  setSquishRandom,
  shimmer,
  purr,
  yawn,
  surprised,
  laugh,
  dizzy,
  jump,
  shutter,
  squelchParams,
  squishPress,
  flavorSquelch,
  FLAVOR_TONES,
  peel,
  cheekRub,
  groan,
  boing,
  land,
  bump,
  squelch,
  thwap,
  thwapParams,
  wetSquelchParams,
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

  it('젖은 "쮸웁": 공명이 빠르게 내려가고, 세게 누를수록 크고 높게 시작한다', () => {
    const soft = wetSquelchParams(0, () => 0.5);
    const hard = wetSquelchParams(1, () => 0.5);
    expect(soft.from).toBeGreaterThan(soft.to * 2);
    expect(hard.from).toBeGreaterThan(soft.from);
    expect(hard.gain).toBeGreaterThan(soft.gain);
    expect(hard.gain).toBeLessThanOrEqual(0.45);
    // 폰 스피커 대역: 끝나는 곳도 200Hz 위
    expect(soft.to).toBeGreaterThan(200);
    // 찐득이는 더 낮고 느리다
    const sticky = wetSquelchParams(1, () => 0.5, 'sticky');
    expect(sticky.from).toBeLessThan(hard.from);
    expect(sticky.duration).toBeGreaterThan(hard.duration);
  });

  it('고무 "퉁": 많이 늘였을수록 크고 길게, 몸통 음도 200Hz 위에서 시작', () => {
    const a = thwapParams(0.2, () => 0.5);
    const b = thwapParams(1, () => 0.5);
    expect(b.bodyGain).toBeGreaterThan(a.bodyGain);
    expect(b.ringDur).toBeGreaterThan(a.ringDur);
    expect(a.bodyFrom).toBeGreaterThan(200);
    expect(b.bodyTo).toBeLessThan(b.bodyFrom);
    expect(b.bodyGain + b.slapGain + b.ringGain).toBeLessThan(0.5);
  });
});

describe('촉감별 소리 맛', () => {
  it('기본(plain)은 예전 소리 그대로', () => {
    const p = squelchParams(0.5, createSeededRng(3));
    expect(flavorSquelch(p, 'plain')).toBe(p);
  });

  it('젤리는 높고, 슬로우 라이징은 낮고 조용하고 길다', () => {
    const p = squelchParams(0.7, createSeededRng(3));
    const jelly = flavorSquelch(p, 'jelly');
    const slow = flavorSquelch(p, 'slowRise');
    expect(jelly.filterStart).toBeGreaterThan(p.filterStart);
    expect(slow.gain).toBeLessThan(p.gain);
    expect(slow.duration).toBeGreaterThan(p.duration);
    expect(slow.filterStart).toBeLessThan(p.filterStart);
  });

  it('찐득이는 거품이 더 많고, 모든 맛이 편한 음량 안', () => {
    const p = squelchParams(1, createSeededRng(9));
    expect(flavorSquelch(p, 'sticky').bubbles.length).toBeGreaterThan(p.bubbles.length);
    for (const f of Object.keys(FLAVOR_TONES) as (keyof typeof FLAVOR_TONES)[]) {
      const q = flavorSquelch(p, f);
      expect(q.gain).toBeLessThanOrEqual(0.5);
      for (const b of q.bubbles) expect(b.gain).toBeLessThan(0.1);
    }
  });

});

describe('rarity chimes', () => {
  const kinds = ['ping', 'sparkle', 'bell', 'celestial', 'heavenly'] as const;

  it('none is silent; rarer chimes have at least as many notes and ring longer', () => {
    expect(chimeNotes('none', 0, Math.random)).toEqual([]);
    let prevCount = 0;
    let prevDur = 0;
    for (const k of kinds) {
      const notes = chimeNotes(k, 0, createSeededRng(1));
      expect(notes.length).toBeGreaterThanOrEqual(prevCount);
      const dur = Math.max(...notes.map((n) => n.delay + n.duration));
      expect(dur).toBeGreaterThan(prevDur);
      prevCount = notes.length;
      prevDur = dur;
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(300);
        expect(n.freq).toBeLessThan(6000);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThan(0.1);
      }
    }
  });

  it('combo step climbs the scale and stops at one octave', () => {
    const f = (step: number) => chimeNotes('ping', step, () => 0.5)[0]!.freq;
    expect(f(1)).toBeGreaterThan(f(0));
    expect(f(CHIME_MAX_STEP)).toBeCloseTo(f(0) * 2, 0);
    expect(f(CHIME_MAX_STEP + 10)).toBe(f(CHIME_MAX_STEP));
    expect(f(Number.NaN)).toBe(f(0));
  });

  it('fanfare adds notes for level-ups', () => {
    for (const k of kinds) {
      expect(chimeNotes(k, 0, Math.random, true).length).toBe(chimeNotes(k, 0, Math.random).length + 2);
    }
  });

  it('gate rate-limits repeats', () => {
    expect(chimeGate(1, 0.95, 0.11)).toBe(false);
    expect(chimeGate(1.2, 1, 0.11)).toBe(true);
    expect(chimeGate(0, -Infinity, 0.11)).toBe(true);
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
    squelch(1);
    thwap(1);
    poke();
    giggle();
    happy();
    expect(created).toBe(0);
    expect(starts).toBe(0);
  });

  it('builds valid graphs after unlock without creating extra contexts', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    expect(created).toBe(1);
    squishPress(0);
    squishPress(1);
    squelch(0);
    squelch(1, 'sticky');
    thwap(0.2);
    vi.runAllTimers();
    thwap(1);
    poke(1);
    giggle();
    happy();
    for (const k of ['none', 'ping', 'sparkle', 'bell', 'celestial', 'heavenly'] as const) {
      chime(k, 2, { fanfare: true, shiny: true });
      vi.runAllTimers();
    }
    shimmer();
    for (const fn of [purr, yawn, surprised, laugh, dizzy, jump, shutter, () => peel(1), cheekRub, groan, () => boing(1)]) {
      fn();
      vi.runAllTimers();
    }
    for (const f of ['plain', 'slowRise', 'jelly', 'stretchy', 'sticky'] as const) {
      squishPress(1, f);
      poke(0.5, f);
      land(0.8, f);
      bump(0.8, f);
      vi.runAllTimers();
    }

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
