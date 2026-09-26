import { afterEach, describe, expect, it, vi } from 'vitest';
import { SfxEngine } from './sfx';

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = '';
  buffer: unknown = null;
  connect() {}
  start() {}
  stop() {}
}
let created = 0;
class FakeAudioContext {
  currentTime = 0;
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
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
  resume() {
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  created = 0;
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
});
