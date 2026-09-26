/**
 * 말랑 사진 찍기: 지금 화면의 말랑이(3D 캔버스 또는 2D SVG) + 입자 캔버스를 귀여운 카드에 담아 PNG 로 만든다.
 * 배치는 순수 모듈 `touch/photoCard.ts`. 외부 이미지 없이 캔버스로만 그린다.
 *
 * 공유는 사용자 입력 안에서만 되므로(iOS) 찍은 뒤 미리보기에서 "공유하기"를 한 번 더 누르게 한다.
 */
import { RARITY_META, type Rarity } from '../../data/rarity';
import { createSeededRng } from '../../lib/rng';
import {
  captureRect,
  fitContain,
  photoCardLayout,
  type Rect,
} from '../../touch/photoCard';
import { VIEWBOX } from '../malang/helpers';
import { rasterizeMalang } from './rasterMalang';

const INK = '#2b2233';
const PAPER = '#fffdf8';
const CREAM = '#fff4e2';
const FONT = '"Cafe24 Ssurround", "Jua", "Apple SD Gothic Neo", sans-serif';
const RARITY_FALLBACK: Record<Rarity, string> = {
  common: '#cfc5b6',
  rare: '#5cc8ff',
  epic: '#b98cff',
  legendary: '#ffc02e',
  mythic: '#ff7aa2',
  secret: '#2d1b5e',
};

/** 화면 위 한 겹: 그림과 그 그림이 놓인 client 좌표 */
export interface PhotoLayer {
  image: CanvasImageSource;
  rect: Rect;
}

export interface PhotoInput {
  id: string;
  name: string;
  rarity: Rarity;
  shiny: boolean;
  level: number;
  /** 여럿이 함께 찍었을 때 애정 단계 대신 쓰는 한 줄 (3단계 단체 사진 틀이 이 자리를 키운다) */
  caption?: string;
  /** 여럿이 함께 (등급 딱지 없이, 밝은 바탕) */
  group?: boolean;
  /** 말랑이 상자 (client 좌표) — 사진 칸을 여기에 맞춘다 */
  jelly: Rect;
  /** 잘라낼 수 있는 범위 (client 좌표, 무대) */
  bounds: Rect;
  layers: PhotoLayer[];
}

function rarityColor(r: Rarity): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(RARITY_META[r].colorVar).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  } catch {
    // 스타일을 못 읽으면 기본값
  }
  return RARITY_FALLBACK[r];
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
    const rr = i % 2 === 0 ? r : r * 0.48;
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

/** 풍선 글씨: 잉크 그림자 → 잉크 외곽선 → 흰 글자 (.page-title 과 같은 느낌) */
function balloonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = '#ffffff') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.strokeText(text, x, y + size * 0.09);
  ctx.fillText(text, x, y + size * 0.09);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 지금 화면을 사진 칸 크기의 캔버스로 모은다 */
function gatherScene(input: PhotoInput): HTMLCanvasElement {
  const cap = captureRect(input.jelly, input.bounds);
  const scale = 3;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cap.w * scale));
  c.height = Math.max(1, Math.round(cap.h * scale));
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  for (const layer of input.layers) {
    ctx.drawImage(
      layer.image,
      (layer.rect.x - cap.x) * scale,
      (layer.rect.y - cap.y) * scale,
      layer.rect.w * scale,
      layer.rect.h * scale,
    );
  }
  return c;
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

export async function composePhoto(input: PhotoInput): Promise<Blob> {
  const rng = createSeededRng([...input.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
  const L = photoCardLayout(input.name, rng);
  const canvas = document.createElement('canvas');
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  try {
    await document.fonts?.load(`${L.name.size}px ${FONT}`);
  } catch {
    // 글꼴을 못 받아도 기본 글꼴로 찍는다
  }
  const color = rarityColor(input.rarity);
  // 일반 등급 색(베이지)은 번지면 탁해 보여서 딸기우유색으로
  const glowColor = input.rarity === 'common' || input.group ? '#ffb3c8' : color;
  const meta = RARITY_META[input.rarity];
  const dark = input.rarity === 'secret' && !input.group;

  // 배경 + 스프링클
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.lineCap = 'round';
  ctx.lineWidth = 12;
  for (const s of L.sprinkles) {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 14, s.y - Math.sin(s.angle) * 14);
    ctx.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 카드: 같은 잉크 아랫단 + 종이 + 잉크 테두리
  roundRect(ctx, { ...L.card, y: L.card.y + 14 }, 56);
  ctx.fillStyle = INK;
  ctx.fill();
  roundRect(ctx, L.card, 56);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // 사진 칸: 등급 색이 은은하게 번지는 바탕
  ctx.save();
  roundRect(ctx, L.photo, 36);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, L.photo.y, 0, L.photo.y + L.photo.h);
  if (dark) {
    bg.addColorStop(0, '#3b2a78');
    bg.addColorStop(1, '#140a2a');
  } else {
    bg.addColorStop(0, '#fffaf0');
    bg.addColorStop(1, CREAM);
  }
  ctx.fillStyle = bg;
  ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h);
  const glow = ctx.createRadialGradient(
    L.photo.x + L.photo.w / 2,
    L.photo.y + L.photo.h * 0.55,
    0,
    L.photo.x + L.photo.w / 2,
    L.photo.y + L.photo.h * 0.55,
    L.photo.w * 0.55,
  );
  glow.addColorStop(0, `${glowColor}99`);
  glow.addColorStop(1, `${glowColor}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h);
  if (dark) {
    // 시크릿: 밤하늘 작은 별
    ctx.fillStyle = '#fff6c9';
    for (const s of L.sprinkles.slice(0, 24)) {
      const x = L.photo.x + (s.x / L.width) * L.photo.w;
      const y = L.photo.y + (s.y / L.height) * L.photo.h;
      star(ctx, x, y, 5 + (s.angle % 1) * 5);
      ctx.fill();
    }
  }
  // 접시
  ctx.fillStyle = 'rgba(43,34,51,0.12)';
  ctx.beginPath();
  ctx.ellipse(L.photo.x + L.photo.w / 2, L.photo.y + L.photo.h * 0.86, L.photo.w * 0.34, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  const scene = gatherScene(input);
  const at = fitContain(scene.width, scene.height, L.photo, 0.03);
  ctx.drawImage(scene, at.x, at.y, at.w, at.h);
  ctx.restore();
  roundRect(ctx, L.photo, 36);
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // 등급 딱지: 색 + 별 + 글자 (단체 사진은 없음)
  if (!input.group) drawBadge();
  function drawBadge() {
  if (!ctx) return;
  const label = meta.label;
  ctx.font = `44px ${FONT}`;
  const starCount = Math.min(6, meta.stars);
  const textW = ctx.measureText(label).width;
  const badgeW = Math.max(L.badge.w, 40 + textW + 18 + starCount * 30 + 24);
  const badge = { ...L.badge, w: badgeW };
  roundRect(ctx, { ...badge, y: badge.y + 7 }, badge.h / 2);
  ctx.fillStyle = INK;
  ctx.fill();
  roundRect(ctx, badge, badge.h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = dark ? '#fff6c9' : INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badge.x + 32, badge.y + badge.h / 2 + 2);
  for (let i = 0; i < starCount; i++) {
    star(ctx, badge.x + 32 + textW + 30 + i * 30, badge.y + badge.h / 2, 12);
    ctx.fillStyle = dark ? '#ffd23f' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  if (input.shiny) {
    const sx = badge.x + badge.w + 16;
    const shinyRect = { x: sx, y: badge.y + 8, w: 132, h: badge.h - 16 };
    const g = ctx.createLinearGradient(sx, 0, sx + shinyRect.w, 0);
    ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'].forEach((c, i) => g.addColorStop(i / 4, c));
    roundRect(ctx, shinyRect, shinyRect.h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.font = `34px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText('반짝', sx + shinyRect.w / 2, shinyRect.y + shinyRect.h / 2 + 2);
  }
  }

  // 이름 (풍선 글씨)
  balloonText(ctx, input.name, L.name.x, L.name.y, L.name.size);

  // 애정 단계(또는 단체 사진 한 줄): 하트 + 글자
  ctx.font = `${L.level.size}px ${FONT}`;
  const levelText = input.caption ?? `애정 Lv.${input.level}`;
  const lw = ctx.measureText(levelText).width;
  const hx = L.level.x - lw / 2 - 30;
  heart(ctx, hx, L.level.y, 24);
  ctx.fillStyle = '#ff7aa2';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(levelText, hx + 36, L.level.y + 2);

  // 가게 이름
  ctx.font = `${L.logo.size}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.strokeText('말랑 뽑기방', L.logo.x, L.logo.y);
  ctx.fillStyle = '#ff8fab';
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
