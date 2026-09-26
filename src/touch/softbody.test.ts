import { describe, expect, it } from 'vitest';
import { SHAPES } from '../components/malang/shapes';
import { buildJellyMesh, meshVolume } from './jellyMesh';
import { createTouchState, drag, press, type TouchState } from './physics';
import {
  REST_POSE,
  SOFT_TUNING,
  breathLevel,
  setSoftDoze,
  setSoftReducedMotion,
  composePose,
  createScratch,
  createSoftState,
  deformJelly,
  deformPoints,
  isSoftAtRest,
  snapSoft,
  softEnergy,
  softPoke,
  softPress,
  softPull,
  softRelease,
  softTickle,
  softTouch,
  stepSoft,
  type SoftHit,
  type SoftState,
} from './softbody';

const FRAME = 1000 / 60;
const UV = { x: 6, y: 8, w: 108, h: 108 };
const round = buildJellyMesh(SHAPES.round.body, { uvRect: UV });

/** 앞면 가운데를 누른 지점 */
const HIT: SoftHit = { point: { x: 0, y: 40, z: round.depth }, normal: { x: 0, y: 0, z: 1 } };

function run(s: SoftState, ms: number, onFrame?: (s: SoftState) => void): SoftState {
  let st = s;
  for (let t = 0; t < ms; t += FRAME) {
    st = stepSoft(st, FRAME);
    onFrame?.(st);
  }
  return st;
}

function deformed(mesh = round, pose = REST_POSE, soft: SoftState = createSoftState()) {
  const out = new Float32Array(mesh.vertexCount * 3);
  deformJelly(mesh, pose, soft, out, createScratch(mesh));
  return out;
}

function frontCenterZ(out: Float32Array) {
  return out[2]!;
}

describe('softbody: 자국', () => {
  it('누르면 누른 곳이 움푹 들어가고, 놓으면 출렁이며 돌아온다', () => {
    let s = softPress(softTouch(createSoftState(), HIT), 1);
    s = run(s, 800);
    const pressed = deformed(round, REST_POSE, s);
    // 앞 중심 정점(0번)은 중심 바로 근처 → 안으로 들어간다
    const restZ = round.rest[2]!;
    expect(frontCenterZ(pressed)).toBeLessThan(restZ - 5);

    s = softRelease(s);
    let overshoot = false;
    s = run(s, 3000, (st) => {
      const d = st.dents[0]?.depth.x ?? 0;
      if (d < -0.3) overshoot = true; // 반대로 튀어나오는 출렁임
    });
    expect(overshoot).toBe(true);
    expect(s.dents).toHaveLength(0);
  });

  it('자국 개수는 최대 maxDents', () => {
    let s = createSoftState();
    for (let i = 0; i < 6; i++) s = softTouch(s, { ...HIT, point: { ...HIT.point, x: i * 5 } });
    expect(s.dents.length).toBeLessThanOrEqual(SOFT_TUNING.maxDents);
    expect(s.dents.filter((d) => d.active)).toHaveLength(1);
  });
});

describe('softbody: 부피 보존', () => {
  const V0 = round.volume;

  it('깊게 누른 자국: 나머지 몸이 부풀어 부피가 1% 안에서 유지된다', () => {
    const s = run(softPress(softTouch(createSoftState(), HIT), 1), 1500);
    const out = deformed(round, REST_POSE, s);
    const v = meshVolume(out, round.index);
    expect(Math.abs(v - V0) / V0).toBeLessThan(0.01);
    // 보정이 없으면 부피가 줄어든다 (보정이 실제로 일하고 있는지)
    const raw = new Float32Array(round.vertexCount * 3);
    deformJelly(round, REST_POSE, s, raw, createScratch(round), { preserveVolume: false });
    expect(meshVolume(raw, round.index)).toBeLessThan(V0 * 0.99);
  });

  it('손가락 쪽으로 당겨도 부피 유지', () => {
    let s = softTouch(createSoftState(), HIT);
    s = run(softPull(s, { x: 40, y: 30 }), 1500);
    const v = meshVolume(deformed(round, REST_POSE, s), round.index);
    expect(Math.abs(v - V0) / V0).toBeLessThan(0.01);
  });

  it('전체 눌림·늘어남·기울기·비틀림은 부피를 바꾸지 않는다', () => {
    let t: TouchState = press(createTouchState(), { x: 0.3, y: -0.4 }, 1);
    for (let i = 0; i < 60; i++) t = { ...t, squash: { ...t.squash, x: t.squash.target } };
    const soft: SoftState = { ...createSoftState(), twist: { x: 0.4, v: 0, target: 0 }, sway: { x: -0.2, v: 0, target: 0 } };
    for (const touch of [t, drag(t, { x: 0.8, y: -1.4 })]) {
      const settledTouch = {
        ...touch,
        squash: { ...touch.squash, x: touch.squash.target },
        lean: { ...touch.lean, x: touch.lean.target },
      };
      const pose = composePose(settledTouch, { ...soft, reducedMotion: true });
      expect(pose.scaleX * pose.scaleY * pose.scaleZ).toBeCloseTo(1, 6);
      const v = meshVolume(deformed(round, pose, soft), round.index);
      expect(Math.abs(v - V0) / V0).toBeLessThan(0.005);
    }
  });

  it('모든 모양에서 누름 + 당김 + 눌림 자세의 부피가 2% 안', () => {
    for (const shape of Object.values(SHAPES)) {
      const mesh = buildJellyMesh(shape.body, { uvRect: UV });
      const hit: SoftHit = { point: { x: 0, y: mesh.center.y, z: mesh.depth }, normal: { x: 0, y: 0, z: 1 } };
      const s = run(softPress(softTouch(createSoftState(), hit), 0.8), 1000);
      const touch = press(createTouchState(), { x: 0, y: 0 }, 1);
      const pose = composePose({ ...touch, squash: { ...touch.squash, x: touch.squash.target } }, s);
      const v = meshVolume(deformed(mesh, pose, s), mesh.index);
      expect(Math.abs(v - mesh.volume) / mesh.volume, shape.key).toBeLessThan(0.02);
    }
  });
});

describe('softbody: 안정성·에너지', () => {
  it('찌른 뒤 에너지는 줄어들고 3초 안에 멈춘다', () => {
    let s = softPoke(createSoftState(), HIT, 1);
    s = softRelease(s, { x: 900, y: -600 }); // 튕기듯 놓기
    const e0 = softEnergy(s);
    expect(e0).toBeGreaterThan(0);
    const energies: number[] = [];
    s = run(s, 3000, (st) => energies.push(softEnergy(st)));
    // 1초 구간마다 확실히 줄어든다
    const at = (ms: number) => energies[Math.floor(ms / FRAME)]!;
    expect(at(1000)).toBeLessThan(e0 * 0.3);
    expect(at(2000)).toBeLessThan(at(1000));
    s = run(s, 10_000);
    expect(isSoftAtRest(s)).toBe(true);
  });

  it('무작위 입력과 큰 dt, NaN 에도 값이 유한하고 한계 안에 머문다', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let s = createSoftState();
    const out = new Float32Array(round.vertexCount * 3);
    const scratch = createScratch(round);
    for (let i = 0; i < 2000; i++) {
      const r = rnd();
      const hit: SoftHit = {
        point: { x: (rnd() - 0.5) * 80, y: rnd() * 80, z: rnd() * 30 },
        normal: { x: rnd() - 0.5, y: rnd() - 0.5, z: rnd() },
      };
      if (r < 0.15) s = softTouch(s, hit);
      else if (r < 0.3) s = softPress(s, rnd() * 3 - 1);
      else if (r < 0.45) s = softPull(s, { x: (rnd() - 0.5) * 900, y: (rnd() - 0.5) * 900 });
      else if (r < 0.55) s = softPoke(s, hit, rnd());
      else if (r < 0.6) s = softTickle(s, rnd() - 0.5);
      else if (r < 0.7) s = softRelease(s, { x: (rnd() - 0.5) * 1e5, y: Number.NaN });
      s = stepSoft(s, r < 0.02 ? 10_000 : r < 0.03 ? Number.NaN : rnd() * 40);
    }
    deformJelly(round, REST_POSE, s, out, scratch);
    expect(out.every((n) => Number.isFinite(n))).toBe(true);
    expect(Math.abs(s.twist.x)).toBeLessThanOrEqual(SOFT_TUNING.twistMax * 2);
    for (const d of s.dents) expect(Math.abs(d.depth.x)).toBeLessThan(60);
    expect(Math.hypot(s.pullX.x, s.pullY.x)).toBeLessThan(SOFT_TUNING.pullMax * 3);
  });

  it('같은 입력이면 같은 결과 (결정적)', () => {
    const script = (st: SoftState) => {
      let s = softPress(softTouch(st, HIT), 0.7);
      s = run(s, 300);
      s = softPull(s, { x: -30, y: 12 });
      s = run(s, 250);
      s = softRelease(s, { x: -500, y: 200 });
      return run(s, 700);
    };
    const a = script(createSoftState());
    const b = script(createSoftState());
    expect(a).toEqual(b);
    expect(deformed(round, REST_POSE, a)).toEqual(deformed(round, REST_POSE, b));
  });

  it('움직임 줄이기에서는 출렁임이 거의 없고 숨쉬지 않는다', () => {
    let s = createSoftState({ reducedMotion: true });
    s = run(s, 2000);
    expect(breathLevel(s)).toBe(0);
    s = softRelease(softPress(softTouch(s, HIT), 1));
    let minDepth = 0;
    run(s, 2000, (st) => (minDepth = Math.min(minDepth, st.dents[0]?.depth.x ?? 0)));
    expect(minDepth).toBeGreaterThan(-0.5);
  });
});

describe('softbody: 숨쉬기·쉬기', () => {
  it('놓은 뒤 몇 초 숨쉬다 멈춘다 (멈추면 그리기를 쉰다)', () => {
    let s = run(createSoftState(), 1500);
    expect(breathLevel(s)).toBeGreaterThan(0.9);
    expect(isSoftAtRest(s)).toBe(false);
    s = run(s, SOFT_TUNING.breathHoldMs + SOFT_TUNING.breathFadeOutMs);
    expect(breathLevel(s)).toBe(0);
    expect(isSoftAtRest(s)).toBe(true);
  });

  it('숨쉬기도 부피를 보존한다', () => {
    const s = run(createSoftState(), 2100);
    const pose = composePose(createTouchState(), s);
    expect(pose.scaleY).not.toBeCloseTo(1, 3);
    expect(pose.scaleX * pose.scaleY * pose.scaleZ).toBeCloseTo(1, 6);
  });

  it('snapSoft 는 남은 값을 지운다', () => {
    const s = snapSoft(run(softRelease(softPoke(createSoftState(), HIT, 1)), 200));
    expect(s.dents).toHaveLength(0);
    expect(s.twist.v).toBe(0);
  });
});

describe('deformPoints', () => {
  it('쉬는 자세에서는 그대로, 기울면 위쪽이 옆으로 간다', () => {
    const src = new Float32Array([10, 0, -2, 10, 80, -2]);
    const out = new Float32Array(6);
    deformPoints(src, 2, 80, REST_POSE, createSoftState(), out);
    expect(Array.from(out)).toEqual(Array.from(src));
    deformPoints(src, 2, 80, { ...REST_POSE, lean: 0.2 }, createSoftState(), out);
    expect(out[0]).toBeCloseTo(10);
    expect(out[3]).toBeCloseTo(10 + 16);
  });
});

describe('doze breathing', () => {
  it('keeps breathing slowly and deeply while dozing, then can rest again', () => {
    let s = createSoftState();
    s = stepSoft(s, 20);
    for (let i = 0; i < 600; i++) s = stepSoft(s, 50); // 30초
    expect(breathLevel(s)).toBe(0);
    expect(isSoftAtRest(s)).toBe(true);
    s = setSoftDoze(s, true);
    expect(breathLevel(s)).toBeGreaterThan(1);
    expect(isSoftAtRest(s)).toBe(false);
    s = setSoftDoze(s, false);
    expect(isSoftAtRest(s)).toBe(true);
    expect(breathLevel(setSoftReducedMotion(setSoftDoze(s, true), true))).toBe(0);
  });
});
