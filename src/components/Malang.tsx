import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Character, MalangEyes, MalangEffect } from '../data/characters';
import { isDark, lighten } from '../lib/color';
import { AccessoryBack, AccessoryDefs, AccessoryFront, type AccessoryPaint } from './malang/accessories';
import { AuraBack, AuraDefs, AuraFront } from './malang/aura';
import { BodyFillDef, EffectBehind, EffectDefs, EffectOverlay } from './malang/effects';
import { INK, VIEWBOX_ATTR, auraLevel, lifeTiming, shinyColor } from './malang/helpers';
import { POKE_KEYFRAMES, POKE_MS, pauseWhenOffscreen } from './malang/motion';
import { JellyDefs, JellyGround, JellyShading, JellySpecular } from './malang/jelly';
import { PatternDef, ScatterPattern, isTilePattern } from './malang/patterns';
import { SHAPES, type ShapeSpec } from './malang/shapes';
import { ShinyDefs, ShinyOverlay, ShinySparkles } from './malang/shiny';
import './Malang.css';

/** 이 크기(px) 이하에서는 선을 굵히고 1~2px짜리 광택 점·림을 뺀다 (도감 칸, 로비, 탭) */
const COMPACT_MAX_PX = 64;

// ── 얼굴 ───────────────────────────────────────────────────

interface EyeProps {
  kind: MalangEyes;
  x: number;
  y: number;
  color: string;
  glint: string;
  compact: boolean;
}

function Eye({ kind, x, y, color, glint, compact }: EyeProps) {
  switch (kind) {
    case 'happy':
      return <path d={`M${x - 6} ${y + 2} Q${x} ${y - 7} ${x + 6} ${y + 2}`} className="malang-stroke" stroke={color} />;
    case 'sleepy':
      return <path d={`M${x - 6} ${y} Q${x} ${y + 6} ${x + 6} ${y}`} className="malang-stroke" stroke={color} />;
    case 'sparkle':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={5.6} ry={6.6} fill={color} />
          <circle cx={x + 1.8} cy={y - 2.4} r={2.3} fill={glint} />
          {!compact && <circle cx={x - 2} cy={y + 2.6} r={1.1} fill={glint} />}
        </g>
      );
    case 'wide':
      return (
        <g>
          <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={compact ? 2.8 : 2.4} />
          <circle cx={x + 1} cy={y + 1} r={3.8} fill={color} />
          <circle cx={x + 2.1} cy={y - 0.6} r={1.3} fill="#fff" />
        </g>
      );
    case 'wink':
    case 'dot':
    default:
      return (
        <g>
          <ellipse cx={x} cy={y} rx={compact ? 5 : 4.6} ry={compact ? 5.4 : 5} fill={color} />
          <circle cx={x + 1.5} cy={y - 1.8} r={compact ? 1.9 : 1.7} fill={glint} />
          {!compact && <circle cx={x - 1.7} cy={y + 2} r={0.8} fill={glint} opacity={0.85} />}
        </g>
      );
  }
}

/** 눈을 뜨고 있는 모양만 깜빡인다 (웃는 눈·조는 눈은 이미 감은 선이다) */
const OPEN_EYES: ReadonlySet<MalangEyes> = new Set<MalangEyes>(['dot', 'sparkle', 'wide', 'wink']);

function Face({ shape, eyes, dark, compact }: { shape: ShapeSpec; eyes: MalangEyes; dark: boolean; compact: boolean }) {
  const { faceY: y, eyeGap } = shape;
  const featureColor = dark ? '#fff6e6' : INK;
  const glint = dark ? INK : '#fff';
  const left = 60 - eyeGap;
  const right = 60 + eyeGap;
  const eye = (kind: MalangEyes, x: number) => (
    <Eye kind={kind} x={x} y={y} color={featureColor} glint={glint} compact={compact} />
  );
  const blinkable = OPEN_EYES.has(eyes);
  // 윙크는 뜬 눈(왼쪽)만 깜빡인다
  const leftEye = eye(eyes, left);
  const rightEye = eyes === 'wink' ? eye('happy', right) : eye(eyes, right);
  // 입은 작게: 몸 너비의 10% 안쪽. 작은 크기에서는 조금 넓혀 뭉개지지 않게.
  const mw = compact ? 5 : 4.2;
  return (
    <g className="malang-face">
      <ellipse cx={left - 8.5} cy={y + 9} rx={7} ry={4.2} fill="#ff7a9c" opacity={compact ? 0.5 : 0.42} />
      <ellipse cx={right + 8.5} cy={y + 9} rx={7} ry={4.2} fill="#ff7a9c" opacity={compact ? 0.5 : 0.42} />
      {blinkable ? (
        eyes === 'wink' ? (
          <>
            <g className="malang-eyes">{leftEye}</g>
            {rightEye}
          </>
        ) : (
          <g className="malang-eyes">
            {leftEye}
            {rightEye}
          </g>
        )
      ) : (
        <>
          {leftEye}
          {rightEye}
        </>
      )}
      <path
        d={`M${60 - mw} ${y + 7} Q${60 - mw / 2} ${y + 10.6} ${60} ${y + 7.4} Q${60 + mw / 2} ${y + 10.6} ${60 + mw} ${y + 7}`}
        className="malang-stroke malang-mouth"
        stroke={featureColor}
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
  /**
   * 몸 전체 움직임. 'idle'은 바닥을 딛고 숨쉰다(인스턴스마다 주기·위상이 다르다).
   * 'squish'는 한 번 눌렸다 출렁인다 (key 교체로 다시 재생).
   */
  animation?: MalangAnimation;
  /**
   * 눈 깜빡임. 기본값: animation이 'none'이 아니면 켜짐.
   * 'none'으로 두고 깜빡임만 원하면 true.
   */
  blink?: boolean;
  /**
   * 값이 바뀔 때마다 탭 찌그러짐(0.82배 → 스프링 출렁임)을 한 번 재생한다. 숨쉬기와 겹쳐도 된다.
   * 예: 누를 때마다 `setPoke((n) => n + 1)`. 0/undefined는 재생하지 않는다.
   */
  poke?: number;
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
 * 말랑이 SVG. gradient/clipPath/pattern id는 useId로 인스턴스마다 고유하게 생성해
 * 여러 말랑이를 동시에 렌더링해도 충돌하지 않는다.
 *
 * 구조: svg > g.malang-body-group(숨쉬기) > [바닥 그림자, g.malang-poke(탭 찌그러짐) > 몸·얼굴·장식]
 */
export function Malang({
  character,
  size = 120,
  animation = 'idle',
  blink,
  poke,
  silhouette = false,
  shiny = false,
  aura = 'none',
  decorative = false,
  className,
  style,
}: MalangProps) {
  const reactId = useId();
  const uid = `m${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ids = {
    gold: `${uid}-gold`,
    clip: `${uid}-clip`,
    pattern: `${uid}-pattern`,
    title: `${uid}-title`,
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const pokeRef = useRef<SVGGElement>(null);

  const shape = SHAPES[character.shape];
  const compact = size <= COMPACT_MAX_PX;
  const isShiny = shiny && !silhouette;
  const baseAccent = character.accentColor ?? lighten(character.color, 0.35);
  const color = isShiny ? shinyColor(character.color) : character.color;
  const accent = isShiny ? shinyColor(baseAccent) : baseAccent;
  const effect: MalangEffect = silhouette ? 'none' : (character.effect ?? 'none');
  const dark = isDark(color);
  const level = silhouette ? 'none' : auraLevel(character.rarity, aura);
  const paint: AccessoryPaint = { uid, color, accent };
  const tilePattern = !silhouette && isTilePattern(character.pattern);
  const anim = silhouette ? 'none' : animation;
  const blinking = !silhouette && (blink ?? anim !== 'none');

  const life = lifeTiming(reactId);
  const lifeStyle = {
    '--malang-breathe-dur': `${life.breatheDur}s`,
    '--malang-breathe-delay': `${life.breatheDelay}s`,
    '--malang-blink-dur': `${life.blinkDur}s`,
    '--malang-blink-delay': `${life.blinkDelay}s`,
  } as CSSProperties;

  useEffect(() => {
    const el = svgRef.current;
    return el ? pauseWhenOffscreen(el) : undefined;
  }, []);

  useEffect(() => {
    const el = pokeRef.current;
    if (!poke || !el || typeof el.animate !== 'function') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const a = el.animate(POKE_KEYFRAMES, { duration: POKE_MS });
    return () => a.cancel();
  }, [poke]);

  const title = silhouette ? '아직 만나지 못한 말랑이' : isShiny ? `반짝 ${character.name}` : character.name;

  return (
    <svg
      ref={svgRef}
      className={[
        'malang',
        `malang--${anim}`,
        blinking && (life.doubleBlink ? 'malang--blink2' : 'malang--blink'),
        compact && 'malang--compact',
        isShiny && 'malang--shiny',
        level !== 'none' && `malang--aura-${level}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style ? { ...lifeStyle, ...style } : lifeStyle}
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
        <JellyDefs paint={paint} effect={effect} />
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
        <JellyGround uid={uid} shape={shape} />
        <g ref={pokeRef} className="malang-poke">
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
              <JellyShading uid={uid} shape={shape} />
              <ScatterPattern kind={character.pattern} shape={shape} accent={accent} />
              <EffectOverlay effect={effect} shape={shape} paint={paint} />
              <JellySpecular uid={uid} shape={shape} compact={compact} />
              {isShiny && <ShinyOverlay uid={uid} shape={shape} />}
            </g>
          )}
          <path
            d={shape.body}
            fill="none"
            stroke={INK}
            strokeWidth={compact ? 4.6 : 3.6}
            strokeLinejoin="round"
          />
          {silhouette ? (
            <text x={60} y={shape.faceY + 8} textAnchor="middle" className="malang-question">
              ?
            </text>
          ) : (
            <>
              <Face shape={shape} eyes={character.eyes} dark={dark} compact={compact} />
              <AccessoryFront kind={character.accessory} shape={shape} paint={paint} />
            </>
          )}
        </g>
      </g>

      {isShiny && <ShinySparkles />}
      {level !== 'none' && <AuraFront level={level} uid={uid} />}
    </svg>
  );
}
