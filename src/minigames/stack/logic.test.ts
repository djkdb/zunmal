import { describe, expect, it } from 'vitest';
import {
  STACK_CONFIG as C,
  WORLD,
  createStackState,
  drop,
  moveSlider,
  perfectBonus,
  speedForFloor,
  step,
  type StackState,
} from './logic';

/** 슬라이더를 원하는 위치에 둔 상태 */
function withSliderAt(state: StackState, x: number): StackState {
  return { ...state, slider: { ...state.slider, x } };
}

function topOf(state: StackState) {
  const top = state.tower[state.tower.length - 1];
  if (!top) throw new Error('empty tower');
  return top;
}

/** 현재 탑 꼭대기에 정확히 맞춰 내려놓기 */
function perfectDrop(state: StackState) {
  return drop(withSliderAt(state, topOf(state).x));
}

describe('말랑 쌓기 로직', () => {
  it('초기 상태: 바닥 블록은 가운데, 슬라이더는 같은 너비', () => {
    const s = createStackState();
    expect(s.tower).toEqual([{ x: (WORLD.width - C.baseWidth) / 2, w: C.baseWidth }]);
    expect(s.slider.w).toBe(C.baseWidth);
    expect(s.finished).toBe(false);
  });

  it('슬라이더는 벽에서 튕기며 범위를 벗어나지 않는다', () => {
    let s = createStackState();
    const max = WORLD.width - s.slider.w;
    const dirs = new Set<number>();
    for (let i = 0; i < 400; i++) {
      s = step(s, 16);
      expect(s.slider.x).toBeGreaterThanOrEqual(0);
      expect(s.slider.x).toBeLessThanOrEqual(max);
      dirs.add(s.slider.dir);
    }
    expect(dirs).toEqual(new Set([1, -1]));
  });

  it('moveSlider: 오른쪽 벽을 넘으면 반사되고 방향이 바뀐다', () => {
    const w = 100;
    const max = WORLD.width - w;
    const out = moveSlider({ x: max - 10, w, dir: 1 }, 30);
    expect(out.x).toBeCloseTo(max - 20);
    expect(out.dir).toBe(-1);
    const back = moveSlider({ x: 5, w, dir: -1 }, 15);
    expect(back.x).toBeCloseTo(10);
    expect(back.dir).toBe(1);
    // 아주 큰 이동도 범위 안
    const huge = moveSlider({ x: 0, w, dir: 1 }, 10_000);
    expect(huge.x).toBeGreaterThanOrEqual(0);
    expect(huge.x).toBeLessThanOrEqual(max);
  });

  it('dt는 잘린다 (큰 dt로 순간이동하지 않음)', () => {
    const s = createStackState();
    const a = step(s, 5_000);
    const b = step(s, C.maxDtMs);
    expect(a).toEqual(b);
    expect(step(s, -10).slider.x).toBe(s.slider.x);
  });

  it('정확히 겹치면 딱 맞음: 자르지 않음', () => {
    const s = createStackState();
    const top = topOf(s);
    const { state, result } = perfectDrop(s);
    expect(result.kind).toBe('perfect');
    expect(topOf(state)).toEqual(top);
    expect(state.perfects).toBe(1);
    expect(state.perfectStreak).toBe(1);
    expect(state.slider.w).toBe(top.w);
  });

  it('허용 오차(4px) 이내면 딱 맞음으로 정렬, 넘으면 잘림', () => {
    const s = createStackState();
    const top = topOf(s);
    const near = drop(withSliderAt(s, top.x + C.perfectTolerance));
    expect(near.result.kind).toBe('perfect');
    expect(topOf(near.state).x).toBe(top.x);
    const far = drop(withSliderAt(s, top.x + C.perfectTolerance + 1));
    expect(far.result.kind).toBe('trim');
  });

  it('오른쪽으로 넘치면 오른쪽 조각이 잘린다 (너비/x)', () => {
    const s = createStackState();
    const top = topOf(s); // x=80, w=160
    const { state, result } = drop(withSliderAt(s, top.x + 30));
    expect(result.kind).toBe('trim');
    if (result.kind !== 'trim') return;
    expect(result.placed).toEqual({ x: top.x + 30, w: top.w - 30 });
    expect(result.cut).toEqual({ x: top.x + top.w, w: 30 });
    expect(topOf(state)).toEqual(result.placed);
    expect(state.slider.w).toBe(top.w - 30);
    expect(state.perfectStreak).toBe(0);
  });

  it('왼쪽으로 넘치면 왼쪽 조각이 잘린다 (너비/x)', () => {
    const s = createStackState();
    const top = topOf(s);
    const { result } = drop(withSliderAt(s, top.x - 45));
    expect(result.kind).toBe('trim');
    if (result.kind !== 'trim') return;
    expect(result.placed).toEqual({ x: top.x, w: top.w - 45 });
    expect(result.cut).toEqual({ x: top.x - 45, w: 45 });
  });

  it('완전히 빗나가면 게임 오버, 이후 입력은 무시', () => {
    let s = createStackState();
    s = { ...s, tower: [{ x: 200, w: 60 }], slider: { x: 0, w: 60, dir: 1 } };
    const { state, result } = drop(s);
    expect(result.kind).toBe('miss');
    expect(state.finished).toBe(true);
    expect(state.endReason).toBe('miss');
    expect(state.floors).toBe(0);
    expect(drop(state).result.kind).toBe('ignored');
    expect(step(state, 16)).toBe(state);
    // 딱 가장자리만 닿는 경우(겹침 0)도 빗나감
    const edge = drop({ ...s, slider: { x: 140, w: 60, dir: 1 } });
    expect(edge.result.kind).toBe('miss');
  });

  it('딱 맞음 3연속부터 다시 넓어지되 원래 너비를 넘지 않는다', () => {
    let s = drop(withSliderAt(createStackState(), 80 + 40)).state; // 120 → w 120
    expect(topOf(s).w).toBe(120);
    const widths: number[] = [];
    const grew: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const out = perfectDrop(s);
      s = out.state;
      widths.push(topOf(s).w);
      grew.push(out.result.kind === 'perfect' && out.result.grew);
    }
    expect(widths.slice(0, 2)).toEqual([120, 120]);
    expect(widths[2]).toBe(120 + C.regrowAmount);
    expect(grew.slice(0, 3)).toEqual([false, false, true]);
    expect(Math.max(...widths)).toBe(C.baseWidth);
    widths.forEach((w) => expect(w).toBeLessThanOrEqual(C.baseWidth));
    // 넓어진 블록도 월드 안에 있다
    s.tower.forEach((b) => {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(WORLD.width);
    });
    expect(s.maxPerfectStreak).toBe(8);
  });

  it('높이 올라갈수록 빨라지고 최대 속도에서 멈춘다', () => {
    expect(speedForFloor(0)).toBe(C.speedStart);
    expect(speedForFloor(10)).toBeGreaterThan(speedForFloor(5));
    expect(speedForFloor(1000)).toBe(C.maxSpeed);

    let s = createStackState();
    const d0 = Math.abs(step(s, 16).slider.x - s.slider.x);
    for (let i = 0; i < 10; i++) s = perfectDrop(s).state;
    const d10 = Math.abs(step(s, 16).slider.x - s.slider.x);
    expect(d10).toBeGreaterThan(d0);
  });

  it('45초가 지나면 종료', () => {
    let s = createStackState();
    let frames = 0;
    while (!s.finished && frames < 10_000) {
      s = step(s, 16);
      frames++;
    }
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe('time');
    expect(s.elapsedMs).toBe(C.durationMs);
    expect(frames).toBe(Math.ceil(C.durationMs / 16));
    expect(drop(s).result.kind).toBe('ignored');
  });

  it('점수 = 블록 × 10 + 딱 맞음 보너스(10, 15, 20, … 최대 30)', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => perfectBonus(n))).toEqual([10, 15, 20, 25, 30, 30, 30]);
    expect(perfectBonus(0)).toBe(0);

    let s = createStackState();
    s = perfectDrop(s).state; // 10 + 10
    s = perfectDrop(s).state; // 10 + 15
    s = drop(withSliderAt(s, topOf(s).x + 20)).state; // 10
    s = perfectDrop(s).state; // 10 + 10 (연속 초기화)
    expect(s.floors).toBe(4);
    expect(s.perfects).toBe(3);
    expect(s.maxPerfectStreak).toBe(2);
    expect(s.score).toBe(4 * 10 + 10 + 15 + 10);
  });

  it('같은 입력 순서면 같은 결과 (결정적)', () => {
    const play = () => {
      let s = createStackState();
      const log: string[] = [];
      const pattern = [430, 610, 250, 900, 377, 520, 1210, 333];
      for (let i = 0; i < 40 && !s.finished; i++) {
        const wait = pattern[i % pattern.length] ?? 400;
        for (let t = 0; t < wait; t += 16) s = step(s, 16);
        const out = drop(s);
        s = out.state;
        log.push(out.result.kind);
      }
      return { s, log };
    };
    const a = play();
    const b = play();
    expect(a.s).toEqual(b.s);
    expect(a.log).toEqual(b.log);
    expect(a.log.length).toBeGreaterThan(0);
  });
});
