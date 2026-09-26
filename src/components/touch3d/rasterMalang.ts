/**
 * 화면에 그려진 <Malang> SVG 를 그대로 이미지(캔버스)로 굽는다 — 3D 젤리 몸에 입힐 텍스처.
 *
 * 말랑이 그림 코드를 따로 두지 않고 실제 컴포넌트를 복제하므로 32종 모두, 앞으로 바뀌는 그림도 똑같이 보인다.
 * SVG 를 이미지로 그리면 페이지 CSS 가 적용되지 않으므로, 원본 요소의 계산된 스타일(칠·선…)을 속성으로 옮겨 적는다.
 * 애니메이션 중간 값이 찍히지 않도록 원본 쪽은 CSS 로 애니메이션을 꺼 둔다(TouchPage.css `.touch3d-src`).
 *
 * 부분 굽기:
 *  - body  : 전체 (몸통 + 무늬 + 얼굴 + 앞 장식) → 부풀린 몸에 입힘
 *  - back  : 몸통 뒤 장식(날개·귀·꼬리…)만, 몸통 안쪽은 지움 → 몸 뒤 평평한 카드
 *  - front : 얼굴 앞 장식(왕관·리본…) 중 몸통 밖으로 나온 부분만 → 몸 앞 평평한 카드 (외곽선보다 위)
 */

export type RasterPart = 'body' | 'back' | 'front' | 'full';

/** 구운 그림 위에 덧그리는 모양 (그림 좌표 SVG path) — 만지기 전용 얼굴 */
export interface RasterExtra {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
}

export interface RasterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'paint-order',
  'mix-blend-mode',
  'stop-color',
  'stop-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'filter',
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

function inlineStyles(src: Element, dst: Element) {
  const cs = window.getComputedStyle(src);
  let style = dst.getAttribute('style') ?? '';
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (!v || (p === 'filter' && v === 'none') || (p === 'mix-blend-mode' && v === 'normal')) continue;
    style += `;${p}:${v}`;
  }
  // CSS 로 걸린 변형(애니메이션)은 옮기지 않는다 — 정지 그림
  if (style) dst.setAttribute('style', style.replace(/^;/, ''));
  const sc = src.children;
  const dc = dst.children;
  for (let i = 0; i < sc.length && i < dc.length; i++) {
    const s = sc[i];
    const d = dc[i];
    if (s && d) inlineStyles(s, d);
  }
}

/** 몸통 그룹 안에서 [몸통 path 의 위치, 얼굴 그룹의 위치] */
function landmarks(group: Element, bodyPath: string): { body: number; face: number } {
  let body = -1;
  let face = -1;
  const kids = Array.from(group.children);
  kids.forEach((el, i) => {
    if (body < 0 && el.tagName.toLowerCase() === 'path' && el.getAttribute('d') === bodyPath) body = i;
    if (face < 0 && (el.classList.contains('malang-face') || el.querySelector(':scope > .malang-face'))) face = i;
  });
  return { body, face };
}

function prune(svg: SVGSVGElement, part: RasterPart, bodyPath: string, bottom: number) {
  if (part === 'full') return;
  const group = svg.querySelector('.malang-body-group') ?? Array.from(svg.children).find((c) => c.tagName.toLowerCase() === 'g');
  if (!group) return;
  if (part === 'body') {
    // 몸통 잉크 외곽선은 3D 외곽선(뒤집힌 껍질)이 대신 그린다 — 텍스처에 남기면 가장자리가 회색 띠로 늘어난다
    for (const el of Array.from(group.children)) {
      if (el.tagName.toLowerCase() !== 'path' || el.getAttribute('d') !== bodyPath) continue;
      // 복제본은 문서 밖이라 계산된 스타일이 없다 → 속성과 옮겨 적은 style 로 판단
      const style = (el.getAttribute('style') ?? '').replace(/\s/g, '');
      if (el.getAttribute('fill') === 'none' || /(^|;)fill:none/.test(style)) {
        el.setAttribute('style', `${el.getAttribute('style') ?? ''};stroke:none`);
        el.setAttribute('stroke', 'none');
      }
    }
    return;
  }
  const top = Array.from(svg.children);
  const gi = top.indexOf(group);
  const { body, face } = landmarks(group, bodyPath);
  const kids = Array.from(group.children);
  if (part === 'back') {
    // 몸통부터 뒤는 모두 지우고, 몸통 아래 그림자 타원도 지운다 (3D 그림자를 따로 그림)
    kids.forEach((el, i) => {
      if (body >= 0 && i >= body) el.remove();
      const isShadow =
        i === 0 && el.tagName.toLowerCase() === 'ellipse' && Number(el.getAttribute('cy')) >= bottom - 1;
      if (isShadow) el.remove();
    });
    top.forEach((el, i) => {
      if (i > gi) el.remove();
    });
  } else {
    if (face < 0) {
      // 구조를 모르면 앞 카드는 비운다 (몸 텍스처에 이미 다 들어 있다)
      kids.forEach((el) => el.remove());
    } else {
      kids.forEach((el, i) => {
        if (i <= face) el.remove();
      });
    }
    top.forEach((el, i) => {
      if (i < gi && el.tagName.toLowerCase() !== 'defs') el.remove();
    });
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg raster failed'));
    img.src = url;
  });
}

/**
 * source (화면의 Malang svg) 의 rect 영역을 size×size 캔버스로 굽는다.
 * back/front 는 몸통 안쪽을 지워 몸 메시와 겹치지 않게 한다.
 */
export async function rasterizeMalang(
  source: SVGSVGElement,
  opts: {
    part: RasterPart;
    rect: RasterRect;
    size: number;
    bodyPath: string;
    bottom: number;
    extras?: readonly RasterExtra[];
    /** 세로 크기 (기본 size) */
    height?: number;
  },
): Promise<HTMLCanvasElement> {
  const { part, rect, size, bodyPath } = opts;
  const clone = source.cloneNode(true) as SVGSVGElement;
  inlineStyles(source, clone);
  clone.querySelectorAll('title').forEach((t) => t.remove());
  prune(clone, part, bodyPath, opts.bottom);
  clone.setAttribute('xmlns', SVG_NS);
  const height = opts.height ?? size;
  clone.setAttribute('width', String(size));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  clone.setAttribute('preserveAspectRatio', 'none');
  clone.removeAttribute('class');
  clone.style.overflow = 'hidden';

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, size, height);
    if (opts.extras && opts.extras.length > 0) {
      ctx.save();
      ctx.setTransform(size / rect.w, 0, 0, height / rect.h, (-rect.x * size) / rect.w, (-rect.y * height) / rect.h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const e of opts.extras) {
        const path = new Path2D(e.d);
        ctx.globalAlpha = e.opacity ?? 1;
        if (e.fill) {
          ctx.fillStyle = e.fill;
          ctx.fill(path);
        }
        if (e.stroke) {
          ctx.strokeStyle = e.stroke;
          ctx.lineWidth = e.width ?? 1.5;
          ctx.stroke(path);
        }
      }
      ctx.restore();
    }
    if (part === 'back' || part === 'front') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.setTransform(size / rect.w, 0, 0, size / rect.h, (-rect.x * size) / rect.w, (-rect.y * size) / rect.h);
      ctx.fill(new Path2D(bodyPath));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
