/**
 * 말랑 사진 카드 배치 — 순수 모듈 (캔버스 그리기는 components/touch3d/photo.ts).
 * 인스타그램 세로 게시물 비율(4:5, 1080×1350)의 폴라로이드 카드:
 * 스프링클 배경 → 잉크 테두리 카드 → 사진 칸(말랑이) → 등급 딱지 → 이름 풍선 글씨 → 애정 단계 → 가게 이름.
 */
import type { RNG } from '../lib/rng';

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sprinkle {
  x: number;
  y: number;
  angle: number;
  color: string;
}

export interface PhotoCardLayout {
  width: number;
  height: number;
  /** 카드 (잉크 테두리) */
  card: Rect;
  /** 사진 칸 */
  photo: Rect;
  /** 등급 딱지 (사진 칸 왼쪽 위에 걸침) */
  badge: Rect;
  /** 이름 */
  name: { x: number; y: number; size: number };
  /** 애정 단계 줄 */
  level: { x: number; y: number; size: number };
  /** 가게 이름 (오른쪽 아래) */
  logo: { x: number; y: number; size: number };
  sprinkles: Sprinkle[];
}

const SPRINKLE_COLORS = ['#ff8fab', '#5cc8ff', '#ffd23f', '#7ed957', '#b98cff', '#ffb36b'] as const;

/** 이름 글자 크기: 카드 폭 안에 들어가게 (한글 한 글자 ≈ 글자 크기 1.0 폭) */
export function nameFontSize(name: string, maxWidth: number, max = 96, min = 52): number {
  const chars = Math.max(1, [...name].length);
  return Math.max(min, Math.min(max, Math.floor(maxWidth / (chars * 1.02))));
}

export function photoCardLayout(name: string, rng: RNG): PhotoCardLayout {
  const card: Rect = { x: 54, y: 54, w: CARD_W - 108, h: CARD_H - 108 };
  const photo: Rect = { x: card.x + 42, y: card.y + 42, w: card.w - 84, h: 860 };
  const badge: Rect = { x: photo.x + 26, y: photo.y + 26, w: 250, h: 74 };
  const nameY = photo.y + photo.h + 118;
  const sprinkles: Sprinkle[] = [];
  for (let i = 0; i < 46; i++) {
    sprinkles.push({
      x: Math.round(rng() * CARD_W),
      y: Math.round(rng() * CARD_H),
      angle: rng() * Math.PI,
      color: SPRINKLE_COLORS[Math.floor(rng() * SPRINKLE_COLORS.length)] ?? '#ff8fab',
    });
  }
  return {
    width: CARD_W,
    height: CARD_H,
    card,
    photo,
    badge,
    name: { x: CARD_W / 2, y: nameY, size: nameFontSize(name, card.w - 120) },
    level: { x: CARD_W / 2, y: nameY + 92, size: 46 },
    logo: { x: card.x + card.w - 40, y: card.y + card.h - 36, size: 34 },
    sprinkles,
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

/**
 * 사진 칸에 담을 영역: 말랑이 상자(client px) 를 위로 넉넉히(장식·입자) 키운 정사각형에 가깝게.
 * 결과는 client 좌표.
 */
export function captureRect(jelly: Rect, bounds: Rect): Rect {
  const w = jelly.w * 1.55;
  const h = jelly.h * 1.5;
  const cx = jelly.x + jelly.w / 2;
  const top = jelly.y - jelly.h * 0.36;
  const r: Rect = { x: cx - w / 2, y: top, w, h };
  // 캔버스 밖은 잘라낸다
  const x0 = Math.max(bounds.x, r.x);
  const y0 = Math.max(bounds.y, r.y);
  const x1 = Math.min(bounds.x + bounds.w, r.x + r.w);
  const y1 = Math.min(bounds.y + bounds.h, r.y + r.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
