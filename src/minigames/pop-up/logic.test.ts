import { describe, expect, it } from 'vitest';
import { createSeededRng, type RNG } from '../../lib/rng';
import {
  CELL_COUNT,
  POP_UP_CONFIG as C,
  boop,
  comboBonus,
  createPopUpState,
  difficulty,
  freeCells,
  step,
  type Pop,
  type PopKind,
  type PopUpState,
} from './logic';

const FRAME = 16;

function withPop(state: PopUpState, cell: number, kind: PopKind, visibleMs = 1000): PopUpState {
  const cells = state.cells.slice();
  const pop: Pop = { id: 999, kind, shownAt: state.elapsedMs, hideAt: state.elapsedMs + visibleMs, variant: 0 };
  cells[cell] = pop;
  return { ...state, cells };
}

/** 등장하지 않게 스폰을 멀리 미룬 상태 */
function quiet(state: PopUpState = createPopUpState()): PopUpState {
  return { ...state, nextSpawnMs: 1e9 };
}

interface BotOptions {
  /** 올라온 뒤 반응까지 걸리는 시간 (ms) */
  reactionMs: (rng: RNG) => number;
  /** 일반/황금 말랑을 누르려 시도할 확률 */
  attempt: number;
  /** 가시 말랑을 실수로 누를 확률 (가시 1마리당 1회 판정) */
  spikyMistake: number;
}

/** 봇 플레이 시뮬레이션. 게임 RNG와 봇 RNG를 분리해 결정적으로 만든다. */
function playBot(seed: number, opts: BotOptions): PopUpState {
  const rng = createSeededRng(seed);
  const botRng = createSeededRng(seed ^ 0x9e3779b9);
  const plan = new Map<number, number | null>(); // pop id → 누를 시각 (null = 누르지 않음)
  let s = createPopUpState();
  let guard = 0;
  while (!s.finished && guard++ < 10_000) {
    s = step(s, FRAME, rng).state;
    for (let i = 0; i < CELL_COUNT; i++) {
      const pop = s.cells[i];
      if (!pop) continue;
      if (!plan.has(pop.id)) {
        const wants = pop.kind === 'spiky' ? botRng() < opts.spikyMistake : botRng() < opts.attempt;
        plan.set(pop.id, wants ? pop.shownAt + opts.reactionMs(botRng) : null);
      }
      const at = plan.get(pop.id);
      if (at != null && s.elapsedMs >= at) s = boop(s, i).state;
    }
  }
  return s;
}

const perfect: BotOptions = { reactionMs: () => 0, attempt: 1, spikyMistake: 0 };
const average: BotOptions = { reactionMs: (r) => 420 + r() * 450, attempt: 0.9, spikyMistake: 0.15 };
const strong: BotOptions = { reactionMs: (r) => 300 + r() * 250, attempt: 0.97, spikyMistake: 0.05 };

describe('pop-up logic', () => {
  it('초기 상태: 빈 컵 9개, 0점', () => {
    const s = createPopUpState();
    expect(s.cells).toHaveLength(CELL_COUNT);
    expect(s.cells.every((c) => c === null)).toBe(true);
    expect(s.score).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('한 컵에는 한 마리만 올라온다', () => {
    const rng = createSeededRng(7);
    let s = createPopUpState();
    const owner = new Map<number, number>(); // cell → pop id
    while (!s.finished) {
      const out = step(s, FRAME, rng);
      for (const ev of out.events) {
        if (ev.type !== 'show') continue;
        // 등장한 컵은 직전 프레임에 비어 있어야 한다
        expect(s.cells[ev.cell]).toBeNull();
      }
      s = out.state;
      s.cells.forEach((p, i) => {
        if (p) owner.set(i, p.id);
      });
      expect(s.cells.filter(Boolean).length).toBeLessThanOrEqual(CELL_COUNT);
    }
    expect(owner.size).toBeGreaterThan(0);
  });

  it('가득 찬 컵에는 등장하지 않는다', () => {
    let s = createPopUpState();
    for (let i = 0; i < CELL_COUNT; i++) s = withPop(s, i, 'normal', 5000);
    s = { ...s, nextSpawnMs: 0 };
    const out = step(s, FRAME, createSeededRng(1));
    expect(out.events.filter((e) => e.type === 'show')).toHaveLength(0);
    expect(freeCells(out.state)).toHaveLength(0);
  });

  it('빈 컵을 누르면 아무 일도 없다', () => {
    const s = { ...quiet(), score: 40, combo: 3 };
    const out = boop(s, 4);
    expect(out.event.type).toBe('empty');
    expect(out.state).toBe(s);
    expect(boop(s, 99).event.type).toBe('empty');
  });

  it('일반 말랑 톡: +10, 콤보 증가, 컵이 비워진다', () => {
    const out = boop(withPop(quiet(), 2, 'normal'), 2);
    expect(out.event).toMatchObject({ type: 'boop', kind: 'normal', points: C.points.normal });
    expect(out.state.score).toBe(C.points.normal);
    expect(out.state.combo).toBe(1);
    expect(out.state.boops).toBe(1);
    expect(out.state.cells[2]).toBeNull();
    // 같은 말랑이를 두 번 누를 수 없다
    expect(boop(out.state, 2).event.type).toBe('empty');
  });

  it('황금 말랑은 30점, 더 짧게 보인다', () => {
    const out = boop(withPop(quiet(), 0, 'gold'), 0);
    expect(out.state.score).toBe(C.points.gold);
    expect(out.state.golds).toBe(1);

    // 등장 시 보이는 시간 비교 (같은 난이도에서)
    const vis: Record<PopKind, number[]> = { normal: [], gold: [], spiky: [] };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rng = createSeededRng(seed);
      let s = createPopUpState();
      while (!s.finished) {
        s = step(s, FRAME, rng).state;
        const cells = s.cells;
        cells.forEach((p, i) => {
          if (!p) return;
          // 같은 난이도 기준으로 정규화한 보이는 시간
          vis[p.kind].push((p.hideAt - p.shownAt) / difficulty(p.shownAt).visibleMs);
          s = boop(s, i).state; // 바로 치워서 다음 등장이 계속되게
        });
      }
    }
    const maxGold = Math.max(...vis.gold);
    const minNormal = Math.min(...vis.normal);
    expect(vis.gold.length).toBeGreaterThan(0);
    expect(maxGold).toBeLessThan(minNormal);
  });

  it('가시 말랑: 감점(0점 아래 불가) + 콤보 초기화', () => {
    const rich = boop(withPop({ ...quiet(), score: 50, combo: 8 }, 5, 'spiky'), 5);
    expect(rich.event).toEqual({ type: 'spiky', cell: 5, points: C.points.spiky });
    expect(rich.state.score).toBe(50 + C.points.spiky);
    expect(rich.state.combo).toBe(0);
    expect(rich.state.spikes).toBe(1);

    const poor = boop(withPop({ ...quiet(), score: 6, combo: 2 }, 5, 'spiky'), 5);
    expect(poor.state.score).toBe(0);
    expect(poor.event).toMatchObject({ points: -6 });
  });

  it('일반 말랑을 놓치면 콤보만 초기화, 가시 말랑은 그냥 들어가도 괜찮다', () => {
    const base = { ...quiet(), score: 70, combo: 6 };
    const miss = step(withPop(base, 1, 'normal', 100), 120, createSeededRng(1));
    expect(miss.state.combo).toBe(0);
    expect(miss.state.score).toBe(70);
    expect(miss.state.missed).toBe(1);
    expect(miss.state.cells[1]).toBeNull();
    expect(miss.events).toContainEqual({ type: 'escape', cell: 1, kind: 'normal' });

    const spiky = step(withPop(base, 1, 'spiky', 100), 120, createSeededRng(1));
    expect(spiky.state.combo).toBe(6);
    expect(spiky.state.missed).toBe(0);
    expect(spiky.events).toContainEqual({ type: 'retreat', cell: 1 });
  });

  it('콤보 보너스는 단계별로 오르고 상한이 있다', () => {
    expect(comboBonus(4)).toBe(0);
    expect(comboBonus(5)).toBe(C.comboBonusStep);
    expect(comboBonus(10)).toBe(C.comboBonusStep * 2);
    expect(comboBonus(10_000)).toBe(C.maxComboBonus);
    let s = quiet();
    for (let i = 0; i < 5; i++) s = boop(withPop(s, 0, 'normal'), 0).state;
    expect(s.score).toBe(C.points.normal * 5 + C.comboBonusStep);
    expect(s.maxCombo).toBe(5);
  });

  it('시간이 지날수록 어려워진다', () => {
    const a = difficulty(0);
    const b = difficulty(C.durationMs);
    expect(b.spawnInterval).toBeLessThan(a.spawnInterval);
    expect(b.visibleMs).toBeLessThan(a.visibleMs);
    expect(b.spikyChance).toBeGreaterThan(a.spikyChance);
    expect(a.doubleChance).toBe(0);
    expect(b.doubleChance).toBeGreaterThan(0);
  });

  it('후반에는 두 마리가 동시에 올라오기도 한다', () => {
    const rng = createSeededRng(11);
    let s = createPopUpState();
    let doublesEarly = 0;
    let doublesLate = 0;
    while (!s.finished) {
      const out = step(s, FRAME, rng);
      const shows = out.events.filter((e) => e.type === 'show').length;
      if (shows >= 2) {
        if (s.elapsedMs < C.durationMs * C.doubleFrom) doublesEarly++;
        else doublesLate++;
      }
      s = out.state;
    }
    expect(doublesEarly).toBe(0);
    expect(doublesLate).toBeGreaterThan(0);
  });

  it('같은 시드면 같은 결과 (결정적)', () => {
    const run = (seed: number) => {
      const rng = createSeededRng(seed);
      let s = createPopUpState();
      const log: string[] = [];
      while (!s.finished) {
        const out = step(s, FRAME, rng);
        out.events.forEach((e) => log.push(`${out.state.elapsedMs}:${JSON.stringify(e)}`));
        s = out.state;
      }
      return log.join('|');
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
    expect(playBot(5, average).score).toBe(playBot(5, average).score);
  });

  it('30초가 지나면 끝나고, 끝난 뒤에는 변화가 없다', () => {
    const rng = createSeededRng(9);
    let s = createPopUpState();
    let steps = 0;
    while (!s.finished) {
      s = step(s, 1000, rng).state; // 큰 dt는 maxStepMs로 잘린다
      steps++;
    }
    expect(s.elapsedMs).toBe(C.durationMs);
    expect(steps).toBeGreaterThanOrEqual(Math.ceil(C.durationMs / C.maxStepMs));
    expect(s.cells.every((c) => c === null)).toBe(true);
    const after = step(s, 500, rng);
    expect(after.state).toBe(s);
    expect(after.events).toHaveLength(0);
    expect(boop(withPop(s, 0, 'normal'), 0).event.type).toBe('empty');
  });

  it('완벽한 봇: 가시 0회, 점수는 적정 범위', () => {
    const scores = [1, 2, 3, 4, 5].map((seed) => {
      const s = playBot(seed, perfect);
      expect(s.spikes).toBe(0);
      expect(s.missed).toBe(0);
      expect(s.boops).toBeGreaterThan(30);
      return s.score;
    });
    for (const score of scores) {
      expect(score).toBeGreaterThan(550);
      expect(score).toBeLessThan(1100);
    }
  });

  it('보통 실력 < 잘하는 실력 < 완벽 (평균 점수)', () => {
    const avg = (o: BotOptions) => {
      const seeds = Array.from({ length: 20 }, (_, i) => i + 100);
      return seeds.reduce((sum, seed) => sum + playBot(seed, o).score, 0) / seeds.length;
    };
    const a = avg(average);
    const g = avg(strong);
    const p = avg(perfect);
    expect(a).toBeLessThan(g);
    expect(g).toBeLessThan(p);
    // 경제 배율(0.35) 기준: 보통 ≈ 100~150 코인, 잘하면 상한(200) 근처
    expect(a).toBeGreaterThan(250);
    expect(a).toBeLessThan(450);
    expect(g).toBeGreaterThan(450);
  });
});
