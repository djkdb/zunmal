/**
 * 쏙쏙 말랑 — 순수 로직 (React/DOM 무관, 시간·RNG 주입).
 *
 * 규칙
 *  - 30초 동안 3×3 젤리 컵에서 말랑이가 잠깐 쏙 올라온다. 눌러서(톡) 다시 들여보낸다.
 *  - 일반 말랑 10점, 황금 말랑 30점(드묾, 더 짧게 보임).
 *  - 가시 말랑은 누르면 안 된다: 누르면 -15점(0점 아래로는 내려가지 않음) + 콤보 초기화.
 *    가시 말랑이 그냥 들어가면 아무 일도 없다.
 *  - 일반/황금 말랑을 놓치면(그냥 들어가면) 콤보만 초기화된다. 감점은 없다.
 *  - 빈 컵을 누르면 아무 일도 없다 (점수·콤보 변화 없음). 가시 말랑 때문에 마구 누르기는 손해다.
 *  - 콤보 comboStep마다 톡 1회 점수 +comboBonusStep (최대 +maxComboBonus).
 *  - 시간이 지날수록 보이는 시간이 짧아지고 더 자주 올라오며, 후반엔 두 마리가 동시에 올라오기도 한다.
 *  - 한 컵에는 동시에 한 마리만 있다. 들어간 컵은 cellCooldownMs 동안 비어 있다.
 */
import type { RNG } from '../../lib/rng';

export const CELL_COUNT = 9;

export const POP_UP_CONFIG = {
  durationMs: 30_000,
  /** 첫 등장까지 대기 */
  firstSpawnMs: 350,
  spawnIntervalStart: 900, // ms
  spawnIntervalEnd: 470,
  visibleStart: 1450, // ms, 일반 말랑이 올라와 있는 시간
  visibleEnd: 760,
  /** 보이는 시간 무작위 폭 (±) */
  visibleJitter: 0.1,
  /** 황금 말랑은 이 비율만큼만 보인다 */
  goldVisibleFactor: 0.65,
  goldChance: 0.07,
  spikyChanceStart: 0.12,
  spikyChanceEnd: 0.24,
  /** 진행도(0~1)가 이 값을 넘으면 두 마리 동시 등장이 가능 */
  doubleFrom: 0.45,
  doubleChanceMax: 0.35,
  cellCooldownMs: 220,
  points: { normal: 10, gold: 30, spiky: -15 },
  comboStep: 5,
  comboBonusStep: 2,
  maxComboBonus: 10,
  /** 탭 전환 등으로 생긴 큰 dt는 잘라낸다 */
  maxStepMs: 250,
} as const;

export type PopUpConfig = typeof POP_UP_CONFIG;

export type PopKind = 'normal' | 'gold' | 'spiky';

export interface Pop {
  id: number;
  kind: PopKind;
  /** 올라온 시각 (elapsedMs 기준) */
  shownAt: number;
  /** 이 시각이 되면 들어간다 */
  hideAt: number;
  /** 겉모습 선택용 난수 (렌더러가 캐릭터 고르기에 사용) */
  variant: number;
}

export interface PopUpState {
  elapsedMs: number;
  /** 길이 CELL_COUNT. null = 빈 컵 */
  cells: (Pop | null)[];
  /** 컵별 재등장 가능 시각 */
  cooldownUntil: number[];
  nextSpawnMs: number;
  nextId: number;
  score: number;
  combo: number;
  maxCombo: number;
  /** 톡 성공 (일반+황금) */
  boops: number;
  golds: number;
  /** 가시 말랑을 누른 횟수 */
  spikes: number;
  /** 놓친 일반/황금 말랑 */
  missed: number;
  finished: boolean;
}

export type PopUpEvent =
  | { type: 'show'; cell: number; kind: PopKind }
  | { type: 'escape'; cell: number; kind: 'normal' | 'gold' } // 놓침 → 콤보 초기화
  | { type: 'retreat'; cell: number } // 가시 말랑이 무사히 들어감
  | { type: 'end' };

export type BoopEvent =
  | { type: 'boop'; cell: number; kind: 'normal' | 'gold'; points: number; combo: number }
  | { type: 'spiky'; cell: number; points: number }
  | { type: 'empty'; cell: number };

export function createPopUpState(config: PopUpConfig = POP_UP_CONFIG): PopUpState {
  return {
    elapsedMs: 0,
    cells: Array.from({ length: CELL_COUNT }, () => null),
    cooldownUntil: Array.from({ length: CELL_COUNT }, () => 0),
    nextSpawnMs: config.firstSpawnMs,
    nextId: 1,
    score: 0,
    combo: 0,
    maxCombo: 0,
    boops: 0,
    golds: 0,
    spikes: 0,
    missed: 0,
    finished: config.durationMs <= 0,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** 경과 시간에 따른 난이도 */
export function difficulty(elapsedMs: number, config: PopUpConfig = POP_UP_CONFIG) {
  const t = Math.max(0, Math.min(1, elapsedMs / config.durationMs));
  const doubleT = (t - config.doubleFrom) / (1 - config.doubleFrom);
  return {
    spawnInterval: lerp(config.spawnIntervalStart, config.spawnIntervalEnd, t),
    visibleMs: lerp(config.visibleStart, config.visibleEnd, t),
    spikyChance: lerp(config.spikyChanceStart, config.spikyChanceEnd, t),
    doubleChance: t < config.doubleFrom ? 0 : lerp(0, config.doubleChanceMax, doubleT),
  };
}

/** 콤보에 따른 톡 1회 보너스 점수 */
export function comboBonus(combo: number, config: PopUpConfig = POP_UP_CONFIG): number {
  return Math.min(config.maxComboBonus, Math.floor(combo / config.comboStep) * config.comboBonusStep);
}

/** 지금 말랑이가 올라올 수 있는 컵 목록 */
export function freeCells(state: PopUpState): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.cells[i] == null && (state.cooldownUntil[i] ?? 0) <= state.elapsedMs) out.push(i);
  }
  return out;
}

function spawnOne(s: PopUpState, rng: RNG, config: PopUpConfig, events: PopUpEvent[]): void {
  const free = freeCells(s);
  if (free.length === 0) return;
  const cell = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  if (cell === undefined) return;
  const d = difficulty(s.elapsedMs, config);
  const roll = rng();
  const kind: PopKind = roll < d.spikyChance ? 'spiky' : roll < d.spikyChance + config.goldChance ? 'gold' : 'normal';
  const jitter = 1 - config.visibleJitter + rng() * config.visibleJitter * 2;
  const visible = d.visibleMs * jitter * (kind === 'gold' ? config.goldVisibleFactor : 1);
  s.cells[cell] = {
    id: s.nextId,
    kind,
    shownAt: s.elapsedMs,
    hideAt: s.elapsedMs + visible,
    variant: Math.floor(rng() * 1000),
  };
  s.nextId += 1;
  events.push({ type: 'show', cell, kind });
}

/**
 * dt(ms)만큼 진행한다: 들어갈 말랑이 처리 → 새 말랑이 등장 → 종료 판정.
 * 입력 상태는 변경하지 않고 새 상태와 이벤트를 반환한다.
 */
export function step(
  prev: PopUpState,
  dtMs: number,
  rng: RNG,
  config: PopUpConfig = POP_UP_CONFIG,
): { state: PopUpState; events: PopUpEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dt = Math.max(0, Math.min(dtMs, config.maxStepMs));
  const events: PopUpEvent[] = [];
  const s: PopUpState = { ...prev, cells: prev.cells.slice(), cooldownUntil: prev.cooldownUntil.slice() };
  s.elapsedMs = Math.min(config.durationMs, s.elapsedMs + dt);

  // 들어가기
  for (let i = 0; i < CELL_COUNT; i++) {
    const pop = s.cells[i];
    if (!pop || pop.hideAt > s.elapsedMs) continue;
    s.cells[i] = null;
    s.cooldownUntil[i] = s.elapsedMs + config.cellCooldownMs;
    if (pop.kind === 'spiky') {
      events.push({ type: 'retreat', cell: i });
    } else {
      s.combo = 0;
      s.missed += 1;
      events.push({ type: 'escape', cell: i, kind: pop.kind });
    }
  }

  // 등장
  if (s.elapsedMs < config.durationMs) {
    s.nextSpawnMs -= dt;
    while (s.nextSpawnMs <= 0) {
      const d = difficulty(s.elapsedMs, config);
      spawnOne(s, rng, config, events);
      if (d.doubleChance > 0 && rng() < d.doubleChance) spawnOne(s, rng, config, events);
      s.nextSpawnMs += d.spawnInterval;
    }
  }

  if (s.elapsedMs >= config.durationMs) {
    s.finished = true;
    s.cells = s.cells.map(() => null);
    events.push({ type: 'end' });
  }
  return { state: s, events };
}

/** 컵 하나를 누른다. 빈 컵이거나 게임이 끝났으면 상태 변화 없음. */
export function boop(
  prev: PopUpState,
  cell: number,
  config: PopUpConfig = POP_UP_CONFIG,
): { state: PopUpState; event: BoopEvent } {
  const pop = prev.cells[cell];
  if (prev.finished || !pop) return { state: prev, event: { type: 'empty', cell } };

  const s: PopUpState = { ...prev, cells: prev.cells.slice(), cooldownUntil: prev.cooldownUntil.slice() };
  s.cells[cell] = null;
  s.cooldownUntil[cell] = s.elapsedMs + config.cellCooldownMs;

  if (pop.kind === 'spiky') {
    const points = Math.max(config.points.spiky, -s.score);
    s.score += points;
    s.combo = 0;
    s.spikes += 1;
    return { state: s, event: { type: 'spiky', cell, points } };
  }

  s.combo += 1;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  const points = config.points[pop.kind] + comboBonus(s.combo, config);
  s.score += points;
  s.boops += 1;
  if (pop.kind === 'gold') s.golds += 1;
  return { state: s, event: { type: 'boop', cell, kind: pop.kind, points, combo: s.combo } };
}
