/**
 * 말랑이 만지기 소리: 찰떡한 젤리/슬라임 ASMR 을 WebAudio 로 합성한다 (오디오 파일 없음).
 *
 * - AudioContext 는 직접 만들지 않고 `sfx.getOutput()` 을 빌린다.
 *   첫 사용자 입력 전이거나 음소거면 null → 아무것도 하지 않는다.
 * - 모든 소리는 엔벌로프로 시작/끝을 부드럽게 해 딸깍 소리를 막는다.
 * - 동시에 울리는 일회성 소리 수를 제한한다 (MAX_VOICES).
 * - 매번 파라미터를 조금씩 흔들어 같은 소리가 반복되지 않게 한다.
 *
 * 파라미터 계산은 순수 함수로 분리해 단위 테스트한다.
 *
 * 촉감(flavor)마다 맛이 다르다 (`FLAVOR_TONES`): 슬로우 라이징은 낮고 조용한 "푸슉", 탱탱 젤리는 높고 탱글한
 * "뾰잉", 쭉쭉이는 늘어날수록 올라가는 "쭈우욱", 찐득이는 축축한 거품 + 떼어낼 때 "쩍"(`peel`).
 * 촉감을 주지 않으면('plain') 예전 소리 그대로다.
 */
import type { MaterialId } from '../data/materials';
import { sfx } from './sfx';

export type Rand = () => number;

/** 소리 맛: 말랑이 촉감 또는 예전 기본 */
export type SquishFlavor = MaterialId | 'plain';

export interface FlavorTone {
  /** 음높이 배수 */
  pitch: number;
  /** 음량 배수 */
  gain: number;
  /** 밝기(필터) 배수 */
  bright: number;
  /** 기포 수·크기 배수 (찐득이는 축축하게 많이) */
  bubbles: number;
  /** 길이 배수 */
  length: number;
  /** 놓을 때 비브라토(출렁임) 깊이 배수 */
  wobble: number;
}

export const FLAVOR_TONES: Readonly<Record<SquishFlavor, FlavorTone>> = {
  plain: { pitch: 1, gain: 1, bright: 1, bubbles: 1, length: 1, wobble: 1 },
  slowRise: { pitch: 0.78, gain: 0.55, bright: 0.55, bubbles: 0.4, length: 1.5, wobble: 0.15 },
  jelly: { pitch: 1.45, gain: 1, bright: 1.35, bubbles: 1.2, length: 0.8, wobble: 1.5 },
  stretchy: { pitch: 1.05, gain: 0.95, bright: 1, bubbles: 0.8, length: 1.1, wobble: 1.2 },
  sticky: { pitch: 0.85, gain: 0.9, bright: 0.8, bubbles: 1.8, length: 1.25, wobble: 0.35 },
};

// ── 순수 헬퍼 ─────────────────────────────────────────────

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** base 를 ±amount 비율로 흔든다. rand 는 [0,1). */
export function jitter(base: number, amount: number, rand: Rand): number {
  return base * (1 + (rand() * 2 - 1) * amount);
}

/** a..b 사이 선형 보간 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 지수 감쇠 엔벌로프 값 (attack 은 선형). 테스트/시각화용 참조 구현이자
 * 소리 설계 시 decay 가 duration 안에 -60dB 로 떨어지는지 확인하는 데 쓴다.
 */
export function envelopeAt(t: number, attack: number, decayTau: number): number {
  if (t <= 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decayTau);
}

/** -60dB(0.001) 까지 떨어지는 데 걸리는 시간 */
export function decayTime(decayTau: number): number {
  return decayTau * Math.log(1000);
}

export interface Bubble {
  delay: number;
  freq: number;
  /** 끝 주파수 = freq * drop */
  drop: number;
  duration: number;
  gain: number;
}

export interface SquelchParams {
  duration: number;
  gain: number;
  /** 밴드패스 필터가 위에서 아래로 쓸려 내려간다 (젖은 "쮸왑") */
  filterStart: number;
  filterEnd: number;
  q: number;
  /** 두 번째 공명(모음 같은 질감) 비율 */
  formantRatio: number;
  thumpFreq: number;
  thumpGain: number;
  bubbles: Bubble[];
}

/** 눌림 소리에 촉감 맛을 입힌다 (순수) */
export function flavorSquelch(p: SquelchParams, flavor: SquishFlavor = 'plain'): SquelchParams {
  const t = FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain;
  if (t === FLAVOR_TONES.plain) return p;
  const extra = Math.max(0, Math.round((t.bubbles - 1) * p.bubbles.length));
  const bubbles = p.bubbles
    .slice(0, Math.max(1, Math.round(p.bubbles.length * Math.min(1, t.bubbles))))
    .concat(p.bubbles.slice(0, extra).map((b) => ({ ...b, delay: b.delay * 1.6 + 0.02, freq: b.freq * 0.8 })))
    .map((b) => ({ ...b, freq: b.freq * t.pitch, gain: Math.min(0.09, b.gain * t.gain) }));
  return {
    ...p,
    duration: p.duration * t.length,
    gain: Math.min(0.5, p.gain * t.gain),
    filterStart: p.filterStart * t.bright,
    filterEnd: p.filterEnd * Math.sqrt(t.bright),
    thumpFreq: p.thumpFreq * Math.sqrt(t.pitch),
    thumpGain: p.thumpGain * t.gain,
    bubbles,
  };
}

export function squelchParams(intensity: number, rand: Rand): SquelchParams {
  const i = clamp01(intensity);
  const count = 2 + Math.floor(rand() * 3) + Math.round(i); // 2..5
  const bubbles: Bubble[] = [];
  for (let n = 0; n < count; n++) {
    bubbles.push({
      delay: 0.03 + rand() * (0.12 + 0.1 * i),
      freq: lerp(700, 1900, rand()),
      drop: lerp(0.35, 0.6, rand()),
      duration: lerp(0.025, 0.055, rand()),
      gain: lerp(0.03, 0.07, rand()) * (0.6 + 0.4 * i),
    });
  }
  return {
    duration: jitter(0.2 + 0.14 * i, 0.12, rand),
    gain: (0.22 + 0.2 * i) * jitter(1, 0.1, rand),
    filterStart: jitter(1500 + 900 * i, 0.15, rand),
    filterEnd: jitter(260, 0.2, rand),
    q: jitter(4 + 3 * i, 0.2, rand),
    formantRatio: jitter(2.4, 0.12, rand),
    thumpFreq: jitter(115, 0.12, rand),
    thumpGain: 0.18 + 0.22 * i,
    bubbles,
  };
}

export interface StretchTargets {
  /** 끈적한 노이즈 층 볼륨 */
  noiseGain: number;
  /** 노이즈 밴드패스 중심 주파수 */
  cutoff: number;
  /** 낮은 삐걱임 음 볼륨 */
  toneGain: number;
  /** 삐걱임 음높이 */
  toneFreq: number;
  /** 끈적임(스틱-슬립) 떨림 속도 Hz */
  creakRate: number;
  /** 쭉쭉이 "쭈우욱" 고무 음 (0 이면 없음) — 늘어난 길이만큼 올라간다 */
  squeakGain: number;
  squeakFreq: number;
}

/**
 * 늘어난 정도(0..1)와 끄는 속도(0..1) → 늘림 소리 목표값.
 * length 는 기본 말랑 늘림 한계 대비 실제 길이 (쭉쭉이는 2 를 넘는다) — 쭉쭉이의 "쭈우욱" 음높이.
 */
export function stretchTargets(amount: number, speed: number, flavor: SquishFlavor = 'plain', length = 0): StretchTargets {
  const a = clamp01(amount);
  const s = clamp01(speed);
  const t = FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain;
  // 가만히 늘려 두면 조용하고, 빠르게 끌수록 크고 밝아진다
  const motion = 0.25 + 0.75 * s;
  const len = Number.isFinite(length) ? Math.max(0, Math.min(3, length)) : 0;
  const squeaky = flavor === 'stretchy';
  return {
    noiseGain: (0.02 + 0.14 * a) * motion * t.gain,
    cutoff: (350 + 1100 * a + 900 * s) * t.bright,
    toneGain: (0.015 + 0.06 * a) * (0.4 + 0.6 * s) * t.gain,
    toneFreq: (70 + 70 * a + 40 * s) * t.pitch,
    // 찐득이는 더 끈적하게(느리고 굵은 떨림)
    creakRate: (9 + 26 * s + 10 * a) * (flavor === 'sticky' ? 0.55 : 1),
    squeakGain: squeaky ? (0.012 + 0.05 * clamp01(len / 2.2)) * (0.35 + 0.65 * s) : 0,
    squeakFreq: squeaky ? 260 + 420 * len : 0,
  };
}

export interface ReleaseParams {
  duration: number;
  gain: number;
  baseFreq: number;
  endFreq: number;
  /** 비브라토 깊이 (Hz) — 시간에 따라 감쇠 */
  vibratoDepth: number;
  vibratoRate: number;
  slapGain: number;
}

/** 놓는 소리에 촉감 맛을 입힌다 (순수) */
export function flavorRelease(p: ReleaseParams, flavor: SquishFlavor = 'plain'): ReleaseParams {
  const t = FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain;
  if (t === FLAVOR_TONES.plain) return p;
  return {
    ...p,
    duration: p.duration * t.length,
    gain: p.gain * t.gain,
    baseFreq: p.baseFreq * t.pitch,
    endFreq: p.endFreq * t.pitch * (flavor === 'slowRise' ? 0.9 : 1),
    vibratoDepth: p.vibratoDepth * t.pitch * t.wobble,
    slapGain: p.slapGain * t.gain * (flavor === 'sticky' ? 1.4 : 1),
  };
}

export function releaseParams(intensity: number, rand: Rand, wobbleRateHz = 6): ReleaseParams {
  const i = clamp01(intensity);
  const base = jitter(lerp(210, 150, i), 0.08, rand);
  return {
    duration: 0.35 + 0.35 * i,
    gain: 0.1 + 0.18 * i,
    baseFreq: base,
    endFreq: base * 0.72,
    vibratoDepth: base * (0.12 + 0.2 * i),
    vibratoRate: jitter(wobbleRateHz, 0.06, rand),
    slapGain: 0.08 + 0.18 * i,
  };
}

// ── 오디오 그래프 ─────────────────────────────────────────

const MAX_VOICES = 8;
let activeVoices = 0;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
let rand: Rand = Math.random;

/** 테스트용: 난수 교체 */
export function setSquishRandom(r: Rand): void {
  rand = r;
}

/** 테스트/디버그용: 현재 사용 중인 일회성 소리 수 */
export function activeVoiceCount(): number {
  return activeVoices;
}

function output(): { ctx: AudioContext; out: GainNode } | null {
  try {
    const r = sfx.getOutput();
    if (!r || r.ctx.state === 'closed') return null;
    return r;
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (buf) return buf;
  // 1초짜리 "갈색 기운" 노이즈: 흰 노이즈를 살짝 적분해 고음을 줄여 축축한 질감
  const len = Math.max(1, Math.floor(ctx.sampleRate));
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let n = 0; n < len; n++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.55 + white * 0.45;
    data[n] = last * 1.6;
  }
  noiseBuffers.set(ctx, buf);
  return buf;
}

/**
 * 일회성 소리 슬롯을 잡는다. 꽉 차면 null → 그 소리는 건너뛴다.
 * 반환된 함수는 duration 뒤 슬롯을 돌려준다.
 */
function takeVoice(duration: number): boolean {
  if (activeVoices >= MAX_VOICES) return false;
  activeVoices++;
  setTimeout(
    () => {
      activeVoices = Math.max(0, activeVoices - 1);
    },
    Math.ceil(duration * 1000) + 60,
  );
  return true;
}

/** 0에서 시작해 attack 뒤 peak, 이후 end 시각에 거의 0 으로 지수 감쇠 */
function envelope(param: AudioParam, t0: number, attack: number, peak: number, end: number) {
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, end);
}

function noiseSource(ctx: AudioContext, t0: number, duration: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  const buf = noiseBuffer(ctx);
  src.buffer = buf;
  src.loop = true;
  // 버퍼의 임의 위치에서 시작해 매번 다른 결
  src.start(t0, rand() * Math.max(0.01, buf.duration - 0.01));
  src.stop(t0 + duration + 0.05);
  return src;
}

/** 빠르게 음이 떨어지는 작은 기포 */
function bubble(ctx: AudioContext, out: AudioNode, t0: number, b: Bubble) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  const t = t0 + b.delay;
  osc.frequency.setValueAtTime(b.freq, t);
  osc.frequency.exponentialRampToValueAtTime(b.freq * b.drop, t + b.duration);
  envelope(env.gain, t, 0.003, b.gain, t + b.duration);
  osc.connect(env);
  env.connect(out);
  osc.start(t);
  osc.stop(t + b.duration + 0.03);
}

/** 짧은 저음 "퉁" */
function thump(ctx: AudioContext, out: AudioNode, t0: number, freq: number, gain: number, duration = 0.14) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + duration);
  envelope(env.gain, t0, 0.008, gain, t0 + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
  // 폰 스피커는 ~200Hz 아래를 거의 못 낸다 → 3배음 "톡"을 짧게 얹어 작은 스피커에서도 퉁 소리가 느껴지게
  const knock = ctx.createOscillator();
  const kEnv = ctx.createGain();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime(freq * 3, t0);
  knock.frequency.exponentialRampToValueAtTime(freq * 1.6, t0 + duration * 0.5);
  envelope(kEnv.gain, t0, 0.003, gain * 0.3, t0 + duration * 0.5);
  knock.connect(kEnv);
  kEnv.connect(out);
  knock.start(t0);
  knock.stop(t0 + duration * 0.5 + 0.03);
}

/** 짧은 젖은 "찰싹" (밴드패스 노이즈) */
function slap(ctx: AudioContext, out: AudioNode, t0: number, gain: number, freq = 900, duration = 0.07) {
  const src = noiseSource(ctx, t0, duration);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq * 1.6, t0);
  bp.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + duration);
  bp.Q.value = 1.2;
  const env = ctx.createGain();
  envelope(env.gain, t0, 0.004, gain, t0 + duration);
  src.connect(bp);
  bp.connect(env);
  env.connect(out);
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // 오디오 그래프 오류로 화면이 멈추지 않게 한다
  }
}

// ── 공개 API ─────────────────────────────────────────────

/** 꾹 누를 때: 젖은 "쮸왑" + 부드러운 퉁 + 작은 기포 터짐 */
export function squishPress(intensity = 0.6, flavor: SquishFlavor = 'plain'): void {
  const o = output();
  if (!o) return;
  const p = flavorSquelch(squelchParams(intensity, rand), flavor);
  if (!takeVoice(p.duration + 0.3)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const src = noiseSource(ctx, t0, p.duration);

    // 주 공명: 위에서 아래로 쓸어내리는 밴드패스
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = p.q;
    bp.frequency.setValueAtTime(p.filterStart, t0);
    bp.frequency.exponentialRampToValueAtTime(p.filterEnd, t0 + p.duration);
    // 두 번째 공명: 입 모양이 바뀌는 듯한 질감
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.Q.value = p.q * 1.4;
    bp2.frequency.setValueAtTime(p.filterStart * p.formantRatio, t0);
    bp2.frequency.exponentialRampToValueAtTime(p.filterEnd * p.formantRatio, t0 + p.duration * 0.8);
    const g2 = ctx.createGain();
    g2.gain.value = 0.45;

    const env = ctx.createGain();
    envelope(env.gain, t0, 0.012, p.gain, t0 + p.duration);
    // 밴드패스 뒤 음량이 작아지므로 보정
    const makeup = ctx.createGain();
    makeup.gain.value = 2.2;

    src.connect(bp);
    src.connect(bp2);
    bp.connect(env);
    bp2.connect(g2);
    g2.connect(env);
    env.connect(makeup);
    makeup.connect(out);

    thump(ctx, out, t0, p.thumpFreq, p.thumpGain);
    for (const b of p.bubbles) bubble(ctx, out, t0, b);
  });
}

export interface StretchHandle {
  /** amount: 늘어난 정도 0..1, speed: 끄는 속도 0..1, length: 기본 대비 늘어난 길이 (쭉쭉이 음높이) */
  update(amount: number, speed: number, length?: number): void;
  /** 딸깍 없이 페이드아웃. 여러 번 불러도 안전하다. */
  stop(): void;
}

const NOOP_STRETCH: StretchHandle = { update() {}, stop() {} };

/**
 * 쭉 늘릴 때의 끈적하고 삐걱이는 연속음.
 * 노이즈(밴드패스) + 낮은 삼각파를 스틱-슬립 LFO 로 떨리게 하고,
 * 빠르게 끌면 가끔 작은 "쩍" 소리(떨어지는 실)를 더한다.
 */
export function startStretch(flavor: SquishFlavor = 'plain'): StretchHandle {
  const o = output();
  if (!o) return NOOP_STRETCH;
  const { ctx, out } = o;
  let stopped = false;
  let lastPop = 0;
  const nodes: { stop(when?: number): void }[] = [];

  try {
    const t0 = ctx.currentTime + 0.005;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.setTargetAtTime(1, t0, 0.03);
    master.connect(out);

    // 끈적한 노이즈 층
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.value = 500;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    // 스틱-슬립 떨림: 톱니 LFO 가 노이즈 볼륨을 주기적으로 뚝뚝 끊는다
    const creakGain = ctx.createGain();
    creakGain.gain.value = 0.5; // 기본 0.5 ± LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 12;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(creakGain.gain);

    src.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(creakGain);
    creakGain.connect(master);

    // 낮은 삐걱임 음: 삼각파 → 로우패스, 음높이가 LFO 로 살짝 흔들림
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 90;
    const toneLp = ctx.createBiquadFilter();
    toneLp.type = 'lowpass';
    toneLp.frequency.value = 420;
    toneLp.Q.value = 3;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0;
    const vib = ctx.createGain();
    vib.gain.value = 6;
    lfo.connect(vib);
    vib.connect(tone.frequency);
    tone.connect(toneLp);
    toneLp.connect(toneGain);
    toneGain.connect(master);

    src.start(t0, rand() * 0.5);
    lfo.start(t0);
    tone.start(t0);
    nodes.push(src, lfo, tone);

    // 쭉쭉이: 늘어날수록 올라가는 고무 "쭈우욱" (사인 + 약한 3배음, 스틱-슬립으로 살짝 떨림)
    let squeak: OscillatorNode | null = null;
    let squeakGain: GainNode | null = null;
    if (flavor === 'stretchy') {
      squeak = ctx.createOscillator();
      squeak.type = 'triangle';
      squeak.frequency.value = 260;
      squeakGain = ctx.createGain();
      squeakGain.gain.value = 0;
      const sqVib = ctx.createGain();
      sqVib.gain.value = 14;
      lfo.connect(sqVib);
      sqVib.connect(squeak.frequency);
      squeak.connect(squeakGain);
      squeakGain.connect(master);
      squeak.start(t0);
      nodes.push(squeak);
    }

    const handle: StretchHandle = {
      update(amount, speed, length = 0) {
        if (stopped) return;
        safe(() => {
          const now = ctx.currentTime;
          const tg = stretchTargets(amount, speed, flavor, length);
          noiseGain.gain.setTargetAtTime(tg.noiseGain, now, 0.05);
          bp.frequency.setTargetAtTime(tg.cutoff, now, 0.06);
          toneGain.gain.setTargetAtTime(tg.toneGain, now, 0.06);
          tone.frequency.setTargetAtTime(tg.toneFreq, now, 0.08);
          lfo.frequency.setTargetAtTime(tg.creakRate, now, 0.1);
          if (squeak && squeakGain) {
            squeakGain.gain.setTargetAtTime(tg.squeakGain, now, 0.06);
            squeak.frequency.setTargetAtTime(tg.squeakFreq, now, 0.07);
          }
          // 빠르게 당기면 가끔 실이 끊기는 듯한 작은 쩍 소리
          const s = clamp01(speed);
          if (s > 0.35 && now - lastPop > 0.09 && rand() < s * 0.35) {
            lastPop = now;
            bubble(ctx, master, now, {
              delay: 0,
              freq: lerp(900, 2200, rand()),
              drop: 0.45,
              duration: 0.03,
              gain: 0.025 + 0.035 * clamp01(amount),
            });
          }
        });
      },
      stop() {
        if (stopped) return;
        stopped = true;
        safe(() => {
          const now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
          master.gain.setTargetAtTime(0, now, 0.045);
          for (const n of nodes) n.stop(now + 0.35);
        });
        // 연결 해제는 페이드가 끝난 뒤
        setTimeout(() => safe(() => master.disconnect()), 450);
      },
    };
    return handle;
  } catch {
    stopped = true;
    safe(() => nodes.forEach((n) => n.stop()));
    return NOOP_STRETCH;
  }
}

/**
 * 놓았을 때: 비브라토가 점점 잦아드는 "뾰잉~" + 작은 찰싹.
 * wobbleRateHz 로 화면의 출렁임과 비브라토 속도를 맞출 수 있다.
 */
export function squishRelease(intensity = 0.6, wobbleRateHz?: number, flavor: SquishFlavor = 'plain'): void {
  const o = output();
  if (!o) return;
  const p = flavorRelease(releaseParams(intensity, rand, wobbleRateHz), flavor);
  if (!takeVoice(p.duration + 0.1)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const end = t0 + p.duration;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.baseFreq * 1.15, t0);
    osc.frequency.exponentialRampToValueAtTime(p.endFreq, end);

    // 감쇠하는 비브라토
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = p.vibratoRate;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(p.vibratoDepth, t0);
    depth.gain.exponentialRampToValueAtTime(Math.max(0.5, p.vibratoDepth * 0.05), end);
    lfo.connect(depth);
    depth.connect(osc.frequency);

    // 살짝 두툼하게: 한 옥타브 위 배음을 약하게
    const over = ctx.createOscillator();
    over.type = 'triangle';
    over.frequency.setValueAtTime(p.baseFreq * 2.3, t0);
    over.frequency.exponentialRampToValueAtTime(p.endFreq * 2, end);
    depth.connect(over.frequency);
    const overGain = ctx.createGain();
    overGain.gain.value = 0.18;

    const env = ctx.createGain();
    envelope(env.gain, t0, 0.015, p.gain, end);
    osc.connect(env);
    over.connect(overGain);
    overGain.connect(env);
    env.connect(out);

    osc.start(t0);
    over.start(t0);
    lfo.start(t0);
    osc.stop(end + 0.05);
    over.stop(end + 0.05);
    lfo.stop(end + 0.05);

    slap(ctx, out, t0, p.slapGain, jitter(1000, 0.15, rand));
  });
}

/** 콕 찌를 때: 귀여운 "뽁" (촉감에 따라 높낮이·크기) */
export function poke(strength = 0.6, flavor: SquishFlavor = 'plain'): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.15)) return;
  const s = clamp01(strength) * (FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain).gain;
  const pitch = (FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain).pitch;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    const start = jitter(330 * pitch, 0.1, rand);
    const peak = jitter((1050 + 250 * s) * pitch, 0.08, rand);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(start, t0);
    osc.frequency.exponentialRampToValueAtTime(peak, t0 + 0.035);
    osc.frequency.exponentialRampToValueAtTime(peak * 0.8, t0 + 0.09);
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.004, 0.2 + 0.12 * s, t0 + 0.1);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.13);
    // 입술 떨어지는 듯한 작은 클릭
    slap(ctx, out, t0, 0.06 + 0.05 * s, 2600, 0.025);
  });
}

/** 간질일 때: "히히히" 같은 짧은 웃음 */
export function giggle(): void {
  const o = output();
  if (!o) return;
  const count = 3 + Math.floor(rand() * 2);
  if (!takeVoice(count * 0.09 + 0.1)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const base = jitter(760, 0.08, rand);
    for (let n = 0; n < count; n++) {
      const t = t0 + n * jitter(0.085, 0.1, rand);
      const f = base * (1 - n * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f * 1.12, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.86, t + 0.06);
      const env = ctx.createGain();
      envelope(env.gain, t, 0.008, 0.09, t + 0.065);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  });
}

/** 애정 레벨 업: 짧고 귀여운 "삐릿" */
export function happy(): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.4)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const chirps: [number, number, number][] = [
      [0, 880, 1320],
      [0.11, 1175, 1760],
      [0.22, 1320, 2090],
    ];
    for (const [d, from, to] of chirps) {
      const t = t0 + d;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + 0.07);
      const env = ctx.createGain();
      envelope(env.gain, t, 0.006, 0.13, t + 0.12);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  });
}

// ── 등급별 방울 소리 (만지기) ──────────────────────────────

/** 등급별 방울 층 (data/rarity.ts 의 TouchChime 과 같은 이름) */
export type ChimeKind = 'none' | 'ping' | 'sparkle' | 'bell' | 'celestial' | 'heavenly';

export interface ChimeNote {
  delay: number;
  freq: number;
  duration: number;
  gain: number;
  /** 종처럼 어긋난 배음 비율 (1 = 기본음) */
  partials: readonly number[];
}

/** 장조 5음 음계 (연달아 찌를수록 한 칸씩 오른다) */
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2] as const;
/** 음계 사다리 상한 (1옥타브) */
export const CHIME_MAX_STEP = PENTA.length - 1;

interface ChimeRecipe {
  base: number;
  notes: number;
  spacing: number;
  duration: number;
  gain: number;
  partials: readonly number[];
}

const CHIME_RECIPES: Record<Exclude<ChimeKind, 'none'>, ChimeRecipe> = {
  // 레어: 작은 "띵" 하나
  ping: { base: 1568, notes: 1, spacing: 0, duration: 0.22, gain: 0.045, partials: [1, 2.76] },
  // 에픽: 두 음 반짝
  sparkle: { base: 1319, notes: 2, spacing: 0.055, duration: 0.3, gain: 0.05, partials: [1, 2, 3.1] },
  // 전설: 금종 세 음
  bell: { base: 1047, notes: 3, spacing: 0.06, duration: 0.55, gain: 0.055, partials: [1, 2.76, 5.4] },
  // 신화: 맑은 종 + 한 옥타브 위 울림
  celestial: { base: 880, notes: 3, spacing: 0.07, duration: 0.75, gain: 0.055, partials: [1, 2, 2.76, 4.1] },
  // 시크릿: 천상의 종 (반짝 울림은 shimmer 가 따로)
  heavenly: { base: 784, notes: 4, spacing: 0.07, duration: 0.9, gain: 0.05, partials: [1, 2, 3, 4.2] },
};

/**
 * 방울 음들 (순수). step = 연달아 찌른 횟수(0부터) → 음계 사다리, fanfare = 애정 단계 축하(음 두 개 더, 느리게).
 */
export function chimeNotes(kind: ChimeKind, step: number, r: Rand, fanfare = false): ChimeNote[] {
  if (kind === 'none') return [];
  const rec = CHIME_RECIPES[kind];
  const s = Math.max(0, Math.min(CHIME_MAX_STEP, Math.floor(Number.isFinite(step) ? step : 0)));
  const count = rec.notes + (fanfare ? 2 : 0);
  const spacing = fanfare ? Math.max(0.08, rec.spacing * 1.6) : rec.spacing;
  const notes: ChimeNote[] = [];
  for (let n = 0; n < count; n++) {
    // 위로 올라가는 아르페지오: 음계 한 칸씩 (음계 끝을 넘으면 한 옥타브 위 첫 음부터)
    const k = s + n;
    const ratio = k < PENTA.length ? (PENTA[k] ?? 1) : 2 * (PENTA[k - PENTA.length + 1] ?? 1);
    notes.push({
      delay: n * spacing,
      freq: jitter(rec.base * ratio, 0.01, r),
      duration: rec.duration * (fanfare ? 1.3 : 1),
      gain: rec.gain * (n === count - 1 ? 1 : 0.8),
      partials: rec.partials,
    });
  }
  return notes;
}

/** 같은 소리 연타 간격 제한 (초). 순수 헬퍼 */
export function chimeGate(now: number, last: number, minGap: number): boolean {
  return !(now - last < minGap);
}

/** 방울 소리 최소 간격 — 빠르게 연타해도 어수선하지 않게 */
export const CHIME_MIN_GAP = 0.11;
/** 시크릿 천상의 반짝 울림 최소 간격 */
export const SHIMMER_MIN_GAP = 1.6;
const MAX_CHIME_VOICES = 3;
let chimeVoices = 0;
let lastChimeAt = -Infinity;
let lastShimmerAt = -Infinity;

function takeChimeVoice(duration: number): boolean {
  if (chimeVoices >= MAX_CHIME_VOICES) return false;
  chimeVoices++;
  setTimeout(
    () => {
      chimeVoices = Math.max(0, chimeVoices - 1);
    },
    Math.ceil(duration * 1000) + 60,
  );
  return true;
}

function bellTone(ctx: AudioContext, out: AudioNode, t0: number, note: ChimeNote) {
  const t = t0 + note.delay;
  note.partials.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq * ratio, t);
    // 높은 배음일수록 작고 빨리 사라진다 (종소리)
    const dur = note.duration / (1 + i * 0.8);
    envelope(env.gain, t, 0.004, note.gain / (1 + i * 1.6), t + dur);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  });
}

/**
 * 등급별 방울 소리를 젤리 소리 위에 얹는다. kind 'none' 이고 반짝이 아니면 아무것도 하지 않는다.
 * 최소 간격(CHIME_MIN_GAP)보다 빠른 연타는 건너뛴다. 시크릿(heavenly)은 가끔 천상의 반짝 울림도 더한다.
 */
export function chime(kind: ChimeKind, step = 0, opts: { fanfare?: boolean; shiny?: boolean } = {}): void {
  if (kind === 'none' && !opts.shiny) return;
  const o = output();
  if (!o) return;
  const now = o.ctx.currentTime;
  if (!opts.fanfare && !chimeGate(now, lastChimeAt, CHIME_MIN_GAP)) return;
  const notes = chimeNotes(kind, step, rand, opts.fanfare);
  if (opts.shiny) {
    // 반짝: 맨 끝에 아주 높은 반짝 한 음
    const last = notes[notes.length - 1];
    notes.push({
      delay: (last?.delay ?? 0) + 0.05,
      freq: jitter(3136, 0.02, rand),
      duration: 0.25,
      gain: 0.025,
      partials: [1, 2.4],
    });
  }
  if (notes.length === 0) return;
  const length = Math.max(...notes.map((n) => n.delay + n.duration));
  if (!takeChimeVoice(length)) return;
  lastChimeAt = now;
  safe(() => {
    const t0 = o.ctx.currentTime + 0.01;
    for (const n of notes) bellTone(o.ctx, o.out, t0, n);
  });
  if (kind === 'heavenly' && (opts.fanfare || chimeGate(now, lastShimmerAt, SHIMMER_MIN_GAP))) {
    lastShimmerAt = now;
    shimmer();
  }
}

/** 시크릿: 부드러운 천상의 반짝 울림 (높은 사인파 여럿이 천천히 피었다 사라진다) */
export function shimmer(): void {
  const o = output();
  if (!o) return;
  const dur = 1.4;
  if (!takeChimeVoice(dur)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.01;
    const bus = ctx.createGain();
    envelope(bus.gain, t0, 0.35, 1, t0 + dur);
    bus.connect(out);
    // 떨림(트레몰로)으로 반짝이는 느낌
    const lfo = ctx.createOscillator();
    lfo.frequency.value = jitter(7, 0.1, rand);
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    const trem = ctx.createGain();
    trem.gain.value = 0.65;
    lfo.connect(depth);
    depth.connect(trem.gain);
    trem.connect(bus);
    for (const f of [2093, 2637, 3136, 3951, 4186]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(jitter(f, 0.004, rand), t0);
      const g = ctx.createGain();
      g.gain.value = 0.014;
      osc.connect(g);
      g.connect(trem);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    setTimeout(() => safe(() => bus.disconnect()), (dur + 0.3) * 1000);
  });
}

// ── 반응 소리 (만지기) ─────────────────────────────────────

/** 짧은 사인 글라이드 한 음 (공용) */
function glide(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  envelope(env.gain, t, Math.min(0.02, dur * 0.2), gain, t + dur);
  osc.connect(env);
  env.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

const lastReaction: Record<string, number> = {};

/** 같은 반응 소리 연타 제한 */
function gated(name: string, ctx: AudioContext, gap: number): boolean {
  const now = ctx.currentTime;
  if (!chimeGate(now, lastReaction[name] ?? -Infinity, gap)) return false;
  lastReaction[name] = now;
  return true;
}

/**
 * 머리 쓰다듬기: 고양이 가르랑 같은 부드러운 "르르르" (폰 스피커에서도 들리게 200Hz 위 대역 노이즈를 22Hz 로 떨게 한다)
 */
export function purr(): void {
  const o = output();
  if (!o || !gated('purr', o.ctx, 0.9)) return;
  const dur = 0.85;
  if (!takeVoice(dur)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const src = noiseSource(ctx, t0, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = jitter(320, 0.1, rand);
    lp.Q.value = 1.4;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = jitter(23, 0.08, rand);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(trem.gain);
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.12, 0.35, t0 + dur);
    src.connect(lp);
    lp.connect(trem);
    trem.connect(env);
    env.connect(out);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    // 기분 좋은 "음~" 허밍
    glide(ctx, out, t0 + 0.05, jitter(330, 0.05, rand), 300, dur * 0.8, 0.035, 'triangle');
  });
}

/** 하품: "하아암~" (올라갔다 내려오는 모음 + 숨소리) */
export function yawn(): void {
  const o = output();
  if (!o || !gated('yawn', o.ctx, 2)) return;
  const dur = 1.1;
  if (!takeVoice(dur)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t0);
    osc.frequency.exponentialRampToValueAtTime(420, t0 + dur * 0.35);
    osc.frequency.exponentialRampToValueAtTime(210, t0 + dur);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(800, t0);
    formant.frequency.exponentialRampToValueAtTime(1100, t0 + dur * 0.4);
    formant.frequency.exponentialRampToValueAtTime(600, t0 + dur);
    formant.Q.value = 2;
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.18, 0.16, t0 + dur);
    osc.connect(formant);
    formant.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    // 숨소리
    slap(ctx, out, t0 + 0.05, 0.05, 1400, dur * 0.7);
  });
}

/** 깜짝 놀라 깰 때: "뿅!" */
export function surprised(): void {
  const o = output();
  if (!o || !gated('surprised', o.ctx, 0.5)) return;
  if (!takeVoice(0.25)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    glide(ctx, out, t0, 520, 1560, 0.12, 0.16);
    glide(ctx, out, t0 + 0.1, 1400, 1700, 0.1, 0.08, 'triangle');
  });
}

/** 깔깔 웃음: 짧은 웃음 두 번, 두 번째가 더 높다 */
export function laugh(): void {
  const o = output();
  if (!o || !gated('laugh', o.ctx, 0.8)) return;
  const count = 6;
  if (!takeVoice(count * 0.08 + 0.15)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const base = jitter(820, 0.06, rand);
    for (let n = 0; n < count; n++) {
      const t = t0 + n * 0.075 + (n >= 3 ? 0.06 : 0);
      const f0 = base * (n >= 3 ? 1.12 : 1) * (1 - (n % 3) * 0.05);
      glide(ctx, out, t, f0 * 1.15, f0 * 0.85, 0.06, 0.09, 'triangle');
    }
  });
}

/** 빙글빙글: 내려가며 흔들리는 "삐요요요~" */
export function dizzy(): void {
  const o = output();
  if (!o || !gated('dizzy', o.ctx, 1)) return;
  const dur = 0.9;
  if (!takeVoice(dur)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t0);
    osc.frequency.exponentialRampToValueAtTime(500, t0 + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 120;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.02, 0.1, t0 + dur);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
  });
}

/** 애교 점프: 위로 "뾰롱" + 착지 "퐁" */
export function jump(): void {
  const o = output();
  if (!o || !gated('jump', o.ctx, 0.5)) return;
  if (!takeVoice(0.55)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    glide(ctx, out, t0, 400, 1200, 0.18, 0.15);
    glide(ctx, out, t0 + 0.08, 800, 2000, 0.14, 0.05, 'triangle');
    thump(ctx, out, t0 + 0.42, 140, 0.2, 0.1);
  });
}

/** 사진 찍기: 기계식 셔터 "찰-칵" */
export function shutter(): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.2)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    slap(ctx, out, t0, 0.22, 3200, 0.03);
    slap(ctx, out, t0 + 0.085, 0.3, 2200, 0.05);
    thump(ctx, out, t0 + 0.085, 220, 0.08, 0.05);
  });
}

// ── 놀이방: 착지·부딪힘·캡슐 ─────────────────────────────────

/** 매트에 떨어져 철퍽 내려앉는 소리. strength 0..1 (떨어진 속도). 찐득이는 더 축축하게, 젤리는 높게 */
export function land(strength = 0.6, flavor: SquishFlavor = 'plain'): void {
  const o = output();
  if (!o || !gated('land', o.ctx, 0.07)) return;
  if (!takeVoice(0.2)) return;
  const s = clamp01(strength);
  const t = FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    thump(ctx, out, t0, jitter((170 + 60 * s) * Math.sqrt(t.pitch), 0.1, rand), (0.1 + 0.16 * s) * t.gain, 0.12);
    slap(ctx, out, t0, (0.05 + 0.12 * s) * t.gain * (flavor === 'sticky' ? 1.5 : 1), jitter(850 * t.bright, 0.15, rand), (0.06 + 0.03 * s) * t.length);
  });
}

/** 말랑이끼리 툭 부딪힘: 작고 높은 "뽀용" */
export function bump(strength = 0.5, flavor: SquishFlavor = 'plain'): void {
  const o = output();
  if (!o || !gated('bump', o.ctx, 0.09)) return;
  if (!takeVoice(0.16)) return;
  const s = clamp01(strength);
  const t = FLAVOR_TONES[flavor] ?? FLAVOR_TONES.plain;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    const f = jitter((520 + 200 * s) * t.pitch, 0.12, rand);
    glide(ctx, out, t0, f, f * 1.35, 0.07, (0.05 + 0.08 * s) * t.gain);
    slap(ctx, out, t0, 0.03 + 0.05 * s, 1400 * t.bright, 0.03);
  });
}

// ── 촉감·말랑이끼리 ───────────────────────────────────────

/** 찐득이를 떼어낼 때: 끈적한 "쩍" (높은 젖은 딱 + 내려가는 실 + 작은 거품 터짐). strength 0..1 */
export function peel(strength = 0.6): void {
  const o = output();
  if (!o || !gated('peel', o.ctx, 0.12)) return;
  if (!takeVoice(0.3)) return;
  const s = clamp01(strength);
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    slap(ctx, out, t0, 0.14 + 0.16 * s, jitter(2600, 0.12, rand), 0.03);
    slap(ctx, out, t0 + 0.015, 0.08 + 0.08 * s, jitter(1200, 0.15, rand), 0.07);
    glide(ctx, out, t0 + 0.01, jitter(900, 0.1, rand), 240, 0.12 + 0.06 * s, 0.06 + 0.05 * s, 'triangle');
    for (let i = 0; i < 2 + Math.round(2 * s); i++) {
      bubble(ctx, out, t0, {
        delay: 0.04 + rand() * 0.12,
        freq: lerp(900, 1900, rand()),
        drop: 0.5,
        duration: 0.035,
        gain: 0.03 + 0.03 * s,
      });
    }
  });
}

/** 슬로우 라이징이 천천히 차오를 때: 아주 작은 공기 "스으으" (길이 = 차오르는 시간, 초) */
export function riseSigh(duration = 1.6): void {
  const o = output();
  if (!o || !gated('rise', o.ctx, 1.2)) return;
  const dur = Math.max(0.5, Math.min(3, Number.isFinite(duration) ? duration : 1.6));
  if (!takeVoice(dur)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.01;
    const src = noiseSource(ctx, t0, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.035, t0 + dur * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(env);
    env.connect(out);
  });
}

/** 볼 비비기: 뽀득뽀득 문지르는 소리 + 기분 좋은 "으음~" */
export function cheekRub(): void {
  const o = output();
  if (!o || !gated('cheekRub', o.ctx, 0.9)) return;
  if (!takeVoice(0.9)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.13;
      const f = jitter(i % 2 ? 1500 : 1250, 0.06, rand);
      glide(ctx, out, t, f, f * 1.25, 0.06, 0.035, 'triangle');
      slap(ctx, out, t, 0.04, 2200, 0.04);
    }
    glide(ctx, out, t0 + 0.1, jitter(420, 0.05, rand), 520, 0.5, 0.05, 'triangle');
    glide(ctx, out, t0 + 0.12, jitter(630, 0.05, rand), 780, 0.45, 0.03);
  });
}

/** 위에 누가 올라타 눌린 말랑이: 낮고 짧은 "끙" */
export function groan(): void {
  const o = output();
  if (!o || !gated('groan', o.ctx, 0.8)) return;
  if (!takeVoice(0.4)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(jitter(300, 0.05, rand), t0);
    osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.3);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 700;
    formant.Q.value = 2.5;
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.03, 0.2, t0 + 0.32);
    osc.connect(formant);
    formant.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.36);
    thump(ctx, out, t0, 150, 0.08, 0.1);
  });
}

/** 탱탱 젤리끼리 튕겨 나갈 때: 높은 "뾰잉~" (strength 0..1) */
export function boing(strength = 0.6): void {
  const o = output();
  if (!o || !gated('boing', o.ctx, 0.15)) return;
  if (!takeVoice(0.45)) return;
  const s = clamp01(strength);
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = jitter(420 + 180 * s, 0.08, rand);
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 2.2, t0 + 0.08);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + 0.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.value = f * 0.12;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const env = ctx.createGain();
    envelope(env.gain, t0, 0.008, 0.1 + 0.08 * s, t0 + 0.4);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + 0.43);
    lfo.stop(t0 + 0.43);
  });
}


/** 캡슐을 비틀 때 톱니 "딱" (작게) */
export function capsuleTick(): void {
  const o = output();
  if (!o || !gated('capTick', o.ctx, 0.05)) return;
  if (!takeVoice(0.06)) return;
  safe(() => {
    const { ctx, out } = o;
    slap(ctx, out, ctx.currentTime + 0.002, 0.1, jitter(3600, 0.1, rand), 0.018);
  });
}

/** 캡슐 반쪽이 풀리는 플라스틱 "딸깍" */
export function capsuleClick(): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.15)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    slap(ctx, out, t0, 0.24, 3000, 0.025);
    slap(ctx, out, t0 + 0.05, 0.3, 2100, 0.035);
    glide(ctx, out, t0 + 0.05, 1900, 1500, 0.05, 0.08, 'triangle');
  });
}

/** 캡슐이 열리며 말랑이가 튀어나오는 "뽁!" (공기 빠지는 소리 + 높아지는 방울) */
export function popOut(): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.4)) return;
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.004;
    glide(ctx, out, t0, 280, 1300, 0.07, 0.3);
    glide(ctx, out, t0 + 0.06, 1300, 1000, 0.08, 0.14);
    slap(ctx, out, t0, 0.14, 2400, 0.03);
    for (let i = 0; i < 3; i++) {
      const f = jitter(1200 + i * 300, 0.1, rand);
      glide(ctx, out, t0 + 0.1 + i * 0.05, f, f * 1.4, 0.06, 0.06);
    }
  });
}
