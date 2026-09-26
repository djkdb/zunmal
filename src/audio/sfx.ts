import type { Rarity } from '../data/rarity';

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
  resultEpic(): void;
  resultLegendary(): void;
  resultMythic(): void;
  /** 시크릿 등장: 정적 → 깊은 울림 → 천상의 화음 + 메아리 */
  resultSecret(): void;
  /** 시크릿 캡슐이 나오기 직전의 불길한(?) 예고음 */
  secretTease(): void;
  /** 반짝 버전 획득 */
  shinyChime(): void;
  /** 신화 이상 연출: 점점 차오르는 소리 (초 단위 길이) */
  epicRiser(seconds: number): void;
  /** 신화 이상 연출: 캡슐이 터지는 충격음 */
  epicImpact(): void;
  /** 시크릿 연출: 모든 빛이 한 점으로 빨려 들어가는 소리 (초 단위 길이) */
  epicImplode(seconds: number): void;
  /** 시크릿 연출: 두 번째 초신성 폭발 + 하늘에서 울리는 화음 */
  secretBoom(): void;
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

  /**
   * 다른 합성 모듈(말랑 만지기 소리 등)이 같은 AudioContext·음소거 설정을 쓰도록 출력 노드를 빌려준다.
   * 첫 사용자 입력 전이거나 음소거면 null.
   */
  getOutput(): { ctx: AudioContext; out: GainNode } | null {
    return this.ready();
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

  /** 필터 주파수가 from → to로 쓸려 올라가는(내려가는) 노이즈. 길어도 끊기지 않게 버퍼를 반복한다. */
  private sweep(duration: number, { from, to, gain = 0.2, delay = 0, q = 4 }: { from: number; to: number; gain?: number; delay?: number; q?: number }) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    this.noise(0.001, { gain: 0.0001 }); // noiseBuffer 준비
    if (!this.noiseBuffer) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + duration * 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.05);
    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t0);
    src.stop(t0 + duration + 0.1);
  }

  epicRiser(seconds: number) {
    const d = Math.max(0.3, seconds);
    // 바람이 몰려드는 듯한 노이즈 스윕 + 반음씩 올라가는 두 겹 톱니파 + 낮은 웅웅거림
    this.sweep(d, { from: 180, to: 5200, gain: 0.32, q: 3 });
    this.tone({ freq: 110, slideTo: 440, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.8 });
    this.tone({ freq: 111.5, slideTo: 446, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.8 });
    this.tone({ freq: 55, duration: d, type: 'sine', gain: 0.25, attack: d * 0.5 });
    // 끝에 가까울수록 빨라지는 반짝임
    const ticks = 10;
    for (let i = 0; i < ticks; i++) {
      const at = d * (1 - (1 - i / ticks) ** 1.8);
      this.tone({ freq: 880 * 2 ** (i / 6), duration: 0.06, type: 'triangle', gain: 0.05, delay: at });
    }
  }

  epicImpact() {
    // 깊은 쿵 + 파열음 + 오래 남는 심벌 같은 치익
    this.tone({ freq: 90, slideTo: 32, duration: 0.9, type: 'sine', gain: 0.9, attack: 0.002 });
    this.tone({ freq: 180, slideTo: 60, duration: 0.25, type: 'triangle', gain: 0.35, attack: 0.002 });
    this.noise(0.35, { freq: 700, gain: 0.6, q: 0.6 });
    this.sweep(1.6, { from: 9000, to: 3000, gain: 0.12, q: 0.8, delay: 0.02 });
  }

  epicImplode(seconds: number) {
    const d = Math.max(0.2, seconds);
    // 거꾸로 감긴 바람 소리 — 높은 곳에서 바닥까지 빨려 내려가다 뚝 끊긴다
    this.sweep(d, { from: 7000, to: 140, gain: 0.34, q: 5 });
    this.tone({ freq: 520, slideTo: 55, duration: d, type: 'sine', gain: 0.22, attack: d * 0.3 });
    this.tone({ freq: 260, slideTo: 40, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.3 });
  }

  secretBoom() {
    // 첫 폭발보다 낮고 긴 쿵 + 오래 남는 치익 + 높은 곳에서 퍼지는 장7화음 종소리
    this.tone({ freq: 62, slideTo: 22, duration: 1.8, type: 'sine', gain: 0.95, attack: 0.002 });
    this.tone({ freq: 124, slideTo: 40, duration: 0.5, type: 'triangle', gain: 0.3, attack: 0.002 });
    this.noise(0.6, { freq: 400, gain: 0.55, q: 0.5 });
    this.sweep(2.6, { from: 12000, to: 1800, gain: 0.14, q: 0.7, delay: 0.03 });
    [1046.5, 1318.5, 1568, 1975.5, 2637].forEach((f, i) => this.bell(f, 0.12 + i * 0.07, 1.4));
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

  resultEpic() {
    // 레어보다 한 단계 높은 반짝이는 상승 아르페지오 + 종소리
    this.arpeggio([NOTE.E5, NOTE.G5, NOTE.B5, NOTE.E6], 0.07, { duration: 0.28, type: 'triangle', gain: 0.22 });
    this.bell(NOTE.E6 * 2, 0.35, 0.8);
    this.bell(NOTE.B5 * 2, 0.45, 0.6);
  }

  resultMythic() {
    this.resultLegendary();
    // 무지개처럼 쏟아지는 하강·상승 반짝임
    const run = [NOTE.C6 * 2, NOTE.G6, NOTE.E6, NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C6 * 2, NOTE.E6 * 2];
    run.forEach((f, i) => this.bell(f, 0.9 + i * 0.07, 0.35));
  }

  resultSecret() {
    const r = this.ready();
    if (!r) return;
    // 1) 깊은 울림
    this.tone({ freq: 55, slideTo: 40, duration: 1.4, type: 'sine', gain: 0.6, attack: 0.05 });
    this.noise(1.2, { freq: 220, gain: 0.25, q: 0.5 });
    // 2) 천상의 화음: 살짝 어긋난 여러 음을 겹쳐 합창처럼
    const chord = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.B5, NOTE.D6];
    chord.forEach((f, i) => {
      for (const detune of [-0.006, 0, 0.006]) {
        this.tone({ freq: f * (1 + detune), duration: 2.6, type: 'sine', gain: 0.05, delay: 0.7 + i * 0.05, attack: 0.5 });
      }
    });
    // 3) 메아리치는 별빛 아르페지오
    const stars = [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.B5 * 2, NOTE.D6 * 2, NOTE.G6 * 2];
    stars.forEach((f, i) => {
      this.bell(f, 1.2 + i * 0.11, 0.5);
      this.bell(f, 1.2 + i * 0.11 + 0.33, 0.18); // 메아리
    });
  }

  secretTease() {
    // 낮게 웅웅거리다 멎는 소리 — "뭔가 이상하다"
    this.tone({ freq: 70, slideTo: 140, duration: 0.9, type: 'sawtooth', gain: 0.05, attack: 0.2 });
    this.tone({ freq: 71.5, slideTo: 143, duration: 0.9, type: 'sawtooth', gain: 0.05, attack: 0.2 });
    this.noise(0.9, { freq: 900, gain: 0.08, q: 6 });
  }

  shinyChime() {
    [NOTE.E6 * 2, NOTE.B5 * 2, NOTE.G6 * 2, NOTE.E6 * 2 * 1.5].forEach((f, i) => this.bell(f, i * 0.06, 0.4));
  }

  /** 맑은 종소리: 기음 + 비정수배 배음, 긴 감쇠 */
  private bell(freq: number, delay: number, level: number) {
    this.tone({ freq, duration: 0.9, type: 'sine', gain: 0.09 * level, delay, attack: 0.003 });
    this.tone({ freq: freq * 2.76, duration: 0.45, type: 'sine', gain: 0.035 * level, delay, attack: 0.003 });
    this.tone({ freq: freq * 5.4, duration: 0.2, type: 'sine', gain: 0.015 * level, delay, attack: 0.003 });
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

/** 결과 희귀도에 맞는 효과음. 반짝이면 반짝 종소리를 덧붙인다. */
export function playRarityFanfare(engine: Sfx, rarity: Rarity, shiny = false): void {
  switch (rarity) {
    case 'common':
      engine.resultCommon();
      break;
    case 'rare':
      engine.resultRare();
      break;
    case 'epic':
      engine.resultEpic();
      break;
    case 'legendary':
      engine.resultLegendary();
      break;
    case 'mythic':
      engine.resultMythic();
      break;
    case 'secret':
      engine.resultSecret();
      break;
  }
  if (shiny) engine.shinyChime();
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
