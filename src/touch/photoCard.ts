/**
 * 말랑 사진 카드 배치 — 순수 모듈 (캔버스 그리기는 components/touch3d/photo.ts).
 * 인스타그램 세로 게시물 비율(4:5, 1080×1350)의 스카이 소다 카드:
 * 하늘 그라데이션 + 비눗방울 → 흰 카드(부드러운 그림자) → 사진 칸(고른 매트 무늬 + 소품 + 말랑이) → 등급 칩 →
 * 이름(제목 글꼴) → 애정 단계 또는 단체 사진 한 줄 → 가게 이름.
 * 단체 사진은 매트 위 모든 말랑이를 감싸는 상자를 사진 칸 비율에 맞춰 넓힌다(frameGroup) — 아무도 잘리지 않는다.
 */
import { rarityRank, type Rarity } from '../data/rarity';
import { josa } from '../lib/josa';
import type { RNG } from '../lib/rng';

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
}

export interface TextSpot {
  x: number;
  y: number;
  size: number;
}

export interface PhotoCardLayout {
  width: number;
  height: number;
  /** 흰 카드 */
  card: Rect;
  /** 사진 칸 */
  photo: Rect;
  /** 등급 칩 줄 (사진 칸 왼쪽 위 안쪽): 시작 x, 가운데 y, 칩 높이, 오른쪽 끝 한계 */
  chips: { x: number; y: number; h: number; maxRight: number };
  /** 이름 (가운데 맞춤) */
  name: TextSpot;
  /** 애정 단계 / 단체 사진 한 줄 (가운데 맞춤) */
  line: TextSpot;
  /** 가게 이름 (오른쪽 맞춤) */
  logo: TextSpot;
  /** 바탕 비눗방울 */
  bubbles: Bubble[];
}

/** 이름 글자 크기: 카드 폭 안에 들어가게 (한글 한 글자 ≈ 글자 크기 1.0 폭) */
export function nameFontSize(name: string, maxWidth: number, max = 96, min = 52): number {
  const chars = Math.max(1, [...name].length);
  return Math.max(min, Math.min(max, Math.floor(maxWidth / (chars * 1.02))));
}

export function photoCardLayout(name: string, rng: RNG): PhotoCardLayout {
  const card: Rect = { x: 54, y: 54, w: CARD_W - 108, h: CARD_H - 108 };
  const photo: Rect = { x: card.x + 36, y: card.y + 36, w: card.w - 72, h: 880 };
  const nameY = photo.y + photo.h + 100;
  const bubbles: Bubble[] = [];
  for (let i = 0; i < 16; i++) {
    // 카드 둘레에 보이도록 가장자리 쪽에 모은다
    const side = i % 4;
    const t = rng();
    const r = Math.round(10 + rng() * 30);
    const inset = Math.round(rng() * 40);
    const x = side === 0 ? inset : side === 1 ? CARD_W - inset : Math.round(t * CARD_W);
    const y = side === 2 ? inset : side === 3 ? CARD_H - inset : Math.round(t * CARD_H);
    bubbles.push({ x, y, r });
  }
  return {
    width: CARD_W,
    height: CARD_H,
    card,
    photo,
    chips: { x: photo.x + 24, y: photo.y + 24 + 32, h: 64, maxRight: photo.x + photo.w - 24 },
    name: { x: CARD_W / 2, y: nameY, size: nameFontSize(name, card.w - 120) },
    line: { x: CARD_W / 2, y: nameY + 86, size: 42 },
    logo: { x: card.x + card.w - 44, y: card.y + card.h - 44, size: 34 },
    bubbles,
  };
}

/**
 * 원본 이미지(src 크기)를 target 칸 안에 비율을 지켜 가운데 맞춤 (contain).
 * 여백 비율 pad 만큼 안쪽으로 줄인다.
 */
export function fitContain(srcW: number, srcH: number, target: Rect, pad = 0): Rect {
  const tw = target.w * (1 - pad * 2);
  const th = target.h * (1 - pad * 2);
  if (!(srcW > 0) || !(srcH > 0)) return { x: target.x, y: target.y, w: 0, h: 0 };
  const k = Math.min(tw / srcW, th / srcH);
  const w = srcW * k;
  const h = srcH * k;
  return { x: target.x + (target.w - w) / 2, y: target.y + (target.h - h) / 2, w, h };
}

/** 저장 파일 이름: malang-<id>-YYYYMMDD-HHMM.png (로컬 시각) */
export function photoFileName(id: string, date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = id.replace(/[^a-z0-9-]/gi, '') || 'malang';
  return `malang-${safe}-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.png`;
}

/** 담을 영역의 여백 (말랑이 그림 상자 한 변 대비) */
export const FRAME_PAD = { side: 0.16, top: 0.22, bottom: 0.12 } as const;
/** 한 마리여도 이 폭(말랑이 한 변 대비)보다 좁게 담지 않는다 — 너무 크게 확대되지 않게 */
export const FRAME_MIN_W = 1.9;

/**
 * 사진 칸에 담을 영역 (client 좌표): 모든 말랑이 그림 상자를 감싸는 상자 + 여백을 사진 칸 비율(aspect = 폭/높이)로
 * 넓힌다 (cover — 칸을 가득 채우고, 넓히기만 하므로 아무도 잘리지 않는다). unit = 말랑이 그림 상자 한 변(px).
 * 화면 밖으로 넘어간 부분은 사진 칸에서 매트 무늬로 채운다.
 */
export function frameGroup(boxes: readonly Rect[], aspect: number, unit: number): Rect {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const u = Number.isFinite(unit) && unit > 0 ? unit : 120;
  const ok = boxes.filter((b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0);
  if (ok.length === 0) {
    const w = u * FRAME_MIN_W;
    return { x: 0, y: 0, w, h: w / a };
  }
  let x0 = Math.min(...ok.map((b) => b.x)) - u * FRAME_PAD.side;
  let x1 = Math.max(...ok.map((b) => b.x + b.w)) + u * FRAME_PAD.side;
  let y0 = Math.min(...ok.map((b) => b.y)) - u * FRAME_PAD.top;
  let y1 = Math.max(...ok.map((b) => b.y + b.h)) + u * FRAME_PAD.bottom;
  const minW = u * FRAME_MIN_W;
  if (x1 - x0 < minW) {
    const cx = (x0 + x1) / 2;
    x0 = cx - minW / 2;
    x1 = cx + minW / 2;
  }
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h > a) {
    // 가로로 길다 → 위아래로 늘린다 (바닥 쪽을 조금 더: 말랑이가 사진 가운데보다 살짝 위에 서도록)
    const extra = w / a - h;
    y0 -= extra * 0.45;
    h = w / a;
  } else {
    const extra = h * a - w;
    x0 -= extra / 2;
    w = h * a;
  }
  return { x: x0, y: y0, w, h };
}

/**
 * 매트 무늬 타일을 사진 칸에 화면과 같은 자리·비율로 깔기 위한 변환:
 * 화면의 타일 시작점(origin, client px)이 사진 칸에서 놓일 자리와 배율.
 */
export function patternPlacement(slot: Rect, capture: Rect, origin: { x: number; y: number }): { x: number; y: number; scale: number } {
  const scale = capture.w > 0 ? slot.w / capture.w : 1;
  return { x: slot.x + (origin.x - capture.x) * scale, y: slot.y + (origin.y - capture.y) * scale, scale };
}

export interface RarityChip {
  rarity: Rarity;
  count: number;
}

/** 단체 사진 등급 칩: 등급별 마릿수, 높은 등급부터 */
export function groupRarityChips(rarities: readonly Rarity[]): RarityChip[] {
  const counts = new Map<Rarity, number>();
  for (const r of rarities) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()]
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
}

/** 칩 줄 배치: 폭 목록을 왼쪽부터 늘어놓되 오른쪽 한계를 넘는 칩은 뺀다. 각 칩의 x 를 돌려준다 */
export function layoutChipRow(widths: readonly number[], startX: number, maxRight: number, gap: number): number[] {
  const xs: number[] = [];
  let x = startX;
  for (const w of widths) {
    if (!(w > 0) || x + w > maxRight) break;
    xs.push(x);
    x += w + gap;
  }
  return xs;
}

/** 단체 사진 제목 */
export function groupTitle(count: number): string {
  return `말랑이 ${Math.max(2, Math.floor(count))}마리와 함께`;
}

/**
 * 단체 사진 한 줄: 이름을 나란히 ("A와 B", "A, B와 C"). 너무 길면 "A와 친구 N마리".
 * 조사는 받침에 맞춘다 (lib/josa).
 */
export function groupCaption(names: readonly string[], maxChars = 22): string {
  const list = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0] ?? '';
  const last = list[list.length - 1] ?? '';
  const beforeLast = list[list.length - 2] ?? '';
  const head = list.slice(0, -2);
  const full = [...head, `${josa(beforeLast, '과/와')} ${last}`].join(', ');
  if ([...full].length <= maxChars) return full;
  const first = list[0] ?? '';
  return `${josa(first, '과/와')} 친구 ${list.length - 1}마리`;
}
