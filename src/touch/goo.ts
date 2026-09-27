/**
 * 찐득이 실 가닥 — 손가락을 떼어낼 때 손가락과 몸 사이에 늘어나다 가늘어지며 끊어지는 끈적한 실 (순수 모듈, 시간·RNG 주입).
 *
 * 좌표는 몸 가운데 기준, 몸 반지름(r) 단위 (y 아래 +). 몸이 움직이거나 크기가 바뀌어도 가닥이 몸에 붙어 따라간다.
 * 그리기는 입자 캔버스(`touch3d/fxLayer.ts` → `touchFxDraw.drawGoo`) — 3D 와 2D 대체 화면에서 같다.
 *
 * 한 가닥의 일생: 손가락이 들리며 늘어난다(가늘어짐, 가운데가 더 가늘다) → 가닥마다 다른 순간에 끊어진다
 * → 몸 쪽 반은 몸으로 되감기고, 손가락 쪽 반은 작은 방울이 되어 조금 처지며 사라진다.
 */
import type { RNG } from '../lib/rng';

export const GOO_TUNING = {
  /** 끊어진 뒤 되감기·방울이 사라지는 시간 (ms) */
  retractMs: 260,
  /** 가닥 굵기 (몸 반지름 대비) */
  widthMin: 0.06,
  widthMax: 0.11,
  /** 가닥 끝이 퍼지는 폭 (몸 쪽, 손가락 쪽 — r 단위) */
  anchorSpread: 0.16,
  fingerSpread: 0.07,
  /** 손가락이 들리는 방향: 화면 위 + 조금 바깥 */
  liftOut: 0.25,
  /** 가장 먼저 끊어지는 가닥 (전체 시간 대비) */
  firstBreak: 0.45,
  /** 최대 가닥 수 */
  maxStrands: 7,
} as const;

export interface GooStrand {
  /** 몸 쪽 끝 (접점 기준, r 단위) */
  ax: number;
  ay: number;
  /** 손가락 쪽 끝의 퍼짐 (접점 기준, r 단위) */
  fx: number;
  fy: number;
  /** 처음 굵기 (r 단위) */
  width: number;
  /** 끊어지는 순간 (전체 시간 대비 0..1) */
  breakAt: number;
  /** 늘어진 휨 (−1..1, 수직 방향) */
  sag: number;
}

export interface Goo {
  /** 손가락이 닿았던 곳 (몸 가운데 기준, r 단위) */
  x: number;
  y: number;
  /** 손가락이 들리는 거리 (r 단위) */
  lift: number;
  /** 붙어 있는 시간 (ms) — 마지막 가닥이 이때 끊어진다 */
  durMs: number;
  ageMs: number;
  strands: GooStrand[];
}

/** 그릴 한 가닥 (몸 가운데 기준, r 단위) */
export interface GooDraw {
  /** 몸 쪽 끝 */
  x0: number;
  y0: number;
  /** 손가락 쪽 끝 */
  x1: number;
  y1: number;
  /** 휨 조절점 */
  cx: number;
  cy: number;
  /** 끝 굵기, 가운데 굵기 (r 단위) */
  width: number;
  waist: number;
  alpha: number;
  /** 끊어진 뒤 손가락 쪽 방울 (없으면 null) */
  drop: { x: number; y: number; r: number } | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 실 가닥 묶음을 만든다. count = 가닥 수 (촉감 표의 skin.strands), contact = 접점 (r 단위),
 * durMs = 붙어 있는 시간 (peelPlan.delayMs), lift = 들리는 거리 (r 단위). count 가 0 이거나 시간이 없으면 null.
 */
export function createGoo(count: number, contact: { x: number; y: number }, durMs: number, lift: number, rng: RNG): Goo | null {
  const n = Math.min(GOO_TUNING.maxStrands, Math.max(0, Math.floor(finite(count))));
  const dur = finite(durMs);
  if (n <= 0 || dur <= 0) return null;
  const T = GOO_TUNING;
  const strands: GooStrand[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const ra = Math.sqrt(rng()) * T.anchorSpread;
    const rf = Math.sqrt(rng()) * T.fingerSpread;
    const af = a + (rng() - 0.5) * 1.2;
    strands.push({
      ax: Math.cos(a) * ra,
      ay: Math.sin(a) * ra * 0.6,
      fx: Math.cos(af) * rf,
      fy: Math.sin(af) * rf * 0.6,
      width: T.widthMin + (T.widthMax - T.widthMin) * rng(),
      // 마지막 가닥은 떨어지는 바로 그 순간("쩍")에 끊어진다
      breakAt: i === 0 ? 1 : T.firstBreak + (1 - T.firstBreak) * rng(),
      sag: (rng() - 0.5) * 2,
    });
  }
  return {
    x: clamp(finite(contact.x), -1.5, 1.5),
    y: clamp(finite(contact.y), -1.5, 1.5),
    lift: clamp(finite(lift), 0.05, 2.5),
    durMs: dur,
    ageMs: 0,
    strands,
  };
}

/** dtMs 만큼 진행. 모두 끊어져 사라지면 null */
export function stepGoo(goo: Goo | null, dtMs: number): Goo | null {
  if (!goo) return null;
  const next = { ...goo, ageMs: goo.ageMs + clamp(finite(dtMs), 0, 100) };
  return next.ageMs >= goo.durMs + GOO_TUNING.retractMs ? null : next;
}

/** 손가락이 들린 정도 0..1 (빠르게 들리다 느려진다) */
export function gooLift(goo: Goo, ageMs = goo.ageMs): number {
  const t = clamp(ageMs / goo.durMs, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

/** 떼어내는 빠르기 0..1 (소리·진동의 부스럭 밀도) — 들리는 속도 × 아직 붙어 있는 가닥 비율 */
export function gooPeelSpeed(goo: Goo | null): number {
  if (!goo || goo.ageMs >= goo.durMs) return 0;
  const t = clamp(goo.ageMs / goo.durMs, 0, 1);
  const speed = 2 * (1 - t);
  const attached = goo.strands.filter((s) => t < s.breakAt).length / Math.max(1, goo.strands.length);
  // 끝으로 갈수록 실이 팽팽해져 부스럭이 잦아진다 (가닥이 끊어질 때마다 잦아듦)
  return clamp((0.35 + 0.65 * t) * attached * Math.max(0.4, speed), 0, 1);
}

/** 지금 그릴 가닥들 */
export function gooDraws(goo: Goo | null): GooDraw[] {
  if (!goo) return [];
  const T = GOO_TUNING;
  const out: GooDraw[] = [];
  const e = gooLift(goo);
  // 손가락은 위(−y)로, 조금 바깥(접점이 있는 쪽)으로 들린다
  const out0 = Math.sign(goo.x) * T.liftOut;
  const lx = goo.lift * out0;
  const ly = -goo.lift;
  for (const s of goo.strands) {
    const breakMs = s.breakAt * goo.durMs;
    const x0 = goo.x + s.ax;
    const y0 = goo.y + s.ay;
    if (goo.ageMs < breakMs) {
      // 붙어 있는 동안: 손가락 끝까지 늘어나며 가늘어진다
      const k = e;
      const x1 = goo.x + s.fx + lx * k;
      const y1 = goo.y + s.fy + ly * k;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const p = clamp(goo.ageMs / Math.max(1, breakMs), 0, 1);
      const width = s.width * Math.pow(1 - 0.7 * p, 0.8);
      const nx = len > 1e-6 ? -(y1 - y0) / len : 0;
      const ny = len > 1e-6 ? (x1 - x0) / len : 0;
      const bend = s.sag * len * 0.3 + len * 0.1; // 가닥은 아래로 조금 처진다
      out.push({
        x0,
        y0,
        x1,
        y1,
        cx: (x0 + x1) / 2 + nx * s.sag * len * 0.3,
        cy: (y0 + y1) / 2 + ny * s.sag * len * 0.18 + Math.abs(bend) * 0.4,
        width,
        waist: width * (0.55 - 0.3 * p),
        alpha: 0.9,
        drop: null,
      });
    } else {
      // 끊어진 뒤: 몸 쪽 반은 되감기고, 손가락 쪽은 방울로 처지며 사라진다
      const q = clamp((goo.ageMs - breakMs) / T.retractMs, 0, 1);
      if (q >= 1) continue;
      const kb = gooLift(goo, breakMs);
      const bx = goo.x + s.fx + lx * kb;
      const by = goo.y + s.fy + ly * kb;
      const back = (1 - q) * (1 - q) * 0.5;
      const x1 = x0 + (bx - x0) * back;
      const y1 = y0 + (by - y0) * back;
      out.push({
        x0,
        y0,
        x1,
        y1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2 + 0.02 * (1 - q),
        width: s.width * 0.5 * (1 - q),
        waist: s.width * 0.35 * (1 - q),
        alpha: 0.9 * (1 - q),
        drop: { x: bx, y: by + 0.18 * q * q, r: s.width * (0.9 - 0.5 * q) },
      });
    }
  }
  return out;
}
