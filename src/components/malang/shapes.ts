import type { MalangShape } from '../../data/characters';

/** 몸통 좌표계: 몸통은 대략 (10..110, 14..112) 안에 그린다. */

export function roundedStarPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const verts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const n = verts.length;
  const start = mid(verts[0]!, verts[1]!);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const v = verts[i % n]!;
    const m = mid(v, verts[(i + 1) % n]!);
    d += ` Q${v[0].toFixed(1)} ${v[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

export interface ShapeSpec {
  key: MalangShape;
  body: string;
  /** 얼굴 중심 y */
  faceY: number;
  /** 머리 꼭대기 y (장식 위치) */
  top: number;
  /** 눈 사이 반간격 */
  eyeGap: number;
  /** 몸통이 가장 넓은 높이 y (날개/지느러미 부착 기준) */
  sideY: number;
  /** sideY에서의 왼쪽/오른쪽 가장자리 x */
  left: number;
  right: number;
  /** 몸통 바닥 y */
  bottom: number;
}

export const SHAPES: Record<MalangShape, ShapeSpec> = {
  round: {
    key: 'round',
    body: 'M60 30 C88 30 106 48 106 72 C106 96 86 108 60 108 C34 108 14 96 14 72 C14 48 32 30 60 30 Z',
    faceY: 70,
    top: 30,
    eyeGap: 15,
    sideY: 72,
    left: 14,
    right: 106,
    bottom: 108,
  },
  drop: {
    key: 'drop',
    body: 'M60 16 C74 36 102 54 102 80 C102 100 84 110 60 110 C36 110 18 100 18 80 C18 54 46 36 60 16 Z',
    faceY: 78,
    top: 22,
    eyeGap: 14,
    sideY: 80,
    left: 18,
    right: 102,
    bottom: 110,
  },
  bun: {
    key: 'bun',
    body: 'M14 90 C14 54 34 34 60 34 C86 34 106 54 106 90 C106 104 92 108 60 108 C28 108 14 104 14 90 Z',
    faceY: 74,
    top: 34,
    eyeGap: 16,
    sideY: 86,
    left: 14,
    right: 106,
    bottom: 108,
  },
  bean: {
    key: 'bean',
    body: 'M22 72 C18 46 42 30 64 32 C90 34 108 54 102 80 C98 102 74 110 52 106 C32 102 24 92 22 72 Z',
    faceY: 70,
    top: 32,
    eyeGap: 15,
    sideY: 68,
    left: 21,
    right: 104,
    bottom: 107,
  },
  cloud: {
    key: 'cloud',
    body: 'M28 106 C10 106 8 82 22 76 C16 56 36 44 48 52 C52 34 80 32 86 50 C100 44 114 62 102 76 C116 84 110 106 92 106 Z',
    faceY: 80,
    top: 38,
    eyeGap: 15,
    sideY: 80,
    left: 12,
    right: 110,
    bottom: 106,
  },
  heart: {
    key: 'heart',
    body: 'M60 108 C40 96 12 80 12 56 C12 40 24 30 40 30 C50 30 56 36 60 42 C64 36 70 30 80 30 C96 30 108 40 108 56 C108 80 80 96 60 108 Z',
    faceY: 64,
    top: 30,
    eyeGap: 15,
    sideY: 56,
    left: 12,
    right: 108,
    bottom: 108,
  },
  crystal: {
    key: 'crystal',
    // 윗면(테이블)이 평평하고 아래로 둥글게 좁아지는 말랑한 보석
    body: 'M44 22 L76 22 Q82 22 86 26 L102 43 Q108 50 103 57 Q92 82 68 104 Q60 112 52 104 Q28 82 17 57 Q12 50 18 43 L34 26 Q38 22 44 22 Z',
    faceY: 60,
    top: 22,
    eyeGap: 13,
    sideY: 50,
    left: 14,
    right: 106,
    bottom: 110,
  },
  star: {
    key: 'star',
    body: roundedStarPath(60, 66, 54, 32),
    faceY: 70,
    top: 14,
    eyeGap: 12,
    sideY: 56,
    left: 10,
    right: 110,
    bottom: 112,
  },
};
