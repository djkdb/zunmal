import { describe, expect, it } from 'vitest';
import { FOCUS_ZOOM, SOLO_SPRITE_MAX, computeMatLayout, groupSpriteFor, stepFocusZoom, matBounds, remapPoint, soloSpot, squeezePose, toScreen, toWorld } from './matView';
import { REST_POSE } from './softbody';

describe('mat layout', () => {
  it('혼자 놀 때는 말랑이가 더 크고, 바닥은 여전히 HUD 아래·선반 위', () => {
    for (const [w, h, top, bottom] of [
      [360, 640, 130, 580],
      [390, 844, 140, 780],
      [1024, 768, 120, 700],
    ] as const) {
      const group = computeMatLayout(w, h, { top, bottom });
      const solo = computeMatLayout(w, h, { top, bottom }, { solo: true });
      expect(solo.sprite).toBeGreaterThan(group.sprite * 1.2);
      expect(solo.sprite).toBeLessThanOrEqual(SOLO_SPRITE_MAX);
      expect(solo.groupSprite).toBe(group.sprite);
      expect(group.groupSprite).toBe(group.sprite);
      expect(solo.floorTop).toBeGreaterThan(top);
      expect(solo.floorLeft + solo.floorW).toBeLessThanOrEqual(w);
      // 혼자 자리에 서면 머리가 HUD 아래, 발은 바닥 안
      const b = matBounds(solo);
      const spot = soloSpot(b);
      const s = toScreen(solo, spot.x, spot.y, 0);
      expect(s.y - solo.sprite * 0.95).toBeGreaterThan(top - 1);
      expect(s.y).toBeLessThanOrEqual(solo.floorTop + solo.floorH);
      expect(Math.abs(s.x - w / 2)).toBeLessThan(1);
    }
  });

  it('배치가 바뀌어도 화면 위 같은 자리에 머문다', () => {
    const a = computeMatLayout(360, 640, { top: 130, bottom: 580 });
    const b = computeMatLayout(360, 640, { top: 130, bottom: 580 }, { solo: true });
    const p = remapPoint(a, b, 1.1, 0.9, 0.4);
    const sa = toScreen(a, 1.1, 0.9, 0);
    const sb = toScreen(b, p.x, p.y, 0);
    expect(sb.x).toBeCloseTo(sa.x);
    expect(sb.y).toBeCloseTo(sa.y);
    expect(p.z * b.sprite).toBeCloseTo(0.4 * a.sprite);
  });

  it('360×640 폰: 말랑이 100px 이상, 바닥은 HUD 아래·선반 위, 가로 넘침 없음', () => {
    const l = computeMatLayout(360, 640, { top: 90, bottom: 570 });
    expect(l.sprite).toBeGreaterThanOrEqual(100);
    expect(l.floorTop).toBeGreaterThan(90);
    expect(l.floorTop + l.floorH).toBeLessThanOrEqual(570);
    expect(l.floorLeft + l.floorW).toBeLessThanOrEqual(360);
    const b = matBounds(l);
    // 말랑이 셋이 나란히 설 만큼
    expect(b.w).toBeGreaterThan(2.2);
    expect(b.d).toBeGreaterThan(1.5);
  });

  it('세계 ↔ 화면 왕복, 들어 올리면 위로·앞으로', () => {
    const l = computeMatLayout(400, 800, { top: 80, bottom: 720 });
    const s = toScreen(l, 1.2, 0.8, 0);
    const w = toWorld(l, s.x, s.y);
    expect(w.x).toBeCloseTo(1.2);
    expect(w.y).toBeCloseTo(0.8);
    const up = toScreen(l, 1.2, 0.8, 0.5);
    expect(up.y).toBeLessThan(s.y);
    expect(up.groundY).toBe(s.groundY);
    expect(up.depth).toBeGreaterThan(s.depth);
    expect(toScreen(l, 1, 2, 0).depth).toBeGreaterThan(toScreen(l, 1, 1, 0).depth);
  });

  it('눌린 모양은 부피를 지키고, 안 눌리면 그대로', () => {
    expect(squeezePose(REST_POSE, 0, 0, 0)).toBe(REST_POSE);
    const side = squeezePose(REST_POSE, 0.3, 0, 0);
    expect(side.scaleX).toBeLessThan(1);
    expect(side.scaleY).toBeGreaterThan(1);
    const top = squeezePose(REST_POSE, 0, 0, -0.3);
    expect(top.scaleY).toBeLessThan(1);
    expect(top.scaleX).toBeGreaterThan(1);
    expect(top.scaleX * top.scaleY * top.scaleZ).toBeCloseTo(1);
    const nan = squeezePose(REST_POSE, Number.NaN, 0, 9);
    expect(Number.isFinite(nan.scaleX)).toBe(true);
  });
});

describe('여럿일 때 크기 (수에 따라)', () => {
  const phones = [
    [360, 640, 118, 578],
    [390, 844, 124, 780],
  ] as const;

  it('둘이면 160px 이상, 셋은 그 사이, 넷·다섯은 예전 크기 — 수가 늘수록 작아지기만', () => {
    for (const [w, h, top, bottom] of phones) {
      const size = (n: number) => computeMatLayout(w, h, { top, bottom }, { count: n }).sprite;
      expect(size(2)).toBeGreaterThanOrEqual(160);
      expect(size(3)).toBeLessThanOrEqual(size(2));
      expect(size(3)).toBeGreaterThanOrEqual(size(4));
      expect(size(4)).toBe(size(5));
      expect(size(5)).toBe(computeMatLayout(w, h, { top, bottom }).sprite);
      expect(size(2)).toBeLessThan(computeMatLayout(w, h, { top, bottom }, { solo: true }).sprite + 1);
      // 소품 크기 기준은 수와 상관없이 같다
      expect(computeMatLayout(w, h, { top, bottom }, { count: 2 }).groupSprite).toBe(size(5));
    }
    expect(groupSpriteFor(360, 640, 1)).toBe(groupSpriteFor(360, 640, 2));
  });

  it('모두 매트 안에 선다: 바닥은 HUD 아래·선반 위, 가로 넘침 없음, 몸 N개가 겹치지 않고 놓일 넓이', () => {
    // 말랑이 몸 반지름 (세계 단위, 가장 넓은 모양) ≈ 0.34
    const r = 0.34;
    for (const [w, h, top, bottom] of phones) {
      for (const n of [2, 3, 4, 5]) {
        const l = computeMatLayout(w, h, { top, bottom }, { count: n });
        expect(l.floorTop).toBeGreaterThan(top);
        expect(l.floorTop + l.floorH).toBeLessThanOrEqual(bottom);
        expect(l.floorLeft + l.floorW).toBeLessThanOrEqual(w);
        const b = matBounds(l);
        // 둘은 나란히 설 만큼, 나머지는 격자 칸 수만큼
        expect(b.w).toBeGreaterThanOrEqual(4 * r);
        const cols = Math.floor(b.w / (2 * r));
        const rows = Math.floor(b.d / (2 * r));
        expect(cols * rows).toBeGreaterThanOrEqual(n);
      }
    }
  });
});

describe('잡은 말랑이 살짝 확대 (stepFocusZoom)', () => {
  it('잡으면 부드럽게 1.15배까지, 놓으면 1로 돌아온다', () => {
    let z = 1;
    const seen: number[] = [];
    for (let t = 0; t < 600; t += 16) {
      z = stepFocusZoom(z, true, 16);
      seen.push(z);
    }
    expect(seen[0]).toBeGreaterThan(1);
    expect(seen[0]).toBeLessThan(1.1);
    expect(z).toBe(FOCUS_ZOOM);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    for (let t = 0; t < 600; t += 16) z = stepFocusZoom(z, false, 16);
    expect(z).toBe(1);
  });
  it('움직임 줄이기면 바로, 이상한 값은 범위 안으로', () => {
    expect(stepFocusZoom(1, true, 16, true)).toBe(FOCUS_ZOOM);
    expect(stepFocusZoom(Number.NaN, false, Number.NaN)).toBe(1);
    expect(stepFocusZoom(9, true, 0)).toBe(FOCUS_ZOOM);
  });
});

