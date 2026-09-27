import { describe, expect, it } from 'vitest';
import {
  faceEllipse,
  faceShadeFactor,
  SURFACE_TUNING,
  creaseDip,
  dentProfile,
  fingerRadius,
  kickRipple,
  neckSqueeze,
  rippleAt,
  rippleFront,
  rippleHeight,
  stepRipple,
  type Ripple,
} from './surface';

describe('손끝 자국 모양', () => {
  it('손끝(약 10mm = 38px) 크기: 혼자 놀 때(240px 그림)와 여럿일 때(140px) 모두 화면에서 같은 크기', () => {
    for (const size of [240, 180, 140]) {
      const unitsPerPx = 148 / size;
      const r = fingerRadius(unitsPerPx);
      // 절반 깊이 지름 ≈ 1.8 r → px 로 되돌리면 손끝 지름
      expect((1.8 * r) / unitsPerPx).toBeGreaterThan(34);
      expect((1.8 * r) / unitsPerPx).toBeLessThan(42);
    }
    expect(fingerRadius(Number.NaN)).toBeGreaterThan(0);
    expect(fingerRadius(100)).toBe(SURFACE_TUNING.fingerRadiusMax);
  });

  it('평평한 바닥: 반지름 절반에서도 거의 가장 깊고, 가장자리는 가파르다 (둥근 그릇보다)', () => {
    const flat = (u: number) => dentProfile(u, 1, 0);
    const bowl = (u: number) => dentProfile(u, 0, 0);
    expect(flat(0)).toBeCloseTo(1);
    expect(flat(0.25)).toBeGreaterThan(0.9);
    expect(flat(0.25)).toBeGreaterThan(bowl(0.25));
    // 벽: 반지름 0.8 → 1.3 사이에서 평평한 쪽이 더 많이 떨어진다
    expect(flat(0.64) - flat(1.69)).toBeGreaterThan(bowl(0.64) - bowl(1.69));
  });

  it('둘레 테는 밖으로 솟는다 (음수), 멀리서는 0', () => {
    const r = SURFACE_TUNING.rimAt;
    expect(dentProfile(r * r, 0.8, 0.3)).toBeLessThan(0);
    expect(dentProfile(r * r, 0.8, 0)).toBeGreaterThan(dentProfile(r * r, 0.8, 0.3));
    expect(Math.abs(dentProfile(25, 0.8, 0.3))).toBeLessThan(1e-3);
    expect(dentProfile(Number.NaN, 0.5, 0.2)).toBeCloseTo(1);
  });

  it('주름은 깊게 누를 때만, 자국 둘레 고리에서만, 골과 등성이가 번갈아 생긴다', () => {
    expect(creaseDip(0, 1.5, 0.2, 1)).toBe(0);
    expect(creaseDip(0, 1.5, 1, 0)).toBe(0);
    expect(creaseDip(0, 0.3, 1, 1)).toBe(0);
    expect(creaseDip(0, 4, 1, 1)).toBe(0);
    const n = SURFACE_TUNING.creaseCount;
    const valley = creaseDip(0, 1.4, 1, 1);
    const ridge = creaseDip(Math.PI / n, 1.4, 1, 1);
    expect(valley).toBeGreaterThan(0.05);
    expect(ridge).toBeLessThan(valley * 0.05);
    expect(valley).toBeLessThanOrEqual(SURFACE_TUNING.creaseDepth);
  });
});

describe('젤리 물결', () => {
  const origin = { x: 0, y: 40, z: 30 };

  it('촉감 세기 0 이면 일지 않는다', () => {
    expect(kickRipple(null, origin, 1, 0)).toBeNull();
    expect(kickRipple(null, origin, 0, 1)).toBeNull();
  });

  it('앞머리는 퍼져 나가고 그 앞은 잔잔하다', () => {
    let r: Ripple | null = kickRipple(null, origin, 1, 1);
    r = stepRipple(r, 50);
    r = stepRipple(r, 50);
    const front = rippleFront(r);
    expect(front).toBeCloseTo((SURFACE_TUNING.waveSpeed * 100) / 1000, 5);
    expect(rippleAt(r, front + SURFACE_TUNING.waveLength)).toBe(0);
    // 앞머리 뒤 반 파장 안쪽에는 물결이 있다
    let peak = 0;
    for (let d = 0; d < front; d += 1) peak = Math.max(peak, Math.abs(rippleAt(r, d)));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(rippleHeight(r) + 1e-9);
  });

  it('시간이 지나면 잦아들어 사라진다 (그리기를 쉴 수 있다)', () => {
    let r: Ripple | null = kickRipple(null, origin, 1, 1);
    let last = rippleHeight(r);
    let t = 0;
    while (r && t < 5000) {
      r = stepRipple(r, 16);
      t += 16;
      const h = rippleHeight(r);
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      last = h;
    }
    expect(r).toBeNull();
    expect(t).toBeLessThan(3000);
  });

  it('높이는 한계를 넘지 않고 큰 dt·NaN 에도 유한하다', () => {
    let r: Ripple | null = null;
    for (let i = 0; i < 10; i++) r = kickRipple(r, origin, 1, 1);
    expect(rippleHeight(r)).toBeLessThanOrEqual(SURFACE_TUNING.waveMaxAmp);
    r = stepRipple(r, Number.NaN);
    r = stepRipple(r, 1e9);
    expect(Number.isFinite(rippleAt(r, 10))).toBe(true);
  });
});

describe('쭉쭉이 목', () => {
  it('잡은 곳과 몸 사이 가운데가 가장 잘록하고, 많이 당길수록 잘록하다', () => {
    expect(neckSqueeze(0.5, 1, 1)).toBeCloseTo(SURFACE_TUNING.neckMax);
    expect(neckSqueeze(0.5, 1, 1)).toBeGreaterThan(neckSqueeze(0.9, 1, 1));
    expect(neckSqueeze(0.5, 1, 1)).toBeGreaterThan(neckSqueeze(0.1, 1, 1));
    expect(neckSqueeze(0.5, 0.1, 1)).toBe(0);
    expect(neckSqueeze(0.5, 1, 0)).toBe(0);
    expect(neckSqueeze(0.5, 0.6, 1)).toBeLessThan(neckSqueeze(0.5, 1, 1));
  });
});

describe('얼굴 비켜 가기 (faceShadeFactor)', () => {
  const face = faceEllipse({ faceY: 72, eyeGap: 16 });
  it('눈 위를 누르면 그늘이 거의 없고, 얼굴에서 멀면 그대로', () => {
    expect(faceShadeFactor(face.cx, face.cy, 14, face)).toBeCloseTo(SURFACE_TUNING.faceShadeKeep);
    expect(faceShadeFactor(face.cx - face.rx, face.cy, 14, face)).toBeLessThan(0.5);
    expect(faceShadeFactor(face.cx, face.cy + 60, 14, face)).toBeCloseTo(1);
    expect(faceShadeFactor(face.cx, face.cy - 60, 10, face)).toBeCloseTo(1);
  });
  it('가까워질수록 줄어들기만 하고, 큰 자국은 더 멀리서부터 옅어진다', () => {
    let prev = 1;
    for (let y = face.cy + 60; y >= face.cy; y -= 2) {
      const f = faceShadeFactor(face.cx, y, 14, face);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      prev = f;
    }
    expect(faceShadeFactor(face.cx, face.cy + 30, 24, face)).toBeLessThan(faceShadeFactor(face.cx, face.cy + 30, 9, face));
  });
  it('NaN 이면 그늘을 줄이지 않는다', () => {
    expect(faceShadeFactor(Number.NaN, Number.NaN, Number.NaN, face)).toBeCloseTo(1);
  });
});

