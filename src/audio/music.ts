/**
 * 절차적 배경음악: 오디오 파일 없이 마림바·오르골·종·칼림바 소리를 합성해 화면마다 다른 곡을 만든다.
 *
 * - 스케줄러는 "두 개의 시계" 방식: 25ms마다 도는 JS 타이머가 오디오 시계(currentTime) 기준으로
 *   앞으로 ~120ms 안에 들어오는 16분음표를 미리 예약한다. 타이머가 조금 늦어도 박자가 흔들리지 않는다.
 * - 곡은 시드 고정 난수로 8마디 악절을 만들고, 악절마다 시드를 바꿔 32마디가 지나야 똑같이 반복된다.
 *   선율은 장조 5음 음계라 콤보 효과음(tuning.comboPitch)과 부딪히지 않는다.
 * - 곡을 바꾸면 현재 곡의 다음 마디 경계에서 약 1초 동안 교차 페이드한다.
 * - 소리는 sfx 엔진의 음악 버스로 나간다(효과음보다 약 10dB 낮게, 팡파레 때는 sfx.duck으로 더 낮게).
 * - 첫 사용자 입력 전에는 아무것도 만들지 않는다(원하는 곡만 기억했다가 잠금 해제 때 시작).
 *
 * 곡/패턴 생성과 박자 계산은 순수 함수로 분리해 단위 테스트한다.
 */
import { createSeededRng, type RNG } from '../lib/rng';
import { sfx as defaultEngine, type SfxEngine } from './sfx';
import { MAJOR_PENTATONIC, midiToFreq } from './tuning';
import type { TrackId } from './tracks';

// ── 곡 정의 (순수 데이터) ────────────────────────────────────

export type { TrackId } from './tracks';
export type VoiceId = 'marimba' | 'musicBox' | 'bell' | 'kalimba' | 'pad' | 'bass' | 'shaker' | 'click';

export type ChordQuality = 'maj' | 'min' | 'maj7' | 'min7' | 'dom7' | 'sus2' | 'add9';

export interface Chord {
  /** 조의 으뜸음으로부터 반음 수 */
  root: number;
  quality: ChordQuality;
}

export interface TrackSpec {
  id: TrackId;
  bpm: number;
  /** 으뜸음 MIDI (C4 = 60) */
  key: number;
  /** 한 마디에 화음 하나. 8마디 악절 안에서 반복된다. */
  progression: readonly Chord[];
  lead: VoiceId;
  /** 짝수 마디 끝에 가끔 얹는 높은 반짝임 음색 (없으면 생략) */
  sparkle: VoiceId | null;
  /** 선율 음 밀도 0..1 (8분음표 자리마다 음이 나올 확률) */
  density: number;
  /** 베이스가 울리는 마디 안 16분음표 자리 */
  bass: readonly number[];
  /** 화음 패드를 깔지 */
  pad: boolean;
  shaker: readonly number[];
  click: readonly number[];
  /** 뒷박 8분음표를 늦추는 비율 (0 = 정박) */
  swing: number;
  seed: number;
  /** 곡 자체 음량 (음악 버스 안에서) */
  level: number;
}

export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 8;
export const STEPS_PER_PHRASE = STEPS_PER_BAR * PHRASE_BARS;
/** 서로 다른 악절 수. 이만큼 지나야 같은 악절이 다시 나온다. */
export const PHRASE_VARIANTS = 4;
/** 베이스는 110Hz(A2) 아래로 내려가지 않는다 — 폰 스피커에서 들리는 하한 */
export const BASS_MIN_MIDI = 45;

const C = (root: number, quality: ChordQuality): Chord => ({ root, quality });

export const TRACKS: Record<TrackId, TrackSpec> = {
  // 밝고 통통 튀는 가게 앞: C장조 I–V–vi–IV
  home: {
    id: 'home',
    bpm: 92,
    key: 60,
    progression: [C(0, 'maj'), C(7, 'maj'), C(9, 'min'), C(5, 'maj')],
    lead: 'marimba',
    sparkle: 'musicBox',
    density: 0.55,
    bass: [0, 6, 8],
    pad: true,
    shaker: [2, 6, 10, 14],
    click: [4, 12],
    swing: 0.12,
    seed: 11,
    level: 1,
  },
  // 차분한 도감 선반: F장조 ii–V–I–IV, 오르골
  collection: {
    id: 'collection',
    bpm: 76,
    key: 65,
    progression: [C(2, 'min7'), C(7, 'dom7'), C(0, 'maj7'), C(5, 'maj7')],
    lead: 'musicBox',
    sparkle: 'bell',
    density: 0.42,
    bass: [0, 8],
    pad: true,
    shaker: [8],
    click: [],
    swing: 0,
    seed: 23,
    level: 0.95,
  },
  // 꿈꾸는 듯한 만지기 방: 느린 칼림바 + 넓은 패드, 타악기 없음
  touch: {
    id: 'touch',
    bpm: 68,
    key: 60,
    progression: [C(5, 'maj7'), C(4, 'min7'), C(2, 'min7'), C(0, 'add9')],
    lead: 'kalimba',
    sparkle: 'bell',
    density: 0.3,
    bass: [0],
    pad: true,
    shaker: [],
    click: [],
    swing: 0,
    seed: 37,
    level: 0.9,
  },
  // 두근두근 캡슐 머신: 통통 튀는 베이스 + 뒷박 클릭
  gacha: {
    id: 'gacha',
    bpm: 100,
    key: 60,
    progression: [C(0, 'maj'), C(9, 'min'), C(5, 'maj'), C(7, 'sus2')],
    lead: 'bell',
    sparkle: 'marimba',
    density: 0.45,
    bass: [0, 4, 8, 12],
    pad: false,
    shaker: [2, 6, 10, 14],
    click: [4, 12],
    swing: 0.08,
    seed: 51,
    level: 0.9,
  },
  // 신나는 미니게임: vi–IV–I–V, 8분음표 베이스
  minigame: {
    id: 'minigame',
    bpm: 120,
    key: 60,
    progression: [C(9, 'min'), C(5, 'maj'), C(0, 'maj'), C(7, 'maj')],
    lead: 'marimba',
    sparkle: 'musicBox',
    density: 0.6,
    bass: [0, 3, 6, 8, 11, 14],
    pad: false,
    shaker: [2, 6, 10, 14],
    click: [4, 12],
    swing: 0,
    seed: 73,
    level: 0.85,
  },
};

const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
};

/** 화음 구성음의 음이름(0..11, 조 기준) */
export function chordPitchClasses(chord: Chord): number[] {
  return QUALITY_INTERVALS[chord.quality].map((i) => (((chord.root + i) % 12) + 12) % 12);
}

export interface NoteEvent {
  /** 악절 안 16분음표 위치 (0..STEPS_PER_PHRASE-1) */
  step: number;
  voice: VoiceId;
  midi: number;
  /** 길이 (16분음표 수) */
  len: number;
  /** 세기 0..1 */
  vel: number;
}

/** 조의 5음 음계를 low..high MIDI 범위에서 나열 */
export function pentatonicRange(key: number, low: number, high: number): number[] {
  const notes: number[] = [];
  for (let m = low; m <= high; m++) {
    const pc = (((m - key) % 12) + 12) % 12;
    if ((MAJOR_PENTATONIC as readonly number[]).includes(pc)) notes.push(m);
  }
  return notes;
}

function chordAt(spec: TrackSpec, bar: number): Chord {
  return spec.progression[bar % spec.progression.length] ?? { root: 0, quality: 'maj' };
}

/** 화음 근음을 베이스 음역(≥ BASS_MIN_MIDI)으로 */
function bassMidi(key: number, pc: number): number {
  let m = key - 12 + pc; // C3 근처
  while (m < BASS_MIN_MIDI) m += 12;
  while (m >= BASS_MIN_MIDI + 12) m -= 12;
  return m;
}

/** idx에서 가장 가까운, 화음 구성음인 음계 자리 */
function snapToChord(scale: readonly number[], idx: number, key: number, chord: Chord): number {
  const pcs = chordPitchClasses(chord);
  let best = idx;
  let bestDist = Infinity;
  scale.forEach((m, i) => {
    const pc = (((m - key) % 12) + 12) % 12;
    if (!pcs.includes(pc)) return;
    const d = Math.abs(i - idx);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

function motifRhythm(rng: RNG, density: number, bars: number): number[] {
  const onsets: number[] = [0];
  for (let s = 2; s < bars * STEPS_PER_BAR; s += 2) {
    // 강박은 조금 더 자주
    const p = s % 8 === 0 ? density + 0.2 : density;
    if (rng() < p) onsets.push(s);
  }
  return onsets;
}

/**
 * 8마디 악절 하나를 만든다. 같은 곡·같은 악절 번호면 항상 같은 결과 (결정적).
 * 구조: [동기 A 2마디][A 변형 2마디][A 2마디][마침 2마디 — 으뜸음으로 끝남]
 */
export function generatePhrase(spec: TrackSpec, phraseIndex: number): NoteEvent[] {
  const variant = ((phraseIndex % PHRASE_VARIANTS) + PHRASE_VARIANTS) % PHRASE_VARIANTS;
  const rng = createSeededRng(spec.seed * 7919 + variant * 104729 + 1);
  const events: NoteEvent[] = [];
  const key = spec.key;

  // 화음 패드 + 베이스
  for (let bar = 0; bar < PHRASE_BARS; bar++) {
    const chord = chordAt(spec, bar);
    const base = bar * STEPS_PER_BAR;
    if (spec.pad) {
      // G3..F4 근처에 모아 둔 닫힌 화음 (패드 기음은 모두 190Hz 이상)
      for (const pc of chordPitchClasses(chord)) {
        let m = key - 5 + ((pc + 5) % 12);
        if (m < 55) m += 12;
        events.push({ step: base, voice: 'pad', midi: m, len: STEPS_PER_BAR, vel: 0.55 });
      }
    }
    const root = bassMidi(key, chordPitchClasses(chord)[0] ?? 0);
    const fifth = root + 7;
    spec.bass.forEach((s, i) => {
      const next = spec.bass[i + 1] ?? STEPS_PER_BAR;
      events.push({
        step: base + s,
        voice: 'bass',
        midi: i % 2 === 1 && spec.bass.length > 2 ? fifth : root,
        len: Math.max(1, next - s),
        vel: i === 0 ? 0.9 : 0.65,
      });
    });
    for (const s of spec.shaker) {
      events.push({ step: base + s, voice: 'shaker', midi: 0, len: 1, vel: 0.5 + rng() * 0.3 });
    }
    // 가끔 16분음표 장식 (마지막 마디는 채우기)
    if (spec.shaker.length > 0) {
      const ghosts = bar === PHRASE_BARS - 1 ? 4 : rng() < 0.4 ? 1 : 0;
      for (let g = 0; g < ghosts; g++) {
        events.push({ step: base + 1 + 2 * Math.floor(rng() * 8), voice: 'shaker', midi: 0, len: 1, vel: 0.3 });
      }
    }
    for (const s of spec.click) {
      events.push({ step: base + s, voice: 'click', midi: 0, len: 1, vel: 0.7 });
    }
  }

  // 선율: 5음 음계 위를 걷는 동기
  const scale = pentatonicRange(key, key + 12, key + 28);
  const tonicIdx = Math.max(0, scale.indexOf(key + 12));
  const motif = motifRhythm(rng, spec.density, 2);
  const answer = motifRhythm(rng, spec.density, 1);
  let idx = Math.min(scale.length - 1, tonicIdx + 2 + Math.floor(rng() * 4));
  const walk = (): number => {
    const moves = [-2, -1, -1, 0, 1, 1, 2];
    idx += moves[Math.floor(rng() * moves.length)] ?? 0;
    idx = Math.max(0, Math.min(scale.length - 1, idx));
    return idx;
  };
  // 동기 음높이는 한 번 정해 두고 반복 때 재사용 (귀에 남는 모양)
  const motifPitches = motif.map(() => walk());
  const answerPitches = answer.map(() => walk());

  const place = (bar0: number, onsets: readonly number[], pitches: readonly number[], vel: number) => {
    onsets.forEach((s, i) => {
      const next = onsets[i + 1] ?? (Math.floor(s / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
      const abs = bar0 * STEPS_PER_BAR + s;
      const bar = Math.floor(abs / STEPS_PER_BAR);
      let p = pitches[i] ?? tonicIdx;
      if (s % 8 === 0) p = snapToChord(scale, p, key, chordAt(spec, bar));
      const midi = scale[p];
      if (midi === undefined) return;
      events.push({ step: abs, voice: spec.lead, midi, len: Math.max(1, Math.min(6, next - s)), vel: s % 8 === 0 ? vel : vel * 0.8 });
    });
  };
  place(0, motif, motifPitches, 0.9); // 마디 1–2: A
  place(2, motif.filter((s) => s < STEPS_PER_BAR), motifPitches, 0.85); // 마디 3: A 앞부분
  place(3, answer, answerPitches, 0.8); // 마디 4: 대답
  place(4, motif, motifPitches, 0.9); // 마디 5–6: A
  // 마디 7: 짧은 대답, 마디 8: 으뜸음으로 마침
  place(6, answer.filter((s) => s < 12), answerPitches, 0.75);
  // 마지막 화음이 으뜸음을 품으면 으뜸음, 아니면 가장 가까운 화음 구성음 (반마침)
  const endMidi = scale[snapToChord(scale, tonicIdx, key, chordAt(spec, PHRASE_BARS - 1))];
  if (endMidi !== undefined) {
    events.push({ step: (PHRASE_BARS - 1) * STEPS_PER_BAR, voice: spec.lead, midi: endMidi, len: 8, vel: 0.85 });
  }

  // 반짝임: 짝수 번째 마디 뒷부분에 화음 분산 화음을 높게
  if (spec.sparkle) {
    for (let bar = 1; bar < PHRASE_BARS; bar += 2) {
      if (rng() > 0.6) continue;
      const pcs = chordPitchClasses(chordAt(spec, bar));
      const start = bar * STEPS_PER_BAR + 8;
      pcs.slice(0, 3).forEach((pc, i) => {
        events.push({ step: start + i * 2, voice: spec.sparkle ?? 'bell', midi: key + 24 + pc, len: 2, vel: 0.45 - i * 0.08 });
      });
    }
  }

  return events.sort((a, b) => a.step - b.step);
}

/** 악절을 16분음표 자리별 묶음으로 */
export function bucketPhrase(events: readonly NoteEvent[]): NoteEvent[][] {
  const buckets: NoteEvent[][] = Array.from({ length: STEPS_PER_PHRASE }, () => []);
  for (const e of events) buckets[e.step]?.push(e);
  return buckets;
}

/** 경로 → 곡은 첫 화면용 작은 모듈(tracks.ts)에 있다 — 테스트·기존 import 호환으로 다시 내보낸다 */
export { QUIET_GAME_IDS, trackForPath } from './tracks';

// ── 박자 계산 (순수) ─────────────────────────────────────────

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/** 스윙: 뒷박 8분음표(16분음표 자리 2, 6, 10, 14)를 늦춘다 */
export function swingOffset(step: number, swing: number, stepDur: number): number {
  return step % 4 === 2 ? swing * stepDur : 0;
}

/**
 * 오디오 시계 위의 16분음표 박자기. 예약 창(now + ahead) 안에 들어온 박을 차례로 꺼낸다.
 * 불변식: collect 뒤에는 now + ahead 이전의 모든 박이 이미 반환되었다.
 */
export class StepClock {
  nextStep = 0;

  constructor(
    readonly stepDur: number,
    readonly startTime: number,
  ) {}

  timeOf(step: number): number {
    return this.startTime + step * this.stepDur;
  }

  collect(now: number, ahead: number): { step: number; time: number }[] {
    const out: { step: number; time: number }[] = [];
    while (this.timeOf(this.nextStep) < now + ahead) {
      out.push({ step: this.nextStep, time: this.timeOf(this.nextStep) });
      this.nextStep++;
    }
    return out;
  }

  /** 타이머가 오래 멈췄다 돌아오면(백그라운드 등) 놓친 박을 한꺼번에 울리지 않고 건너뛴다. */
  resync(now: number, tolerance = 0.05): void {
    if (this.timeOf(this.nextStep) < now - tolerance) {
      this.nextStep = Math.ceil((now - this.startTime) / this.stepDur);
    }
  }

  /** now + margin 이후 첫 마디 시작 박 */
  nextBarStep(now: number, margin = 0.05): number {
    const raw = Math.ceil((now + margin - this.startTime) / this.stepDur);
    const bar = Math.ceil(Math.max(raw, this.nextStep) / STEPS_PER_BAR);
    return bar * STEPS_PER_BAR;
  }
}

// ── 음색 (WebAudio) ──────────────────────────────────────────

interface VoiceCtx {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

function env(param: AudioParam, t: number, attack: number, peak: number, decay: number): void {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function partial(v: VoiceCtx, t: number, freq: number, gain: number, decay: number, attack = 0.003, type: OscillatorType = 'sine'): void {
  const osc = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env(g.gain, t, attack, gain, decay);
  osc.connect(g);
  g.connect(v.out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.03);
}

/** 마림바: 막대의 부분음 1 : 3.92 : 9.24, 높은 부분음일수록 빨리 사라진다 */
function marimba(v: VoiceCtx, t: number, f: number, vel: number): void {
  partial(v, t, f, 0.26 * vel, 0.9);
  partial(v, t, f * 3.92, 0.07 * vel, 0.22);
  if (f * 9.24 < 9000) partial(v, t, f * 9.24, 0.025 * vel, 0.06, 0.001);
}

/** 오르골/첼레스타: 기음 + 약한 2·3배음, 짧은 감쇠 */
function musicBox(v: VoiceCtx, t: number, f: number, vel: number): void {
  partial(v, t, f, 0.18 * vel, 0.7, 0.002);
  partial(v, t, f * 2, 0.04 * vel, 0.35, 0.002);
  partial(v, t, f * 3, 0.018 * vel, 0.18, 0.002);
}

/** FM 종: 변조기 1.4배, 변조 지수가 빠르게 줄어 금속성에서 맑은 음으로 */
function bell(v: VoiceCtx, t: number, f: number, vel: number): void {
  const { ctx } = v;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const amp = ctx.createGain();
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(f * 1.4, t);
  modGain.gain.setValueAtTime(f * 3.5, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + 0.45);
  env(amp.gain, t, 0.002, 0.12 * vel, 1.4);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  car.connect(amp);
  amp.connect(v.out);
  car.start(t);
  mod.start(t);
  car.stop(t + 1.45);
  mod.stop(t + 1.45);
}

/** 칼림바: 기음 + 5.4배의 아주 짧은 금속 부분음 */
function kalimba(v: VoiceCtx, t: number, f: number, vel: number): void {
  partial(v, t, f, 0.24 * vel, 1.1, 0.002);
  partial(v, t, f * 5.4, 0.05 * vel, 0.07, 0.001);
  partial(v, t, f * 2, 0.03 * vel, 0.3, 0.002);
}

/** 부드러운 패드: 살짝 어긋난 삼각파 두 개 + 저역 통과 */
function pad(v: VoiceCtx, t: number, f: number, vel: number, dur: number): void {
  const { ctx } = v;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const g = ctx.createGain();
  const peak = 0.035 * vel;
  const attack = Math.min(0.4, dur * 0.3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  lp.connect(g);
  g.connect(v.out);
  for (const cents of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    osc.detune.setValueAtTime(cents, t);
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + dur + 0.55);
  }
}

/** 베이스: 삼각파 + 2·3배음 (폰 스피커는 기음 대신 배음으로 음높이를 들려준다) */
function bass(v: VoiceCtx, t: number, f: number, vel: number, dur: number): void {
  const d = Math.min(0.6, Math.max(0.12, dur * 0.9));
  partial(v, t, f, 0.2 * vel, d, 0.006, 'triangle');
  partial(v, t, f * 2, 0.07 * vel, d * 0.7, 0.006);
  partial(v, t, f * 3, 0.03 * vel, d * 0.5, 0.006);
}

function shaker(v: VoiceCtx, t: number, vel: number): void {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  const g = ctx.createGain();
  env(g.gain, t, 0.004, 0.05 * vel, 0.045);
  src.connect(hp);
  hp.connect(g);
  g.connect(v.out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + 0.07);
}

function click(v: VoiceCtx, t: number, vel: number): void {
  partial(v, t, 1760, 0.04 * vel, 0.025, 0.001);
  partial(v, t, 2640, 0.015 * vel, 0.015, 0.001);
}

function playVoice(v: VoiceCtx, e: NoteEvent, t: number, stepDur: number): void {
  const f = midiToFreq(e.midi);
  const dur = e.len * stepDur;
  switch (e.voice) {
    case 'marimba':
      return marimba(v, t, f, e.vel);
    case 'musicBox':
      return musicBox(v, t, f, e.vel);
    case 'bell':
      return bell(v, t, f, e.vel);
    case 'kalimba':
      return kalimba(v, t, f, e.vel);
    case 'pad':
      return pad(v, t, f, e.vel, dur);
    case 'bass':
      return bass(v, t, f, e.vel, dur);
    case 'shaker':
      return shaker(v, t, e.vel);
    case 'click':
      return click(v, t, e.vel);
  }
}

// ── 재생기 ───────────────────────────────────────────────────

/** 스케줄러 타이머 간격 (ms) */
export const LOOKAHEAD_MS = 25;
/** 오디오 시계 기준 예약 창 (초). 폰에서 메인 스레드가 바쁠 때를 대비해 100ms보다 조금 넉넉히. */
export const SCHEDULE_AHEAD = 0.12;
/** 곡 전환 교차 페이드 길이 (초) */
export const CROSSFADE = 1;

interface Player {
  spec: TrackSpec;
  gain: GainNode;
  clock: StepClock;
  /** 이 박부터는 예약하지 않는다 (페이드아웃 중) */
  stopStep: number | null;
  phrases: Map<number, NoteEvent[][]>;
}

export class MusicEngine {
  private desired: TrackId | null = null;
  private players: Player[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;

  constructor(private readonly engine: SfxEngine = defaultEngine) {
    engine.onChange(() => this.sync());
  }

  /** 지금 화면의 곡 (null = 조용히). 잠금 해제 전이면 기억만 해 둔다. */
  setTrack(id: TrackId | null): void {
    if (id === this.desired) return;
    this.desired = id;
    this.sync();
  }

  currentTrack(): TrackId | null {
    return this.desired;
  }

  /** 테스트/디버그용 */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /** 설정·잠금·화면 상태에 맞춰 재생 상태를 맞춘다. */
  sync(): void {
    const engine = this.engine;
    if (!engine.isUnlocked() || !engine.isMusicEnabled()) {
      this.stopAll(0.3);
      return;
    }
    if (!this.ctx) {
      const out = engine.getMusicOutput();
      if (!out) return;
      this.ctx = out.ctx;
      this.out = out.out;
    }
    const playing = this.activePlayer();
    if ((playing?.spec.id ?? null) !== this.desired) this.switchTo(this.desired);
    if (engine.isPageHidden() || this.players.length === 0) this.stopTimer();
    else this.startTimer();
  }

  private activePlayer(): Player | undefined {
    return this.players.find((p) => p.stopStep === null);
  }

  private switchTo(id: TrackId | null): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    const now = ctx.currentTime;
    const current = this.activePlayer();
    let startAt = now + 0.08;
    if (current) {
      // 지금 곡의 다음 마디 경계에서 바꾼다
      const barStep = current.clock.nextBarStep(now, SCHEDULE_AHEAD);
      startAt = current.clock.timeOf(barStep);
      if (startAt - now > 3) startAt = now + 0.1; // 아주 느린 곡이라도 너무 오래 기다리지 않게
      this.fadeOut(current, startAt, CROSSFADE);
    }
    if (!id) return;
    const spec = TRACKS[id];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(spec.level, startAt + (current ? CROSSFADE * 0.6 : CROSSFADE * 1.5));
    gain.connect(out);
    this.players.push({ spec, gain, clock: new StepClock(stepSeconds(spec.bpm), startAt), stopStep: null, phrases: new Map() });
  }

  private fadeOut(p: Player, at: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const start = Math.max(now, at);
    const g = p.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.setValueAtTime(Math.max(0.0001, g.value), start);
    g.exponentialRampToValueAtTime(0.0001, start + seconds);
    const endStep = Math.ceil((start + seconds - p.clock.startTime) / p.clock.stepDur);
    p.stopStep = Math.max(p.clock.nextStep, endStep);
    // 남은 음이 다 울린 뒤 연결을 끊는다
    const ms = (start + seconds - now + 2) * 1000;
    setTimeout(() => {
      try {
        p.gain.disconnect();
      } catch {
        // 이미 끊김
      }
      this.players = this.players.filter((x) => x !== p);
      if (this.players.length === 0) this.stopTimer();
    }, ms);
  }

  private stopAll(seconds: number): void {
    for (const p of this.players) if (p.stopStep === null) this.fadeOut(p, 0, seconds);
    if (this.players.length === 0) this.stopTimer();
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!this.noise) this.noise = makeNoise(ctx);
    for (const p of this.players) {
      p.clock.resync(now);
      const voice: VoiceCtx = { ctx, out: p.gain, noise: this.noise };
      for (const { step, time } of p.clock.collect(now, SCHEDULE_AHEAD)) {
        if (p.stopStep !== null && step >= p.stopStep) break;
        this.playStep(p, voice, step, time);
      }
    }
  }

  private playStep(p: Player, voice: VoiceCtx, step: number, time: number): void {
    const phraseIndex = Math.floor(step / STEPS_PER_PHRASE);
    let buckets = p.phrases.get(phraseIndex % PHRASE_VARIANTS);
    if (!buckets) {
      buckets = bucketPhrase(generatePhrase(p.spec, phraseIndex));
      p.phrases.set(phraseIndex % PHRASE_VARIANTS, buckets);
    }
    const events = buckets[step % STEPS_PER_PHRASE];
    if (!events || events.length === 0) return;
    const t = time + swingOffset(step, p.spec.swing, p.clock.stepDur);
    for (const e of events) {
      try {
        playVoice(voice, e, t, p.clock.stepDur);
      } catch {
        // 한 음 실패가 음악 전체를 멈추지 않게
      }
    }
  }
}

/**
 * 악절 하나를 t0부터 통째로 예약한다 (스케줄러 없이). OfflineAudioContext로 음량을 재거나
 * 개발 중 곡을 미리 들어 볼 때 쓴다. 앱은 MusicEngine의 스케줄러를 쓴다.
 */
export function schedulePhrase(ctx: BaseAudioContext, out: AudioNode, spec: TrackSpec, phraseIndex: number, t0: number): number {
  const voice: VoiceCtx = { ctx: ctx as AudioContext, out, noise: makeNoise(ctx) };
  const stepDur = stepSeconds(spec.bpm);
  for (const e of generatePhrase(spec, phraseIndex)) {
    playVoice(voice, e, t0 + e.step * stepDur + swingOffset(e.step, spec.swing, stepDur), stepDur);
  }
  return t0 + STEPS_PER_PHRASE * stepDur;
}

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** 앱 전역 배경음악 */
export const music = new MusicEngine();
