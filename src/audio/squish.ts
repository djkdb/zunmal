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
 */
import { sfx } from './sfx';

export type Rand = () => number;

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
}

/** 늘어난 정도(0..1)와 끄는 속도(0..1) → 늘림 소리 목표값 */
export function stretchTargets(amount: number, speed: number): StretchTargets {
  const a = clamp01(amount);
  const s = clamp01(speed);
  // 가만히 늘려 두면 조용하고, 빠르게 끌수록 크고 밝아진다
  const motion = 0.25 + 0.75 * s;
  return {
    noiseGain: (0.02 + 0.14 * a) * motion,
    cutoff: 350 + 1100 * a + 900 * s,
    toneGain: (0.015 + 0.06 * a) * (0.4 + 0.6 * s),
    toneFreq: 70 + 70 * a + 40 * s,
    creakRate: 9 + 26 * s + 10 * a,
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
export function squishPress(intensity = 0.6): void {
  const o = output();
  if (!o) return;
  const p = squelchParams(intensity, rand);
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
  /** amount: 늘어난 정도 0..1, speed: 끄는 속도 0..1 */
  update(amount: number, speed: number): void;
  /** 딸깍 없이 페이드아웃. 여러 번 불러도 안전하다. */
  stop(): void;
}

const NOOP_STRETCH: StretchHandle = { update() {}, stop() {} };

/**
 * 쭉 늘릴 때의 끈적하고 삐걱이는 연속음.
 * 노이즈(밴드패스) + 낮은 삼각파를 스틱-슬립 LFO 로 떨리게 하고,
 * 빠르게 끌면 가끔 작은 "쩍" 소리(떨어지는 실)를 더한다.
 */
export function startStretch(): StretchHandle {
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

    const handle: StretchHandle = {
      update(amount, speed) {
        if (stopped) return;
        safe(() => {
          const now = ctx.currentTime;
          const tg = stretchTargets(amount, speed);
          noiseGain.gain.setTargetAtTime(tg.noiseGain, now, 0.05);
          bp.frequency.setTargetAtTime(tg.cutoff, now, 0.06);
          toneGain.gain.setTargetAtTime(tg.toneGain, now, 0.06);
          tone.frequency.setTargetAtTime(tg.toneFreq, now, 0.08);
          lfo.frequency.setTargetAtTime(tg.creakRate, now, 0.1);
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
export function squishRelease(intensity = 0.6, wobbleRateHz?: number): void {
  const o = output();
  if (!o) return;
  const p = releaseParams(intensity, rand, wobbleRateHz);
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

/** 콕 찌를 때: 귀여운 "뽁" */
export function poke(strength = 0.6): void {
  const o = output();
  if (!o) return;
  if (!takeVoice(0.15)) return;
  const s = clamp01(strength);
  safe(() => {
    const { ctx, out } = o;
    const t0 = ctx.currentTime + 0.003;
    const start = jitter(330, 0.1, rand);
    const peak = jitter(1050 + 250 * s, 0.08, rand);
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
