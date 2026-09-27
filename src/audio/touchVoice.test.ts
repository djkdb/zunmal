import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MATERIAL_IDS } from '../data/materials';
import { createSeededRng } from '../lib/rng';
import { sfx } from './sfx';
import { squelch } from './squish';
import {
  MAX_TOUCH_VOICES,
  QUIET_SENSE,
  VOICE_TIMBRES,
  activeTouchVoices,
  duckTouchVoices,
  maxVoiceGain,
  setTouchVoiceRandom,
  startTouchVoice,
  stopAllTouchVoices,
  touchVoiceParams,
  voiceLoudness,
  type TouchSense,
} from './touchVoice';

const sense = (p: Partial<TouchSense>): TouchSense => ({ ...QUIET_SENSE, ...p });

describe('손맛 목소리: 물리 → 소리 (순수)', () => {
  it('가만히 있으면 조용하다', () => {
    for (const m of MATERIAL_IDS) {
      expect(voiceLoudness(touchVoiceParams(m, QUIET_SENSE))).toBe(0);
      expect(voiceLoudness(touchVoiceParams(m, sense({ held: true, press: 0.8 })))).toBeLessThan(0.01);
    }
  });

  it('폼 "스읍"은 깊이가 아니라 누르는 빠르기를 따른다: 빠를수록 크고 밝다', () => {
    const still = touchVoiceParams('slowRise', sense({ held: true, press: 0.9, pressVel: 0 }));
    const slow = touchVoiceParams('slowRise', sense({ held: true, press: 0.3, pressVel: 0.5 }));
    const fast = touchVoiceParams('slowRise', sense({ held: true, press: 0.3, pressVel: 2.5 }));
    expect(still.flow.gain).toBe(0);
    expect(fast.flow.gain).toBeGreaterThan(slow.flow.gain * 1.8);
    expect(fast.flow.freq).toBeGreaterThan(slow.flow.freq);
    // 폼 공기 대역 300Hz ~ 2.5kHz
    expect(fast.flow.freq).toBeLessThanOrEqual(2500);
    expect(slow.flow.freq).toBeGreaterThanOrEqual(300);
  });

  it('폼은 깊게 눌러 들어갈 때만 바삭한 부스럭 알갱이가 생긴다', () => {
    const shallow = touchVoiceParams('slowRise', sense({ held: true, press: 0.3, pressVel: 1.5 }));
    const deep = touchVoiceParams('slowRise', sense({ held: true, press: 1, pressVel: 1.5 }));
    expect(shallow.grains.rate).toBeLessThan(1);
    expect(deep.grains.rate).toBeGreaterThan(30);
    expect(deep.grains.freq).toBeGreaterThan(2500);
  });

  it('폼을 놓으면 막 놓은 순간은 조용하고, 차오르며 옅은 들숨 (날숨보다 작고 높다)', () => {
    const justLet = touchVoiceParams('slowRise', sense({ held: false, press: 0.95, pressVel: -1.4 }));
    const rising = touchVoiceParams('slowRise', sense({ held: false, press: 0.4, pressVel: -1.4 }));
    const exhale = touchVoiceParams('slowRise', sense({ held: true, press: 0.4, pressVel: 1.4 }));
    expect(rising.flow.gain).toBeGreaterThan(justLet.flow.gain * 1.5);
    expect(rising.flow.gain).toBeLessThan(exhale.flow.gain);
    expect(rising.flow.freq).toBeGreaterThan(1200);
  });

  it('젤리 "뾰잉": 잡고 있으면 없고, 놓은 뒤 음높이는 변위를 따르고 크기는 진폭·속도를 따른다', () => {
    expect(touchVoiceParams('jelly', sense({ held: true, jiggle: 0.8, jiggleVel: 0.5 })).tone.gain).toBe(0);
    const up = touchVoiceParams('jelly', sense({ jiggle: 0.6 }));
    const down = touchVoiceParams('jelly', sense({ jiggle: -0.6 }));
    expect(up.tone.freq).toBeGreaterThan(down.tone.freq);
    const big = touchVoiceParams('jelly', sense({ jiggle: 0, jiggleVel: 1 }));
    const small = touchVoiceParams('jelly', sense({ jiggle: 0, jiggleVel: 0.3 }));
    expect(big.tone.gain).toBeGreaterThan(small.tone.gain * 3);
    // 가장 빠를 때(가운데를 지날 때) 가장 크다 — 트레몰로가 화면의 출렁임과 같은 박자
    const atTurn = touchVoiceParams('jelly', sense({ jiggle: 1, jiggleVel: 0 }));
    expect(big.tone.gain).toBeGreaterThan(atTurn.tone.gain);
    // 폰 스피커 대역: 가장 낮게 휘어도 200Hz 위
    expect(touchVoiceParams('jelly', sense({ jiggle: -1.5, jiggleVel: 0.5 })).tone.freq).toBeGreaterThan(200);
  });

  it('쭉쭉이 "끼익": 늘어나는 빠르기만큼 펄스가 잦아지고, 팽팽할수록 공명이 높다. 멈추면 조용', () => {
    const slow = touchVoiceParams('stretchy', sense({ held: true, stretch: 0.3, stretchVel: 0.5 }));
    const fast = touchVoiceParams('stretchy', sense({ held: true, stretch: 0.3, stretchVel: 2.5 }));
    const taut = touchVoiceParams('stretchy', sense({ held: true, stretch: 1, stretchVel: 2.5 }));
    const still = touchVoiceParams('stretchy', sense({ held: true, stretch: 1, stretchVel: 0 }));
    expect(fast.creak.rate).toBeGreaterThan(slow.creak.rate * 2);
    expect(fast.creak.gain).toBeGreaterThan(slow.creak.gain);
    expect(taut.creak.freq).toBeGreaterThan(fast.creak.freq);
    expect(still.creak.gain).toBe(0);
    // 폼은 삐걱이지 않는다
    expect(touchVoiceParams('slowRise', sense({ held: true, stretch: 1, stretchVel: 3 })).creak.gain).toBe(0);
  });

  it('찐득이 "칙칙": 떼어내는 빠르기만큼 촘촘해진다', () => {
    const a = touchVoiceParams('sticky', sense({ held: true, peel: 0.2 }));
    const b = touchVoiceParams('sticky', sense({ held: true, peel: 0.9 }));
    expect(b.grains.rate).toBeGreaterThan(a.grains.rate * 3);
    expect(b.grains.rate).toBeGreaterThan(150);
    expect(touchVoiceParams('jelly', sense({ held: true, peel: 1 })).grains.rate).toBe(0);
  });

  it('문지름은 손가락 속도만큼, 촉감마다 결이 다르다 (폼 낮고 부드럽게, 고무 높고 매끈하게)', () => {
    const r = (m: (typeof MATERIAL_IDS)[number], v: number) => touchVoiceParams(m, sense({ held: true, rub: v }));
    for (const m of MATERIAL_IDS) {
      expect(r(m, 1).rub.gain).toBeGreaterThan(r(m, 0.3).rub.gain);
      expect(r(m, 0).rub.gain).toBe(0);
    }
    expect(r('stretchy', 0.6).rub.freq).toBeGreaterThan(r('slowRise', 0.6).rub.freq * 2);
    expect(r('jelly', 0.6).rub.q).toBeGreaterThan(r('slowRise', 0.6).rub.q * 3);
    // 찐득이 문지름은 끈적한 알갱이
    expect(r('sticky', 0.8).grains.rate).toBeGreaterThan(r('slowRise', 0.8).grains.rate * 3);
  });

  it('모든 대역은 폰 스피커가 내는 200Hz~6kHz 안', () => {
    for (const m of MATERIAL_IDS) {
      const t = VOICE_TIMBRES[m];
      for (const f of [t.flow.lo, t.flow.hi, t.rub.lo, t.rub.hi, t.grains.freq]) {
        expect(f, m).toBeGreaterThanOrEqual(200);
        expect(f, m).toBeLessThanOrEqual(6000);
      }
      if (t.tone.gain > 0) expect(t.tone.base * (1 - t.tone.bend)).toBeGreaterThan(200);
      if (t.creak.gain > 0) expect(t.creak.lo).toBeGreaterThanOrEqual(200);
    }
  });

  it('목소리 하나의 층을 모두 최대로 올려도 버스 앞 1 을 넘지 않는다 (3개가 겹쳐도 리미터가 감당)', () => {
    for (const m of MATERIAL_IDS) expect(maxVoiceGain(m)).toBeLessThan(1);
  });

  it('NaN 입력에도 유한한 값', () => {
    const bad = sense({ held: true, press: Number.NaN, pressVel: Number.NaN, stretch: Infinity, stretchVel: -Infinity, rub: Number.NaN, jiggle: Number.NaN, jiggleVel: Number.NaN, peel: Number.NaN });
    for (const m of MATERIAL_IDS) {
      const p = touchVoiceParams(m, bad);
      for (const layer of Object.values(p)) for (const v of Object.values(layer)) expect(Number.isFinite(v), m).toBe(true);
    }
  });
});

// ── 오디오 그래프 (가짜 WebAudio) ──────────────────────────

const problems: string[] = [];
let stops = 0;
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
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.check('linearRamp', v, t);
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.check('setTarget', v, t);
    if (!(tau > 0)) problems.push(`setTarget tau ${tau}`);
    this.value = v;
  }
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  playbackRate = new FakeParam();
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
  start() {}
  stop() {
    stops++;
  }
  setPeriodicWave() {}
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
  createPeriodicWave() {
    return {};
  }
  createBuffer(_c: number, len: number) {
    const data = new Float32Array(len);
    return { duration: len / 8000, getChannelData: () => data };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('손맛 목소리 그래프', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    problems.length = 0;
    stops = 0;
    setTouchVoiceRandom(createSeededRng(9));
  });
  afterEach(() => {
    stopAllTouchVoices();
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setTouchVoiceRandom(Math.random);
  });

  it('첫 입력 전에는 만들지 않는다 (컨텍스트도 없음)', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    expect(startTouchVoice('jelly')).toBeNull();
    expect(created).toBe(0);
  });

  it('입력 뒤: 촉감마다 그래프가 유효하고, 상한 3개를 넘으면 오래된 것부터 끈다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    const voices = MATERIAL_IDS.map((m) => startTouchVoice(m));
    expect(voices.every((v) => v !== null)).toBe(true);
    expect(activeTouchVoices()).toBe(MAX_TOUCH_VOICES);
    expect(voices[0]!.done).toBe(true);
    for (const v of voices) {
      for (let i = 0; i < 30; i++) {
        v!.update(sense({ held: true, press: i / 30, pressVel: 2, stretch: i / 30, stretchVel: 2, rub: 0.5, jiggle: Math.sin(i), jiggleVel: Math.cos(i), peel: 0.5 }));
      }
    }
    expect(problems).toEqual([]);
    stopAllTouchVoices();
    expect(activeTouchVoices()).toBe(0);
    expect(stops).toBeGreaterThan(0);
  });

  it('놓은 뒤 조용해지면 스스로 멈춘다, 멈춘 뒤 부르는 것도 안전', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    const v = startTouchVoice('jelly')!;
    v.update(sense({ held: true, pressVel: 2 }));
    v.release();
    const ctx = (sfx.getOutput() as unknown as { ctx: FakeAudioContext }).ctx;
    for (let i = 0; i < 40; i++) {
      ctx.currentTime += 1 / 60;
      v.update(QUIET_SENSE);
    }
    expect(v.done).toBe(true);
    expect(activeTouchVoices()).toBe(0);
    v.update(sense({ held: true, pressVel: 2 }));
    v.stop();
    v.release();
    expect(problems).toEqual([]);
  });

  it('update 가 끊기면(그리기 루프가 멈춤·화면을 떠남) 감시가 멈춘다 — 멈춘 소리가 남지 않는다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    const v = startTouchVoice('stretchy')!;
    v.update(sense({ held: true, stretch: 1, stretchVel: 2 }));
    vi.advanceTimersByTime(2000);
    expect(v.done).toBe(true);
    expect(activeTouchVoices()).toBe(0);
  });

  it('일회성 소리가 울리면 목소리가 비켜 준다 (덕킹), 오류 없음', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    sfx.unlock();
    const v = startTouchVoice('jelly')!;
    duckTouchVoices(0.3, -6);
    squelch(1);
    duckTouchVoices(Number.NaN, Number.NaN);
    v.stop();
    expect(problems).toEqual([]);
  });
});
