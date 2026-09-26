/**
 * 말랑 사진 찍기: 지금 매트의 말랑이(3D 캔버스 또는 2D SVG) + 소품 + 입자를 스카이 소다 카드에 담아 PNG 로 만든다.
 * 배치는 순수 모듈 `touch/photoCard.ts` (담을 영역 frameGroup, 무늬 자리 patternPlacement, 칩 줄·한 줄).
 * 외부 이미지 없이 캔버스로만 그린다 — 매트 무늬는 코드로 그린 타일 SVG, 소품은 화면의 SVG 를 굽는다.
 * 글꼴은 CSS 토큰(--font-display / --font-body)을 읽어 화면과 같은 글꼴로 쓴다.
 *
 * 공유는 사용자 입력 안에서만 되므로(iOS) 찍은 뒤 미리보기에서 "공유하기"를 한 번 더 누르게 한다.
 */
import { RARITY_META, type Rarity } from '../../data/rarity';
import { createSeededRng } from '../../lib/rng';
import {
  layoutChipRow,
  patternPlacement,
  photoCardLayout,
  type RarityChip,
  type Rect,
} from '../../touch/photoCard';
import { VIEWBOX } from '../malang/helpers';
import { rasterizeMalang } from './rasterMalang';

/** 캔버스 글꼴 (CSS 토큰을 못 읽을 때). 제목 글꼴은 한 가지 굵기뿐이라 굵게 하지 않는다 */
const DISPLAY_FALLBACK = "'Jua', 'NanumSquareRound', 'Pretendard Variable', sans-serif";
const BODY_FALLBACK = "'NanumSquareRound', 'Pretendard Variable', sans-serif";

/** 스카이 소다 색 (global.css 토큰과 같은 값) */
const INK = '#22304a';
const SUB = '#56657f';
const PRIMARY = '#ff9fb8';
const PRIMARY_DEEP = '#f27a9a';
const PRIMARY_TEXT = '#b8456f';
const RAINBOW = ['#ffd0dc', '#fff1b8', '#d4f5df', '#d6e9ff', '#e6dcff'] as const;

const RARITY_FALLBACK: Record<Rarity, { color: string; tint: string; ink: string }> = {
  common: { color: '#c3cddb', tint: '#eef2f7', ink: '#56657f' },
  rare: { color: '#7db8ff', tint: '#dcebff', ink: '#2a64b0' },
  epic: { color: '#b592ff', tint: '#eee6ff', ink: '#6d42c9' },
  legendary: { color: '#ffc53d', tint: '#fff0c2', ink: '#8a5b00' },
  mythic: { color: '#ff8fb5', tint: '#ffe3ec', ink: '#a83d68' },
  secret: { color: '#ffd66b', tint: '#2d1b5e', ink: '#fff6d6' },
};

/** 화면 위 한 겹: 그림과 그 그림이 놓인 client 좌표 */
export interface PhotoLayer {
  image: CanvasImageSource;
  rect: Rect;
}

/** 매트 무늬: 타일 한 장(data: URL)과 화면에서 타일이 시작하는 자리 */
export interface PhotoMat {
  tileUrl: string;
  /** 타일 한 변 (CSS px) */
  tile: number;
  base: string;
  /** 화면에서 매트 천의 왼쪽 위 (client px) — 무늬가 화면과 같은 자리에 오게 */
  origin: { x: number; y: number };
}

export interface PhotoInput {
  id: string;
  /** 제목 (한 마리면 이름, 여럿이면 "말랑이 N마리와 함께") */
  name: string;
  rarity: Rarity;
  shiny: boolean;
  level: number;
  /** 여럿이 함께 찍었을 때 애정 단계 대신 쓰는 한 줄 (이름 나열) */
  caption?: string;
  /** 여럿이 함께: 등급 칩을 등급별 마릿수로 (chips) */
  group?: boolean;
  chips?: RarityChip[];
  /** 사진 칸에 담을 영역 (client 좌표, touch/photoCard.frameGroup) */
  capture: Rect;
  mat: PhotoMat;
  /** 뒤에서 앞 순서 */
  layers: PhotoLayer[];
}

function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  } catch {
    // 스타일을 못 읽으면 기본값
  }
  return fallback;
}

function rarityColors(r: Rarity): { color: string; tint: string; ink: string } {
  const fb = RARITY_FALLBACK[r];
  if (r === 'secret') return fb;
  const hex = (v: string, d: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const base = RARITY_META[r].colorVar;
  return {
    color: hex(cssVar(base, fb.color), fb.color),
    tint: hex(cssVar(`${base}-tint`, fb.tint), fb.tint),
    ink: hex(cssVar(`${base}-ink`, fb.ink), fb.ink),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.5;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.5, x - s, y + s * 0.15, x - s, y - s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.75, x - s * 0.7, y - s * 0.95, x - s * 0.45, y - s * 0.95);
  ctx.bezierCurveTo(x - s * 0.22, y - s * 0.95, x - s * 0.08, y - s * 0.82, x, y - s * 0.62);
  ctx.bezierCurveTo(x + s * 0.08, y - s * 0.82, x + s * 0.22, y - s * 0.95, x + s * 0.45, y - s * 0.95);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 0.95, x + s, y - s * 0.75, x + s, y - s * 0.35);
  ctx.bezierCurveTo(x + s, y + s * 0.15, x + s * 0.5, y + s * 0.5, x, y + s * 0.9);
  ctx.closePath();
}

/** 글자가 maxW 안에 들어가는 크기 (한 줄) */
function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, maxW: number): number {
  let s = size;
  for (let i = 0; i < 12; i++) {
    ctx.font = font(s);
    if (ctx.measureText(text).width <= maxW) break;
    s = Math.floor(s * 0.92);
  }
  return s;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** 2D 사진에서 그림 상자 밖으로 번지는 몫 (전설 이상 오라가 네모로 잘리지 않게) — 상자 폭 대비 한쪽 */
export const RASTER_PAD = 0.3;

/**
 * 2D 말랑이 SVG 를 그대로 이미지로 (외곽선·오라 포함). 결과는 상자보다 한쪽마다 RASTER_PAD 만큼 넓다 —
 * 놓을 때도 svg 상자를 같은 비율로 넓혀 놓는다.
 */
export async function rasterizeVisibleMalang(svg: SVGSVGElement, bodyPath: string, bottom: number): Promise<HTMLCanvasElement> {
  const p = VIEWBOX.w * RASTER_PAD;
  const rect = { x: VIEWBOX.x - p, y: VIEWBOX.y - p, w: VIEWBOX.w + 2 * p, h: VIEWBOX.h + 2 * p };
  return rasterizeMalang(svg, { part: 'full', rect, size: 900, bodyPath, bottom });
}

/** 소품 그림을 넓힐 몫 (한쪽, 상자 대비) — 별 조명의 빛처럼 그림 밖으로 번지는 부분까지 */
export const PROP_PAD = 0.25;

/**
 * 색을 모두 속성으로 적은 SVG(소품 그림)를 이미지로. 상자(w×h px)보다 한쪽마다 PROP_PAD 만큼 넓게 굽는다 —
 * 놓을 때도 같은 비율로 넓혀 놓는다.
 */
export async function rasterizePlainSvg(svg: SVGSVGElement, w: number, h: number): Promise<HTMLCanvasElement> {
  const scale = 3;
  const vb = svg.viewBox.baseVal;
  const px = vb.width * PROP_PAD;
  const py = vb.height * PROP_PAD;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${vb.x - px} ${vb.y - py} ${vb.width + 2 * px} ${vb.height + 2 * py}`);
  const cw = Math.max(1, Math.round(w * (1 + 2 * PROP_PAD) * scale));
  const ch = Math.max(1, Math.round(h * (1 + 2 * PROP_PAD) * scale));
  clone.setAttribute('width', String(cw));
  clone.setAttribute('height', String(ch));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  c.getContext('2d')?.drawImage(img, 0, 0, cw, ch);
  return c;
}

/** 칩 하나: 옅은 등급색 알약 + 별 + 글자 (색 + 아이콘 + 글자) */
interface ChipSpec {
  text: string;
  /** null 이면 무지개 (반짝) */
  bg: string | null;
  fg: string;
  icon: string | null;
}

export async function composePhoto(input: PhotoInput): Promise<Blob> {
  const rng = createSeededRng([...input.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
  const L = photoCardLayout(input.name, rng);
  const canvas = document.createElement('canvas');
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const display = cssVar('--font-display', DISPLAY_FALLBACK);
  const body = cssVar('--font-body', BODY_FALLBACK);
  const lineText = input.caption ?? `애정 Lv.${input.level}`;
  try {
    await Promise.all([
      document.fonts?.load(`${L.name.size}px ${display}`, `${input.name}말랑 뽑기방`),
      document.fonts?.load(`800 ${L.line.size}px ${body}`, `${lineText}반짝${RARITY_META[input.rarity].label}마리`),
    ]);
  } catch {
    // 글꼴을 못 받아도 기본 글꼴로 찍는다
  }

  // 바탕: 하늘 그라데이션 + 비눗방울
  const sky = ctx.createLinearGradient(0, 0, 0, L.height);
  sky.addColorStop(0, '#cfe6ff');
  sky.addColorStop(0.6, '#eaf4ff');
  sky.addColorStop(1, '#ffffff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.lineWidth = 3;
  for (const b of L.bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
  }

  // 카드: 흰 면 + 파란 기운 그림자 (테두리 없음)
  ctx.save();
  ctx.shadowColor = 'rgba(26, 64, 128, 0.16)';
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, L.card, 56);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // 사진 칸: 고른 매트 무늬(화면과 같은 자리·배율) → 소품·말랑이·입자
  ctx.save();
  roundRect(ctx, L.photo, 40);
  ctx.clip();
  ctx.fillStyle = input.mat.base;
  ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h);
  const place = patternPlacement(L.photo, input.capture, input.mat.origin);
  try {
    const tile = await loadImage(input.mat.tileUrl);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      const k = (place.scale * input.mat.tile) / Math.max(1, tile.naturalWidth || input.mat.tile);
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, place.x, place.y]));
      ctx.fillStyle = pattern;
      ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h);
    }
  } catch {
    // 무늬를 못 그리면 바탕색만
  }
  // 아래쪽이 살짝 도톰해 보이는 그늘
  const shade = ctx.createLinearGradient(0, L.photo.y, 0, L.photo.y + L.photo.h);
  shade.addColorStop(0, 'rgba(26,64,128,0)');
  shade.addColorStop(0.72, 'rgba(26,64,128,0)');
  shade.addColorStop(1, 'rgba(26,64,128,0.08)');
  ctx.fillStyle = shade;
  ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h);
  for (const layer of input.layers) {
    ctx.drawImage(
      layer.image,
      L.photo.x + (layer.rect.x - input.capture.x) * place.scale,
      L.photo.y + (layer.rect.y - input.capture.y) * place.scale,
      layer.rect.w * place.scale,
      layer.rect.h * place.scale,
    );
  }
  ctx.restore();
  roundRect(ctx, L.photo, 40);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(26,64,128,0.08)';
  ctx.stroke();

  // 등급 칩: 한 마리면 등급 + 반짝, 여럿이면 등급별 마릿수
  const chipFor = (r: Rarity, count: number): ChipSpec => {
    const c = rarityColors(r);
    return { text: RARITY_META[r].label + (count > 1 ? ` ${count}마리` : ''), bg: c.tint, fg: c.ink, icon: c.color };
  };
  const chips: ChipSpec[] = input.group
    ? (input.chips ?? []).map((c) => chipFor(c.rarity, c.count))
    : [chipFor(input.rarity, 1), ...(input.shiny ? [{ text: '반짝', bg: null, fg: INK, icon: null }] : [])];
  const chipFont = `800 30px ${body}`;
  ctx.font = chipFont;
  const widths = chips.map((c) => ctx.measureText(c.text).width + (c.icon ? 78 : 50));
  const xs = layoutChipRow(widths, L.chips.x, L.chips.maxRight, 12);
  xs.forEach((x, i) => {
    const c = chips[i];
    const w = widths[i];
    if (!c || w === undefined) return;
    const r: Rect = { x, y: L.chips.y - L.chips.h / 2, w, h: L.chips.h };
    ctx.save();
    ctx.shadowColor = 'rgba(26,64,128,0.18)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, r, r.h / 2);
    if (c.bg === null) {
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      RAINBOW.forEach((col, k) => g.addColorStop(k / (RAINBOW.length - 1), col));
      ctx.fillStyle = g;
    } else ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.restore();
    let tx = r.x + 25;
    if (c.icon) {
      star(ctx, r.x + 38, L.chips.y, 14);
      ctx.fillStyle = c.icon;
      ctx.fill();
      tx = r.x + 60;
    }
    ctx.font = chipFont;
    ctx.fillStyle = c.fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, tx, L.chips.y + 2);
  });

  // 이름: 제목 글꼴, 잉크색, 외곽선 없음
  const nameSize = fitFont(ctx, input.name, (s) => `${s}px ${display}`, L.name.size, L.card.w - 100);
  ctx.font = `${nameSize}px ${display}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(input.name, L.name.x, L.name.y);

  // 애정 단계(또는 단체 사진 한 줄): 하트 + 글자
  const lineSize = fitFont(ctx, lineText, (s) => `800 ${s}px ${body}`, L.line.size, L.card.w - 180);
  ctx.font = `800 ${lineSize}px ${body}`;
  const lw = ctx.measureText(lineText).width;
  const hx = L.line.x - lw / 2 - 20;
  heart(ctx, hx, L.line.y, lineSize * 0.46);
  ctx.fillStyle = PRIMARY;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PRIMARY_DEEP;
  ctx.stroke();
  ctx.fillStyle = SUB;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(lineText, hx + 30, L.line.y + 2);

  // 가게 이름
  ctx.font = `${L.logo.size}px ${display}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = PRIMARY_TEXT;
  ctx.fillText('말랑 뽑기방', L.logo.x, L.logo.y);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export type ShareResult = 'shared' | 'downloaded' | 'opened' | 'cancelled' | 'failed';

type ShareNavigator = Navigator & { canShare?: (data: ShareData) => boolean };

/** 파일 공유를 지원하는가 (모바일 Chrome·Safari) */
export function canShareFile(blob: Blob, fileName: string): boolean {
  try {
    const nav = navigator as ShareNavigator;
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    return nav.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** 사용자 입력(버튼) 안에서 부른다: 공유 창 */
export async function sharePhoto(blob: Blob, fileName: string, text: string): Promise<ShareResult> {
  const nav = navigator as ShareNavigator;
  try {
    await nav.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: '말랑 뽑기방', text });
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** 파일로 저장 (안 되는 앱 안 브라우저는 새 탭으로 열어 길게 눌러 저장) */
export function savePhoto(blob: Blob, fileName: string): ShareResult {
  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  const a = document.createElement('a');
  if ('download' in a) {
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'downloaded';
  }
  return window.open(url, '_blank') ? 'opened' : 'failed';
}
