/**
 * 말랑이를 만지는 동안 계속 울리는 "손맛 목소리" — 실제 말랑이 장난감 소리를 물리 값으로 움직인다 (WebAudio 합성, 파일 없음).
 *
 * 한 번 울리고 끝나는 소리(`squish.ts`) 대신, 손가락이 닿아 있는 동안(그리고 놓은 뒤 몸이 출렁이거나 차오르는 동안)
 * 매 프레임 물리에서 읽은 값(`TouchSense`)으로 층마다 음량·음높이·필터를 부드럽게(`setTargetAtTime`) 옮긴다.
 * 그래서 소리가 눈에 보이는 움직임과 같은 박자로 변한다.
 *
 * 층 (촉감마다 세기·음색은 `VOICE_TIMBRES`):
 *  - flow  : 눌리는 빠르기만큼 새어 나오는 공기·물기 (대역 노이즈). 폼은 "스읍" 하고 셀 속 공기가 빠지고, 놓고 차오를 때는
 *            아주 옅은 들숨. 젤리·찐득이는 공명 필터가 좁아 축축한 "쮸왑" — 눌림 속도가 줄면 음이 내려간다.
 *  - rub   : 손가락이 표면을 문지르는 마찰 (노이즈 음량 ∝ 손가락 속도, 촉감마다 결이 다르다: 폼 벨벳·젤리 뽀득·고무 사각·슬라임 끈적).
 *  - grains: 작은 부스럭 알갱이 (폼 셀이 터지는 바삭임, 찐득이를 떼어낼 때 "칙칙", 젤리를 문지를 때 물기 틱). 밀도 = 초당 알갱이 수.
 *            알갱이는 미리 만든 두 밀도의 딸깍 고리(성긴·촘촘)를 섞어 낸다 — 알갱이마다 노드를 만들지 않는다.
 *  - tone  : 출렁임을 그대로 따르는 "뾰잉/블럽" — 음높이 = 몸이 눌리고 늘어난 변위, 크기 = 출렁임 진폭 × 속도(트레몰로).
 *  - creak : 고무 스틱-슬립 "끼익" — 펄스열의 속도(Hz)가 늘어나는 빠르기·팽팽함을 따른다. 느리면 뚝뚝 끊기는 삐걱, 빠르면 끽 소리.
 *
 * 규칙: AudioContext 는 `sfx.getOutput()` 을 빌린다(첫 입력 전·효과음 꺼짐이면 null). 동시에 3개까지(`MAX_TOUCH_VOICES`),
 * 넘치면 가장 오래된 것부터 부드럽게 끈다. 일회성 소리가 울리면 잠깐 낮아진다(`duckTouchVoices`). 화면이 숨겨지거나(visibilitychange)
 * 한동안 update 가 오지 않으면 스스로 멈춘다 — 멈춘 목소리가 남지 않게.
 *
 * `touchVoiceParams` 는 순수 함수(테스트). 그래프는 오프라인 렌더(`scripts/render-touch-sounds.mjs`)로 클리핑·대역·잔향을 확인한다.
 */
import type { MaterialId } from '../data/materials';
import { sfx } from './sfx';

/** 한 프레임의 물리 읽기 (touch/touchSense.ts 가 만든다). 모두 정규화 값 */
export interface TouchSense {
  /** 손가락(또는 떼어내는 중인 실)이 닿아 있다 */
  held: boolean;
  /** 눌린 깊이 0..1 */
  press: number;
  /** 눌림 속도 (깊이/초, + 들어감 − 차오름) */
  pressVel: number;
  /** 늘어난 정도 0..1 */
  stretch: number;
  /** 늘어나는 속도 (늘림/초, 부호 있음) */
  stretchVel: number;
  /** 손가락이 표면을 문지르는 빠르기 0..1 */
  rub: number;
  /** 출렁임 변위 −1..1 (+ 눌림) */
  jiggle: number;
  /** 출렁임 속도 (진폭 1 의 최고 속도 = 1) */
  jiggleVel: number;
  /** 떼어내는 빠르기 0..1 (찐득이 실) */
  peel: number;
}

export const QUIET_SENSE: Readonly<TouchSense> = {
  held: false,
  press: 0,
  pressVel: 0,
  stretch: 0,
  stretchVel: 0,
  rub: 0,
  jiggle: 0,
  jiggleVel: 0,
  peel: 0,
};

export interface VoiceTimbre {
  flow: {
    gain: number;
    /** 대역 중심: 느릴 때 lo → 빠를 때 hi */
    lo: number;
    hi: number;
    q: number;
    /** 이 눌림 속도(깊이/초)에서 가장 크다 */
    fullVel: number;
    /** 차오를 때 들숨 (음량 배수, 0 = 없음) 과 그 대역 */
    inhale: number;
    inhaleLo: number;
    inhaleHi: number;
    /** 출렁임 속도가 만드는 물소리 (젤리의 찰랑) */
    slosh: number;
  };
  rub: { gain: number; lo: number; hi: number; q: number };
  grains: {
    gain: number;
    freq: number;
    q: number;
    /** 초당 알갱이: 깊게 누를 때(폼), 문지를 때, 떼어낼 때(찐득이), 늘릴 때 */
    press: number;
    rub: number;
    peel: number;
    stretch: number;
    /** 알갱이만큼 톡톡 진동 (폼 부스럭·찐득이 칙칙) */
    haptic: boolean;
  };
  tone: { gain: number; base: number; bend: number };
  creak: { gain: number; lo: number; hi: number; q: number; rateLo: number; rateHi: number };
}

/**
 * 촉감별 목소리. 음량은 효과음 버스(0.55) 앞 값 — 층을 모두 최대로 올려도 목소리 하나가 0.5 를 넘지 않게 (테스트).
 * 대역은 폰 스피커가 내는 200Hz~6kHz 안에 둔다.
 */
export const VOICE_TIMBRES: Readonly<Record<MaterialId, VoiceTimbre>> = {
  // 메모리폼·모찌: 셀 속 공기가 빠지는 보송한 "스읍" + 깊이 누르면 바삭한 폼 부스럭, 놓으면 거의 조용하다가 옅은 들숨
  slowRise: {
    flow: { gain: 0.3, lo: 340, hi: 2300, q: 0.85, fullVel: 2.2, inhale: 0.3, inhaleLo: 1300, inhaleHi: 2600, slosh: 0 },
    rub: { gain: 0.24, lo: 600, hi: 1250, q: 0.55 },
    grains: { gain: 0.2, freq: 3400, q: 1.1, press: 90, rub: 16, peel: 0, stretch: 0, haptic: true },
    tone: { gain: 0, base: 0, bend: 0 },
    creak: { gain: 0, lo: 0, hi: 0, q: 1, rateLo: 0, rateHi: 0 },
  },
  // 구미 젤리: 누를 때 젖은 "쮸왑"(좁은 공명이 아래로), 놓으면 출렁임 그대로 "뾰잉~" + 찰랑, 문지르면 뽀득 물기 틱
  jelly: {
    flow: { gain: 0.15, lo: 380, hi: 1700, q: 4.5, fullVel: 3, inhale: 0, inhaleLo: 0, inhaleHi: 0, slosh: 0.35 },
    rub: { gain: 0.18, lo: 1500, hi: 2600, q: 3.2 },
    grains: { gain: 0.16, freq: 2300, q: 2.2, press: 0, rub: 40, peel: 0, stretch: 8, haptic: false },
    tone: { gain: 0.24, base: 300, bend: 0.2 },
    creak: { gain: 0.07, lo: 900, hi: 1700, q: 5, rateLo: 25, rateHi: 260 },
  },
  // 실리콘 고무: 당길 때 "끼이익" 스틱-슬립 삐걱, 매끈한 사각 마찰, 놓으면 고무 "퉁"(squish.thwap)과 낮은 출렁 음
  stretchy: {
    flow: { gain: 0.1, lo: 450, hi: 1400, q: 2.2, fullVel: 3, inhale: 0, inhaleLo: 0, inhaleHi: 0, slosh: 0.05 },
    rub: { gain: 0.16, lo: 2300, hi: 4200, q: 1.3 },
    grains: { gain: 0.1, freq: 2800, q: 1.4, press: 0, rub: 10, peel: 0, stretch: 6, haptic: false },
    tone: { gain: 0.08, base: 260, bend: 0.2 },
    creak: { gain: 0.2, lo: 650, hi: 2200, q: 7, rateLo: 16, rateHi: 420 },
  },
  // 슬라임: 낮고 축축한 누름, 문지르거나 떼어낼 때 촘촘한 "칙칙" 끈적 부스럭 → "쩍"(squish.peel)
  sticky: {
    flow: { gain: 0.2, lo: 280, hi: 1100, q: 3.2, fullVel: 2.5, inhale: 0, inhaleLo: 0, inhaleHi: 0, slosh: 0.1 },
    rub: { gain: 0.16, lo: 850, hi: 1500, q: 1.2 },
    grains: { gain: 0.32, freq: 1900, q: 1.6, press: 10, rub: 90, peel: 280, stretch: 45, haptic: true },
    tone: { gain: 0, base: 0, bend: 0 },
    creak: { gain: 0.09, lo: 400, hi: 900, q: 4, rateLo: 12, rateHi: 90 },
  },
};

/** 한 프레임의 목표값 */
export interface VoiceParams {
  flow: { gain: number; freq: number; q: number };
  rub: { gain: number; freq: number; q: number };
  grains: { rate: number; gain: number; freq: number; q: number };
  tone: { gain: number; freq: number };
  creak: { gain: number; rate: number; freq: number; q: number };
}

// ── 순수 계산 ─────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function c01(v: number): number {
  return clamp(num(v), 0, 1);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 손맛 → 목소리 목표값 (순수). 알 수 없는 촉감은 젤리 */
export function touchVoiceParams(material: MaterialId, sense: TouchSense): VoiceParams {
  const t = VOICE_TIMBRES[material] ?? VOICE_TIMBRES.jelly;
  const press = c01(sense.press);
  const pv = num(sense.pressVel);
  const stretch = c01(sense.stretch);
  const sv = Math.abs(num(sense.stretchVel));
  const rub = c01(sense.rub);
  const jig = clamp(num(sense.jiggle), -1.5, 1.5);
  const jv = clamp(num(sense.jiggleVel), -1.5, 1.5);
  const peel = c01(sense.peel);
  const held = !!sense.held;

  // flow: 들어가는 빠르기(날숨) / 차오르는 빠르기(들숨) / 출렁임 속도(찰랑)
  const exhale = c01(pv / t.flow.fullVel);
  // 들숨: 차오르는 빠르기 × 이미 차오른 만큼 (막 놓은 순간은 거의 조용하다가 겉 셀부터 공기가 다시 찬다)
  const inhale = held ? 0 : c01(-pv / (t.flow.fullVel * 0.55)) * (0.2 + 0.8 * (1 - press));
  const slosh = held ? 0 : c01(Math.abs(jv)) * t.flow.slosh;
  const outAir = Math.pow(exhale, 0.8);
  const inAir = Math.pow(inhale, 0.9) * t.flow.inhale;
  const flowGain = t.flow.gain * Math.min(1, outAir + inAir + slosh);
  // 소리가 큰 쪽의 대역을 따른다: 들숨은 더 높고 바람 같다
  const flowFreq =
    inAir > outAir && t.flow.inhale > 0
      ? t.flow.inhaleLo + (t.flow.inhaleHi - t.flow.inhaleLo) * inhale
      : t.flow.lo + (t.flow.hi - t.flow.lo) * Math.max(exhale, slosh * 0.6);
  const flowQ = t.flow.q * (inAir > outAir ? 0.8 : 1);

  // rub: 손가락 속도만큼 (문지르는 동안만)
  const rubGain = t.rub.gain * (held ? Math.pow(rub, 0.9) : 0);
  const rubFreq = t.rub.lo + (t.rub.hi - t.rub.lo) * rub;

  // grains: 폼은 깊이 눌러 들어갈 때, 찐득이는 떼어낼 때·문지를 때
  // 셀이 터지는 건 눌러 들어가는 동안만 (가만히 버티면 조용하다)
  const pressCrackle = held ? t.grains.press * smoothstep(0.45, 0.95, press) * Math.min(1, exhale * 2) : 0;
  const rate =
    pressCrackle + t.grains.rub * (held ? rub : 0) + t.grains.peel * peel + t.grains.stretch * c01(sv / 2.5) * (held ? 1 : 0);
  const grainGain = rate > 0.5 ? t.grains.gain * (0.55 + 0.45 * smoothstep(0, 120, rate)) : 0;

  // tone: 출렁임을 따른다. 진폭 = √(변위² + 속도²), 크기는 속도 쪽이 클 때 더 (트레몰로), 음높이 = 변위
  const amp = Math.min(1, Math.hypot(jig, jv));
  const trem = amp > 1e-4 ? Math.abs(jv) / amp : 0;
  // 손가락이 잡고 있는 동안은 출렁이지 않는다. 진폭의 제곱을 따라 눈에 보이는 출렁임보다 조금 먼저 잦아든다
  const toneGain = held ? 0 : t.tone.gain * amp * amp * (0.45 + 0.55 * trem);
  const toneFreq = t.tone.base > 0 ? t.tone.base * (1 + t.tone.bend * clamp(jig, -1, 1)) : 0;

  // creak: 늘어나는 빠르기 × 팽팽함 → 펄스 속도, 공명은 팽팽할수록 높게
  const motion = c01(sv / 2.5 + (held ? 0.5 * rub * stretch : 0));
  const creakGain = held ? t.creak.gain * smoothstep(0.03, 0.4, motion) * (0.35 + 0.65 * stretch) : 0;
  const creakRate = t.creak.rateLo + (t.creak.rateHi - t.creak.rateLo) * Math.pow(motion, 0.8) * (0.5 + 0.5 * stretch);
  const creakFreq = t.creak.lo + (t.creak.hi - t.creak.lo) * stretch;

  return {
    flow: { gain: flowGain, freq: Math.max(60, flowFreq), q: flowQ },
    rub: { gain: rubGain, freq: rubFreq, q: t.rub.q },
    grains: { rate, gain: grainGain, freq: t.grains.freq * (0.9 + 0.2 * peel), q: t.grains.q },
    tone: { gain: toneGain, freq: Math.max(60, toneFreq) },
    creak: { gain: creakGain, rate: Math.max(1, creakRate), freq: Math.max(60, creakFreq), q: t.creak.q },
  };
}

/** 목소리 전체 크기 (조용해졌는지 판단) */
export function voiceLoudness(p: VoiceParams): number {
  return p.flow.gain + p.rub.gain + p.grains.gain + p.tone.gain + p.creak.gain;
}

/** 모든 층이 한꺼번에 최대일 때의 합 (클리핑 여유 — 테스트) */
export function maxVoiceGain(material: MaterialId): number {
  const t = VOICE_TIMBRES[material];
  return t.flow.gain + t.rub.gain + t.grains.gain + t.tone.gain + t.creak.gain;
}

// ── 오디오 그래프 ─────────────────────────────────────────

/** 동시에 울리는 목소리 수 */
export const MAX_TOUCH_VOICES = 3;
/** 놓은 뒤 이만큼 조용하면 멈춘다 (s) */
const QUIET_HOLD_S = 0.3;
const QUIET_LEVEL = 0.003;
/** update 가 이만큼 오지 않으면 스스로 멈춘다 (ms) — 그리기 루프가 멈췄거나 화면을 떠났다 */
const WATCHDOG_MS = 600;
/** 알갱이 고리 밀도 (초당) */
const SPARSE_RATE = 40;
const DENSE_RATE = 280;

type Out = { ctx: BaseAudioContext; out: AudioNode };

export interface TouchVoice {
  /** 매 프레임 물리 읽기로 목표값을 옮긴다 */
  update(sense: TouchSense): void;
  /** 손을 뗐다: 몸이 출렁이거나 차오르는 동안 계속 따라가다 조용해지면 멈춘다 */
  release(): void;
  /** 바로 멈춘다 (짧은 페이드). 여러 번 불러도 안전 */
  stop(): void;
  /** 멈췄다 */
  readonly done: boolean;
  /** 마지막 목표값 (진동·디버그) */
  readonly params: VoiceParams | null;
}

interface Shared {
  bus: GainNode;
  noise: AudioBuffer;
  sparse: AudioBuffer;
  dense: AudioBuffer;
  pulse: PeriodicWave | null;
  duckEnd: number;
}

const shared = new WeakMap<BaseAudioContext, Shared>();
const voices: VoiceImpl[] = [];
let rand: () => number = Math.random;
let watchdog: ReturnType<typeof setInterval> | null = null;
let visibilityHooked = false;
let outputOverride: Out | null = null;

/** 테스트용: 난수 교체 */
export function setTouchVoiceRandom(r: () => number): void {
  rand = r;
}

/** 오프라인 렌더(소리 확인 스크립트)용: 출력 바꾸기. null 이면 sfx 효과음 버스 */
export function setTouchVoiceOutput(o: Out | null): void {
  outputOverride = o;
}

/** 테스트/디버그: 살아 있는 목소리 수 */
export function activeTouchVoices(): number {
  return voices.length;
}

function output(): Out | null {
  if (outputOverride) return outputOverride;
  try {
    const r = sfx.getOutput();
    if (!r || r.ctx.state === 'closed') return null;
    return r;
  } catch {
    return null;
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // 오디오 오류로 화면이 멈추지 않게
  }
}

/** 흰 노이즈 2초 (살짝 부드럽게) */
function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = last * 0.25 + w * 0.75;
    d[i] = last;
  }
  return buf;
}

/** 딸깍 알갱이 고리: rate 개/초, 길이 seconds. 알갱이 = 2~6ms 로 빠르게 사그라드는 노이즈, 세기는 제각각 */
function makeClicks(ctx: BaseAudioContext, rate: number, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const count = Math.round(rate * seconds);
  for (let n = 0; n < count; n++) {
    const at = Math.floor(Math.random() * len);
    const dur = Math.floor(sr * (0.002 + Math.random() * 0.004));
    const amp = 0.25 + 0.75 * Math.random() ** 2;
    for (let i = 0; i < dur && at + i < len; i++) {
      const env = Math.exp((-6 * i) / dur);
      d[at + i] = (d[at + i] ?? 0) + (Math.random() * 2 - 1) * amp * env;
    }
  }
  // 겹친 곳이 1 을 넘지 않게
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i] ?? 0));
  if (peak > 1) for (let i = 0; i < len; i++) d[i] = (d[i] ?? 0) / peak;
  return buf;
}

/** 스틱-슬립 펄스: 좁은 펄스(배음이 고르게 많다) */
function makePulse(ctx: BaseAudioContext): PeriodicWave | null {
  const n = 40;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = 1 / Math.pow(k, 0.35);
  try {
    return ctx.createPeriodicWave(real, imag);
  } catch {
    return null;
  }
}

function sharedFor(o: Out): Shared {
  let s = shared.get(o.ctx);
  if (s) return s;
  const bus = o.ctx.createGain();
  bus.gain.value = 1;
  bus.connect(o.out);
  s = {
    bus,
    noise: makeNoise(o.ctx),
    sparse: makeClicks(o.ctx, SPARSE_RATE, 1.7),
    dense: makeClicks(o.ctx, DENSE_RATE, 2.3),
    pulse: makePulse(o.ctx),
    duckEnd: 0,
  };
  shared.set(o.ctx, s);
  return s;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * 일회성 소리가 울리는 동안 목소리들을 잠깐 낮춘다 (squish 가 부른다). 화면 코드는 신경 쓰지 않아도 된다.
 */
export function duckTouchVoices(seconds: number, db = -6): void {
  if (voices.length === 0) return;
  const o = output();
  if (!o) return;
  const s = shared.get(o.ctx);
  if (!s) return;
  safe(() => {
    const now = o.ctx.currentTime;
    const end = Math.max(s.duckEnd, now + Math.max(0.05, Math.min(1.5, num(seconds))));
    const p = s.bus.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(dbToGain(Math.min(0, num(db))), now, 0.012);
    p.setTargetAtTime(1, end, 0.12);
    s.duckEnd = end;
  });
}

/** 모든 목소리를 멈춘다 (화면을 떠남·숨김) */
export function stopAllTouchVoices(): void {
  for (const v of [...voices]) v.stop();
}

function ensureWatch(): void {
  if (!visibilityHooked && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    visibilityHooked = true;
    const hide = () => {
      if (document.visibilityState === 'hidden') stopAllTouchVoices();
    };
    document.addEventListener('visibilitychange', hide);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', stopAllTouchVoices);
    }
  }
  if (watchdog === null && voices.length > 0) {
    watchdog = setInterval(() => {
      const now = Date.now();
      for (const v of [...voices]) if (now - v.lastUpdate > WATCHDOG_MS) v.stop();
      if (voices.length === 0 && watchdog !== null) {
        clearInterval(watchdog);
        watchdog = null;
      }
    }, 200);
  }
}

class VoiceImpl implements TouchVoice {
  done = false;
  params: VoiceParams | null = null;
  lastUpdate = Date.now();
  private released = false;
  private quietSince: number | null = null;
  private readonly o: Out;
  private readonly t: VoiceTimbre;
  private readonly material: MaterialId;
  private readonly master: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private flow: { f: BiquadFilterNode; g: GainNode } | null = null;
  private rub: { f: BiquadFilterNode; g: GainNode } | null = null;
  private grains: { f: BiquadFilterNode; g: GainNode; sparse: GainNode; dense: GainNode; srcs: AudioBufferSourceNode[] } | null = null;
  private tone: { a: OscillatorNode; b: OscillatorNode; g: GainNode } | null = null;
  private creak: { osc: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  /** 반복 피로: 목소리마다 조금씩 다른 음색 */
  private readonly vary: number;
  private readonly varyTone: number;

  constructor(o: Out, material: MaterialId) {
    this.o = o;
    this.material = material;
    this.t = VOICE_TIMBRES[material] ?? VOICE_TIMBRES.jelly;
    this.vary = 1 + (rand() * 2 - 1) * 0.06;
    this.varyTone = 1 + (rand() * 2 - 1) * 0.04;
    const { ctx } = o;
    const sh = sharedFor(o);
    const t0 = ctx.currentTime + 0.005;
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, t0);
    this.master.gain.setTargetAtTime(1, t0, 0.015);
    this.master.connect(sh.bus);
    const T = this.t;
    const add = <N extends AudioNode>(n: N): N => {
      this.nodes.push(n);
      return n;
    };
    const gainNode = () => {
      const g = add(ctx.createGain());
      g.gain.value = 0;
      g.connect(this.master);
      return g;
    };

    if (T.flow.gain > 0 || T.rub.gain > 0) {
      const noise = ctx.createBufferSource();
      noise.buffer = sh.noise;
      noise.loop = true;
      noise.start(t0, rand() * 1.9);
      this.sources.push(noise);
      if (T.flow.gain > 0) {
        const f = add(ctx.createBiquadFilter());
        f.type = 'bandpass';
        f.frequency.value = T.flow.lo;
        f.Q.value = T.flow.q;
        const g = gainNode();
        noise.connect(f);
        f.connect(g);
        this.flow = { f, g };
      }
      if (T.rub.gain > 0) {
        const f = add(ctx.createBiquadFilter());
        f.type = 'bandpass';
        f.frequency.value = T.rub.lo;
        f.Q.value = T.rub.q;
        const g = gainNode();
        noise.connect(f);
        f.connect(g);
        this.rub = { f, g };
      }
    }
    if (T.grains.gain > 0) {
      const f = add(ctx.createBiquadFilter());
      f.type = 'bandpass';
      f.frequency.value = T.grains.freq;
      f.Q.value = T.grains.q;
      const g = gainNode();
      f.connect(g);
      const mk = (buf: AudioBuffer) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = 0.9 + rand() * 0.2;
        const lg = add(ctx.createGain());
        lg.gain.value = 0;
        src.connect(lg);
        lg.connect(f);
        src.start(t0, rand() * buf.duration * 0.9);
        this.sources.push(src);
        return { src, lg };
      };
      const sp = mk(sh.sparse);
      const de = mk(sh.dense);
      this.grains = { f, g, sparse: sp.lg, dense: de.lg, srcs: [sp.src, de.src] };
    }
    if (T.tone.gain > 0) {
      const a = ctx.createOscillator();
      a.type = 'sine';
      a.frequency.value = T.tone.base * this.varyTone;
      // 폰 스피커에서도 들리게 한 옥타브 위 배음 (세모파, 로우패스로 부드럽게)
      const b = ctx.createOscillator();
      b.type = 'triangle';
      b.frequency.value = T.tone.base * 2 * this.varyTone;
      const bg = add(ctx.createGain());
      bg.gain.value = 0.45;
      const lp = add(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 0.7;
      const g = gainNode();
      a.connect(lp);
      b.connect(bg);
      bg.connect(lp);
      lp.connect(g);
      a.start(t0);
      b.start(t0);
      this.sources.push(a, b);
      this.tone = { a, b, g };
    }
    if (T.creak.gain > 0) {
      const osc = ctx.createOscillator();
      if (sh.pulse) osc.setPeriodicWave(sh.pulse);
      else osc.type = 'sawtooth';
      osc.frequency.value = T.creak.rateLo;
      const f = add(ctx.createBiquadFilter());
      f.type = 'bandpass';
      f.frequency.value = T.creak.lo;
      f.Q.value = T.creak.q;
      const g = gainNode();
      osc.connect(f);
      f.connect(g);
      osc.start(t0);
      this.sources.push(osc);
      this.creak = { osc, f, g };
    }
  }

  update(sense: TouchSense): void {
    if (this.done) return;
    this.lastUpdate = Date.now();
    const p = touchVoiceParams(this.material, sense);
    this.params = p;
    const ctx = this.o.ctx;
    safe(() => {
      const now = ctx.currentTime;
      const v = this.vary;
      if (this.flow) {
        this.flow.g.gain.setTargetAtTime(p.flow.gain, now, 0.02);
        this.flow.f.frequency.setTargetAtTime(p.flow.freq * v, now, 0.025);
        this.flow.f.Q.setTargetAtTime(p.flow.q, now, 0.05);
      }
      if (this.rub) {
        this.rub.g.gain.setTargetAtTime(p.rub.gain, now, 0.03);
        this.rub.f.frequency.setTargetAtTime(p.rub.freq * v, now, 0.04);
      }
      if (this.grains) {
        const g = this.grains;
        g.g.gain.setTargetAtTime(p.grains.gain, now, 0.03);
        g.sparse.gain.setTargetAtTime(Math.min(1, p.grains.rate / SPARSE_RATE), now, 0.03);
        g.dense.gain.setTargetAtTime(smoothstep(SPARSE_RATE, DENSE_RATE, p.grains.rate), now, 0.03);
        g.f.frequency.setTargetAtTime(p.grains.freq * v, now, 0.05);
        // 고리가 되풀이되는 티가 나지 않게 속도를 조금씩 흔든다
        for (const s of g.srcs) s.playbackRate.setTargetAtTime(0.88 + rand() * 0.24, now, 0.2);
      }
      if (this.tone) {
        // 출렁임을 프레임마다 따른다 (60fps 에서 3~6Hz 출렁임을 충분히 그린다)
        this.tone.g.gain.setTargetAtTime(p.tone.gain, now, 0.012);
        this.tone.a.frequency.setTargetAtTime(p.tone.freq * this.varyTone, now, 0.01);
        this.tone.b.frequency.setTargetAtTime(p.tone.freq * 2 * this.varyTone, now, 0.01);
      }
      if (this.creak) {
        // 스틱-슬립은 고르지 않다: 속도를 조금씩 흔든다
        const jitter = 1 + (rand() * 2 - 1) * 0.1;
        this.creak.g.gain.setTargetAtTime(p.creak.gain, now, 0.02);
        this.creak.osc.frequency.setTargetAtTime(p.creak.rate * jitter, now, 0.025);
        this.creak.f.frequency.setTargetAtTime(p.creak.freq * v, now, 0.04);
      }
      if (this.released) {
        if (voiceLoudness(p) < QUIET_LEVEL) {
          if (this.quietSince === null) this.quietSince = now;
          else if (now - this.quietSince > QUIET_HOLD_S) this.stop();
        } else {
          this.quietSince = null;
        }
      }
    });
  }

  release(): void {
    this.released = true;
  }

  /** 놓은 목소리부터 자리를 양보한다 */
  isReleased(): boolean {
    return this.released;
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    const i = voices.indexOf(this);
    if (i >= 0) voices.splice(i, 1);
    const ctx = this.o.ctx;
    safe(() => {
      const now = ctx.currentTime;
      const g = this.master.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.setTargetAtTime(0, now, 0.03);
      for (const s of this.sources) s.stop(now + 0.25);
    });
    // 페이드가 끝난 뒤 연결을 끊는다
    const master = this.master;
    const nodes = this.nodes;
    setTimeout(() => safe(() => {
      master.disconnect();
      for (const n of nodes) n.disconnect();
    }), 400);
  }
}

/**
 * 만지기 목소리를 시작한다. 소리를 낼 수 없으면(첫 입력 전·효과음 꺼짐) null.
 * 이미 MAX_TOUCH_VOICES 개가 울리고 있으면 놓은 것 → 오래된 것 순으로 하나를 끈다.
 */
export function startTouchVoice(material: MaterialId): TouchVoice | null {
  const o = output();
  if (!o) return null;
  while (voices.length >= MAX_TOUCH_VOICES) {
    const victim = voices.find((v) => v.isReleased()) ?? voices[0];
    if (!victim) break;
    victim.stop();
  }
  let v: VoiceImpl | null = null;
  try {
    v = new VoiceImpl(o, material);
  } catch {
    return null;
  }
  voices.push(v);
  ensureWatch();
  return v;
}
