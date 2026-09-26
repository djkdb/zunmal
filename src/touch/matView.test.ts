import { describe, expect, it } from 'vitest';
import { SOLO_SPRITE_MAX, computeMatLayout, matBounds, remapPoint, soloSpot, squeezePose, toScreen, toWorld } from './matView';
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
