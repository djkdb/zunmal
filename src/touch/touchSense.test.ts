import { describe, expect, it } from 'vitest';
import { touchVoiceParams, type TouchSense } from '../audio/touchVoice';
import { MATERIALS } from '../data/materials';
import { createTouchState, drag, press, release, step, wobbleHz, type TouchState } from './physics';
import {
  GRAINS_PER_TICK,
  TOUCH_HAPTIC_GAP_MS,
  TOUCH_HAPTIC_PATTERNS,
  createHapticMemory,
  createSenseMemory,
  grainTick,
  hapticDue,
  markHaptic,
  readSense,
  snapStrength,
  type SenseMemory,
} from './touchSense';

const FRAME = 1000 / 60;
const CENTER = { x: 0, y: 0 };

/** 물리를 한 프레임씩 돌리며 읽는다 */
function simulate(
  start: TouchState,
  ms: number,
  input: (t: number, s: TouchState) => { touch: TouchState; held: boolean; finger?: number; peel?: number },
): { senses: TouchSense[]; touch: TouchState } {
  let touch = start;
  let mem: SenseMemory = createSenseMemory();
  const senses: TouchSense[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    const i = input(t, touch);
    touch = step(i.touch, FRAME);
    const r = readSense(touch, mem, FRAME, { held: i.held, fingerSpeed: i.finger ?? 0, peel: i.peel ?? 0 });
    mem = r.mem;
    senses.push(r.sense);
  }
  return { senses, touch };
}

describe('손맛 읽기 (물리 → 소리)', () => {
  it('누르는 동안 눌림 속도가 + 이고, 슬로우 라이징은 놓은 뒤 천천히 차오르는 − 속도가 오래 이어진다', () => {
    const feel = MATERIALS.slowRise.feel;
    const { senses } = simulate(createTouchState({ feel }), 2500, (t, s) =>
      t < 900 ? { touch: press(s, CENTER, Math.min(1, t / 900)), held: true } : { touch: t < 900 + FRAME ? release(s) : s, held: false },
    );
    const pressing = senses.slice(3, 50);
    expect(Math.max(...pressing.map((s) => s.pressVel))).toBeGreaterThan(0.5);
    // 놓고 0.5~1.5초에도 여전히 차오르는 중 (들숨)
    const rising = senses.slice(Math.round(1400 / FRAME), Math.round(2400 / FRAME));
    expect(rising.every((s) => s.pressVel < 0)).toBe(true);
    expect(rising.every((s) => !s.held)).toBe(true);
  });

  it('젤리 출렁임: 변위가 물리 출렁임 박자로 부호를 바꾸고, 목소리 음높이가 그 변위를 그대로 따른다', () => {
    const feel = MATERIALS.jelly.feel;
    const { senses } = simulate(createTouchState({ feel }), 1600, (t, s) =>
      t < 500 ? { touch: press(s, CENTER, 1), held: true } : { touch: t < 500 + FRAME ? release(s) : s, held: false },
    );
    const after = senses.slice(Math.round(520 / FRAME));
    let crossings = 0;
    for (let i = 1; i < after.length; i++) if (Math.sign(after[i]!.jiggle) !== Math.sign(after[i - 1]!.jiggle)) crossings++;
    const seconds = (after.length * FRAME) / 1000;
    const expected = 2 * wobbleHz(feel) * seconds;
    expect(crossings).toBeGreaterThanOrEqual(Math.floor(expected * 0.6));
    expect(crossings).toBeLessThanOrEqual(Math.ceil(expected * 1.4));
    // 음높이 = 기본음 × (1 + 휨 × 변위): 변위가 크면 음이 높다
    const params = after.map((s) => touchVoiceParams('jelly', s));
    const hi = after.reduce((a, b) => (b.jiggle > a.jiggle ? b : a));
    const lo = after.reduce((a, b) => (b.jiggle < a.jiggle ? b : a));
    expect(touchVoiceParams('jelly', hi).tone.freq).toBeGreaterThan(touchVoiceParams('jelly', lo).tone.freq);
    // 출렁임이 잦아들면 소리도 잦아든다
    const early = params.slice(0, 20).reduce((m, p) => Math.max(m, p.tone.gain), 0);
    const late = params.slice(-20).reduce((m, p) => Math.max(m, p.tone.gain), 0);
    expect(late).toBeLessThan(early * 0.5);
  });

  it('쭉쭉이를 당기는 동안 늘어나는 속도가 있고, 멈춰 버티면 0 으로 돌아온다', () => {
    const feel = MATERIALS.stretchy.feel;
    const { senses } = simulate(createTouchState({ feel }), 1200, (t, s) => {
      const k = Math.min(1, t / 500);
      return { touch: drag(press(s, CENTER, 0.2), { x: 0.2 * k, y: -1.6 * k }), held: true };
    });
    expect(Math.max(...senses.slice(0, 30).map((s) => s.stretchVel))).toBeGreaterThan(0.5);
    const holding = senses.slice(-10);
    expect(Math.max(...holding.map((s) => Math.abs(s.stretchVel)))).toBeLessThan(0.2);
    expect(Math.max(...holding.map((s) => s.stretch))).toBeGreaterThan(0.5);
  });

  it('문지름: 손가락 속도만큼 오르고 멈추면 금방 잦아든다, 손을 떼면 0', () => {
    const t0 = createTouchState();
    let mem = createSenseMemory();
    let r = readSense(t0, mem, FRAME, { held: true, fingerSpeed: 0.9, peel: 0 });
    expect(r.sense.rub).toBeCloseTo(0.75);
    mem = r.mem;
    for (let i = 0; i < 12; i++) {
      r = readSense(t0, mem, FRAME, { held: true, fingerSpeed: 0, peel: 0 });
      mem = r.mem;
    }
    expect(r.sense.rub).toBeLessThan(0.15);
    expect(readSense(t0, mem, FRAME, { held: false, fingerSpeed: 2, peel: 0 }).sense.rub).toBe(0);
  });

  it('NaN·큰 dt 에도 값이 유한하다', () => {
    const r = readSense(createTouchState(), createSenseMemory(), Number.NaN, { held: true, fingerSpeed: Number.NaN, peel: Number.NaN });
    for (const v of Object.values(r.sense)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    const r2 = readSense(createTouchState(), r.mem, 1e9, { held: true, fingerSpeed: 1e9, peel: 5 });
    expect(r2.sense.rub).toBeLessThanOrEqual(1);
    expect(r2.sense.peel).toBe(1);
  });

  it('쭉쭉이 "퉁" 크기는 늘어난 만큼', () => {
    const feel = MATERIALS.stretchy.feel;
    let s = createTouchState({ feel });
    for (let i = 0; i < 40; i++) s = step(drag(press(s, CENTER, 0.2), { x: 0, y: -1.8 }), FRAME);
    expect(snapStrength(s)).toBeGreaterThan(0.6);
    expect(snapStrength(createTouchState({ feel }))).toBe(0);
  });
});

describe('촉감 진동', () => {
  it('패턴은 모두 10ms 이상 (많은 기기에서 느껴지는 최소)', () => {
    for (const p of Object.values(TOUCH_HAPTIC_PATTERNS)) for (const ms of p) expect(ms).toBeGreaterThanOrEqual(10);
  });

  it('알갱이 밀도만큼 톡톡 — 간격 제한으로 초당 한계를 넘지 않는다', () => {
    let mem = createHapticMemory();
    let ticks = 0;
    for (let t = 0; t < 2000; t += FRAME) {
      const r = grainTick(mem, 400, FRAME, t);
      mem = r.mem;
      if (r.tick) ticks++;
    }
    const maxPerSec = 1000 / TOUCH_HAPTIC_GAP_MS.tick;
    expect(ticks).toBeLessThanOrEqual(Math.ceil(maxPerSec * 2) + 1);
    expect(ticks).toBeGreaterThan(10);
    // 드문 알갱이는 드문 톡
    let m2 = createHapticMemory();
    let few = 0;
    for (let t = 0; t < 2000; t += FRAME) {
      const r = grainTick(m2, 12, FRAME, t);
      m2 = r.mem;
      if (r.tick) few++;
    }
    expect(few).toBeLessThanOrEqual(Math.ceil((12 * 2) / GRAINS_PER_TICK) + 1);
    expect(grainTick(createHapticMemory(), 0, FRAME, 0).tick).toBe(false);
  });

  it('같은 진동의 간격 제한', () => {
    const m = markHaptic(createHapticMemory(), 'thud', 1000);
    expect(hapticDue(m, 'thud', 1100)).toBe(false);
    expect(hapticDue(m, 'thud', 1000 + TOUCH_HAPTIC_GAP_MS.thud)).toBe(true);
    expect(hapticDue(m, 'peel', 1001)).toBe(true);
  });
});
