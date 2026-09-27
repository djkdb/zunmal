import { describe, expect, it } from 'vitest';
import { SHAPES } from '../components/malang/shapes';
import { MATERIALS } from '../data/materials';
import { buildJellyMesh, meshVolume } from './jellyMesh';
import {
  REST_POSE,
  createScratch,
  createSoftState,
  deformJelly,
  isSoftAtRest,
  softPoke,
  softPress,
  softPull,
  softRelease,
  softTouch,
  stepSoft,
  type SoftHit,
  type SoftState,
} from './softbody';
import { SURFACE_TUNING, fingerRadius } from './surface';

const FRAME = 1000 / 60;
const UV = { x: 6, y: 8, w: 108, h: 108 };
const round = buildJellyMesh(SHAPES.round.body, { uvRect: UV });
const HIT: SoftHit = { point: { x: 0, y: 40, z: round.depth }, normal: { x: 0, y: 0, z: 1 } };
const V0 = round.volume;

function run(s: SoftState, ms: number): SoftState {
  let st = s;
  for (let t = 0; t < ms; t += FRAME) st = stepSoft(st, FRAME);
  return st;
}

function deform(soft: SoftState, preserveVolume = true): Float32Array {
  const out = new Float32Array(round.vertexCount * 3);
  deformJelly(round, REST_POSE, soft, out, createScratch(round), { preserveVolume });
  return out;
}

const skinOf = (m: keyof typeof MATERIALS) => ({ feel: MATERIALS[m].feel, skin: MATERIALS[m].skin });

/** 쉬는 자세 정점 중 조건에 맞는 것들의 법선 방향 변위 (밖 +) */
function normalShift(out: Float32Array, pick: (x: number, y: number, z: number) => boolean): number[] {
  const res: number[] = [];
  for (let v = 0; v < round.vertexCount; v++) {
    const o = v * 3;
    const x = round.rest[o]!;
    const y = round.rest[o + 1]!;
    const z = round.rest[o + 2]!;
    if (!pick(x, y, z)) continue;
    res.push((out[o]! - x) * round.restNormal[o]! + (out[o + 1]! - y) * round.restNormal[o + 1]! + (out[o + 2]! - z) * round.restNormal[o + 2]!);
  }
  return res;
}

const dentDist = (x: number, y: number, r: number) => Math.hypot(x - HIT.point.x, (y - HIT.point.y) / SURFACE_TUNING.fingerAspect) / r;

describe('softbody: 표면 질감 (손끝 자국·테·주름·물결·목)', () => {
  it('손끝 크기 자국: 반지름을 주면 그 크기로, 누를수록 조금만 넓어진다', () => {
    const r = fingerRadius(148 / 240);
    let s = softTouch(createSoftState(skinOf('slowRise')), HIT, r);
    expect(s.dents[0]!.radius).toBeCloseTo(r);
    s = softPress(s, 1);
    expect(s.dents[0]!.radius).toBeLessThan(r * 1.2);
  });

  it('자국 둘레는 밀려난 살이 솟는다 (테), 가운데는 들어간다', () => {
    const r = 14;
    const out = deform(run(softPress(softTouch(createSoftState(skinOf('sticky')), HIT, r), 1), 900), false);
    const inner = normalShift(out, (x, y, z) => z > 5 && dentDist(x, y, r) < 0.5);
    const rim = normalShift(out, (x, y, z) => z > 5 && Math.abs(dentDist(x, y, r) - SURFACE_TUNING.rimAt) < 0.2);
    expect(inner.length).toBeGreaterThan(0);
    expect(rim.length).toBeGreaterThan(0);
    expect(Math.min(...inner)).toBeLessThan(-5);
    expect(Math.max(...rim)).toBeGreaterThan(0.3);
  });

  it('폼은 깊게 누르면 둘레에 주름 골이 생긴다 (주름 세기 0 이면 둘레가 고르다)', () => {
    const spread = (crease: number) => {
      const skin = { ...MATERIALS.slowRise.skin, crease };
      const soft = createSoftState({ feel: MATERIALS.slowRise.feel, skin });
      const out = deform(run(softPress(softTouch(soft, HIT, 14), 1), 900), false);
      const ring = normalShift(out, (x, y, z) => {
        const d = dentDist(x, y, 14);
        return z > 5 && d > 1.4 && d < 2;
      });
      const mean = ring.reduce((a, b) => a + b, 0) / ring.length;
      return Math.sqrt(ring.reduce((a, b) => a + (b - mean) ** 2, 0) / ring.length);
    };
    expect(spread(1)).toBeGreaterThan(spread(0) * 1.5 + 0.2);
  });

  it('깊게 눌러도 부피는 1% 안 (테·주름 포함)', () => {
    for (const m of ['slowRise', 'jelly', 'stretchy', 'sticky'] as const) {
      const s = run(softPress(softTouch(createSoftState(skinOf(m)), HIT, 14), 1), 1200);
      const v = meshVolume(deform(s), round.index);
      expect(Math.abs(v - V0) / V0, m).toBeLessThan(0.01);
    }
  });

  it('젤리는 놓으면 물결이 퍼지고 잦아들어 쉰다, 폼은 물결이 없다', () => {
    const released = (m: 'slowRise' | 'jelly') =>
      softRelease(run(softPress(softTouch(createSoftState(skinOf(m)), HIT, 14), 1), 600), undefined, 0.8);
    expect(released('slowRise').ripple ?? null).toBeNull();
    let s = released('jelly');
    expect(s.ripple).not.toBeNull();
    expect(isSoftAtRest(s)).toBe(false);
    // 물결이 앞면을 실제로 움직인다
    const moved = normalShift(deform(run(s, 120), false), (_x, _y, z) => z > 5);
    expect(Math.max(...moved.map(Math.abs))).toBeGreaterThan(0.5);
    s = run(s, 3000);
    expect(s.ripple ?? null).toBeNull();
    // 숨쉬기까지 끝나면 완전히 쉰다 (그리기를 멈출 수 있다)
    s = run(s, 6000);
    expect(isSoftAtRest(s)).toBe(true);
  });

  it('찌르기도 물결을 일으키고, 움직임 줄이기면 일지 않는다', () => {
    expect(softPoke(createSoftState(skinOf('jelly')), HIT, 1, 14).ripple).not.toBeNull();
    const reduced = softRelease(softPoke(createSoftState({ ...skinOf('jelly'), reducedMotion: true }), HIT, 1), undefined, 1);
    expect(reduced.ripple ?? null).toBeNull();
  });

  it('물결이 지나가는 동안에도 부피가 1% 안', () => {
    let s = softRelease(run(softPress(softTouch(createSoftState(skinOf('jelly')), HIT, 14), 1), 600), undefined, 1);
    for (const ms of [40, 80, 160]) {
      s = run(s, ms);
      const v = meshVolume(deform(s), round.index);
      expect(Math.abs(v - V0) / V0).toBeLessThan(0.01);
    }
  });

  it('쭉쭉이를 당기면 잡은 곳과 몸 사이가 잘록해진다 (목), 부피는 유지', () => {
    const pulled = (neck: number) => {
      const skin = { ...MATERIALS.stretchy.skin, neck };
      const s = softTouch(createSoftState({ feel: MATERIALS.stretchy.feel, skin }), HIT, 14);
      return run(softPull(s, { x: 0, y: 120 }), 1500);
    };
    const width = (s: SoftState) => {
      const out = deform(s);
      // 잡은 곳 둘레 높이의 앞면 두께(z)와 가로 폭
      let lo = Infinity;
      let hi = -Infinity;
      let zMax = -Infinity;
      for (let i = 0; i < out.length; i += 3) {
        const ry = round.rest[i + 1]!;
        if (Math.abs(ry - HIT.point.y) > 6) continue;
        lo = Math.min(lo, out[i]!);
        hi = Math.max(hi, out[i]!);
        zMax = Math.max(zMax, out[i + 2]!);
      }
      return { w: hi - lo, z: zMax, v: meshVolume(out, round.index) };
    };
    const necked = width(pulled(1));
    const plain = width(pulled(0));
    expect(necked.w + necked.z).toBeLessThan((plain.w + plain.z) * 0.97);
    expect(Math.abs(necked.v - V0) / V0).toBeLessThan(0.02);
  });
});
