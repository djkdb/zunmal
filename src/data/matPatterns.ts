/**
 * 놀이방 매트 무늬 그림 (순수 데이터). 타일 SVG 한 장을 코드로 그린다 →
 * CSS 배경(data: URL)과 사진 카드(캔버스 패턴)가 같은 그림을 쓴다. 놀이방 청크에서만 import 한다
 * (저장 검사에 필요한 id 목록은 data/playroomDecor.ts).
 */
import type { MatPatternId } from './playroomDecor';

export interface MatPattern {
  id: MatPatternId;
  label: string;
  /** 천 바탕색 */
  base: string;
  /** 타일 한 변 (CSS px) */
  tile: number;
  /** 타일 안의 무늬 (tile × tile 좌표의 SVG 조각, 바탕 없이) */
  art: string;
  /** 어두운 천인가 (그림자·빈 매트 안내를 조금 다르게) */
  dark: boolean;
}

/** 작은 네 갈래 반짝이 (별밤) */
function sparkle(x: number, y: number, r: number, fill: string): string {
  const k = r * 0.28;
  return `<path d="M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r}Z" fill="${fill}"/>`;
}

/** 작은 하트 (딸기우유). (x, y) = 하트 가운데 */
function heart(x: number, y: number, s: number, fill: string): string {
  return `<path d="M${x} ${y + s * 0.8} C${x - s * 1.1} ${y} ${x - s} ${y - s * 0.9} ${x} ${y - s * 0.35} C${x + s} ${y - s * 0.9} ${x + s * 1.1} ${y} ${x} ${y + s * 0.8}Z" fill="${fill}"/>`;
}

/** 뭉게구름 한 덩이 (구름). (x, y) = 구름 바닥 가운데 */
function cloud(x: number, y: number, s: number, fill: string): string {
  return (
    `<g fill="${fill}">` +
    `<ellipse cx="${x}" cy="${y - s * 0.28}" rx="${s}" ry="${s * 0.3}"/>` +
    `<circle cx="${x - s * 0.42}" cy="${y - s * 0.46}" r="${s * 0.36}"/>` +
    `<circle cx="${x + s * 0.12}" cy="${y - s * 0.62}" r="${s * 0.48}"/>` +
    `<circle cx="${x + s * 0.6}" cy="${y - s * 0.4}" r="${s * 0.3}"/>` +
    `</g>`
  );
}

export const MAT_PATTERNS: Readonly<Record<MatPatternId, MatPattern>> = {
  'sky-dots': {
    id: 'sky-dots',
    label: '하늘 도트',
    base: '#f6faff',
    tile: 36,
    art: '<g fill="#dbeaff"><circle cx="9" cy="9" r="4"/><circle cx="27" cy="27" r="4"/></g>',
    dark: false,
  },
  cloud: {
    id: 'cloud',
    label: '구름',
    base: '#e4f0ff',
    tile: 120,
    art: cloud(30, 44, 22, '#ffffff') + cloud(88, 104, 16, '#f7fbff') + '<g fill="#ffffff" opacity="0.8"><circle cx="96" cy="30" r="2.5"/><circle cx="20" cy="92" r="2"/></g>',
    dark: false,
  },
  'pastel-check': {
    id: 'pastel-check',
    label: '파스텔 체크',
    base: '#ffffff',
    tile: 44,
    art: '<rect x="0" y="0" width="22" height="44" fill="#8fc3ff" opacity="0.2"/><rect x="0" y="0" width="44" height="22" fill="#ff9fb8" opacity="0.2"/>',
    dark: false,
  },
  'strawberry-milk': {
    id: 'strawberry-milk',
    label: '딸기우유',
    base: '#fff1f5',
    tile: 52,
    art: heart(13, 13, 6, '#ffc9d8') + heart(39, 39, 6, '#ffc9d8') + '<g fill="#ffffff"><circle cx="39" cy="12" r="2.4"/><circle cx="13" cy="40" r="2.4"/></g>',
    dark: false,
  },
  'mint-stripe': {
    id: 'mint-stripe',
    label: '민트 줄무늬',
    base: '#f1fbf5',
    tile: 32,
    // (x + y) mod 32 ∈ [0, 12) 인 대각선 띠 — 타일 경계에서 이어진다
    art: '<path d="M0 0H12L0 12Z M0 32L32 0V12L12 32Z" fill="#d2f1de"/>',
    dark: false,
  },
  'star-night': {
    id: 'star-night',
    label: '별밤',
    base: '#56649f',
    tile: 88,
    art:
      sparkle(22, 26, 6, '#ffe08a') +
      sparkle(66, 64, 4.5, '#ffffff') +
      '<g fill="#ffffff" opacity="0.75"><circle cx="64" cy="20" r="1.6"/><circle cx="18" cy="70" r="1.4"/><circle cx="44" cy="46" r="1.2"/></g>',
    dark: true,
  },
};

export function matPattern(id: MatPatternId): MatPattern {
  return MAT_PATTERNS[id];
}

/** 타일 한 장의 SVG 문서 */
export function matTileSvg(id: MatPatternId): string {
  const p = MAT_PATTERNS[id];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.tile}" height="${p.tile}" viewBox="0 0 ${p.tile} ${p.tile}">` +
    `<rect width="${p.tile}" height="${p.tile}" fill="${p.base}"/>${p.art}</svg>`
  );
}

/** 타일 SVG 의 data: URL (CSS·캔버스 이미지 공용) */
export function matTileDataUrl(id: MatPatternId): string {
  return `data:image/svg+xml,${encodeURIComponent(matTileSvg(id))}`;
}

/** 매트 천 CSS background 값 (타일 반복 + 바탕색) */
export function matBackgroundCss(id: MatPatternId): string {
  const p = MAT_PATTERNS[id];
  return `url("${matTileDataUrl(id)}") 0 0 / ${p.tile}px ${p.tile}px repeat, ${p.base}`;
}

