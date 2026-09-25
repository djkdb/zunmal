/**
 * WebAudio 합성 효과음. 오디오 파일을 사용하지 않는다.
 *
 * 자동재생 정책 준수:
 *  - AudioContext는 첫 사용자 입력(pointerdown/keydown/touchstart) 이후에만 생성한다.
 *  - 그 전에 재생 함수가 호출되면 아무것도 하지 않는다.
 */

export interface Sfx {
  button(): void;
  coin(): void;
  capsuleInsert(): void;
  capsuleShake(): void;
  capsuleOpen(): void;
  resultCommon(): void;
  resultRare(): void;
  resultLegendary(): void;
  success(): void;
  fail(): void;
  /** 미니게임: 가벼운 탭음. level이 높을수록 음이 올라간다 (콤보 표현). */
  tap(level?: number): void;
  /** 미니게임: 아이템 획득 */
  pickup(): void;
  /** 미니게임: 폭탄/실수 */
  hit(): void;
  /** 미니게임: 카운트다운 틱 (final=true면 시작음) */
  countdown(final?: boolean): void;
  /** 리듬용 박자음. accent=true면 강박 */
  beat(accent?: boolean): void;
  /** 점프/튀어오름 */
  jump(): void;
  /** 카드 뒤집기 */
  flip(): void;
}

type Wave = OscillatorType;

interface ToneOptions {
  freq: number;
  duration: number;
  type?: Wave;
  gain?: number;
  delay?: number;
  slideTo?: number;
  attack?: number;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext;
}

// 음이름 → 주파수 (자주 쓰는 음만)
const NOTE = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  C4: 261.63,
  G4: 392,
  E4: 329.63,
  A4: 440,
} as const;

export class SfxEngine implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;
  private muted = false;

  /** 사용자 입력 핸들러 안에서 호출된다. 이때 처음으로 AudioContext를 만든다. */
  unlock(): void {
    this.unlocked = true;
    if (!this.muted) this.ensureContext();
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** 테스트/디버그용: 컨텍스트가 생성되었는가 */
  hasContext(): boolean {
    return this.ctx !== null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (this.muted) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return null;
    return { ctx, out: this.master };
  }

  private tone({ freq, duration, type = 'sine', gain = 0.3, delay = 0, slideTo, attack = 0.005 }: ToneOptions) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, { delay = 0, gain = 0.2, freq = 2000, q = 1 } = {}) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  private arpeggio(notes: readonly number[], step: number, opts: Omit<ToneOptions, 'freq'> & { startDelay?: number }) {
    const { startDelay = 0, ...rest } = opts;
    notes.forEach((freq, i) => this.tone({ ...rest, freq, delay: startDelay + i * step }));
  }

  // ── 공개 효과음 ─────────────────────────────────────────

  button() {
    this.tone({ freq: 620, slideTo: 880, duration: 0.07, type: 'square', gain: 0.08 });
  }

  coin() {
    this.tone({ freq: NOTE.B5, duration: 0.08, type: 'square', gain: 0.1 });
    this.tone({ freq: NOTE.E6, duration: 0.25, type: 'square', gain: 0.1, delay: 0.07 });
  }

  capsuleInsert() {
    this.noise(0.05, { freq: 4000, gain: 0.25, q: 2 });
    this.tone({ freq: 240, slideTo: 90, duration: 0.18, type: 'triangle', gain: 0.35, delay: 0.03 });
    this.tone({ freq: 1500, duration: 0.05, type: 'square', gain: 0.05, delay: 0.2 });
  }

  capsuleShake() {
    for (let i = 0; i < 4; i++) {
      this.noise(0.07, { delay: i * 0.1, freq: 900 + i * 180, gain: 0.3, q: 4 });
      this.tone({ freq: 180 + (i % 2) * 40, duration: 0.06, type: 'triangle', gain: 0.12, delay: i * 0.1 });
    }
  }

  capsuleOpen() {
    this.tone({ freq: 260, slideTo: 1100, duration: 0.14, type: 'sine', gain: 0.4 });
    this.noise(0.12, { freq: 6000, gain: 0.15, q: 0.8, delay: 0.02 });
    this.arpeggio([NOTE.C6, NOTE.E6, NOTE.G6], 0.04, { duration: 0.18, type: 'triangle', gain: 0.1, startDelay: 0.1 });
  }

  resultCommon() {
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5], 0.08, { duration: 0.2, type: 'triangle', gain: 0.22 });
  }

  resultRare() {
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08, { duration: 0.3, type: 'triangle', gain: 0.24 });
    this.arpeggio([NOTE.E6, NOTE.G6, NOTE.E6, NOTE.G6], 0.05, {
      duration: 0.12,
      type: 'sine',
      gain: 0.06,
      startDelay: 0.35,
    });
  }

  resultLegendary() {
    // 팡파레: 두 번의 짧은 음 + 긴 화음 + 반짝임
    this.tone({ freq: NOTE.G4, duration: 0.12, type: 'square', gain: 0.12 });
    this.tone({ freq: NOTE.G4, duration: 0.12, type: 'square', gain: 0.12, delay: 0.14 });
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6]) {
      this.tone({ freq: f, duration: 0.9, type: 'triangle', gain: 0.14, delay: 0.3, attack: 0.02 });
    }
    this.tone({ freq: NOTE.C4, duration: 0.9, type: 'sawtooth', gain: 0.05, delay: 0.3, attack: 0.02 });
    this.arpeggio([NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6, NOTE.C6 * 2], 0.06, {
      duration: 0.2,
      type: 'sine',
      gain: 0.07,
      startDelay: 0.55,
    });
  }

  success() {
    this.arpeggio([NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 0.09, { duration: 0.22, type: 'square', gain: 0.08 });
  }

  fail() {
    this.tone({ freq: NOTE.E4, slideTo: 150, duration: 0.5, type: 'sawtooth', gain: 0.08 });
    this.tone({ freq: NOTE.C4, slideTo: 110, duration: 0.6, type: 'triangle', gain: 0.15, delay: 0.1 });
  }

  tap(level = 0) {
    const semitone = Math.min(level, 12);
    const freq = 440 * 2 ** (semitone / 12);
    this.tone({ freq, slideTo: freq * 1.5, duration: 0.07, type: 'sine', gain: 0.25 });
  }

  pickup() {
    this.tone({ freq: NOTE.E5, duration: 0.06, type: 'square', gain: 0.08 });
    this.tone({ freq: NOTE.A5, duration: 0.12, type: 'square', gain: 0.08, delay: 0.05 });
  }

  hit() {
    this.noise(0.25, { freq: 400, gain: 0.4, q: 0.7 });
    this.tone({ freq: 150, slideTo: 50, duration: 0.3, type: 'sawtooth', gain: 0.15 });
  }

  countdown(final = false) {
    this.tone({ freq: final ? NOTE.A5 : NOTE.A4, duration: final ? 0.3 : 0.12, type: 'square', gain: 0.08 });
  }

  beat(accent = false) {
    // 킥 느낌의 저음 + 짧은 클릭
    this.tone({ freq: accent ? 160 : 120, slideTo: 45, duration: 0.16, type: 'sine', gain: accent ? 0.55 : 0.4 });
    this.noise(0.03, { freq: accent ? 5000 : 3500, gain: accent ? 0.18 : 0.1, q: 1.5 });
  }

  jump() {
    this.tone({ freq: 300, slideTo: 720, duration: 0.14, type: 'square', gain: 0.06 });
  }

  flip() {
    this.noise(0.05, { freq: 2600, gain: 0.18, q: 2 });
    this.tone({ freq: 520, slideTo: 640, duration: 0.05, type: 'triangle', gain: 0.08 });
  }
}

/** 앱 전역 효과음 인스턴스 */
export const sfx = new SfxEngine();

/** 결과 희귀도 단계에 맞는 효과음 */
export function playResultFanfare(engine: Sfx, fanfare: 0 | 1 | 2 | 3): void {
  if (fanfare >= 3) engine.resultLegendary();
  else if (fanfare >= 1) engine.resultRare();
  else engine.resultCommon();
}

/**
 * 첫 사용자 입력에서 오디오를 잠금 해제하는 리스너를 설치한다.
 * capture 단계에서 실행되므로 같은 입력의 click 핸들러보다 먼저 컨텍스트가 준비된다.
 * 반환값: 리스너 제거 함수.
 */
export function installAudioUnlock(engine: SfxEngine = sfx, target: Window = window): () => void {
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const handler = () => {
    engine.unlock();
    remove();
  };
  const remove = () => events.forEach((e) => target.removeEventListener(e, handler, true));
  events.forEach((e) => target.addEventListener(e, handler, { capture: true, passive: true }));
  return remove;
}
