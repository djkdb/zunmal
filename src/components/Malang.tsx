import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Character, MalangEyes, MalangEffect } from '../data/characters';
import { isDark, lighten } from '../lib/color';
import { AccessoryBack, AccessoryDefs, AccessoryFront, type AccessoryPaint } from './malang/accessories';
import { AuraBack, AuraDefs, AuraFront } from './malang/aura';
import { BodyFillDef, EffectBehind, EffectDefs, EffectOverlay } from './malang/effects';
import { INK, VIEWBOX_ATTR, auraLevel, shinyColor } from './malang/helpers';
import { PatternDef, ScatterPattern, isTilePattern } from './malang/patterns';
import { SHAPES, type ShapeSpec } from './malang/shapes';
import { ShinyDefs, ShinyOverlay, ShinySparkles } from './malang/shiny';
import './Malang.css';

// ── 얼굴 ───────────────────────────────────────────────────

function Eye({ kind, x, y, color, glint }: { kind: MalangEyes; x: number; y: number; color: string; glint: string }) {
  switch (kind) {
    case 'happy':
      return <path d={`M${x - 6} ${y + 2} Q${x} ${y - 7} ${x + 6} ${y + 2}`} className="malang-stroke" stroke={color} />;
    case 'sleepy':
      return <path d={`M${x - 6} ${y} Q${x} ${y + 6} ${x + 6} ${y}`} className="malang-stroke" stroke={color} />;
    case 'sparkle':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={5.6} ry={6.6} fill={color} />
          <circle cx={x + 1.8} cy={y - 2.4} r={2.2} fill={glint} />
          <circle cx={x - 2} cy={y + 2.4} r={1} fill={glint} />
        </g>
      );
    case 'wide':
      return (
        <g>
          <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={2.4} />
          <circle cx={x + 1} cy={y + 1} r={3.6} fill={color} />
          <circle cx={x + 2} cy={y - 0.5} r={1.1} fill="#fff" />
        </g>
      );
    case 'wink':
    case 'dot':
    default:
      return (
        <g>
          <circle cx={x} cy={y} r={4.5} fill={color} />
          <circle cx={x + 1.5} cy={y - 1.6} r={1.5} fill={glint} />
        </g>
      );
  }
}

function Face({ shape, eyes, dark }: { shape: ShapeSpec; eyes: MalangEyes; dark: boolean }) {
  const { faceY: y, eyeGap } = shape;
  const featureColor = dark ? '#fff6e6' : INK;
  const glint = dark ? INK : '#fff';
  const left = 60 - eyeGap;
  const right = 60 + eyeGap;
  return (
    <g className="malang-face">
      <ellipse cx={left - 8} cy={y + 9} rx={7} ry={4} fill="#ff7a9c" opacity={0.45} />
      <ellipse cx={right + 8} cy={y + 9} rx={7} ry={4} fill="#ff7a9c" opacity={0.45} />
      <Eye kind={eyes} x={left} y={y} color={featureColor} glint={glint} />
      {eyes === 'wink' ? (
        <Eye kind="happy" x={right} y={y} color={featureColor} glint={glint} />
      ) : (
        <Eye kind={eyes} x={right} y={y} color={featureColor} glint={glint} />
      )}
      <path
        d={`M${55} ${y + 7} Q${57.5} ${y + 11} ${60} ${y + 7.5} Q${62.5} ${y + 11} ${65} ${y + 7}`}
        className="malang-stroke"
        stroke={featureColor}
        strokeWidth={2.4}
      />
    </g>
  );
}

// ── 컴포넌트 ────────────────────────────────────────────────

export type MalangAnimation = 'none' | 'idle' | 'bounce' | 'wiggle' | 'squish';
export type MalangAura = 'none' | 'auto';

type MalangCharacter = Pick<Character, 'name' | 'color' | 'shape' | 'eyes' | 'accessory' | 'pattern'> &
  Partial<Pick<Character, 'rarity' | 'accentColor' | 'effect'>>;

export interface MalangProps {
  character: MalangCharacter;
  /** 픽셀 크기 (정사각형, 몸통+장식 영역). 기본 120. 오라는 이 크기 밖으로 그림만 넘친다. */
  size?: number;
  animation?: MalangAnimation;
  /** 미보유 실루엣 표시 */
  silhouette?: boolean;
  /** 1% "반짝" 변종: 색상 회전 + 무지개 테두리 + 호일 광택 + 주변 반짝이 */
  shiny?: boolean;
  /** 'auto'면 character.rarity에 맞는 희귀도 오라를 뒤에 그린다 (기본 'none') */
  aura?: MalangAura;
  /** 장식용(스크린리더 숨김). 기본값: false → 이름을 title로 노출 */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 말랑이 SVG. gradient/clipPath/pattern/filter id는 useId로 인스턴스마다 고유하게 생성해
 * 여러 말랑이를 동시에 렌더링해도 충돌하지 않는다.
 */
export function Malang({
  character,
  size = 120,
  animation = 'idle',
  silhouette = false,
  shiny = false,
  aura = 'none',
  decorative = false,
  className,
  style,
}: MalangProps) {
  const uid = `m${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ids = {
    gold: `${uid}-gold`,
    clip: `${uid}-clip`,
    pattern: `${uid}-pattern`,
    title: `${uid}-title`,
  };
  const shape = SHAPES[character.shape];
  const isShiny = shiny && !silhouette;
  const baseAccent = character.accentColor ?? lighten(character.color, 0.35);
  const color = isShiny ? shinyColor(character.color) : character.color;
  const accent = isShiny ? shinyColor(baseAccent) : baseAccent;
  const effect: MalangEffect = silhouette ? 'none' : (character.effect ?? 'none');
  const dark = isDark(color);
  const level = silhouette ? 'none' : auraLevel(character.rarity, aura);
  const paint: AccessoryPaint = { uid, color, accent };
  const tilePattern = !silhouette && isTilePattern(character.pattern);

  const title = silhouette ? '아직 만나지 못한 말랑이' : isShiny ? `반짝 ${character.name}` : character.name;

  return (
    <svg
      className={[
        'malang',
        `malang--${silhouette ? 'none' : animation}`,
        isShiny && 'malang--shiny',
        level !== 'none' && `malang--aura-${level}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      width={size}
      height={size}
      viewBox={VIEWBOX_ATTR}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : ids.title}
      focusable="false"
    >
      {!decorative && <title id={ids.title}>{title}</title>}
      <defs>
        <BodyFillDef effect={effect} paint={paint} />
        <linearGradient id={ids.gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1a8" />
          <stop offset="100%" stopColor="#ffb627" />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={shape.body} />
        </clipPath>
        {tilePattern && <PatternDef id={ids.pattern} kind={character.pattern} color={color} />}
        {!silhouette && (
          <>
            <EffectDefs effect={effect} paint={paint} />
            <AccessoryDefs kind={character.accessory} paint={paint} />
          </>
        )}
        {isShiny && <ShinyDefs uid={uid} />}
        {level !== 'none' && <AuraDefs level={level} uid={uid} />}
      </defs>

      {level !== 'none' && <AuraBack level={level} uid={uid} />}

      <g className="malang-body-group">
        <ellipse cx={60} cy={shape.bottom + 4} rx={36} ry={5} fill={INK} opacity={0.14} />
        {!silhouette && (
          <>
            <EffectBehind effect={effect} shape={shape} uid={uid} />
            <AccessoryBack kind={character.accessory} shape={shape} paint={paint} />
          </>
        )}
        <path d={shape.body} fill={silhouette ? '#d9cfc0' : `url(#${uid}-body)`} />
        {tilePattern && <path d={shape.body} fill={`url(#${ids.pattern})`} />}
        {!silhouette && (
          <g clipPath={`url(#${ids.clip})`}>
            <ScatterPattern kind={character.pattern} shape={shape} accent={accent} />
            <EffectOverlay effect={effect} shape={shape} paint={paint} />
            {/* 젤리 광택: 몸통 모양에 맞게 잘라낸 하이라이트 */}
            <ellipse
              cx={42}
              cy={shape.top + 18}
              rx={16}
              ry={9}
              fill="#fff"
              opacity={0.55}
              transform={`rotate(-24 42 ${shape.top + 18})`}
            />
            <ellipse cx={60} cy={shape.bottom + 14} rx={60} ry={18} fill={INK} opacity={0.08} />
            {isShiny && <ShinyOverlay uid={uid} shape={shape} />}
          </g>
        )}
        <path d={shape.body} fill="none" stroke={INK} strokeWidth={3.6} strokeLinejoin="round" />
        {silhouette ? (
          <text x={60} y={shape.faceY + 8} textAnchor="middle" className="malang-question">
            ?
          </text>
        ) : (
          <>
            <Face shape={shape} eyes={character.eyes} dark={dark} />
            <AccessoryFront kind={character.accessory} shape={shape} paint={paint} />
          </>
        )}
      </g>

      {isShiny && <ShinySparkles />}
      {level !== 'none' && <AuraFront level={level} uid={uid} />}
    </svg>
  );
}
