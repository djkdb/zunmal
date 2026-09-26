import { describe, expect, it } from 'vitest';
import { SHAPES } from '../components/malang/shapes';
import {
  buildCardGrid,
  buildJellyMesh,
  distanceToPolygon,
  flattenPath,
  meshVolume,
  pointInPolygon,
  poleOfInaccessibility,
  resampleClosed,
  signedArea,
} from './jellyMesh';

const UV = { x: 6, y: 8, w: 108, h: 108 };

describe('flattenPath', () => {
  it('펼친 사각형은 네 꼭짓점을 지난다', () => {
    const pts = flattenPath('M0 0 L10 0 L10 10 L0 10 Z');
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it('상대 좌표·곡선도 읽는다', () => {
    const pts = flattenPath('m0 0 l10 0 q0 10 -10 10 z', 4);
    expect(pts[1]).toEqual({ x: 10, y: 0 });
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(0);
    expect(last.y).toBeCloseTo(10);
  });

  it('호 길이로 고르게 다시 뽑는다', () => {
    const sq = resampleClosed(flattenPath('M0 0 L10 0 L10 10 L0 10 Z'), 8);
    expect(sq).toHaveLength(8);
    expect(sq[1]).toEqual({ x: 5, y: 0 });
    expect(sq[4]).toEqual({ x: 10, y: 10 });
  });

  it('원의 극점은 가운데', () => {
    const circle = Array.from({ length: 64 }, (_, i) => ({
      x: 10 * Math.cos((i / 64) * Math.PI * 2),
      y: 10 * Math.sin((i / 64) * Math.PI * 2),
    }));
    const { center, radius } = poleOfInaccessibility(circle);
    expect(Math.hypot(center.x, center.y)).toBeLessThan(0.3);
    expect(radius).toBeGreaterThan(9.8);
    expect(distanceToPolygon({ x: 0, y: 0 }, circle)).toBeCloseTo(radius, 0);
  });
});

describe('buildJellyMesh', () => {
  for (const shape of Object.values(SHAPES)) {
    describe(shape.key, () => {
      const mesh = buildJellyMesh(shape.body, { uvRect: UV });

      it('모바일 예산 안의 정점 수', () => {
        expect(mesh.vertexCount).toBeLessThanOrEqual(5000);
        expect(mesh.index.length % 3).toBe(0);
      });

      it('윤곽은 반시계, 모든 정점이 윤곽 안에 있다 (중심에서 별 모양 영역)', () => {
        expect(signedArea(mesh.outline)).toBeGreaterThan(0);
        let outside = 0;
        for (let v = 0; v < mesh.vertexCount; v++) {
          const p = { x: mesh.rest[v * 3]!, y: mesh.rest[v * 3 + 1]! };
          if (!pointInPolygon(p, mesh.outline) && distanceToPolygon(p, mesh.outline) > 0.01) outside++;
        }
        expect(outside).toBe(0);
      });

      it('닫힌 곡면: 모든 변이 정확히 두 삼각형에 속하고 부피가 양수', () => {
        const edges = new Map<string, number>();
        for (let t = 0; t < mesh.index.length; t += 3) {
          const tri = [mesh.index[t]!, mesh.index[t + 1]!, mesh.index[t + 2]!];
          for (let e = 0; e < 3; e++) {
            const a = tri[e]!;
            const b = tri[(e + 1) % 3]!;
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
          }
        }
        expect([...edges.values()].every((n) => n === 2)).toBe(true);
        expect(mesh.volume).toBeGreaterThan(0);
        expect(meshVolume(mesh.rest, mesh.index)).toBeCloseTo(mesh.volume);
      });

      it('앞 중심 법선은 카메라 쪽, 바닥은 y=0 근처, UV 는 0..1', () => {
        expect(mesh.restNormal[2]!).toBeGreaterThan(0.9);
        let minY = Infinity;
        for (let v = 0; v < mesh.vertexCount; v++) minY = Math.min(minY, mesh.rest[v * 3 + 1]!);
        expect(Math.abs(minY)).toBeLessThan(0.2);
        for (const u of mesh.uv) {
          expect(u).toBeGreaterThanOrEqual(-0.01);
          expect(u).toBeLessThanOrEqual(1.01);
        }
        expect(mesh.depth).toBeGreaterThan(15);
      });
    });
  }

  it('둥근 몸은 반구에 가깝게 통통하다', () => {
    const mesh = buildJellyMesh(SHAPES.round.body, { uvRect: UV });
    expect(mesh.depth / mesh.halfWidth).toBeGreaterThan(0.6);
    expect(mesh.depth / mesh.halfWidth).toBeLessThan(1);
  });
});

describe('buildCardGrid', () => {
  it('격자는 화면 쪽을 향한다', () => {
    const card = buildCardGrid({ x: -14, y: -18, w: 148, h: 148 }, 108, -2, 4);
    expect(card.vertexCount).toBe(25);
    const [a, b, c] = [card.index[0]!, card.index[1]!, card.index[2]!];
    const p = (i: number) => [card.rest[i * 3]!, card.rest[i * 3 + 1]!] as const;
    const [ax, ay] = p(a);
    const [bx, by] = p(b);
    const [cx, cy] = p(c);
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    expect(cross).toBeGreaterThan(0);
  });
});
