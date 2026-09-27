/**
 * 말랑이 표면 질감 — 실제 장난감을 만질 때 보이는 작은 모양 (순수 모듈, three/React/DOM 의존 없음. 시간은 주입받는다).
 *
 * - 손끝 자국(`dentProfile`): 손가락 끝 크기(화면에서 약 10mm)의 타원 자국. 바닥은 평평하고 벽은 가팔라
 *   동그란 그릇이 아니라 "손끝 도장" 모양이다. 둘레는 밀려난 살이 살짝 솟는다(테).
 * - 주름(`creaseDip`): 폼을 깊게 누르면 자국 둘레에서 바퀴살처럼 퍼지는 골.
 * - 물결(`Ripple`): 젤리를 놓거나 찌르면 그 자리에서 몸을 가로질러 퍼지는 잔물결 묶음. 시간이 지나며 잦아든다.
 * - 목(`neckSqueeze`): 쭉쭉이를 당기면 잡은 곳과 몸 사이 가운데가 잘록해진다.
 *
 * 촉감마다 세기는 `data/materials.ts` 의 `skin` 표. 이 모듈은 모양(곡선)만 안다.
 * 3D 는 `softbody.ts` 가 정점마다 부르고, 2D 대체 화면은 같은 값으로 겹 그림(자국 타원·물결 고리)을 흉내 낸다.
 */

export const SURFACE_TUNING = {
  /** 손끝 지름 (CSS px) — 96dpi 기준 약 10mm */
  fingerPx: 38,
  /** 손끝 자국 세로:가로 (손가락이 아래에서 들어와 세로로 조금 길다) */
  fingerAspect: 1.18,
  /** 자국 반지름 한계 (몸 좌표 단위) — 아주 작거나 큰 말랑이에서도 모양이 무너지지 않게 */
  fingerRadiusMin: 9,
  fingerRadiusMax: 24,
  /** 꾹 누를수록 손끝이 조금 더 넓게 닿는다 (반지름 배수) */
  fingerGrow: 0.15,
  /** 솟은 테 자리 (자국 반지름 배수)와 폭 */
  rimAt: 1.35,
  rimWidth: 0.36,
  /** 주름: 골 수, 시작·끝 (자국 반지름 배수), 골 깊이 (자국 깊이 대비), 이 깊이(한계 대비)부터 생긴다 */
  creaseCount: 7,
  creaseFrom: 0.8,
  creaseTo: 2.5,
  creaseDepth: 0.2,
  creaseStart: 0.4,
  /** 물결: 퍼지는 빠르기(단위/초), 파장(단위), 잦아드는 시정수(ms), 최대 높이(단위), 멀어질수록 줄어드는 거리, 묶음 길이(파장 배수) */
  waveSpeed: 220,
  waveLength: 30,
  waveTauMs: 480,
  waveMaxAmp: 6,
  waveReach: 70,
  wavePacket: 2.2,
  /** 이보다 작으면 물결이 멈춘 것으로 본다 */
  waveRestAmp: 0.03,
  /** 목: 가장 잘록할 때 옆 두께를 이만큼 줄인다 */
  neckMax: 0.3,
  /** 얼굴(눈·입) 위에서는 자국 그늘을 이만큼만 남긴다 — 눈을 누르고 있어도 얼굴이 보이게 */
  faceShadeKeep: 0.2,
} as const;

// ── 얼굴 비켜 가기 ─────────────────────────────────────────

/** 몸 그림(SVG 단위)에서 얼굴 타원 — 3D 셰이더의 uFaceUv·uFaceR 과 같은 자리 */
export function faceEllipse(shape: { faceY: number; eyeGap: number }): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: 60, cy: shape.faceY + 3, rx: shape.eyeGap + 17, ry: 17 };
}

/**
 * 자국 그늘 세기 배수 (faceShadeKeep..1). 자국이 얼굴에 걸칠수록 옅게 — 몸은 눌려도 눈은 가리지 않는다.
 * (x, y) = 자국 가운데, dentR = 자국 반지름 (모두 몸 그림 단위). 자국 둘레가 얼굴에 닿기 시작하면 옅어진다.
 */
export function faceShadeFactor(x: number, y: number, dentR: number, face: { cx: number; cy: number; rx: number; ry: number }): number {
  const r = Math.max(0, finite(dentR, 0));
  const rx = Math.max(1, face.rx + r * 0.8);
  const ry = Math.max(1, face.ry + r * 0.8);
  const d = Math.hypot((finite(x, 1e6) - face.cx) / rx, (finite(y, 1e6) - face.cy) / ry);
  const keep = SURFACE_TUNING.faceShadeKeep;
  return keep + (1 - keep) * smoothstep(0.55, 1.05, d);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

// ── 손끝 자국 ─────────────────────────────────────────────

/**
 * 화면에서 손끝(약 10mm) 크기가 되는 자국 반지름 (몸 좌표 단위). unitsPerPx = 몸 좌표 1px 당 단위.
 * 자국 프로필이 절반 깊이가 되는 지름 ≈ 1.8 × 반지름 이 손끝 지름과 같게 둔다.
 */
export function fingerRadius(unitsPerPx: number): number {
  const u = finite(unitsPerPx, 0);
  if (!(u > 0)) return (SURFACE_TUNING.fingerRadiusMin + SURFACE_TUNING.fingerRadiusMax) / 2;
  return clamp((SURFACE_TUNING.fingerPx * u) / 1.8, SURFACE_TUNING.fingerRadiusMin, SURFACE_TUNING.fingerRadiusMax);
}

/**
 * 자국 모양 (안쪽 + = 들어감, − = 솟음). u = (거리/반지름)².
 * flat 0 = 가우스 그릇, 1 = 바닥이 평평하고 벽이 가파른 손끝 도장. rim = 둘레 테 높이 (깊이 대비).
 */
export function dentProfile(u: number, flat: number, rim: number): number {
  const uu = Math.max(0, finite(u, 0));
  const f = clamp(finite(flat), 0, 1);
  const inner = Math.exp(-Math.pow(uu, 1 + f));
  const T = SURFACE_TUNING;
  const r = Math.sqrt(uu);
  const ring = clamp(finite(rim), 0, 0.5) * Math.exp(-(((r - T.rimAt) / T.rimWidth) ** 2));
  return inner - ring;
}

/**
 * 주름 골 깊이 (자국 깊이 대비 0..creaseDepth). theta = 자국 둘레 각도, rn = 거리/반지름,
 * depthFrac = 자국 깊이/한계 (0..1), crease = 촉감 세기, phase = 자국마다 다른 골 위치.
 */
export function creaseDip(theta: number, rn: number, depthFrac: number, crease: number, phase = 0): number {
  const T = SURFACE_TUNING;
  const c = clamp(finite(crease), 0, 1);
  if (c <= 0) return 0;
  const d = smoothstep(T.creaseStart, 1, clamp(finite(depthFrac), 0, 1.2));
  if (d <= 0) return 0;
  const r = finite(rn, 99);
  const ring = smoothstep(T.creaseFrom, T.creaseFrom + 0.35, r) * (1 - smoothstep(T.creaseFrom + 0.6, T.creaseTo, r));
  if (ring <= 0) return 0;
  // 골은 날카롭고 등성이는 넓게: 코사인 봉우리를 거듭제곱
  const k = 0.5 + 0.5 * Math.cos(T.creaseCount * finite(theta) + phase);
  return T.creaseDepth * c * d * ring * k * k * k;
}

// ── 물결 ─────────────────────────────────────────────────

export interface Ripple {
  /** 퍼지기 시작한 곳 (몸 좌표, 쉬는 자세) */
  x: number;
  y: number;
  z: number;
  /** 지금 높이 (단위) */
  amp: number;
  /** 시작 뒤 흐른 시간 (ms) */
  ageMs: number;
}

/**
 * 물결을 일으킨다. strength 0..1 × 촉감 세기(wave). 이미 퍼지는 물결이 있으면 새 자리에서 다시 (남은 높이는 더한다).
 * 세기가 0 이면 그대로 돌려준다.
 */
export function kickRipple(r: Ripple | null, origin: { x: number; y: number; z: number }, strength: number, wave: number): Ripple | null {
  const s = clamp(finite(strength), 0, 1) * clamp(finite(wave), 0, 1);
  if (s <= 0.01) return r;
  const left = r ? r.amp * Math.exp(-r.ageMs / SURFACE_TUNING.waveTauMs) * 0.5 : 0;
  return {
    x: finite(origin.x),
    y: finite(origin.y),
    z: finite(origin.z),
    amp: Math.min(SURFACE_TUNING.waveMaxAmp, SURFACE_TUNING.waveMaxAmp * s + left),
    ageMs: 0,
  };
}

/** dtMs 만큼 퍼진다. 다 잦아들면 null */
export function stepRipple(r: Ripple | null, dtMs: number): Ripple | null {
  if (!r) return null;
  const ms = clamp(finite(dtMs), 0, 50);
  const next = { ...r, ageMs: r.ageMs + ms };
  return rippleHeight(next) < SURFACE_TUNING.waveRestAmp ? null : next;
}

/** 지금 물결 높이 (잦아든 만큼) */
export function rippleHeight(r: Ripple | null): number {
  if (!r) return 0;
  return r.amp * Math.exp(-r.ageMs / SURFACE_TUNING.waveTauMs);
}

export function isRippleAtRest(r: Ripple | null): boolean {
  return r === null;
}

/** 물결 앞머리가 간 거리 (단위) */
export function rippleFront(r: Ripple | null): number {
  return r ? (SURFACE_TUNING.waveSpeed * r.ageMs) / 1000 : 0;
}

/**
 * 시작점에서 dist 만큼 떨어진 표면이 법선 방향으로 움직이는 양 (단위, 밖 +).
 * 앞머리 앞은 0, 뒤로는 파장 몇 개만큼의 묶음이 지나간다.
 */
export function rippleAt(r: Ripple | null, dist: number): number {
  if (!r) return 0;
  const T = SURFACE_TUNING;
  const h = rippleHeight(r);
  if (h <= 0) return 0;
  const d = Math.max(0, finite(dist, 1e9));
  const front = rippleFront(r);
  const behind = front - d;
  if (behind < -T.waveLength * 0.5) return 0;
  const edge = smoothstep(-T.waveLength * 0.5, T.waveLength * 0.25, behind);
  const tail = Math.exp(-Math.max(0, behind) / (T.wavePacket * T.waveLength));
  const reach = 1 / (1 + d / T.waveReach);
  return h * Math.sin((2 * Math.PI * behind) / T.waveLength) * edge * tail * reach;
}

// ── 목 ─────────────────────────────────────────────────

/**
 * 당길 때 옆 두께를 얼마나 줄이나 (0..neckMax). g = 당김 영향 (1 = 잡은 곳, 0 = 먼 몸),
 * stretchFrac = 당긴 길이/한계 (0..1), neck = 촉감 세기. 잡은 곳과 몸 사이 가운데(g ≈ 0.5)가 가장 잘록하다.
 */
export function neckSqueeze(g: number, stretchFrac: number, neck: number): number {
  const w = clamp(finite(g), 0, 1);
  const s = smoothstep(0.15, 0.9, clamp(finite(stretchFrac), 0, 1));
  return SURFACE_TUNING.neckMax * clamp(finite(neck), 0, 1) * s * 4 * w * (1 - w);
}

/** 자국마다 다른 주름 위치 (자리에서 정해지는 0..2π) */
export function creasePhase(x: number, y: number): number {
  const h = Math.sin(finite(x) * 12.9898 + finite(y) * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}
