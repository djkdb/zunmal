import type { MalangEffect } from '../../data/characters';
import { isDark, lighten, mix } from '../../lib/color';
import { INK, deepen, hexToHsl } from './helpers';
import type { ShapeSpec } from './shapes';

/**
 * 젤리 재질 층. 필터 없이 그라데이션과 도형만 쓴다 (모바일에서 40마리가 떠도 가볍다).
 * 아래에서 위로: 바닥 그림자 → 몸통 채우기(BodyFillDef) → 무늬/효과 → 아랫면 두께 → 속빛 →
 * 반사광 림 → 광택(넓고 흐린 것 + 작고 또렷한 것 + 점). 광원은 왼쪽 위다.
 *
 * compact(작은 크기)에서는 한두 픽셀짜리 층(림, 광택 점)을 빼서 뭉개지지 않게 한다.
 */

export interface JellyPaint {
  uid: string;
  color: string;
  accent: string;
}

export function JellyDefs({ paint, effect }: { paint: JellyPaint; effect: MalangEffect }) {
  const { uid, color, accent } = paint;
  const dark = isDark(color);
  // 흰색·회색에 가까운 몸은 그냥 어둡게 하면 흙빛이 돌아서 라벤더 그늘을 섞는다
  const [, sat, light] = hexToHsl(color);
  const neutral = sat * (1 - Math.abs(2 * light - 1)) < 0.14; // 채도(HSL)가 아니라 실제 색 차이(chroma)로 본다
  const shade = neutral ? mix(deepen(color, 0.28), '#9d8cc4', 0.45) : deepen(color, dark ? 0.45 : 0.32);
  // 속빛: 몸 안에서 한 번 튕긴 빛이라 몸색보다 밝고 조금 따뜻하다. 불꽃·은하는 강조색으로 빛난다.
  const inner =
    effect === 'fire' || effect === 'galaxy' ? lighten(accent, 0.35) : mix(lighten(color, 0.5), '#fff1cf', 0.25);
  const rim = lighten(effect === 'none' ? color : accent, 0.62);
  return (
    <>
      <radialGradient id={`${uid}-ground`}>
        <stop offset="0%" stopColor={INK} stopOpacity={0.26} />
        <stop offset="65%" stopColor={INK} stopOpacity={0.14} />
        <stop offset="100%" stopColor={INK} stopOpacity={0} />
      </radialGradient>
      <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={shade} stopOpacity={0} />
        <stop offset="52%" stopColor={shade} stopOpacity={0} />
        <stop offset="100%" stopColor={shade} stopOpacity={dark ? 0.5 : 0.42} />
      </linearGradient>
      <radialGradient id={`${uid}-inner`}>
        <stop offset="0%" stopColor={inner} stopOpacity={dark ? 0.4 : 0.5} />
        <stop offset="100%" stopColor={inner} stopOpacity={0} />
      </radialGradient>
      <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={rim} stopOpacity={0} />
        <stop offset="58%" stopColor={rim} stopOpacity={0} />
        <stop offset="100%" stopColor={rim} stopOpacity={0.9} />
      </linearGradient>
      <radialGradient id={`${uid}-spec`}>
        <stop offset="0%" stopColor="#fff" stopOpacity={0.62} />
        <stop offset="55%" stopColor="#fff" stopOpacity={0.22} />
        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
      </radialGradient>
    </>
  );
}

/** 몸통 밖 바닥 그림자 (말랑이 병 게임이 `.malang-body-group > ellipse:first-child`로 숨긴다) */
export function JellyGround({ uid, shape }: { uid: string; shape: ShapeSpec }) {
  return <ellipse cx={60} cy={shape.bottom + 4} rx={40} ry={6.5} fill={`url(#${uid}-ground)`} />;
}

/**
 * 몸통 clip 안, 흩뿌린 무늬(초코칩·펄)/효과 아래: 아랫면 두께 + 속빛.
 * 무늬보다 아래에 깔아야 펄·초코칩이 뿌옇게 바래지 않는다.
 */
export function JellyShading({ uid, shape }: { uid: string; shape: ShapeSpec }) {
  const top = shape.top - 10;
  return (
    <g className="malang-jelly">
      <rect x={0} y={top} width={120} height={shape.bottom - top + 4} fill={`url(#${uid}-shade)`} />
      <ellipse cx={60} cy={shape.bottom - 13} rx={30} ry={13} fill={`url(#${uid}-inner)`} />
    </g>
  );
}

/** 몸통 clip 안 맨 위: 반사광 림 + 광택 */
export function JellySpecular({ uid, shape, compact }: { uid: string; shape: ShapeSpec; compact: boolean }) {
  const { x, y } = shape.light;
  const rot = `rotate(-30 ${x} ${y})`;
  return (
    <g className="malang-spec">
      {/* 광원 반대편(오른쪽 아래) 가장자리에 도는 반사광. clip 안이라 선의 안쪽 절반만 보인다 */}
      {!compact && <path d={shape.body} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={8} />}
      <ellipse cx={x + 4} cy={y + 4} rx={24} ry={15} fill={`url(#${uid}-spec)`} transform={rot} />
      <ellipse cx={x} cy={y} rx={compact ? 11 : 10} ry={compact ? 6.4 : 5.4} fill="#fff" opacity={0.9} transform={rot} />
      {!compact && <circle cx={x + 15} cy={y - 8.5} r={2.4} fill="#fff" opacity={0.9} />}
    </g>
  );
}
