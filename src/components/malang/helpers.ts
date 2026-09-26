/**
 * Malang 그림에 쓰는 순수 헬퍼 (React/DOM 의존 없음 → 단위 테스트 가능).
 */
import type { Rarity } from '../../data/rarity';

export const INK = '#2b2233';

/**
 * 모든 말랑이가 같은 viewBox를 쓴다 → 격자에서 몸통 크기가 일정하다.
 * 날개/꼬리/귀가 이 안에 들어오도록 몸통(10..110) 주변에 여백을 둔다.
 */
export const VIEWBOX = { x: -14, y: -18, w: 148, h: 148 } as const;
export const VIEWBOX_ATTR = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;

/** 오라 중심 (몸통 중심 근처) */
export const AURA_CENTER = { x: 60, y: 64 } as const;

// ── 색 ──────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [200, 200, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex(conv(hh + 1 / 3) * 255, conv(hh) * 255, conv(hh - 1 / 3) * 255);
}

/** 색상환에서 deg만큼 돌린 색 */
export function hueRotate(hex: string, deg: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + deg, s, l);
}

/** 반짝 버전 색: 색상을 살짝 돌리고, 무채색에 가까우면 진주빛 라벤더를 입힌다. */
export function shinyColor(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.25 || l > 0.9) {
    // 흰색/회색 계열은 색상 회전이 보이지 않으므로 라벤더-민트 진주빛으로
    return hslToHex(275, Math.max(s, 0.75), Math.min(l, 0.86));
  }
  return hslToHex(h - 32, Math.min(1, s * 1.1), l);
}

// ── 희귀도 오라 ────────────────────────────────────────────

export type AuraLevel = 'none' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';

export function auraLevel(rarity: Rarity | undefined, aura: 'none' | 'auto' | undefined): AuraLevel {
  if (aura !== 'auto' || rarity === undefined || rarity === 'common') return 'none';
  return rarity;
}

// ── 도형 ────────────────────────────────────────────────────

/** 네 갈래 반짝이 (오목한 별) */
export function sparklePath(x: number, y: number, r: number, pinch = 0.2): string {
  const p = r * pinch;
  const f = (n: number) => Number(n.toFixed(2));
  return (
    `M${f(x)} ${f(y - r)} Q${f(x + p)} ${f(y - p)} ${f(x + r)} ${f(y)} ` +
    `Q${f(x + p)} ${f(y + p)} ${f(x)} ${f(y + r)} Q${f(x - p)} ${f(y + p)} ${f(x - r)} ${f(y)} ` +
    `Q${f(x - p)} ${f(y - p)} ${f(x)} ${f(y - r)} Z`
  );
}

/** 중심에서 뻗는 빛줄기(쐐기) path들 */
export function rayPaths(cx: number, cy: number, count: number, inner: number, outer: number, halfAngleDeg: number): string[] {
  const out: string[] = [];
  const f = (n: number) => Number(n.toFixed(2));
  const ha = (halfAngleDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + inner * Math.cos(a);
    const y0 = cy + inner * Math.sin(a);
    const x1 = cx + outer * Math.cos(a - ha);
    const y1 = cy + outer * Math.sin(a - ha);
    const x2 = cx + outer * Math.cos(a + ha);
    const y2 = cy + outer * Math.sin(a + ha);
    out.push(`M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} Z`);
  }
  return out;
}

export interface Point {
  x: number;
  y: number;
}

/** 얼굴 영역(faceY 기준 타원)을 피한 점만 남긴다. 무늬(초코칩/펄)가 눈·입을 가리지 않게. */
export function avoidFace<T extends Point>(points: readonly T[], faceY: number, rx = 30, ry = 17): T[] {
  const cy = faceY + 3;
  return points.filter((p) => ((p.x - 60) / rx) ** 2 + ((p.y - cy) / ry) ** 2 > 1);
}

/** 채도를 조금 올리며 어둡게: 젤리 아랫면·가장자리의 "두께" 색 (잉크를 섞으면 탁해진다) */
export function deepen(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  const sat = s < 0.05 ? s : Math.min(1, s * (1 + amount * 0.8) + amount * 0.1);
  return hslToHex(h, sat, l * (1 - amount));
}

// ── 인스턴스별 움직임 편차 ─────────────────────────────────

/** 문자열 → 32비트 해시 (FNV-1a) */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface LifeTiming {
  /** 숨쉬기 주기(초) 2.4~3.2 */
  breatheDur: number;
  /** 숨쉬기 시작 위상(음수 지연, 초): 격자에서 다 같이 숨쉬지 않게 */
  breatheDelay: number;
  /** 눈 깜빡임 주기(초) 3~5. 감았다 뜨는 시간은 주기의 3.8% → 115~190ms */
  blinkDur: number;
  blinkDelay: number;
  /** 약 1/7 확률로 두 번 연달아 깜빡인다 */
  doubleBlink: boolean;
}

/**
 * 인스턴스 id로 정해지는 숨쉬기/깜빡임 타이밍. 순수 함수라 렌더마다 같고(StrictMode 안전)
 * 인스턴스마다 다르다. style 문자열이 짧도록 소수 둘째 자리로 반올림한다.
 */
export function lifeTiming(seed: string): LifeTiming {
  let s = hashString(seed) || 1;
  const next = () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const breatheDur = r2(2.4 + next() * 0.8);
  const blinkDur = r2(3 + next() * 2);
  return {
    breatheDur,
    breatheDelay: r2(-next() * breatheDur),
    blinkDur,
    blinkDelay: r2(-next() * blinkDur),
    doubleBlink: next() < 0.14,
  };
}
