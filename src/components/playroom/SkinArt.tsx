import { SURFACE_TUNING } from '../../touch/surface';
import { VIEWBOX, VIEWBOX_ATTR } from '../malang/helpers';
import type { ShapeSpec } from '../malang/shapes';
import type { BodyEls } from './bodyRec';
import type { Surface2d } from './malangActor';

interface SkinArtProps {
  id: string;
  shape: ShapeSpec;
  els: BodyEls;
}

/** 주름 골 수 (3D 와 같다) */
const CREASES = SURFACE_TUNING.creaseCount;

/**
 * 2D 대체 화면의 표면 질감 겹 그림 (3D 의 softbody 자국·물결을 흉내): 몸 윤곽 안에만 보인다.
 *  - 손끝 자국: 가운데가 그늘진 타원(손끝 크기) + 밝은 테 + 폼은 깊이 누르면 바퀴살 주름
 *  - 젤리 물결: 놓은 자리에서 퍼지는 옅은 흰 고리 둘
 * 페이지가 매 프레임 `drawSkin2d` 로 자리·크기·진하기만 바꾼다 (다시 그리기 없음).
 */
export function SkinArt({ id, shape, els }: SkinArtProps) {
  const clip = `pr-skin-clip-${id}`;
  const grad = `pr-skin-dent-${id}`;
  const creases = Array.from({ length: CREASES }, (_, i) => {
    const a = (i / CREASES) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return `M${(c * 1.0).toFixed(3)} ${(s * 1.0 * SURFACE_TUNING.fingerAspect).toFixed(3)} L${(c * 1.75).toFixed(3)} ${(s * 1.75 * SURFACE_TUNING.fingerAspect).toFixed(3)}`;
  });
  return (
    <svg className="pr-skin" viewBox={VIEWBOX_ATTR} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <path d={shape.body} />
        </clipPath>
        {/* 가운데는 손가락·벽에 가려 그늘지고(곱하기로 몸색이 짙어진다), 둘레 너머 솟은 테는 빛을 받아 밝다 */}
        <radialGradient id={grad}>
          <stop offset="0" stopColor="#a996bd" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#a996bd" stopOpacity="0.7" />
          <stop offset="0.74" stopColor="#a996bd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${grad}-rim`}>
          <stop offset="0.66" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.95" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g
          className="pr-skin__dent"
          opacity={0}
          ref={(el) => {
            els.dent = el;
          }}
        >
          <ellipse
            className="pr-skin__pit"
            cx={0}
            cy={0}
            rx={1.35}
            ry={1.35 * SURFACE_TUNING.fingerAspect}
            fill={`url(#${grad})`}
          />
          <ellipse cx={0} cy={0} rx={1.35} ry={1.35 * SURFACE_TUNING.fingerAspect} fill={`url(#${grad}-rim)`} />
          <g className="pr-skin__creases" stroke="#6d5a80" strokeWidth={0.07} strokeLinecap="round" fill="none" opacity={0}>
            {creases.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </g>
        <g
          className="pr-skin__ripple"
          opacity={0}
          ref={(el) => {
            els.ripple = el;
          }}
          fill="none"
          stroke="#ffffff"
        >
          <circle r={1} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
          <circle r={0.7} strokeWidth={1.5} opacity={0.55} vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </svg>
  );
}

/** 한 프레임: 자국·물결의 자리·크기·진하기 (스프라이트 상자 비율 → 그림 좌표) */
export function drawSkin2d(els: BodyEls, s: Surface2d): void {
  const dent = els.dent;
  if (dent) {
    const d = s.dent;
    if (d) {
      const x = VIEWBOX.x + d.x * VIEWBOX.w;
      const y = VIEWBOX.y + d.y * VIEWBOX.w;
      const r = d.r * VIEWBOX.w * (0.85 + 0.25 * d.depth);
      dent.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${r.toFixed(3)})`);
      dent.setAttribute('opacity', (Math.min(1, d.depth * 1.3) * d.shade).toFixed(3));
      const cr = dent.lastElementChild;
      if (cr) cr.setAttribute('opacity', (d.crease * 0.55).toFixed(3));
    } else if (dent.getAttribute('opacity') !== '0') {
      dent.setAttribute('opacity', '0');
    }
  }
  const ring = els.ripple;
  if (ring) {
    const r = s.ripple;
    if (r && r.r > 0.5 / VIEWBOX.w) {
      const x = VIEWBOX.x + r.x * VIEWBOX.w;
      const y = VIEWBOX.y + r.y * VIEWBOX.w;
      const rad = r.r * VIEWBOX.w;
      ring.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${rad.toFixed(3)})`);
      ring.setAttribute('opacity', (r.alpha * 0.8).toFixed(3));
    } else if (ring.getAttribute('opacity') !== '0') {
      ring.setAttribute('opacity', '0');
    }
  }
}
