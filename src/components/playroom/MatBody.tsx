import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Malang } from '../Malang';
import { VIEWBOX, VIEWBOX_ATTR } from '../malang/helpers';
import { SHAPES } from '../malang/shapes';
import type { JellyFace, JellyStage } from '../touch3d/jellyScene';
import { SHINY_TOUCH_FX, TOUCH_FX } from '../../data/rarity';
import { baseEyes, faceExtras, isExtraFace } from '../../touch/faceExtras';
import { fillKindIndex } from '../../touch/filling';
import { fxStylesFor } from '../../touch/touchFx';
import type { BodyRec } from './bodyRec';
import { FillingArt } from './FillingArt';

/** 3D 에서 구워 두는 얼굴 (필요할 때 굽는다) */
const JELLY_FACES: readonly JellyFace[] = ['default', 'happy', 'sleepy', 'wide', 'dizzy', 'yawn', 'blush', 'strain'];
const BLINK_MIN_MS = 2600;
const BLINK_RANGE_MS = 3200;
const BLINK_MS = 140;
/** TouchPage.css 의 pr-doze 한 주기 */
const DOZE_BREATH_MS = 4400;

export type RenderMode = 'loading' | '3d' | '2d';

/** 스프라이트 상자 안에서 몸통 윤곽의 비율 (버튼·그림자 자리) */
export function bodyFrac(shape: (typeof SHAPES)[keyof typeof SHAPES]) {
  return {
    left: (shape.left - VIEWBOX.x) / VIEWBOX.w,
    right: (shape.right - VIEWBOX.x) / VIEWBOX.w,
    top: (shape.top - VIEWBOX.y) / VIEWBOX.w,
    bottom: (shape.bottom - VIEWBOX.y) / VIEWBOX.w,
  };
}

interface MatBodyProps {
  rec: BodyRec;
  mode: RenderMode;
  stage: JellyStage | null;
  reduced: boolean;
  focused: boolean;
  level: number;
  onKeyDown: (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: (rec: BodyRec) => void;
  onBlur: (rec: BodyRec) => void;
  /** 3D 몸이 준비되었다/사라졌다 → 다시 그리기 */
  onView: () => void;
}

/** 매트 위 말랑이 한 마리: 2D 스프라이트 + 키보드용 버튼 + 3D 텍스처 원본 */
export function MatBody({ rec, mode, stage, reduced, focused, level, onKeyDown, onKeyUp, onFocus, onBlur, onView }: MatBodyProps) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    rec.listeners.add(force);
    return () => {
      rec.listeners.delete(force);
    };
  }, [rec]);
  const { character, shiny } = rec;
  const actor = rec.actor;
  const filling = actor?.env.filling ?? null;
  const shape = SHAPES[character.shape];
  const frac = bodyFrac(shape);
  const srcRef = useRef<HTMLDivElement>(null);
  const [ready3d, setReady3d] = useState(false);
  const face = actor?.face ?? 'default';
  const dozing = actor?.dozing ?? false;
  // 2D 졸음 숨(4.4초 CSS 애니메이션)을 페이지 시계에 맞춘다 → 같이 조는 말랑이끼리 숨이 맞는다
  const dozeDelay = useMemo(() => (dozing ? -Math.round(performance.now() % DOZE_BREATH_MS) : 0), [dozing]);

  // 가끔 눈을 깜빡인다 (원래 눈을 감은 말랑이는 제외)
  const [blink, setBlink] = useState(false);
  const eyesClosed = character.eyes === 'happy' || character.eyes === 'sleepy';
  useEffect(() => {
    if (reduced || eyesClosed) return undefined;
    let t: number;
    let open: number | undefined;
    const schedule = () => {
      t = window.setTimeout(() => {
        if (!document.hidden) {
          setBlink(true);
          open = window.setTimeout(() => setBlink(false), BLINK_MS);
        }
        schedule();
      }, BLINK_MIN_MS + Math.random() * BLINK_RANGE_MS);
    };
    schedule();
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(open);
    };
  }, [reduced, eyesClosed]);

  const jellyFace: JellyFace = face === 'default' ? (blink ? 'sleepy' : 'default') : face;

  // 3D 몸: 무대에 올리고, 텍스처가 구워지면 2D 스프라이트와 바꾼다
  const fxSpec = TOUCH_FX[character.rarity];
  const fxStyles = useMemo(() => fxStylesFor(character, fxSpec), [character, fxSpec]);
  const glowStrength = fxSpec.aura > 0 ? fxSpec.aura : shiny ? SHINY_TOUCH_FX.aura : 0;
  const glowColor = fxSpec.aura > 0 ? fxStyles.auraColor : '#bff3ff';
  const faceRef = useRef(jellyFace);
  faceRef.current = jellyFace;
  useEffect(() => {
    if (mode !== '3d' || !stage) return undefined;
    let cancelled = false;
    const view = stage.addBody({
      shape: character.shape,
      face: faceRef.current,
      getSource: (f) => srcRef.current?.querySelector<SVGSVGElement>(`[data-face="${f}"] svg`) ?? null,
      glow: glowStrength > 0 ? { color: glowColor, strength: glowStrength } : undefined,
      iridescence: shiny ? SHINY_TOUCH_FX.iridescence : 0,
      filling: filling ? { kind: fillKindIndex(filling.kind), colors: filling.colors } : undefined,
    });
    view.ready.then(
      () => {
        if (cancelled) return;
        rec.view = view;
        rec.still = false;
        view.setFace(faceRef.current);
        setReady3d(true);
        onView();
      },
      () => {
        // 이 몸만 2D 로 남는다
      },
    );
    return () => {
      cancelled = true;
      if (rec.view === view) rec.view = null;
      view.dispose();
      setReady3d(false);
      onView();
    };
  }, [mode, stage, rec, character.shape, glowStrength, glowColor, shiny, onView, filling]);

  useEffect(() => {
    if (ready3d) rec.view?.setFace(jellyFace);
  }, [ready3d, jellyFace, rec]);

  const shown = useMemo(() => {
    const eyes = face === 'default' ? (blink ? 'sleepy' : character.eyes) : baseEyes(face, character.eyes);
    return eyes === character.eyes ? character : { ...character, eyes };
  }, [character, face, blink]);
  const extras = isExtraFace(face) ? faceExtras(face, shape) : [];

  const vars = {
    '--pr-l': frac.left,
    '--pr-r': frac.right,
    '--pr-t': frac.top,
    '--pr-b': frac.bottom,
    '--pr-doze-delay': `${dozeDelay}ms`,
  } as CSSProperties;

  return (
    <div
      ref={(el) => {
        rec.els.wrap = el;
      }}
      className={`pr-body${ready3d && mode === '3d' ? ' pr-body--3d' : ''}${dozing ? ' pr-body--doze' : ''}`}
      style={vars}
      data-id={rec.id}
    >
      <span
        ref={(el) => {
          rec.els.shadow = el;
        }}
        className="pr-body__shadow"
        aria-hidden="true"
      />
      <span
        ref={(el) => {
          rec.els.sprite = el;
        }}
        className="pr-body__sprite"
        aria-hidden="true"
      >
        <Malang character={shown} size={148} animation="none" decorative aura="auto" shiny={shiny} />
        {filling && <FillingArt id={rec.id} shape={shape} filling={filling} />}
        {extras.length > 0 && (

          <svg className="pr-body__extra" viewBox={VIEWBOX_ATTR} aria-hidden="true" focusable="false">
            <g className="pr-body__extra-g" strokeLinecap="round" strokeLinejoin="round">
              {extras.map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  fill={p.fill ?? 'none'}
                  stroke={p.stroke ?? 'none'}
                  strokeWidth={p.width}
                  opacity={p.opacity}
                />
              ))}
            </g>
          </svg>
        )}
      </span>
      <button
        ref={(el) => {
          rec.els.button = el;
        }}
        type="button"
        className="pr-body__hit"
        aria-label={`${character.name}${dozing ? ', 자는 중' : ''}. 애정 Lv.${level}. 스페이스로 콕, 스페이스를 누른 채 화살표로 당기기, 화살표로 밀기.`}
        aria-current={focused ? 'true' : undefined}
        onKeyDown={(e) => onKeyDown(rec, e)}
        onKeyUp={(e) => onKeyUp(rec, e)}
        onFocus={() => onFocus(rec)}
        onBlur={() => onBlur(rec)}
      />
      {/* 3D 텍스처로 구울 원본 그림 (화면 밖). 실제 <Malang> 을 그대로 쓰므로 모든 말랑이가 똑같이 보인다 */}
      {mode !== '2d' && (
        <div ref={srcRef} className="touch3d-src" aria-hidden="true">
          {JELLY_FACES.map((f) => (
            <span key={f} data-face={f}>
              <Malang
                character={f === 'default' ? character : { ...character, eyes: baseEyes(f, character.eyes) }}
                size={148}
                animation="none"
                decorative
                shiny={shiny}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
