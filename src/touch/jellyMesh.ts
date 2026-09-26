/**
 * 말랑이 2D 윤곽(SVG path)을 부풀려 3D 젤리 몸통 메시를 만든다 (순수 모듈, three/DOM 의존 없음).
 *
 * 1. SVG path 문자열(M/L/C/Q/Z)을 다각형으로 펼치고 호 길이로 고르게 다시 뽑는다.
 * 2. 윤곽 안에서 가장자리에서 가장 먼 점(도달 불가능 극점)을 중심으로 삼아
 *    중심 → 윤곽점으로 가는 고리(ring)들을 만든다. (모든 말랑이 모양은 이 중심에 대해 별 모양 영역이다)
 * 3. 각 점의 "가장자리까지 거리"로 높이를 준다: 원이면 정확히 반구가 되는 sqrt(d(2D−d)) 곡선.
 *    앞면은 통통하게, 뒷면은 납작하게. 앞·뒤는 윤곽 고리를 공유해 닫힌 곡면(부피 계산 가능)이다.
 *
 * 좌표계 ("몸 좌표"): SVG 단위 그대로, 원점은 몸통 바닥 가운데 (SVG x=60, y=shape.bottom),
 * x 오른쪽 +, y 위 +, z 화면 밖(카메라 쪽) +.
 */

export interface Vec2 {
  x: number;
  y: number;
}

// ── SVG path → 다각형 ──────────────────────────────────────

const TOKEN_RE = /[MLCQZHVmlcqzhv]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/**
 * SVG path 를 다각형 점 목록(SVG 좌표)으로 펼친다. 첫 번째 닫힌 부분 경로만 쓴다.
 * 곡선은 segmentSteps 개로 나눈다. 지원: M L H V C Q Z (대소문자).
 */
export function flattenPath(d: string, segmentSteps = 16): Vec2[] {
  const tokens = d.match(TOKEN_RE) ?? [];
  const pts: Vec2[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = (): number => {
    const t = tokens[i++];
    const n = t === undefined ? Number.NaN : Number(t);
    return Number.isFinite(n) ? n : 0;
  };
  const isNum = (t: string | undefined) => t !== undefined && !/^[A-Za-z]$/.test(t);
  while (i < tokens.length) {
    const t = tokens[i];
    if (t !== undefined && /^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx;
        cy = sy;
        if (pts.length > 2) break; // 첫 닫힌 경로만
        continue;
      }
    } else if (!isNum(t)) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        cx = ox + num();
        cy = oy + num();
        sx = cx;
        sy = cy;
        pts.push({ x: cx, y: cy });
        cmd = rel ? 'l' : 'L'; // 이어지는 좌표는 선
        break;
      }
      case 'L': {
        cx = ox + num();
        cy = oy + num();
        pts.push({ x: cx, y: cy });
        break;
      }
      case 'H': {
        cx = (rel ? cx : 0) + num();
        pts.push({ x: cx, y: cy });
        break;
      }
      case 'V': {
        cy = (rel ? cy : 0) + num();
        pts.push({ x: cx, y: cy });
        break;
      }
      case 'C': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        const x = ox + num();
        const y = oy + num();
        for (let s = 1; s <= segmentSteps; s++) {
          const u = s / segmentSteps;
          const m = 1 - u;
          pts.push({
            x: m * m * m * cx + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u * x,
            y: m * m * m * cy + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u * y,
          });
        }
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x = ox + num();
        const y = oy + num();
        for (let s = 1; s <= segmentSteps; s++) {
          const u = s / segmentSteps;
          const m = 1 - u;
          pts.push({ x: m * m * cx + 2 * m * u * x1 + u * u * x, y: m * m * cy + 2 * m * u * y1 + u * u * y });
        }
        cx = x;
        cy = y;
        break;
      }
      default:
        i++;
    }
  }
  // 닫는 점이 시작점과 겹치면 뺀다
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && pts.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) pts.pop();
  return pts;
}

/** 닫힌 다각형을 호 길이 기준으로 n 개의 점으로 고르게 다시 뽑는다. */
export function resampleClosed(points: readonly Vec2[], n: number): Vec2[] {
  const m = points.length;
  if (m < 2 || n < 3) return points.slice();
  const cum: number[] = [0];
  for (let i = 0; i < m; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % m]!;
    cum.push(cum[i]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[m]!;
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (seg < m - 1 && cum[seg + 1]! < target) seg++;
    const a = points[seg]!;
    const b = points[(seg + 1) % m]!;
    const len = cum[seg + 1]! - cum[seg]!;
    const u = len > 1e-9 ? (target - cum[seg]!) / len : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

/** 부호 있는 넓이 (반시계 +, y 위 좌표계 기준) */
export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 점에서 다각형 변까지의 최소 거리 */
export function distanceToPolygon(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
    const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
    if (d < best) best = d;
  }
  return best;
}

/** 다각형 안에서 가장자리로부터 가장 먼 점과 그 거리 (격자 탐색 후 국소 정밀화) */
export function poleOfInaccessibility(poly: readonly Vec2[]): { center: Vec2; radius: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  let best: Vec2 = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let bestD = pointInPolygon(best, poly) ? distanceToPolygon(best, poly) : 0;
  let step = Math.max(maxX - minX, maxY - minY) / 24;
  let x0 = minX;
  let y0 = minY;
  let x1 = maxX;
  let y1 = maxY;
  for (let pass = 0; pass < 4; pass++) {
    for (let y = y0; y <= y1 + 1e-9; y += step) {
      for (let x = x0; x <= x1 + 1e-9; x += step) {
        const p = { x, y };
        if (!pointInPolygon(p, poly)) continue;
        const d = distanceToPolygon(p, poly);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    x0 = best.x - step;
    x1 = best.x + step;
    y0 = best.y - step;
    y1 = best.y + step;
    step /= 4;
  }
  return { center: best, radius: bestD };
}

// ── 메시 ─────────────────────────────────────────────────

export interface JellyMeshOptions {
  /** 윤곽 점 수 (둘레 방향 분할) */
  segments?: number;
  /** 중심 → 윤곽 고리 수 */
  rings?: number;
  /** 앞면 두께 배율 (1 = 원이면 정확히 반구) */
  frontDepth?: number;
  /** 뒷면 두께 배율 (앞면 대비) */
  backDepth?: number;
  /** 몸통 바닥 y (SVG) = 몸 좌표 원점. 생략하면 윤곽의 가장 아래 점 (별처럼 뾰족한 모양도 바닥에 닿게) */
  bottom?: number;
  /** 텍스처가 덮는 SVG 영역 (UV 계산용) */
  uvRect: { x: number; y: number; w: number; h: number };
  /** 높이 매끈하게 하기 반복 횟수 */
  smoothIterations?: number;
}

export interface JellyMesh {
  /** 쉬는 자세 위치 (몸 좌표) xyz */
  rest: Float32Array;
  /** 쉬는 자세 법선 */
  restNormal: Float32Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array;
  /** 정점마다 둘레 넓이 몫 (부피 보정 가중치) */
  vertexArea: Float32Array;
  /** 앞면 높이 비율 0..1 (뒷면 정점은 0) — 움푹 들어가는 양 조절 */
  front: Float32Array;
  vertexCount: number;
  /** 몸 높이 (바닥 0 ~ 꼭대기) */
  height: number;
  /** 몸 폭의 절반 (대략) */
  halfWidth: number;
  /** 앞면 최대 높이 */
  depth: number;
  /** 쉬는 자세 부피 */
  volume: number;
  /** 몸 좌표 원점의 SVG y */
  bottom: number;
  /** 몸 좌표 윤곽 (반시계) */
  outline: Vec2[];
  /** 중심 (몸 좌표 xy) */
  center: Vec2;
}

/** SVG 좌표 → 몸 좌표 (z 제외) */
export function svgToBody(p: Vec2, bottom: number): Vec2 {
  return { x: p.x - 60, y: bottom - p.y };
}

/**
 * 몸통 path 로 젤리 메시를 만든다.
 * 정점 배치: [앞 중심, 앞 고리 1..K(K=윤곽), 뒤 중심, 뒤 고리 1..K−1]
 */
export function buildJellyMesh(bodyPath: string, opts: JellyMeshOptions): JellyMesh {
  const N = opts.segments ?? 112;
  const K = opts.rings ?? 12;
  const frontDepth = opts.frontDepth ?? 0.86;
  const backDepth = opts.backDepth ?? 0.55;
  const smoothIt = opts.smoothIterations ?? 4;

  const flat = flattenPath(bodyPath);
  const bottom = opts.bottom ?? Math.max(...flat.map((p) => p.y));
  let outline = resampleClosed(
    flat.map((p) => svgToBody(p, bottom)),
    N,
  );
  if (signedArea(outline) < 0) outline = outline.reverse();
  const { center, radius: D } = poleOfInaccessibility(outline);

  // 앞면 격자: h[k][i] (k=0 중심)
  const ringT = (k: number) => Math.sin(((k / K) * Math.PI) / 2);
  const frontCount = 1 + N * K;
  const backCount = 1 + N * (K - 1);
  const vertexCount = frontCount + backCount;
  const rest = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const front = new Float32Array(vertexCount);

  const xy: Vec2[] = [center];
  for (let k = 1; k <= K; k++) {
    const t = ringT(k);
    for (let i = 0; i < N; i++) {
      const b = outline[i]!;
      xy.push(k === K ? b : { x: center.x + (b.x - center.x) * t, y: center.y + (b.y - center.y) * t });
    }
  }
  const profile = (d: number) => {
    const s = Math.min(1, d / D);
    return Math.sqrt(Math.max(0, 1 - (1 - s) * (1 - s)));
  };
  const h = xy.map((p, idx) => (idx > frontCount - 1 - N ? 0 : profile(distanceToPolygon(p, outline)) * D * frontDepth));
  // 윤곽 고리는 0 으로 고정하고 안쪽만 매끈하게
  const fi = (k: number, i: number) => (k === 0 ? 0 : 1 + (k - 1) * N + (((i % N) + N) % N));
  for (let it = 0; it < smoothIt; it++) {
    const next = h.slice();
    for (let k = 1; k < K; k++) {
      for (let i = 0; i < N; i++) {
        const avg = (h[fi(k, i - 1)]! + h[fi(k, i + 1)]! + h[fi(k - 1, k === 1 ? 0 : i)]! + h[fi(k + 1, i)]!) / 4;
        next[fi(k, i)] = h[fi(k, i)]! * 0.5 + avg * 0.5;
      }
    }
    h.splice(0, h.length, ...next);
  }
  const depth = Math.max(...h);

  const svgX = (x: number) => x + 60;
  const svgY = (y: number) => bottom - y;
  const setV = (v: number, p: Vec2, z: number, f: number) => {
    rest[v * 3] = p.x;
    rest[v * 3 + 1] = p.y;
    rest[v * 3 + 2] = z;
    uv[v * 2] = (svgX(p.x) - opts.uvRect.x) / opts.uvRect.w;
    uv[v * 2 + 1] = 1 - (svgY(p.y) - opts.uvRect.y) / opts.uvRect.h;
    front[v] = f;
  };
  for (let v = 0; v < frontCount; v++) setV(v, xy[v]!, h[v]!, depth > 0 ? h[v]! / depth : 0);
  // 뒷면: 윤곽 고리(K)는 앞면과 공유
  const bi = (k: number, i: number) => {
    if (k === K) return fi(K, i);
    return k === 0 ? frontCount : frontCount + 1 + (k - 1) * N + (((i % N) + N) % N);
  };
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < (k === 0 ? 1 : N); i++) {
      const src = fi(k, i);
      setV(bi(k, i), xy[src]!, -h[src]! * backDepth, 0);
    }
  }

  // 삼각형 (앞면은 +z 에서 보아 반시계)
  const tris: number[] = [];
  const addSide = (idx: (k: number, i: number) => number, flip: boolean) => {
    const tri = (a: number, b: number, c: number) => (flip ? tris.push(a, c, b) : tris.push(a, b, c));
    for (let i = 0; i < N; i++) tri(idx(0, 0), idx(1, i), idx(1, i + 1));
    for (let k = 1; k < K; k++) {
      for (let i = 0; i < N; i++) {
        const a = idx(k, i);
        const b = idx(k + 1, i);
        const c = idx(k + 1, i + 1);
        const d = idx(k, i + 1);
        tri(a, b, c);
        tri(a, c, d);
      }
    }
  };
  addSide(fi, false);
  addSide(bi, true);
  const index = vertexCount > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);

  const restNormal = new Float32Array(vertexCount * 3);
  computeNormals(rest, index, restNormal);
  const vertexArea = new Float32Array(vertexCount);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    const area = triangleArea(rest, a, b, c) / 3;
    vertexArea[a] = vertexArea[a]! + area;
    vertexArea[b] = vertexArea[b]! + area;
    vertexArea[c] = vertexArea[c]! + area;
  }

  let height = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of outline) {
    height = Math.max(height, p.y);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }

  return {
    rest,
    restNormal,
    uv,
    index,
    vertexArea,
    front,
    vertexCount,
    height,
    halfWidth: (maxX - minX) / 2,
    depth,
    volume: meshVolume(rest, index),
    bottom,
    outline,
    center,
  };
}

function triangleArea(p: Float32Array, a: number, b: number, c: number): number {
  const ax = p[a * 3]!;
  const ay = p[a * 3 + 1]!;
  const az = p[a * 3 + 2]!;
  const ux = p[b * 3]! - ax;
  const uy = p[b * 3 + 1]! - ay;
  const uz = p[b * 3 + 2]! - az;
  const vx = p[c * 3]! - ax;
  const vy = p[c * 3 + 1]! - ay;
  const vz = p[c * 3 + 2]! - az;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz) / 2;
}

/** 닫힌 삼각형 메시의 부피 (발산 정리: 원점 사면체 부피의 합) */
export function meshVolume(p: ArrayLike<number>, index: ArrayLike<number>): number {
  let v = 0;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3;
    const b = index[t + 1]! * 3;
    const c = index[t + 2]! * 3;
    const ax = p[a]!;
    const ay = p[a + 1]!;
    const az = p[a + 2]!;
    const bx = p[b]!;
    const by = p[b + 1]!;
    const bz = p[b + 2]!;
    const cx = p[c]!;
    const cy = p[c + 1]!;
    const cz = p[c + 2]!;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** 면적 가중 정점 법선 (out 에 씀) */
export function computeNormals(p: ArrayLike<number>, index: ArrayLike<number>, out: Float32Array): void {
  out.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3;
    const b = index[t + 1]! * 3;
    const c = index[t + 2]! * 3;
    const ux = p[b]! - p[a]!;
    const uy = p[b + 1]! - p[a + 1]!;
    const uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!;
    const vy = p[c + 1]! - p[a + 1]!;
    const vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      out[i] = out[i]! + nx;
      out[i + 1] = out[i + 1]! + ny;
      out[i + 2] = out[i + 2]! + nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) || 1;
    out[i] = out[i]! / l;
    out[i + 1] = out[i + 1]! / l;
    out[i + 2] = out[i + 2]! / l;
  }
}

// ── 장식 카드 ─────────────────────────────────────────────

export interface CardGrid {
  /** 몸 좌표 xyz */
  rest: Float32Array;
  uv: Float32Array;
  index: Uint16Array;
  vertexCount: number;
}

/**
 * 몸통 밖으로 튀어나온 장식(귀·날개·왕관…)을 그리는 평평한 격자.
 * rect 는 SVG 좌표 영역, z 는 몸 좌표 깊이. 몸과 같은 변형장을 따라 움직인다.
 */
export function buildCardGrid(
  rect: { x: number; y: number; w: number; h: number },
  bottom: number,
  z: number,
  segments = 20,
): CardGrid {
  const n = segments + 1;
  const rest = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const sx = rect.x + (rect.w * i) / segments;
      const sy = rect.y + (rect.h * j) / segments;
      const b = svgToBody({ x: sx, y: sy }, bottom);
      rest[v * 3] = b.x;
      rest[v * 3 + 1] = b.y;
      rest[v * 3 + 2] = z;
      uv[v * 2] = i / segments;
      uv[v * 2 + 1] = 1 - j / segments;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // 화면(+z)에서 반시계: SVG y 는 아래로 가므로 (a, c, b)
      idx.push(a, c, b, b, c, d);
    }
  }
  return { rest, uv, index: new Uint16Array(idx), vertexCount: n * n };
}
