/**
 * 촉감별 물리 (physics.ts·softbody.ts·world.ts 가 data/materials.ts 의 값을 읽는다).
 */
import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialFeel } from '../data/materials';
import {
  NEUTRAL_FEEL,
  createTouchState,
  drag,
  isAtRest,
  peelPlan,
  press,
  recoverMs,
  release,
  step,
  stretchAmount,
  toTransform,
  type TouchState,
} from './physics';
import { createSoftState, softPull, softRelease, softTouch, softPress, stepSoft, pullLimits, type SoftState } from './softbody';
import { addBody, createWorld, getBody, pairStick, releaseBody, grabBody, moveHeld, stepWorld, type World } from './world';

const feel = (id: keyof typeof MATERIALS): MaterialFeel => MATERIALS[id].feel;

function run(s: TouchState, ms: number, frame = 16): TouchState {
  let out = s;
  for (let t = 0; t < ms; t += frame) out = step(out, frame);
  return out;
}

/** 꾹 1초 누른 뒤 놓고, 눌림이 처음의 10% 아래로 돌아오기까지 걸린 시간 (ms) */
function timeToRecover(f: MaterialFeel): number {
  let s = createTouchState({ feel: f });
  for (let t = 0; t < 1000; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
  const start = s.squash.x - f.sag;
  s = release(s);
  for (let t = 0; t < 6000; t += 16) {
    s = step(s, 16);
    // 출렁이며 지나가는 순간이 아니라 "다시 올라오지 않는" 시점: 이후로 계속 10% 안
    if (Math.abs(s.squash.x - f.sag) < start * 0.1 && Math.abs(s.squash.v) < 0.5) return t + 16;
  }
  return Infinity;
}

function zeroCrossings(f: MaterialFeel): number {
  let s = createTouchState({ feel: f });
  for (let t = 0; t < 600; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
  s = release(s);
  let prev = Math.sign(s.squash.x - f.sag);
  let n = 0;
  for (let t = 0; t < 3000; t += 8) {
    s = step(s, 8);
    const sg = Math.sign(s.squash.x - f.sag);
    if (sg !== 0 && sg !== prev) {
      n++;
      prev = sg;
    }
  }
  return n;
}

describe('슬로우 라이징', () => {
  it('놓은 뒤 1.5~3초에 걸쳐 천천히 차오른다 (젤리는 0.15초 만에 쉬는 자세를 지나 출렁인다)', () => {
    const slow = timeToRecover(feel('slowRise'));
    expect(slow).toBeGreaterThanOrEqual(1500);
    expect(slow).toBeLessThanOrEqual(3000);
    expect(recoverMs(feel('slowRise'))).toBeGreaterThan(1500);
    let s = createTouchState({ feel: feel('jelly') });
    for (let t = 0; t < 600; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
    s = release(s);
    let crossed = Infinity;
    for (let t = 0; t < 400 && crossed === Infinity; t += 8) {
      s = step(s, 8);
      if (s.squash.x < 0) crossed = t + 8;
    }
    expect(crossed).toBeLessThan(150);
  });

  it('누를 때는 빠르다 (히스테리시스): 0.25초 만에 거의 다 눌린다', () => {
    let s = createTouchState({ feel: feel('slowRise') });
    for (let t = 0; t < 250; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
    expect(s.squash.x).toBeGreaterThan(s.squash.target * 0.8);
  });

  it('놓고 0.5초 뒤에도 자국이 절반 가까이 남아 있고 출렁이지 않는다', () => {
    let s = createTouchState({ feel: feel('slowRise') });
    for (let t = 0; t < 1000; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
    const start = s.squash.x;
    s = release(s);
    let min = Infinity;
    for (let t = 0; t < 500; t += 16) {
      s = step(s, 16);
      min = Math.min(min, s.squash.x);
    }
    expect(s.squash.x).toBeGreaterThan(start * 0.4);
    expect(min).toBeGreaterThan(0);
    // 끝내 쉬는 자세로 돌아온다
    s = run(s, 5000);
    expect(isAtRest(s)).toBe(true);
    expect(zeroCrossings(feel('slowRise'))).toBe(0);
  });

  it('3D 자국도 천천히 차오른다', () => {
    const hit = { point: { x: 0, y: 40, z: 20 }, normal: { x: 0, y: 0, z: 1 } };
    const depthAfter = (f: MaterialFeel, ms: number) => {
      let s: SoftState = softTouch(createSoftState({ feel: f }), hit);
      for (let t = 0; t < 900; t += 16) s = stepSoft(softPress(s, 1), 16);
      s = softRelease(s);
      for (let t = 0; t < ms; t += 16) s = stepSoft(s, 16);
      return s.dents.reduce((m, d) => Math.max(m, d.depth.x), 0);
    };
    expect(depthAfter(feel('slowRise'), 600)).toBeGreaterThan(5);
    // 젤리 자국은 0.1초도 안 돼 튀어 올라온다
    expect(depthAfter(feel('jelly'), 100)).toBeLessThan(2);
  });
});

describe('탱탱 젤리', () => {
  it('기본 말랑·슬로우 라이징보다 더 여러 번 출렁인다', () => {
    const jelly = zeroCrossings(feel('jelly'));
    expect(jelly).toBeGreaterThan(zeroCrossings(NEUTRAL_FEEL));
    expect(jelly).toBeGreaterThanOrEqual(6);
  });

  it('매트에 떨어지면 슬로우 라이징보다 훨씬 높이 튄다', () => {
    const peak = (id: keyof typeof MATERIALS) => {
      const w = createWorld({ w: 4, d: 4 });
      addBody(w, { id: 'a', x: 2, y: 2, z: 1.2, r: 0.3, material: MATERIALS[id].world });
      let landed = false;
      let top = 0;
      for (let t = 0; t < 2000; t += 16) {
        if (stepWorld(w, 16).some((e) => e.kind === 'land')) landed = true;
        else if (landed) top = Math.max(top, getBody(w, 'a')!.z);
      }

      return top;
    };
    expect(peak('jelly')).toBeGreaterThan(peak('slowRise') * 4);
  });
});

describe('쭉쭉이', () => {
  it('같은 거리를 당기면 기본보다 2~3배 늘어난다', () => {
    const stretch = (f: MaterialFeel) => {
      let s = press(createTouchState({ feel: f }), { x: 0, y: 0 }, 0.3);
      s = run(drag(s, { x: 0, y: -2.2 }), 800);
      return 1 - s.squash.x;
    };
    const base = stretch(NEUTRAL_FEEL) - 1;
    const long = stretch(feel('stretchy')) - 1;
    expect(long / base).toBeGreaterThanOrEqual(2);
    expect(long / base).toBeLessThanOrEqual(3);
    // 화면 크기도 그만큼 (자르지 않는다)
    let s = press(createTouchState({ feel: feel('stretchy') }), { x: 0, y: 0 }, 0.3);
    s = run(drag(s, { x: 0, y: -2.2 }), 800);
    expect(toTransform(s).scaleY).toBeGreaterThan(1.8);
    expect(stretchAmount(s)).toBeLessThanOrEqual(1);
  });

  it('놓으면 반대쪽으로 넘치듯 튕긴다', () => {
    let s = press(createTouchState({ feel: feel('stretchy') }), { x: 0, y: 0 }, 0.3);
    s = run(drag(s, { x: 0, y: -2 }), 800);
    s = release(s);
    let max = 0;
    for (let t = 0; t < 400; t += 8) {
      s = step(s, 8);
      max = Math.max(max, s.squash.x);
    }
    expect(max).toBeGreaterThan(0.25);
  });

  it('3D 당김 한계도 크다', () => {
    expect(pullLimits(feel('stretchy')).max).toBeGreaterThanOrEqual(pullLimits().max * 2);
    const hit = { point: { x: 0, y: 60, z: 20 }, normal: { x: 0, y: 0, z: 1 } };
    let s = softTouch(createSoftState({ feel: feel('stretchy') }), hit);
    s = softPull(s, { x: 0, y: 200 });
    expect(s.pullY.target).toBeGreaterThan(40);
  });
});

describe('찐득이', () => {
  it('쉬는 자세가 살짝 처져 있고 거기서 멈춘다', () => {
    let s = createTouchState({ feel: feel('sticky') });
    expect(s.squash.x).toBeCloseTo(MATERIALS.sticky.feel.sag);
    for (let t = 0; t < 500; t += 16) s = step(press(s, { x: 0, y: 0 }, 1), 16);
    s = run(release(s), 4000);
    expect(isAtRest(s)).toBe(true);
    expect(s.squash.x).toBeCloseTo(MATERIALS.sticky.feel.sag, 2);
  });

  it('손가락을 떼면 잠깐 붙어 있다가 떨어진다: 오래 누를수록 오래', () => {
    const f = feel('sticky');
    const quick = peelPlan(f, 100, false);
    const long = peelPlan(f, 1500, false);
    expect(quick.delayMs).toBeGreaterThan(100);
    expect(long.delayMs).toBeGreaterThan(quick.delayMs);
    expect(long.delayMs).toBeLessThanOrEqual(f.stickMs);
    expect(long.lift).toBeGreaterThan(quick.lift);
    expect(peelPlan(f, 100, true).delayMs).toBeLessThan(quick.delayMs);
    // 다른 촉감은 붙지 않는다
    for (const id of ['slowRise', 'jelly', 'stretchy'] as const) expect(peelPlan(feel(id), 1500, false).delayMs).toBe(0);
  });

  function pair(stickA: 'sticky' | 'jelly', stickB: 'sticky' | 'jelly'): World {
    const w = createWorld({ w: 5, d: 5 });
    addBody(w, { id: 'a', x: 2, y: 2.5, r: 0.3, material: MATERIALS[stickA].world });
    addBody(w, { id: 'b', x: 2.58, y: 2.5, r: 0.3, material: MATERIALS[stickB].world });
    for (let t = 0; t < 300; t += 16) stepWorld(w, 16);
    return w;
  }

  it('두 찐득이는 떨어지려 해도 잠깐 붙어 있다 (젤리 둘은 바로 떨어진다)', () => {
    const gap = (w: World) => Math.hypot(getBody(w, 'a')!.x - getBody(w, 'b')!.x, 0) - 0.6;
    const pull = (w: World) => {
      const a = getBody(w, 'a')!;
      a.vx = -0.8;
      for (let t = 0; t < 120; t += 16) stepWorld(w, 16);
      return gap(w);
    };
    const sticky = pull(pair('sticky', 'sticky'));
    const jelly = pull(pair('jelly', 'jelly'));
    expect(sticky).toBeLessThan(jelly);
    expect(pairStick(MATERIALS.sticky.world, MATERIALS.sticky.world)).toBe(1);
    expect(pairStick(MATERIALS.sticky.world, MATERIALS.jelly.world)).toBeCloseTo(0.25);
    expect(pairStick(MATERIALS.jelly.world, MATERIALS.jelly.world)).toBe(0);
  });

  it('끈적임은 시간이 지나면 풀린다', () => {
    const w = pair('sticky', 'sticky');
    for (let t = 0; t < 2000; t += 16) stepWorld(w, 16);
    const a = getBody(w, 'a')!;
    a.vx = -3;
    for (let t = 0; t < 400; t += 16) stepWorld(w, 16);
    expect(Math.abs(getBody(w, 'a')!.x - getBody(w, 'b')!.x)).toBeGreaterThan(0.7);
  });
});

describe('들고 옆구리에 대기 vs 위로 올리기', () => {
  it('옆에 대고 살짝 밀면 올라타지 않고 맞대어 눌린다', () => {
    const w = createWorld({ w: 5, d: 5 });
    addBody(w, { id: 'a', x: 1.5, y: 2.5, r: 0.3 });
    addBody(w, { id: 'b', x: 2.6, y: 2.5, r: 0.3 });
    for (let t = 0; t < 200; t += 16) stepWorld(w, 16);
    grabBody(w, 'a');
    // 손가락 목표 = b 옆구리 조금 안쪽 (가운데에서 반지름 합 0.85 배)
    for (let x = 1.5; x <= 2.105; x += 0.02) {
      moveHeld(w, 'a', x, 2.5);
      stepWorld(w, 16);
    }
    for (let t = 0; t < 500; t += 16) stepWorld(w, 16);
    const a = getBody(w, 'a')!;
    expect(a.z).toBeLessThan(0.3);
    const c = w.touching.find((k) => k.a === 'a' || k.b === 'a');
    expect(c).toBeDefined();
    expect(Math.abs(c!.nz)).toBeLessThan(0.5);
    releaseBody(w, 'a');
  });
});
