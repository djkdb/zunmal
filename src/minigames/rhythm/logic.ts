/**
 * 리듬 누르기 — 순수 로직 (React/DOM 무관, RNG·시간 주입).
 *
 * 규칙
 *  - 박자(쿼터 비트)가 96 → 132 BPM으로 약 30초 동안 빨라진다.
 *  - 비트 위에 노트가 놓인다: 대부분 4분음표, 후반부에 8분음표 쌍, 가끔 쉼표.
 *  - 노트 시간과 누른 시간의 차이 |d| ≤ perfectMs → 퍼펙트, ≤ goodMs → 좋아요.
 *  - 노트보다 earlyMissMs 이내로 너무 일찍 누르면 그 노트는 놓침(연타 방지).
 *    근처에 노트가 없는 입력은 무시한다(벌점 없음).
 *  - goodMs를 지나도록 판정되지 않은 노트는 sweepMisses가 놓침으로 처리한다.
 *  - 노트 하나는 한 번만 판정된다. 놓침은 콤보를 0으로 만든다.
 *  - 점수 = 기본점(퍼펙트/좋아요) × 콤보 배율(comboStep마다 +multStep, 최대 maxMultiplier), 내림.
 *
 * 시간 단위는 모두 ms, 기준점(0)은 차트 시작 시각이다.
 */
import type { RNG } from '../../lib/rng';

export const RHYTHM_CONFIG = {
  /** 박자가 흐르는 구간 길이 (첫 노트 ~ 마지막 비트) */
  chartMs: 30_000,
  /** 차트 시작 후 첫 노트까지. 이 사이에 카운트인 비트가 울린다. */
  leadInMs: 2_600,
  /** 첫 노트 전 카운트인 비트 수 (노트 없음) */
  countInBeats: 4,
  startBpm: 96,
  endBpm: 132,
  /** 첫 마디(4박)는 쉼표/8분음표 없이 4분음표만 */
  warmupBeats: 4,
  /** 쉼표 확률 (강박 제외, 쉼표 연속 없음) */
  restChance: 0.12,
  /** 8분음표 쌍이 나오기 시작하는 진행도 (0~1) */
  eighthFrom: 0.3,
  /** 8분음표 쌍 확률: 시작 시 min → 끝에서 max */
  eighthChanceMin: 0.12,
  eighthChanceMax: 0.3,
  /** 판정 창 (ms) */
  perfectMs: 50,
  goodMs: 110,
  /** 노트보다 이만큼 이내로 너무 일찍 누르면 놓침 (goodMs 초과 ~ earlyMissMs) */
  earlyMissMs: 200,
  /** 마지막 노트 판정 후 끝나기까지 여유 */
  tailMs: 700,
  /** 입력 지연 보정. 누른 시간에서 이 값을 뺀 뒤 판정한다 (양수 = 입력이 늦게 들어오는 기기). */
  calibrationMs: 0,
  /** 기본 점수 */
  perfectPoints: 10,
  goodPoints: 5,
  /** 콤보 배율: comboStep 콤보마다 +multStep, 최대 maxMultiplier */
  comboStep: 10,
  multStep: 0.5,
  maxMultiplier: 3,
  /** 노트가 화면 가장자리에서 판정 링까지 오는 시간 (표시용) */
  travelMs: 1_500,
} as const;

export type RhythmConfig = { readonly [K in keyof typeof RHYTHM_CONFIG]: number };

export type Judgement = 'perfect' | 'good' | 'miss';

export interface ChartBeat {
  time: number;
  /** 마디 첫 박 (강박) */
  accent: boolean;
}

export interface ChartNote {
  time: number;
  accent: boolean;
  /** 8분음표 쌍의 뒷박 */
  offbeat: boolean;
}

export interface Chart {
  /** 메트로놈 비트 (카운트인 포함, 쉼표 위치에도 울림) — 시간순 */
  beats: ChartBeat[];
  /** 눌러야 할 노트 — 시간순 */
  notes: ChartNote[];
  /** 차트가 끝나는 시각 (마지막 노트 + goodMs + tailMs) */
  endMs: number;
}

/** 진행도(0~1)에 따른 BPM */
export function bpmAt(progress: number, config: RhythmConfig = RHYTHM_CONFIG): number {
  const p = Math.max(0, Math.min(1, progress));
  return config.startBpm + (config.endBpm - config.startBpm) * p;
}

/** RNG로 결정적인 차트를 만든다. 같은 시드 → 같은 차트. */
export function generateChart(rng: RNG, config: RhythmConfig = RHYTHM_CONFIG): Chart {
  const beats: ChartBeat[] = [];
  const notes: ChartNote[] = [];
  const firstInterval = 60_000 / config.startBpm;

  // 카운트인: 첫 노트 이전 비트 (노트 없음)
  for (let k = config.countInBeats; k >= 1; k--) {
    const time = config.leadInMs - k * firstInterval;
    if (time >= 0) beats.push({ time, accent: k === config.countInBeats });
  }

  const endT = config.leadInMs + config.chartMs;
  let t = config.leadInMs;
  let beat = 0;
  let lastWasRest = false;
  while (t <= endT) {
    const progress = (t - config.leadInMs) / config.chartMs;
    const interval = 60_000 / bpmAt(progress, config);
    const accent = beat % 4 === 0;
    beats.push({ time: t, accent });

    // 비트마다 rng를 정확히 한 번 사용해 결정성을 단순하게 유지
    const r = rng();
    const eighthChance =
      progress >= config.eighthFrom
        ? config.eighthChanceMin +
          ((config.eighthChanceMax - config.eighthChanceMin) * (progress - config.eighthFrom)) / (1 - config.eighthFrom)
        : 0;
    const warm = beat < config.warmupBeats;
    const isLast = t + interval > endT;

    if (!warm && !accent && !lastWasRest && !isLast && r < config.restChance) {
      lastWasRest = true;
    } else {
      lastWasRest = false;
      notes.push({ time: t, accent, offbeat: false });
      if (!warm && !isLast && r >= config.restChance && r < config.restChance + eighthChance) {
        notes.push({ time: t + interval / 2, accent: false, offbeat: true });
      }
    }
    t += interval;
    beat++;
  }

  const last = notes[notes.length - 1];
  const endMs = (last ? last.time : config.leadInMs) + config.goodMs + config.tailMs;
  return { beats, notes, endMs };
}

// ── 판정 상태 ───────────────────────────────────────────────

export interface RhythmState {
  chart: Chart;
  /** notes와 같은 길이. null = 아직 판정 전 */
  results: (Judgement | null)[];
  /** 이 인덱스 이전의 노트는 모두 판정됨 (탐색 시작점) */
  cursor: number;
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
}

export function createRhythmState(chart: Chart): RhythmState {
  return {
    chart,
    results: chart.notes.map(() => null),
    cursor: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
  };
}

/** 콤보(이번 타격 포함)에 따른 점수 배율 */
export function comboMultiplier(combo: number, config: RhythmConfig = RHYTHM_CONFIG): number {
  const steps = Math.floor(Math.max(0, combo) / config.comboStep);
  return Math.min(config.maxMultiplier, 1 + steps * config.multStep);
}

/** 판정 하나를 상태에 반영 (노트 i는 판정 전이어야 함) */
function applyJudgement(
  state: RhythmState,
  index: number,
  judgement: Judgement,
  config: RhythmConfig,
): { state: RhythmState; points: number } {
  const results = state.results.slice();
  results[index] = judgement;
  let cursor = state.cursor;
  while (cursor < results.length && results[cursor] !== null) cursor++;

  if (judgement === 'miss') {
    return { state: { ...state, results, cursor, combo: 0, miss: state.miss + 1 }, points: 0 };
  }
  const combo = state.combo + 1;
  const base = judgement === 'perfect' ? config.perfectPoints : config.goodPoints;
  const points = Math.floor(base * comboMultiplier(combo, config));
  return {
    state: {
      ...state,
      results,
      cursor,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      score: state.score + points,
      perfect: state.perfect + (judgement === 'perfect' ? 1 : 0),
      good: state.good + (judgement === 'good' ? 1 : 0),
    },
    points,
  };
}

export interface JudgeOutcome {
  state: RhythmState;
  /** null = 근처에 노트가 없어 무시된 입력 */
  judgement: Judgement | null;
  noteIndex: number | null;
  points: number;
  /** 누른 시간 − 노트 시간 (음수 = 빠름). 무시된 입력이면 null */
  deltaMs: number | null;
}

/**
 * 입력 판정. pressTimeMs는 차트 기준 시각.
 * 판정 전 노트 중 d = press − note ∈ [−earlyMissMs, +goodMs] 인 것 가운데 |d|가 가장 작은 노트
 * (동률이면 앞 노트)를 고른다. 없으면 입력을 무시한다.
 */
export function judge(state: RhythmState, pressTimeMs: number, config: RhythmConfig = RHYTHM_CONFIG): JudgeOutcome {
  const press = pressTimeMs - config.calibrationMs;
  const notes = state.chart.notes;
  let best: number | null = null;
  let bestAbs = Infinity;
  for (let i = state.cursor; i < notes.length; i++) {
    const note = notes[i];
    if (!note) break;
    const d = press - note.time;
    if (d < -config.earlyMissMs) break; // 이후 노트는 더 멀다
    if (state.results[i] !== null || d > config.goodMs) continue;
    const abs = Math.abs(d);
    if (abs < bestAbs) {
      best = i;
      bestAbs = abs;
    }
  }
  if (best === null) return { state, judgement: null, noteIndex: null, points: 0, deltaMs: null };

  const note = notes[best];
  const d = note ? press - note.time : 0;
  const judgement: Judgement =
    Math.abs(d) <= config.perfectMs ? 'perfect' : Math.abs(d) <= config.goodMs ? 'good' : 'miss';
  const out = applyJudgement(state, best, judgement, config);
  return { state: out.state, judgement, noteIndex: best, points: out.points, deltaMs: d };
}

/** 판정 창을 지나친(now − note > goodMs) 미판정 노트를 놓침으로 처리. 새로 놓친 노트 인덱스를 함께 반환. */
export function sweepMisses(
  state: RhythmState,
  nowMs: number,
  config: RhythmConfig = RHYTHM_CONFIG,
): { state: RhythmState; missed: number[] } {
  const now = nowMs - config.calibrationMs;
  const missed: number[] = [];
  let s = state;
  const notes = state.chart.notes;
  for (let i = state.cursor; i < notes.length; i++) {
    const note = notes[i];
    if (!note || now - note.time <= config.goodMs) break;
    if (s.results[i] === null) {
      s = applyJudgement(s, i, 'miss', config).state;
      missed.push(i);
    }
  }
  return { state: s, missed };
}

export function isFinished(state: RhythmState, nowMs: number): boolean {
  return nowMs >= state.chart.endMs;
}

/** 모든 노트를 퍼펙트로 쳤을 때의 점수 (밸런스/테스트용) */
export function maxScore(chart: Chart, config: RhythmConfig = RHYTHM_CONFIG): number {
  let total = 0;
  for (let combo = 1; combo <= chart.notes.length; combo++) {
    total += Math.floor(config.perfectPoints * comboMultiplier(combo, config));
  }
  return total;
}
