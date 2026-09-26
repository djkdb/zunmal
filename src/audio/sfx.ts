import type { Rarity } from '../data/rarity';
import {
  MAX_COMBO_STEP,
  centsToRatio,
  comboOverflow,
  comboPitch,
  dbToGain,
  saturationCurve,
  softClipCurve,
  spread,
} from './tuning';

/**
 * WebAudio 합성 효과음 + 믹서. 오디오 파일을 사용하지 않는다.
 *
 * 자동재생 정책 준수:
 *  - AudioContext는 첫 사용자 입력(pointerdown/keydown/touchstart) 이후에만 생성한다.
 *  - 그 전에 재생 함수가 호출되면 아무것도 하지 않는다.
 *
 * 믹서 구조 (폰 스피커 기준으로 설계):
 *
 *   효과음 ─ sfxBus ─┐
 *   UI 소리 ─ uiBus ─┼─ 저역 컷(90Hz) ─ 버스 컴프(3.5:1) ─ 리미터(-1.5dB) ─ 안전 클리퍼 ─ 스피커
 *   배경음악 ─ musicBus ─ duck ─┘
 *
 *  - 효과음 끄기 = sfxBus·uiBus 0, 배경음악 끄기 = musicBus 0. 둘 다 끄면 컨텍스트를 멈춘다.
 *  - 가챠 팡파레·신화 연출 소리는 스스로 `duck()`을 불러 배경음악을 크게 낮춘다.
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
  /** 미니게임: 가벼운 탭음. level이 높을수록 음이 5음 음계로 올라간다 (콤보 표현, 1.5옥타브 상한). */
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
export type SfxBus = 'sfx' | 'ui';

interface ToneOptions {
  freq: number;
  duration: number;
  type?: Wave;
  gain?: number;
  delay?: number;
  slideTo?: number;
  attack?: number;
  /** 센트 단위 음높이 흔들기 */
  detune?: number;
  bus?: SfxBus;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext;
}

interface AudioSessionLike {
  type: string;
}

/**
 * iOS 17+ Safari: 오디오 세션을 'ambient'로 두어 무음 스위치를 존중하고 다른 앱 음악과 섞인다.
 * 컨텍스트를 만들기 전에 불러야 한다. 지원하지 않으면 아무것도 하지 않는다.
 */
function preferAmbientSession(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { audioSession?: AudioSessionLike };
  try {
    if (nav.audioSession && typeof nav.audioSession.type === 'string') nav.audioSession.type = 'ambient';
  } catch {
    // 일부 WebView는 읽기 전용일 수 있다
  }
}

/** 버스 기준 음량 (배경음악은 효과음 정점보다 약 10dB 아래) */
export const BUS_LEVELS = { sfx: 0.55, ui: 0.42, music: 0.14 } as const;

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

interface Graph {
  sfx: GainNode;
  ui: GainNode;
  music: GainNode;
  duck: GainNode;
}

export class SfxEngine implements Sfx {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private satCurve: Float32Array<ArrayBuffer> | null = null;
  private unlocked = false;
  private sfxOn = true;
  private musicOn = true;
  private pageHidden = false;
  private lastResumeAt = Number.NEGATIVE_INFINITY;
  private duckEnd = 0;
  private duckLevel = 1;
  private lastPlayed = new Map<string, number>();
  private listeners = new Set<() => void>();
  private rand: () => number = Math.random;

  /** 사용자 입력 핸들러 안에서 호출된다. 처음이면 AudioContext를 만들고, 멈춰 있으면 깨운다. */
  unlock(): void {
    const first = !this.unlocked;
    this.unlocked = true;
    if (this.sfxOn || this.musicOn) this.ensureContext(true);
    if (first) this.emit();
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** 테스트/디버그용: 컨텍스트가 생성되었는가 */
  hasContext(): boolean {
    return this.ctx !== null;
  }

  /** 테스트용: 변주 난수 교체 */
  setRandom(rand: () => number): void {
    this.rand = rand;
  }

  /** 상태(잠금 해제, 설정, 컨텍스트 상태)가 바뀔 때 알림. 해제 함수를 돌려준다. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** 모든 소리 끄기/켜기 (효과음 + 배경음악) */
  setMuted(muted: boolean): void {
    this.setSettings({ sfxOn: !muted, musicOn: !muted });
  }

  isMuted(): boolean {
    return !this.sfxOn && !this.musicOn;
  }

  setSfxEnabled(on: boolean): void {
    this.setSettings({ sfxOn: on, musicOn: this.musicOn });
  }

  setMusicEnabled(on: boolean): void {
    this.setSettings({ sfxOn: this.sfxOn, musicOn: on });
  }

  isSfxEnabled(): boolean {
    return this.sfxOn;
  }

  isMusicEnabled(): boolean {
    return this.musicOn;
  }

  setSettings({ sfxOn, musicOn }: { sfxOn: boolean; musicOn: boolean }): void {
    if (sfxOn === this.sfxOn && musicOn === this.musicOn) return;
    this.sfxOn = sfxOn;
    this.musicOn = musicOn;
    this.applyLevels();
    const ctx = this.ctx;
    if (ctx) {
      // 둘 다 끄면 배터리를 위해 오디오 하드웨어를 놓아준다
      if (!sfxOn && !musicOn) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else {
        this.resumeIfNeeded(true);
      }
    } else if (this.unlocked && (sfxOn || musicOn)) {
      this.ensureContext();
    }
    this.emit();
  }

  /** 페이지가 숨겨지면 컨텍스트를 멈추고, 보이면 다시 깨운다 (iOS는 다음 터치에서 깨어날 수 있음). */
  setPageHidden(hidden: boolean): void {
    if (hidden === this.pageHidden) return;
    this.pageHidden = hidden;
    const ctx = this.ctx;
    if (ctx) {
      if (hidden) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else {
        this.resumeIfNeeded(true);
      }
    }
    this.emit();
  }

  isPageHidden(): boolean {
    return this.pageHidden;
  }

  private applyLevels(immediate = false): void {
    const g = this.graph;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    if (immediate) {
      // 컨텍스트를 만든 바로 그 입력의 소리(첫 버튼음)가 잘리지 않게 램프 없이 설정
      g.sfx.gain.value = this.sfxOn ? BUS_LEVELS.sfx : 0;
      g.ui.gain.value = this.sfxOn ? BUS_LEVELS.ui : 0;
      g.music.gain.value = this.musicOn ? BUS_LEVELS.music : 0;
      return;
    }
    const t = ctx.currentTime;
    g.sfx.gain.setTargetAtTime(this.sfxOn ? BUS_LEVELS.sfx : 0, t, 0.02);
    g.ui.gain.setTargetAtTime(this.sfxOn ? BUS_LEVELS.ui : 0, t, 0.02);
    g.music.gain.setTargetAtTime(this.musicOn ? BUS_LEVELS.music : 0, t, 0.08);
  }

  /**
   * Safari는 표준 밖의 'interrupted' 상태를 쓰므로 'suspended'만 보면 안 된다.
   * running이 아니면(닫힌 경우 제외) 깨운다. 사용자 입력 안에서 불려야 iOS에서 성공한다.
   * 입력 밖(효과음 재생 중)에서는 250ms에 한 번만 시도하고, 입력 안에서는 항상 시도한다
   * — iOS는 입력 밖 resume()을 끝나지 않는 약속으로 붙잡아 둘 수 있기 때문이다.
   */
  private resumeIfNeeded(fromGesture = false): void {
    const ctx = this.ctx;
    if (!ctx || this.pageHidden) return;
    if (!this.sfxOn && !this.musicOn) return;
    const state: string = ctx.state;
    if (state === 'running' || state === 'closed') return;
    const now = Date.now();
    if (!fromGesture && now - this.lastResumeAt < 250) return;
    this.lastResumeAt = now;
    void ctx.resume().catch(() => undefined);
  }

  private ensureContext(fromGesture = false): AudioContext | null {
    if (!this.unlocked) return null;
    if (this.ctx) {
      this.resumeIfNeeded(fromGesture);
      return this.ctx;
    }
    if (!this.sfxOn && !this.musicOn) return null;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      preferAmbientSession();
      const ctx = new Ctor();
      this.ctx = ctx;
      this.graph = this.buildGraph(ctx);
      this.applyLevels(true);
      ctx.onstatechange = () => this.emit();
      return ctx;
    } catch {
      this.ctx = null;
      this.graph = null;
      return null;
    }
  }

  private buildGraph(ctx: AudioContext): Graph {
    const bus = (level: number) => {
      const g = ctx.createGain();
      g.gain.value = level;
      return g;
    };
    const sfxBus = bus(0);
    const uiBus = bus(0);
    const musicBus = bus(0);
    const duck = bus(1);

    // 폰 스피커가 못 내는 초저역을 걷어내 리미터 여유를 확보한다
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 90;
    hpf.Q.value = 0.707;

    // 가벼운 버스 컴프레서: 여러 소리가 겹칠 때 한 덩어리로
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.2;

    // 리미터: 빠른 어택, 높은 비율
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    // 안전망: 리미터를 뚫는 순간 피크도 0.99를 넘지 않게
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();

    sfxBus.connect(hpf);
    uiBus.connect(hpf);
    musicBus.connect(duck);
    duck.connect(hpf);
    hpf.connect(comp);
    comp.connect(limiter);
    limiter.connect(clip);
    clip.connect(ctx.destination);
    return { sfx: sfxBus, ui: uiBus, music: musicBus, duck };
  }

  /**
   * 다른 합성 모듈(말랑 만지기 소리 등)이 같은 AudioContext·효과음 설정을 쓰도록 효과음 버스를 빌려준다.
   * 첫 사용자 입력 전이거나 효과음이 꺼져 있으면 null.
   */
  getOutput(): { ctx: AudioContext; out: GainNode } | null {
    return this.ready('sfx');
  }

  /** 배경음악 버스. 첫 사용자 입력 전이거나 배경음악이 꺼져 있으면 null. */
  getMusicOutput(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.musicOn) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.graph) return null;
    return { ctx, out: this.graph.music };
  }

  /**
   * 배경음악을 seconds 동안 db만큼 낮춘다 (겹치면 더 깊고 긴 쪽을 따른다). 끝나면 천천히 돌아온다.
   * 팡파레·신화 연출 소리가 스스로 부르므로 화면 코드는 신경 쓰지 않아도 된다.
   */
  duck(seconds: number, db: number): void {
    const ctx = this.ctx;
    const node = this.graph?.duck;
    if (!ctx || !node) return;
    const now = ctx.currentTime;
    if (now >= this.duckEnd) this.duckLevel = 1;
    const level = Math.min(this.duckLevel, dbToGain(db));
    const end = Math.max(this.duckEnd, now + Math.max(0.1, seconds));
    const p = node.gain;
    const holdable = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
    if (typeof holdable.cancelAndHoldAtTime === 'function') {
      holdable.cancelAndHoldAtTime(now);
    } else {
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
    }
    p.setTargetAtTime(level, now, 0.03);
    p.setTargetAtTime(1, end, 0.4);
    this.duckLevel = level;
    this.duckEnd = end;
  }

  private ready(bus: SfxBus = 'sfx'): { ctx: AudioContext; out: GainNode } | null {
    if (!this.sfxOn) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.graph) return null;
    return { ctx, out: bus === 'ui' ? this.graph.ui : this.graph.sfx };
  }

  /** 같은 소리를 minGap초 안에 또 부르면 건너뛴다 (연타 시 쌓여서 찢어지는 것 방지). */
  private gate(key: string, minGap: number): boolean {
    const ctx = this.ctx;
    if (!ctx) return true;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < minGap && now >= last) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  /** 반복 피로를 줄이는 작은 변주: 음높이(센트)와 음량(dB) */
  private vary(cents: number, db = 1.5): { detune: number; gain: number } {
    return { detune: spread(cents, this.rand), gain: dbToGain(spread(db, this.rand)) };
  }

  private tone({ freq, duration, type = 'sine', gain = 0.3, delay = 0, slideTo, attack = 0.005, detune = 0, bus = 'sfx' }: ToneOptions) {
    const r = this.ready(bus);
    if (!r) return;
    const { ctx, out } = r;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (detune) osc.detune.setValueAtTime(detune, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private noise(duration: number, { delay = 0, gain = 0.2, freq = 2000, q = 1, bus = 'sfx' as SfxBus } = {}) {
    const r = this.ready(bus);
    if (!r) return;
    const { ctx, out } = r;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = duration > 0.45;
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
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
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

  /**
   * 폰 스피커에서도 들리는 "쿵".
   *  1) 사인 초저역 — 이어폰/큰 스피커에서 몸으로 느끼는 부분
   *  2) 같은 음을 포화시켜 만든 3·5·7배음 — 기음이 없어도 뇌가 낮은 음으로 채워 듣는다(잃어버린 기음)
   *  3) 150~400Hz 짧은 "노크" — 작은 스피커가 실제로 내는 타격감
   */
  private boom({ freq, slideTo, duration, gain, delay = 0, attack = 0.002 }: { freq: number; slideTo: number; duration: number; gain: number; delay?: number; attack?: number }) {
    this.tone({ freq, slideTo, duration, type: 'sine', gain: gain * 0.7, attack, delay });
    const r = this.ready();
    if (r) {
      const { ctx, out } = r;
      const t0 = ctx.currentTime + delay;
      if (!this.satCurve) this.satCurve = saturationCurve(5);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
      const drive = ctx.createGain();
      drive.gain.setValueAtTime(0.0001, t0);
      drive.gain.exponentialRampToValueAtTime(1, t0 + attack);
      drive.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.satCurve;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 160;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const post = ctx.createGain();
      post.gain.value = gain * 0.3;
      osc.connect(drive);
      drive.connect(shaper);
      shaper.connect(hp);
      hp.connect(lp);
      lp.connect(post);
      post.connect(out);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }
    this.knock(Math.min(380, Math.max(180, freq * 3.2)), gain * 0.45, delay);
  }

  /** 150~400Hz 대역의 짧은 타격음 (폰 스피커용 "퉁") */
  private knock(freq: number, gain: number, delay = 0) {
    this.tone({ freq, slideTo: freq * 0.5, duration: 0.09, type: 'triangle', gain, attack: 0.001, delay });
  }

  epicRiser(seconds: number) {
    const d = Math.max(0.3, seconds);
    this.duck(d + 1, -15);
    // 바람이 몰려드는 듯한 노이즈 스윕 + 반음씩 올라가는 두 겹 톱니파 + 낮은 웅웅거림
    this.sweep(d, { from: 180, to: 5200, gain: 0.32, q: 3 });
    this.tone({ freq: 110, slideTo: 440, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.8 });
    this.tone({ freq: 111.5, slideTo: 446, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.8 });
    this.tone({ freq: 55, duration: d, type: 'sine', gain: 0.18, attack: d * 0.5 });
    // 폰에서도 들리게: 웅웅거림의 2·4배음
    this.tone({ freq: 110, slideTo: 220, duration: d, type: 'triangle', gain: 0.12, attack: d * 0.6 });
    // 끝에 가까울수록 빨라지는 반짝임
    const ticks = 10;
    for (let i = 0; i < ticks; i++) {
      const at = d * (1 - (1 - i / ticks) ** 1.8);
      this.tone({ freq: 880 * 2 ** (i / 6), duration: 0.06, type: 'triangle', gain: 0.05, delay: at });
    }
  }

  epicImpact() {
    this.duck(3, -18);
    // 깊은 쿵 + 파열음 + 오래 남는 심벌 같은 치익
    this.boom({ freq: 90, slideTo: 32, duration: 0.9, gain: 0.85 });
    this.tone({ freq: 180, slideTo: 60, duration: 0.25, type: 'triangle', gain: 0.35, attack: 0.002 });
    this.noise(0.35, { freq: 700, gain: 0.6, q: 0.6 });
    this.sweep(1.6, { from: 9000, to: 3000, gain: 0.12, q: 0.8, delay: 0.02 });
  }

  epicImplode(seconds: number) {
    const d = Math.max(0.2, seconds);
    this.duck(d + 1.2, -18);
    // 거꾸로 감긴 바람 소리 — 높은 곳에서 바닥까지 빨려 내려가다 뚝 끊긴다
    this.sweep(d, { from: 7000, to: 140, gain: 0.34, q: 5 });
    this.tone({ freq: 520, slideTo: 55, duration: d, type: 'sine', gain: 0.22, attack: d * 0.3 });
    this.tone({ freq: 260, slideTo: 40, duration: d, type: 'sawtooth', gain: 0.05, attack: d * 0.3 });
  }

  secretBoom() {
    this.duck(4.5, -20);
    // 첫 폭발보다 낮고 긴 쿵 + 오래 남는 치익 + 높은 곳에서 퍼지는 장7화음 종소리
    this.boom({ freq: 62, slideTo: 22, duration: 1.8, gain: 0.9 });
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
    if (!this.gate('button', 0.03)) return;
    const v = this.vary(30);
    this.tone({ freq: 620, slideTo: 880, duration: 0.07, type: 'square', gain: 0.08 * v.gain, detune: v.detune, bus: 'ui' });
  }

  coin() {
    if (!this.gate('coin', 0.035)) return;
    // 음정은 배경음악과 어울리도록 거의 그대로, 음량만 조금 흔든다
    const v = this.vary(10);
    this.tone({ freq: NOTE.B5, duration: 0.08, type: 'square', gain: 0.1 * v.gain, detune: v.detune });
    this.tone({ freq: NOTE.E6, duration: 0.25, type: 'square', gain: 0.1 * v.gain, delay: 0.07, detune: v.detune });
  }

  capsuleInsert() {
    this.noise(0.05, { freq: 4000, gain: 0.25, q: 2 });
    this.tone({ freq: 240, slideTo: 90, duration: 0.18, type: 'triangle', gain: 0.35, delay: 0.03 });
    this.knock(300, 0.12, 0.03);
    this.tone({ freq: 1500, duration: 0.05, type: 'square', gain: 0.05, delay: 0.2 });
  }

  capsuleShake() {
    for (let i = 0; i < 4; i++) {
      const v = this.vary(40, 1);
      this.noise(0.07, { delay: i * 0.1, freq: 900 + i * 180, gain: 0.3 * v.gain, q: 4 });
      this.tone({ freq: 240 + (i % 2) * 50, duration: 0.06, type: 'triangle', gain: 0.12, delay: i * 0.1, detune: v.detune });
    }
  }

  capsuleOpen() {
    this.duck(0.8, -6);
    this.tone({ freq: 260, slideTo: 1100, duration: 0.14, type: 'sine', gain: 0.4 });
    this.noise(0.12, { freq: 6000, gain: 0.15, q: 0.8, delay: 0.02 });
    this.arpeggio([NOTE.C6, NOTE.E6, NOTE.G6], 0.04, { duration: 0.18, type: 'triangle', gain: 0.1, startDelay: 0.1 });
  }

  resultCommon() {
    this.duck(0.9, -5);
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5], 0.08, { duration: 0.2, type: 'triangle', gain: 0.22 });
  }

  resultRare() {
    this.duck(1.3, -7);
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08, { duration: 0.3, type: 'triangle', gain: 0.24 });
    this.arpeggio([NOTE.E6, NOTE.G6, NOTE.E6, NOTE.G6], 0.05, {
      duration: 0.12,
      type: 'sine',
      gain: 0.06,
      startDelay: 0.35,
    });
  }

  resultLegendary() {
    this.duck(2.4, -12);
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
    this.duck(1.8, -9);
    // 레어보다 한 단계 높은 반짝이는 상승 아르페지오 + 종소리
    this.arpeggio([NOTE.E5, NOTE.G5, NOTE.B5, NOTE.E6], 0.07, { duration: 0.28, type: 'triangle', gain: 0.22 });
    this.bell(NOTE.E6 * 2, 0.35, 0.8);
    this.bell(NOTE.B5 * 2, 0.45, 0.6);
  }

  resultMythic() {
    this.duck(3.2, -14);
    this.resultLegendary();
    // 무지개처럼 쏟아지는 하강·상승 반짝임
    const run = [NOTE.C6 * 2, NOTE.G6, NOTE.E6, NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C6 * 2, NOTE.E6 * 2];
    run.forEach((f, i) => this.bell(f, 0.9 + i * 0.07, 0.35));
  }

  resultSecret() {
    const r = this.ready();
    if (!r) return;
    this.duck(4.5, -16);
    // 1) 깊은 울림 (폰에서도 들리게 배음을 섞은 쿵)
    this.boom({ freq: 55, slideTo: 40, duration: 1.4, gain: 0.5, attack: 0.05 });
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
    this.duck(1.6, -12);
    // 낮게 웅웅거리다 멎는 소리 — "뭔가 이상하다"
    this.tone({ freq: 70, slideTo: 140, duration: 0.9, type: 'sawtooth', gain: 0.05, attack: 0.2 });
    this.tone({ freq: 71.5, slideTo: 143, duration: 0.9, type: 'sawtooth', gain: 0.05, attack: 0.2 });
    this.noise(0.9, { freq: 900, gain: 0.08, q: 6 });
  }

  shinyChime() {
    this.duck(1.2, -6);
    [NOTE.E6 * 2, NOTE.B5 * 2, NOTE.G6 * 2, NOTE.E6 * 2 * 1.5].forEach((f, i) => this.bell(f, i * 0.06, 0.4));
  }

  /** 맑은 종소리: 기음 + 비정수배 배음, 긴 감쇠 */
  private bell(freq: number, delay: number, level: number) {
    this.tone({ freq, duration: 0.9, type: 'sine', gain: 0.09 * level, delay, attack: 0.003 });
    this.tone({ freq: freq * 2.76, duration: 0.45, type: 'sine', gain: 0.035 * level, delay, attack: 0.003 });
    this.tone({ freq: freq * 5.4, duration: 0.2, type: 'sine', gain: 0.015 * level, delay, attack: 0.003 });
  }

  success() {
    this.duck(1.2, -6);
    this.arpeggio([NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 0.09, { duration: 0.22, type: 'square', gain: 0.08 });
  }

  fail() {
    this.duck(1.2, -6);
    this.tone({ freq: NOTE.E4, slideTo: 150, duration: 0.5, type: 'sawtooth', gain: 0.08 });
    this.tone({ freq: NOTE.C4, slideTo: 110, duration: 0.6, type: 'triangle', gain: 0.15, delay: 0.1 });
  }

  tap(level = 0) {
    if (!this.gate('tap', 0.02)) return;
    // 콤보가 오를수록 도-레-미-솔-라 사다리를 한 칸씩 (1.5옥타브에서 멈춤)
    const freq = comboPitch(level);
    const v = this.vary(15);
    this.tone({ freq, slideTo: freq * 1.5, duration: 0.07, type: 'sine', gain: 0.25 * v.gain, detune: v.detune });
    // 사다리 꼭대기를 넘으면 더 높은 음 대신 작은 반짝임을 얹는다
    if (comboOverflow(level)) this.bell(comboPitch(MAX_COMBO_STEP) * 2, 0.03, 0.35);
  }

  pickup() {
    if (!this.gate('pickup', 0.03)) return;
    const v = this.vary(10);
    this.tone({ freq: NOTE.E5, duration: 0.06, type: 'square', gain: 0.08 * v.gain, detune: v.detune });
    this.tone({ freq: NOTE.A5, duration: 0.12, type: 'square', gain: 0.08 * v.gain, delay: 0.05, detune: v.detune });
  }

  hit() {
    if (!this.gate('hit', 0.04)) return;
    const v = this.vary(30);
    this.noise(0.25, { freq: 400 * centsToRatio(v.detune), gain: 0.4 * v.gain, q: 0.7 });
    this.tone({ freq: 150, slideTo: 50, duration: 0.3, type: 'sawtooth', gain: 0.15 * v.gain, detune: v.detune });
    this.knock(260, 0.18 * v.gain);
  }

  countdown(final = false) {
    this.tone({ freq: final ? NOTE.A5 : NOTE.A4, duration: final ? 0.3 : 0.12, type: 'square', gain: 0.08 });
  }

  beat(accent = false) {
    // 킥 느낌의 저음 + 폰에서도 들리는 노크 + 짧은 클릭
    this.tone({ freq: accent ? 160 : 120, slideTo: 45, duration: 0.16, type: 'sine', gain: accent ? 0.5 : 0.36 });
    this.knock(accent ? 340 : 280, accent ? 0.2 : 0.14);
    this.noise(0.03, { freq: accent ? 5000 : 3500, gain: accent ? 0.18 : 0.1, q: 1.5 });
  }

  jump() {
    this.tone({ freq: 300, slideTo: 720, duration: 0.14, type: 'square', gain: 0.06 });
  }

  flip() {
    const v = this.vary(25);
    this.noise(0.05, { freq: 2600, gain: 0.18 * v.gain, q: 2 });
    this.tone({ freq: 520, slideTo: 640, duration: 0.05, type: 'triangle', gain: 0.08 * v.gain, detune: v.detune });
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
 * 사용자 입력에서 오디오를 잠금 해제·재개하는 리스너와 화면 숨김 처리를 설치한다.
 *  - capture 단계라 같은 입력의 click 핸들러보다 먼저 컨텍스트가 준비된다.
 *  - 첫 입력 뒤에도 계속 듣는다: iOS가 전화·앱 전환·화면 잠금 뒤 컨텍스트를 'interrupted'로 두면
 *    다음 터치에서 다시 깨워야 하기 때문이다 (running이면 아무것도 하지 않아 가볍다).
 *  - 화면이 숨겨지면 컨텍스트를 멈춰 배터리를 아낀다.
 * 반환값: 리스너 제거 함수.
 */
export function installAudioUnlock(
  engine: SfxEngine = sfx,
  target: Window = window,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  const events = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
  const handler = () => engine.unlock();
  events.forEach((e) => target.addEventListener(e, handler, { capture: true, passive: true }));
  const onVisibility = () => {
    if (doc) engine.setPageHidden(doc.visibilityState === 'hidden');
  };
  doc?.addEventListener('visibilitychange', onVisibility);
  const onPageHide = () => engine.setPageHidden(true);
  const onPageShow = () => onVisibility();
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  return () => {
    events.forEach((e) => target.removeEventListener(e, handler, { capture: true }));
    doc?.removeEventListener('visibilitychange', onVisibility);
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
  };
}
