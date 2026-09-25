import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../lib/rng';
import {
  RHYTHM_CONFIG as C,
  comboMultiplier,
  createRhythmState,
  generateChart,
  isFinished,
  judge,
  maxScore,
  sweepMisses,
  type Chart,
  type RhythmState,
} from './logic';

/** 원하는 시간에 노트를 둔 테스트용 차트 */
function chartOf(times: number[]): Chart {
  return {
    beats: times.map((time, i) => ({ time, accent: i % 4 === 0 })),
    notes: times.map((time, i) => ({ time, accent: i % 4 === 0, offbeat: false })),
    endMs: (times[times.length - 1] ?? 0) + C.goodMs + C.tailMs,
  };
}

function pressAll(state: RhythmState, times: number[]): RhythmState {
  let s = state;
  for (const t of times) s = judge(s, t).state;
  return s;
}

describe('리듬 누르기 차트 생성', () => {
  it('노트와 비트는 시간순으로 정렬되고 노트 시간은 겹치지 않는다', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const chart = generateChart(createSeededRng(seed));
      for (let i = 1; i < chart.notes.length; i++) {
        expect(chart.notes[i]!.time).toBeGreaterThan(chart.notes[i - 1]!.time);
      }
      for (let i = 1; i < chart.beats.length; i++) {
        expect(chart.beats[i]!.time).toBeGreaterThan(chart.beats[i - 1]!.time);
      }
    }
  });

  it('같은 시드는 같은 차트, 다른 시드는 다른 차트', () => {
    const a = generateChart(createSeededRng(7));
    const b = generateChart(createSeededRng(7));
    const c = generateChart(createSeededRng(8));
    expect(a).toEqual(b);
    expect(a.notes.map((n) => n.time)).not.toEqual(c.notes.map((n) => n.time));
  });

  it('템포가 점점 빨라진다 (비트 간격이 줄어듦)', () => {
    const chart = generateChart(createSeededRng(3));
    const main = chart.beats.filter((b) => b.time >= C.leadInMs);
    const intervals = main.slice(1).map((b, i) => b.time - main[i]!.time);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!).toBeLessThanOrEqual(intervals[i - 1]! + 1e-9);
    }
    expect(intervals[0]!).toBeCloseTo(60_000 / C.startBpm, 0);
    expect(intervals[intervals.length - 1]!).toBeLessThan(60_000 / (C.endBpm - 3));
  });

  it('4분음표 위주, 후반에 8분음표 쌍, 가끔 쉼표', () => {
    let offbeats = 0;
    let earlyOffbeats = 0;
    let rests = 0;
    let quarters = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const chart = generateChart(createSeededRng(seed));
      const noteTimes = new Set(chart.notes.map((n) => n.time));
      const main = chart.beats.filter((b) => b.time >= C.leadInMs);
      rests += main.filter((b) => !noteTimes.has(b.time)).length;
      for (const n of chart.notes) {
        if (n.offbeat) {
          offbeats++;
          if (n.time < C.leadInMs + C.chartMs * C.eighthFrom) earlyOffbeats++;
        } else quarters++;
      }
      // 강박에는 쉼표가 없다
      for (const b of main) if (b.accent) expect(noteTimes.has(b.time)).toBe(true);
    }
    expect(earlyOffbeats).toBe(0);
    expect(offbeats).toBeGreaterThan(0);
    expect(rests).toBeGreaterThan(0);
    expect(quarters).toBeGreaterThan(offbeats * 2);
  });

  it('카운트인 비트는 첫 노트 이전에만 있고 노트가 없다', () => {
    const chart = generateChart(createSeededRng(5));
    const countIn = chart.beats.filter((b) => b.time < C.leadInMs);
    expect(countIn.length).toBe(C.countInBeats);
    expect(chart.notes[0]!.time).toBe(C.leadInMs);
  });

  it('전체 길이: 약 leadIn + 30초 + 여유', () => {
    for (const seed of [1, 2, 3]) {
      const chart = generateChart(createSeededRng(seed));
      const last = chart.notes[chart.notes.length - 1]!;
      expect(chart.endMs).toBe(last.time + C.goodMs + C.tailMs);
      expect(last.time).toBeLessThanOrEqual(C.leadInMs + C.chartMs);
      expect(chart.endMs).toBeGreaterThan(C.leadInMs + C.chartMs - 1000);
      expect(chart.endMs).toBeLessThan(C.leadInMs + C.chartMs + 2000);
      expect(chart.notes.length).toBeGreaterThan(45);
      expect(chart.notes.length).toBeLessThan(90);
    }
  });
});

describe('리듬 누르기 판정', () => {
  const base = () => createRhythmState(chartOf([1000, 2000, 3000]));

  it('판정 창 경계: ±50 퍼펙트, ±110 좋아요', () => {
    expect(judge(base(), 1000).judgement).toBe('perfect');
    expect(judge(base(), 1000 + C.perfectMs).judgement).toBe('perfect');
    expect(judge(base(), 1000 - C.perfectMs).judgement).toBe('perfect');
    expect(judge(base(), 1000 + C.perfectMs + 1).judgement).toBe('good');
    expect(judge(base(), 1000 - C.perfectMs - 1).judgement).toBe('good');
    expect(judge(base(), 1000 + C.goodMs).judgement).toBe('good');
    expect(judge(base(), 1000 - C.goodMs).judgement).toBe('good');
  });

  it('너무 이르게(창 밖, earlyMiss 안) 누르면 놓침, 더 이르면 무시', () => {
    const early = judge(base(), 1000 - C.goodMs - 1);
    expect(early.judgement).toBe('miss');
    expect(early.state.results[0]).toBe('miss');
    const s = base();
    const far = judge(s, 1000 - C.earlyMissMs - 1);
    expect(far.judgement).toBeNull();
    expect(far.state).toBe(s);
  });

  it('근처에 노트가 없는 입력은 무시하고 콤보를 유지한다', () => {
    let s = judge(base(), 1000).state;
    expect(s.combo).toBe(1);
    const out = judge(s, 1500);
    expect(out.judgement).toBeNull();
    expect(out.points).toBe(0);
    s = out.state;
    expect(s.combo).toBe(1);
    expect(s.miss).toBe(0);
    // 늦은 입력(goodMs 초과)도 무시 — 놓침은 sweep이 처리
    expect(judge(judge(base(), 5000).state, 1000 + C.goodMs + 1).judgement).toBeNull();
  });

  it('노트 하나는 한 번만 판정된다', () => {
    const first = judge(base(), 1000);
    const second = judge(first.state, 1010);
    expect(second.judgement).toBeNull();
    expect(second.state.perfect).toBe(1);
    expect(second.state.score).toBe(first.state.score);
  });

  it('가까운 노트 두 개 중 차이가 작은 쪽을 판정한다', () => {
    const s = createRhythmState(chartOf([1000, 1200]));
    const out = judge(s, 1150);
    expect(out.noteIndex).toBe(1);
    expect(out.judgement).toBe('perfect');
    // 앞 노트는 나중에 sweep으로 놓침
    const swept = sweepMisses(out.state, 1000 + C.goodMs + 1);
    expect(swept.missed).toEqual([0]);
  });

  it('놓침은 콤보를 초기화하고 최대 콤보는 유지', () => {
    let s = createRhythmState(chartOf([1000, 2000, 3000, 4000]));
    s = pressAll(s, [1000, 2000, 3000]);
    expect(s.combo).toBe(3);
    s = judge(s, 4000 - C.goodMs - 20).state;
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(3);
    expect(s.miss).toBe(1);
  });

  it('sweepMisses는 창을 지난 노트만 놓침 처리', () => {
    let s = base();
    let out = sweepMisses(s, 1000 + C.goodMs);
    expect(out.missed).toEqual([]);
    out = sweepMisses(s, 2000 + C.goodMs + 1);
    expect(out.missed).toEqual([0, 1]);
    s = out.state;
    expect(s.miss).toBe(2);
    expect(s.cursor).toBe(2);
    expect(s.combo).toBe(0);
    // 이미 판정된 노트는 다시 놓침이 되지 않는다
    s = judge(s, 3000).state;
    out = sweepMisses(s, 99_999);
    expect(out.missed).toEqual([]);
    expect(out.state.perfect).toBe(1);
  });

  it('isFinished는 endMs 기준', () => {
    const s = base();
    expect(isFinished(s, s.chart.endMs - 1)).toBe(false);
    expect(isFinished(s, s.chart.endMs)).toBe(true);
  });
});

describe('리듬 누르기 점수', () => {
  it('콤보 배율: comboStep마다 +multStep, 최대 maxMultiplier', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(C.comboStep - 1)).toBe(1);
    expect(comboMultiplier(C.comboStep)).toBe(1 + C.multStep);
    expect(comboMultiplier(10_000)).toBe(C.maxMultiplier);
  });

  it('퍼펙트/좋아요 점수 × 콤보 배율', () => {
    const times = Array.from({ length: 12 }, (_, i) => 1000 + i * 500);
    const s = createRhythmState(chartOf(times));
    // 9개 퍼펙트(×1) + 10번째 좋아요(×1.5) + 2개 퍼펙트(×1.5)
    const presses = times.map((t, i) => (i === 9 ? t + 80 : t));
    const end = pressAll(s, presses);
    expect(end.perfect).toBe(11);
    expect(end.good).toBe(1);
    expect(end.score).toBe(9 * 10 + Math.floor(5 * 1.5) + 2 * 15);
    expect(end.maxCombo).toBe(12);
  });

  it('전부 퍼펙트면 maxScore와 같다', () => {
    const chart = generateChart(createSeededRng(11));
    const end = pressAll(createRhythmState(chart), chart.notes.map((n) => n.time));
    expect(end.perfect).toBe(chart.notes.length);
    expect(end.score).toBe(maxScore(chart));
    expect(end.maxCombo).toBe(chart.notes.length);
  });

  it('보정값(calibrationMs)만큼 입력 시간을 당겨 판정', () => {
    const cfg = { ...C, calibrationMs: 40 };
    const s = createRhythmState(chartOf([1000]));
    expect(judge(s, 1040, cfg).deltaMs).toBe(0);
  });
});
