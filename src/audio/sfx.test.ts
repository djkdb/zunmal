import { afterEach, describe, expect, it, vi } from 'vitest';
import { SfxEngine, installAudioUnlock } from './sfx';

class FakeParam {
  value = 0;
  targets: number[] = [];
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime(v: number) {
    this.targets.push(v);
  }
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = '';
  loop = false;
  curve: unknown = null;
  buffer: unknown = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
let created = 0;
let lastCtx: FakeAudioContext | null = null;
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  resumes = 0;
  suspends = 0;
  onstatechange: (() => void) | null = null;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  constructor() {
    created++;
    lastCtx = this;
  }
  createGain() {
    const g = new FakeNode();
    this.gains.push(g);
    return g;
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
    return { getChannelData: () => new Float32Array(len) };
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  created = 0;
  lastCtx = null;
});

describe('SfxEngine', () => {
  it('사용자 입력(unlock) 전에는 AudioContext를 만들지 않는다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.button();
    engine.coin();
    engine.resultLegendary();
    expect(engine.hasContext()).toBe(false);
    expect(created).toBe(0);
  });

  it('unlock 후 컨텍스트를 한 번만 생성하고 재생한다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.unlock();
    engine.button();
    engine.capsuleShake();
    engine.capsuleOpen();
    engine.epicRiser(1.2);
    engine.epicImpact();
    engine.epicImplode(0.45);
    engine.secretBoom();
    engine.resultSecret();
    expect(engine.hasContext()).toBe(true);
    expect(created).toBe(1);
  });

  it('음소거 상태에서 unlock해도 컨텍스트를 만들지 않는다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.setMuted(true);
    engine.unlock();
    engine.success();
    expect(created).toBe(0);
    engine.setMuted(false);
    engine.success();
    expect(created).toBe(1);
  });

  it('WebAudio 미지원 환경에서도 에러 없이 무시', () => {
    const engine = new SfxEngine();
    engine.unlock();
    expect(() => engine.fail()).not.toThrow();
  });
  it("iOS 'interrupted' 상태도 다음 입력에서 다시 깨운다", async () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.unlock();
    const ctx = lastCtx;
    if (!ctx) throw new Error('no ctx');
    ctx.state = 'interrupted';
    engine.unlock();
    await Promise.resolve();
    expect(ctx.resumes).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('화면이 숨겨지면 멈추고, 다시 보이면 깨운다', async () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.unlock();
    const ctx = lastCtx;
    if (!ctx) throw new Error('no ctx');
    engine.setPageHidden(true);
    expect(ctx.suspends).toBe(1);
    // 숨겨진 동안에는 입력이 와도 깨우지 않는다
    engine.unlock();
    expect(ctx.resumes).toBe(0);
    engine.setPageHidden(false);
    await Promise.resolve();
    expect(ctx.resumes).toBe(1);
  });

  it('효과음·배경음악을 모두 끄면 컨텍스트를 멈추고, 효과음이 꺼지면 getOutput은 null', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.unlock();
    engine.setSfxEnabled(false);
    expect(engine.getOutput()).toBeNull();
    expect(engine.getMusicOutput()).not.toBeNull();
    engine.setMusicEnabled(false);
    expect(engine.getMusicOutput()).toBeNull();
    expect(lastCtx?.suspends).toBe(1);
    expect(engine.isMuted()).toBe(true);
  });

  it('배경음악만 켜져 있어도 unlock 때 컨텍스트를 만든다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.setSfxEnabled(false);
    engine.unlock();
    expect(created).toBe(1);
    engine.button();
    expect(engine.getOutput()).toBeNull();
  });

  it('onChange: 첫 unlock과 설정 변경을 알린다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    const fn = vi.fn();
    const off = engine.onChange(fn);
    engine.unlock();
    engine.unlock();
    expect(fn).toHaveBeenCalledTimes(1);
    engine.setMusicEnabled(false);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    engine.setMusicEnabled(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('팡파레는 배경음악을 낮춘다 (duck)', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    engine.unlock();
    const ctx = lastCtx;
    if (!ctx) throw new Error('no ctx');
    // 버스 생성 순서: sfx, ui, music, duck
    const duck = ctx.gains[3];
    engine.resultLegendary();
    const targets = duck?.gain.targets ?? [];
    expect(targets[0]).toBeCloseTo(10 ** (-12 / 20), 5);
    expect(targets[1]).toBe(1);
  });

  it('installAudioUnlock: 첫 입력 뒤에도 계속 듣고, visibilitychange를 전달한다', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const engine = new SfxEngine();
    const unlock = vi.spyOn(engine, 'unlock');
    const hidden = vi.spyOn(engine, 'setPageHidden');
    const target = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const remove = installAudioUnlock(engine, target as unknown as Window, doc as unknown as Document);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(unlock).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(hidden).toHaveBeenLastCalledWith(true);
    remove();
    target.dispatchEvent(new Event('pointerdown'));
    expect(unlock).toHaveBeenCalledTimes(2);
  });
});
