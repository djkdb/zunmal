import { josa } from '../lib/josa';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as squish from '../audio/squish';
import { sfx } from '../audio/sfx';
import { CloseIcon, ShareIcon } from '../components/icons';
import { Malang } from '../components/Malang';
import { VIEWBOX, VIEWBOX_ATTR } from '../components/malang/helpers';
import { SHAPES } from '../components/malang/shapes';
import type { JellyFace, JellyView } from '../components/touch3d/jellyScene';
import {
  getLoadedJelly3d,
  isJelly3dUnsupported,
  markJelly3dUnsupported,
  preloadJelly3d,
} from '../components/touch3d/loadJelly3d';
import { createFxLayer, type FxLayer } from '../components/touch3d/fxLayer';
import type { PhotoLayer } from '../components/touch3d/photo';
import { getCharacter, type Character } from '../data/characters';
import { SHINY_TOUCH_FX, TOUCH_FX } from '../data/rarity';
import { haptic } from '../lib/haptics';
import { fxStylesFor } from '../touch/touchFx';
import { baseEyes, faceExtras, isExtraFace, type TouchFace } from '../touch/faceExtras';
import { photoFileName } from '../touch/photoCard';
import {
  AFFECTION_PER_LEVEL,
  BLUSH_COOL_PER_S,
  BLUSH_FACE_AT,
  approach,
  bumpBlush,
  classifyPoke,
  coolBlush,
  gazeToward,
  idlePhase,
  isDizzyFlick,
  isUnlocked,
  levelOf,
  meltAmount,
  nextUnlock,
  registerPat,
  touchZone,
  unlocksAt,
  type TouchZone,
} from '../touch/reactions';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGameStore } from '../store/useGameStore';
import {
  createTouchState,
  drag,
  hop,
  isAtRest,
  melt,
  poke,
  press,
  release,
  setReducedMotion,
  snapToTargets,
  squashAmount,
  step,
  stretchAmount,
  stretchUp,
  tickle,
  toTransform,
  wobbleEnergy,
  wobbleHz,
  type TouchState,
} from '../touch/physics';
import {
  composePose,
  createSoftState,
  isSoftAtRest,
  setSoftDoze,
  setSoftReducedMotion,
  snapSoft,
  softPoke,
  softPress,
  softPull,
  softRelease,
  softTickle,
  softTouch,
  stepSoft,
  type SoftHit,
  type SoftState,
} from '../touch/softbody';
import './TouchPage.css';

/** 애정이 오르는 최소 간격 (ms) */
const PET_INTERVAL_MS = 400;
/** 이 시간 안에 떼고 거의 안 움직였으면 "콕 찌르기" */
const TAP_MS = 200;
/** 이만큼 움직이면 끌기로 본다 (px) */
const DRAG_START_PX = 10;
/** 이만큼 오래 누르고 있으면 졸린 눈 (ms) */
const SLEEPY_MS = 2600;
const MAX_HEARTS = 8;
/** 화살표 키 한 번에 당기는 양 (몸 반지름 단위) */
const KEY_DRAG_STEP = 0.3;
/** 머리를 이만큼(px) 문지를 때마다 한 번 쓰다듬기 */
const PAT_STROKE_PX = 70;
/** 손을 뗀 뒤 이만큼 지나면 다시 앞(화면)을 본다 */
const GAZE_RETURN_MS = 700;
/** 졸 때 z 간격, 졸 때 3D 는 이 간격으로만 다시 그린다 (배터리) */
const ZZZ_EVERY_MS = 1700;
const DOZE_FRAME_MS = 50;

/** 3D 모듈을 이 시간 안에 못 받으면 이번에는 2D 로 (ms) */
const LOAD_WAIT_MS = 1500;
/** physics 정규화 단위(말랑이 상자 반폭)를 3D 몸 좌표로 */
const BODY_UNIT = VIEWBOX.w / 2;
/** 말랑이 상자 가운데의 그림 좌표 */
const BOX_CX = VIEWBOX.x + VIEWBOX.w / 2;
const BOX_CY = VIEWBOX.y + VIEWBOX.h / 2;
/** 눈 깜빡임 간격 (ms) 과 길이 */
const BLINK_MIN_MS = 2600;
const BLINK_RANGE_MS = 3200;
const BLINK_MS = 140;
/** 3D 에서 구워 두는 얼굴 (필요할 때 굽는다) */
const JELLY_FACES: readonly JellyFace[] = ['default', 'happy', 'sleepy', 'wide', 'dizzy', 'yawn', 'blush'];

type RenderMode = 'loading' | '3d' | '2d';

const ARROWS: Partial<Record<string, { x: number; y: number }>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

interface Gesture {
  source: 'pointer' | 'key';
  pointerId: number;
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastY: number;
  lastT: number;
  /** 누른 지점 (몸 중심 기준 정규화 좌표) */
  point: { x: number; y: number };
  /** 누른 곳 (머리·볼·배) */
  zone: TouchZone;
  radius: number;
  moved: boolean;
  squishCount: number;
  stretch: squish.StretchHandle | null;
  lastDirX: number;
  reversals: number[];
  /** 키보드로 끄는 누적량 */
  keyDisp: { x: number; y: number };
  /** 3D 몸에서 닿은 곳 (몸 밖이거나 2D 면 null) */
  hit: SoftHit | null;
  /** 손가락 속도 (px/ms, 부드럽게) — 튕기듯 놓기 */
  vx: number;
  vy: number;
  /** 머리를 문지른 거리 (px) — 쓰다듬기 */
  patPath: number;
  /** 다 녹았다 (한 번만 가르랑) */
  melted: boolean;
}

interface Heart {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface Celebrate {
  level: number;
  unlocked: string | null;
}

interface Photo {
  url: string;
  blob: Blob;
  fileName: string;
  canShare: boolean;
}

function toRect(r: DOMRect) {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function vibrate(ms: number, reduced: boolean) {
  if (reduced) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 지원하지 않는 기기
  }
}

export function TouchPage() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);

  const ownedChars = useMemo(
    () => Object.keys(owned).map(getCharacter).filter((c): c is Character => c !== undefined),
    [owned],
  );
  const current =
    (paramId && owned[paramId] ? getCharacter(paramId) : undefined) ??
    (partnerId && owned[partnerId] ? getCharacter(partnerId) : undefined) ??
    ownedChars[0];

  if (!current) {
    return (
      <section className="page touch" aria-labelledby="touch-title">
        <h1 id="touch-title" className="page-title">
          말랑 만지기
        </h1>
        <p className="page-subtitle">아직 함께하는 말랑이가 없어요.</p>
        <Link to="/" className="btn btn--primary">
          처음 화면으로 가기
        </Link>
      </section>
    );
  }

  return (
    <section className="page touch" aria-labelledby="touch-title">
      <h1 id="touch-title" className="page-title">
        말랑 만지기
      </h1>
      <TouchPlay key={current.id} character={current} />
      {ownedChars.length > 1 && (
        <div className="touch__picker" role="group" aria-label="만질 말랑이 고르기">
          {ownedChars.map((c) => (
            <button
              key={c.id}
              type="button"
              className="touch__pick"
              aria-pressed={c.id === current.id}
              aria-label={c.name}
              onClick={() => {
                sfx.button();
                navigate(`/touch/${c.id}`, { replace: true });
              }}
            >
              <Malang character={c} size={44} animation="none" decorative />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TouchPlay({ character }: { character: Character }) {
  const reduced = useReducedMotion();
  const affection = useGameStore((s) => s.affection[character.id] ?? 0);
  // 파트너를 반짝 모습으로 두었고 반짝을 가지고 있으면 반짝으로 보여준다
  const shiny = useGameStore((s) => s.partnerShiny && (s.ownedMalangs[character.id]?.shinyCount ?? 0) > 0);
  const shape = SHAPES[character.shape];

  const stageRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const jellyRef = useRef<HTMLSpanElement>(null);
  const physRef = useRef<TouchState>(createTouchState({ reducedMotion: reduced }));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastDrawRef = useRef(0);
  const gestureRef = useRef<Gesture | null>(null);
  const lastPetRef = useRef(0);
  const pokeTimesRef = useRef<number[]>([]);
  const patTimesRef = useRef<number[]>([]);
  const lastTickleRef = useRef(0);
  const faceTimerRef = useRef<number | null>(null);
  const heartIdRef = useRef(0);
  const reducedRef = useRef(reduced);
  const timersRef = useRef<number[]>([]);
  // 3D 젤리
  const softRef = useRef<SoftState>(createSoftState({ reducedMotion: reduced }));
  const viewRef = useRef<JellyView | null>(null);
  const glRef = useRef<HTMLSpanElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  // 등급별 손맛: 입자·빛·방울 소리·진동 (data/rarity.ts 의 TOUCH_FX)
  const fxSpec = TOUCH_FX[character.rarity];
  const fxStyles = useMemo(() => fxStylesFor(character, fxSpec), [character, fxSpec]);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<FxLayer | null>(null);
  const shinyRef = useRef(shiny);
  shinyRef.current = shiny;
  const glowStrength = fxSpec.aura > 0 ? fxSpec.aura : shiny ? SHINY_TOUCH_FX.aura : 0;
  const glowColor = fxSpec.aura > 0 ? fxStyles.auraColor : '#bff3ff';
  const iridescence = shiny ? SHINY_TOUCH_FX.iridescence : 0;
  // 눈길·볼·졸음
  const gazeRef = useRef({ x: 0, y: 0 });
  const gazeTargetRef = useRef({ x: 0, y: 0 });
  const gazeReturnRef = useRef<number | null>(null);
  const blushRef = useRef({ level: 0, at: 0 });
  const lastActiveRef = useRef(performance.now());
  const yawnedRef = useRef(false);
  const dozingRef = useRef(false);
  const photoLockRef = useRef(false);

  const [face, setFace] = useState<TouchFace>('default');
  const [blink, setBlink] = useState(false);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [celebrate, setCelebrate] = useState<Celebrate | null>(null);
  const [dozing, setDozing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<RenderMode>(() => (reduced || isJelly3dUnsupported() ? '2d' : 'loading'));
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const level = levelOf(affection);
  const levelRef = useRef(level);
  levelRef.current = level;
  const progress = affection % AFFECTION_PER_LEVEL;
  const upcoming = nextUnlock(level);

  useEffect(() => {
    reducedRef.current = reduced;
    physRef.current = setReducedMotion(physRef.current, reduced);
    softRef.current = setSoftReducedMotion(softRef.current, reduced);
    // 움직임 줄이기에서는 하트 애니메이션이 없어 animationend 가 오지 않으므로 바로 비운다
    if (reduced) setHearts([]);
  }, [reduced]);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((x) => x !== t);
      fn();
    }, ms);
    timersRef.current.push(t);
  }, []);

  // ── 렌더링 루프 ─────────────────────────────────────────

  const applyTransform = useCallback(() => {
    const el = jellyRef.current;
    if (!el) return;
    const t = toTransform(physRef.current);
    const r = el.offsetWidth / 2;
    el.style.transform =
      `translate(${(t.translateX * r).toFixed(2)}px, ${(t.translateY * r).toFixed(2)}px) ` +
      `skewX(${t.skewXDeg.toFixed(2)}deg) scale(${t.scaleX.toFixed(4)}, ${t.scaleY.toFixed(4)})`;
  }, []);

  const applyGaze = useCallback(() => {
    const g = gazeRef.current;
    if (modeRef.current === '3d') viewRef.current?.setGaze(g.x, g.y);
    const el = jellyRef.current;
    if (el) {
      el.style.setProperty('--gaze-x', g.x.toFixed(2));
      el.style.setProperty('--gaze-y', g.y.toFixed(2));
    }
  }, []);

  const showFace = useCallback((f: TouchFace, holdMs?: number) => {
    if (faceTimerRef.current !== null) window.clearTimeout(faceTimerRef.current);
    faceTimerRef.current = null;
    setFace(f);
    if (holdMs !== undefined) {
      faceTimerRef.current = window.setTimeout(() => {
        faceTimerRef.current = null;
        setFace(dozingRef.current ? 'sleepy' : 'default');
      }, holdMs);
    }
  }, []);

  const spawnHeart = useCallback((count = 1) => {
    if (reducedRef.current) return;
    setHearts((prev) => {
      const next = [...prev];
      for (let i = 0; i < count; i++) {
        heartIdRef.current += 1;
        next.push({
          id: heartIdRef.current,
          x: 20 + Math.random() * 60,
          y: 20 + Math.random() * 35,
          size: 18 + Math.random() * 14,
        });
      }
      return next.slice(-MAX_HEARTS);
    });
  }, []);

  /** 쓰다듬기 한 번 (최소 간격 제한). 애정은 코인과 무관하다. */
  const pet = useCallback(
    (now: number) => {
      if (now - lastPetRef.current < PET_INTERVAL_MS) return;
      lastPetRef.current = now;
      useGameStore.getState().petMalang(character.id, 1);
      spawnHeart();
    },
    [character.id, spawnHeart],
  );

  const frame = useCallback(
    (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const g = gestureRef.current;
      const now = performance.now();
      const dt = ts - last;

      // 누르고만 있는 동안: 점점 세게 눌리고, 눌리는 소리를 낸다. 오래 누르면 녹아내린다 (애정 5단계)
      if (g && !g.moved) {
        const held = now - g.startT;
        const pressure = Math.min(1, held / 900);
        const meltBy = meltAmount(held, levelRef.current);
        physRef.current = meltBy > 0 ? melt(physRef.current, g.point, meltBy) : press(physRef.current, g.point, pressure);
        softRef.current = softPress(softRef.current, pressure);
        const px = g.source === 'pointer' ? g.startX : undefined;
        const py = g.source === 'pointer' ? g.startY : undefined;
        if (g.squishCount === 0 && held > TAP_MS) {
          g.squishCount = 1;
          squish.squishPress(0.45);
          fxRef.current?.emit('press', px, py, 0.45);
        } else if (g.squishCount === 1 && held > 900) {
          g.squishCount = 2;
          squish.squishPress(1);
          fxRef.current?.emit('press', px, py, 1);
          squish.chime(fxSpec.chime, 1, { shiny: shinyRef.current });
          viewRef.current?.pulse(fxSpec.auraPulse);
          if (!reducedRef.current) haptic(fxSpec.pokeHaptic);
        }
        if (meltBy >= 1 && !g.melted) {
          g.melted = true;
          squish.purr();
          fxRef.current?.react('hearts', 2);
        }
        if (held > SLEEPY_MS) setFace((f) => (f === 'sleepy' ? f : 'sleepy'));
      }
      if (g) pet(now);

      // 눈길: 손가락 쪽으로 부드럽게
      const gz = gazeRef.current;
      const target = gazeTargetRef.current;
      const gazeMoving = Math.abs(gz.x - target.x) > 0.02 || Math.abs(gz.y - target.y) > 0.02;
      if (gazeMoving) {
        gazeRef.current = approach(gz, target, dt);
      } else if (gz.x !== target.x || gz.y !== target.y) {
        gazeRef.current = { ...target };
      }
      applyGaze();

      physRef.current = step(physRef.current, dt);
      const view = modeRef.current === '3d' ? viewRef.current : null;
      if (view) softRef.current = stepSoft(softRef.current, dt);
      // 3D 는 숨쉬기·출렁임까지 멈춰야 쉰다 → 멈추면 그리기도 멈춘다 (배터리)
      const resting =
        !g &&
        !gazeMoving &&
        isAtRest(physRef.current) &&
        (!view || (isSoftAtRest(softRef.current) && !view.busy()));
      if (resting) {
        physRef.current = snapToTargets(physRef.current);
        softRef.current = snapSoft(softRef.current);
      }
      // 졸면서 숨쉬기만 할 때는 20fps 로 충분하다
      const dozeOnly = dozingRef.current && !g && isAtRest(physRef.current) && !gazeMoving;
      if (!dozeOnly || resting || ts - lastDrawRef.current >= DOZE_FRAME_MS) {
        lastDrawRef.current = ts;
        if (view) view.draw(composePose(physRef.current, softRef.current, BODY_UNIT), softRef.current);
        else applyTransform();
      }

      if (!resting) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
        lastTsRef.current = null;
      }
    },
    [applyTransform, applyGaze, pet, fxSpec],
  );

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [frame]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      gestureRef.current?.stretch?.stop();
      gestureRef.current = null;
      if (faceTimerRef.current !== null) window.clearTimeout(faceTimerRef.current);
      if (gazeReturnRef.current !== null) window.clearTimeout(gazeReturnRef.current);
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    },
    [],
  );

  // ── 3D 젤리: 모듈을 받고(최대 1.5초), 장면을 만들고, 준비되면 2D 와 바꾼다 ──
  const shapeKey = character.shape;
  useEffect(() => {
    if (reduced || isJelly3dUnsupported()) {
      setMode('2d');
      return undefined;
    }
    setMode('loading');
    let cancelled = false;
    let view: JellyView | null = null;
    let timer: number | undefined;

    const fallback = () => {
      cancelled = true;
      if (viewRef.current === view) viewRef.current = null;
      view?.dispose();
      view = null;
      setMode('2d');
    };

    const start = (mod: NonNullable<ReturnType<typeof getLoadedJelly3d>>) => {
      const container = glRef.current;
      const anchor = jellyRef.current;
      if (cancelled || !container || !anchor) return;
      try {
        view = mod.createJellyView({
          container,
          anchor,
          shape: shapeKey,
          face: 'default',
          getSource: (f) => srcRef.current?.querySelector<SVGSVGElement>(`[data-face="${f}"] svg`) ?? null,
          onLost: fallback,
          glow: glowStrength > 0 ? { color: glowColor, strength: glowStrength } : undefined,
          iridescence,
        });
      } catch {
        // WebGL 을 만들 수 없는 기기 → 이번 방문 동안 2D
        markJelly3dUnsupported();
        fallback();
        return;
      }
      view.ready.then(
        () => {
          if (cancelled || !view) return;
          viewRef.current = view;
          setMode('3d');
        },
        () => {
          if (!cancelled) fallback();
        },
      );
    };

    const loaded = getLoadedJelly3d();
    if (loaded) start(loaded);
    else {
      timer = window.setTimeout(fallback, LOAD_WAIT_MS);
      void preloadJelly3d().then((m) => {
        window.clearTimeout(timer);
        if (cancelled) return;
        if (m) start(m);
        else fallback();
      });
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (viewRef.current === view) viewRef.current = null;
      view?.dispose();
    };
  }, [reduced, shapeKey, glowColor, glowStrength, iridescence]);

  // 입자 캔버스 (움직임 줄이기면 없음). 3D·2D 어느 쪽이든 같은 자리에 얹는다
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (reduced || !canvas) return undefined;
    const layer = createFxLayer({
      canvas,
      styles: fxStyles,
      spec: fxSpec,
      shiny,
      getBody: () => {
        const el = jellyRef.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        // 그림 좌표 → 화면: 몸통 가운데·반지름·머리 꼭대기 (모양마다 다르다)
        const k = r.width / VIEWBOX.w;
        return {
          x: r.left + (60 - VIEWBOX.x) * k,
          y: r.top + ((shape.top + shape.bottom) / 2 - VIEWBOX.y) * k,
          r: ((shape.right - shape.left) / 2) * k,
          headY: r.top + (shape.top - VIEWBOX.y) * k,
        };
      },
    });
    fxRef.current = layer;
    const onVisible = () => layer.setAmbient(!document.hidden);
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layer.resize()) : null;
    ro?.observe(canvas);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      ro?.disconnect();
      layer.dispose();
      if (fxRef.current === layer) fxRef.current = null;
    };
  }, [reduced, fxStyles, fxSpec, shiny, shape]);

  // 3D 로 바뀌면 2D 변형을 지우고 첫 장면부터 숨쉬기 시작
  useEffect(() => {
    const jelly = jellyRef.current;
    if (mode !== '3d') return undefined;
    if (jelly) jelly.style.transform = '';
    const view = viewRef.current;
    const onResize = () => view?.layout();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (glRef.current) ro?.observe(glRef.current);
    window.addEventListener('resize', onResize);
    ensureLoop();
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [mode, ensureLoop]);

  // 가끔 눈을 깜빡인다 (원래 눈을 감은 말랑이는 제외)
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
  useEffect(() => {
    if (mode === '3d') viewRef.current?.setFace(jellyFace);
  }, [mode, jellyFace]);

  // ── 가만히 두면: 하품(8초) → 졸기(20초). 만지면 깜짝 놀라 깬다 ──

  const startDoze = useCallback(() => {
    if (dozingRef.current) return;
    dozingRef.current = true;
    setDozing(true);
    showFace('sleepy');
    softRef.current = setSoftDoze(softRef.current, true);
    ensureLoop();
  }, [ensureLoop, showFace]);

  const wake = useCallback(() => {
    if (!dozingRef.current) return false;
    dozingRef.current = false;
    setDozing(false);
    softRef.current = setSoftDoze(softRef.current, false);
    physRef.current = hop(physRef.current, 0.55);
    squish.surprised();
    showFace('wide', 800);
    return true;
  }, [showFace]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.hidden || gestureRef.current) {
        lastActiveRef.current = performance.now();
        return;
      }
      const phase = idlePhase(performance.now() - lastActiveRef.current);
      if (phase === 'yawn' && !yawnedRef.current) {
        yawnedRef.current = true;
        squish.yawn();
        showFace('yawn', 1600);
        physRef.current = stretchUp(physRef.current, 0.8);
        ensureLoop();
      } else if (phase === 'doze') {
        startDoze();
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [ensureLoop, showFace, startDoze]);

  // 졸 때 머리 위로 z z (움직임 줄이기면 없음)
  useEffect(() => {
    if (!dozing || reduced) return undefined;
    fxRef.current?.react('zzz', 1);
    const t = window.setInterval(() => {
      if (!document.hidden) fxRef.current?.react('zzz', 1);
    }, ZZZ_EVERY_MS);
    return () => window.clearInterval(t);
  }, [dozing, reduced]);

  // 애정 레벨 업 축하 (새 반응이 열리면 함께 알린다)
  const prevLevelRef = useRef(level);
  useEffect(() => {
    if (level > prevLevelRef.current) {
      squish.happy();
      squish.chime(fxSpec.chime, 0, { fanfare: true, shiny: shinyRef.current });
      const opened = unlocksAt(level);
      setCelebrate({ level, unlocked: opened.length > 0 ? opened.map((u) => u.label).join(', ') : null });
      spawnHeart(fxSpec.milestoneHearts);
      fxRef.current?.emit('milestone');
      viewRef.current?.pulse(1);
      if (!reducedRef.current) haptic(fxSpec.milestoneHaptic);
      ensureLoop();
      showFace('happy', 1400);
      const t = window.setTimeout(() => setCelebrate(null), opened.length > 0 ? 3200 : 2200);
      prevLevelRef.current = level;
      return () => window.clearTimeout(t);
    }
    prevLevelRef.current = level;
    return undefined;
  }, [level, spawnHeart, showFace, fxSpec, ensureLoop]);

  // ── 눈길 ───────────────────────────────────────────────

  /** client 좌표 → 얼굴이 옮겨 갈 목표 (그림 좌표) */
  const lookAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = jellyRef.current;
      const stage = stageRef.current;
      if (!el || !stage || reducedRef.current) return;
      const rect = stage.getBoundingClientRect();
      const w = Math.max(1, el.offsetWidth);
      const unit = VIEWBOX.w / w;
      const fx = rect.left + el.offsetLeft + (60 - VIEWBOX.x) / unit;
      const fy = rect.top + el.offsetTop + (shape.faceY - VIEWBOX.y) / unit;
      gazeTargetRef.current = gazeToward((clientX - fx) * unit, (clientY - fy) * unit);
      if (gazeReturnRef.current !== null) window.clearTimeout(gazeReturnRef.current);
      gazeReturnRef.current = null;
      ensureLoop();
    },
    [ensureLoop, shape.faceY],
  );

  const lookBack = useCallback(
    (delay = GAZE_RETURN_MS) => {
      if (gazeReturnRef.current !== null) window.clearTimeout(gazeReturnRef.current);
      gazeReturnRef.current = window.setTimeout(() => {
        gazeReturnRef.current = null;
        gazeTargetRef.current = { x: 0, y: 0 };
        ensureLoop();
      }, delay);
    },
    [ensureLoop],
  );

  // ── 반응 ───────────────────────────────────────────────

  /** 머리 쓰다듬기: 기분 좋아 눈을 가늘게 뜨고 가르랑, 세 번이면 애교 점프 (애정 7단계) */
  const patHead = useCallback(
    (clientX?: number, clientY?: number) => {
      const now = performance.now();
      showFace('happy', 1000);
      squish.purr();
      fxRef.current?.react('hearts', 2, clientX, clientY);
      const r = registerPat(patTimesRef.current, now, levelRef.current);
      patTimesRef.current = r.pats;
      if (r.jump) {
        physRef.current = hop(physRef.current, 1);
        squish.jump();
        fxRef.current?.react('hearts', 6);
        spawnHeart(3);
        showFace('happy', 1300);
        if (!reducedRef.current) haptic('success');
      }
      ensureLoop();
    },
    [ensureLoop, showFace, spawnHeart],
  );

  const laughWiggle = useCallback(() => {
    squish.laugh();
    showFace('happy', 1400);
    fxRef.current?.react('hearts', 3);
    [0, 130, 260, 390].forEach((ms, i) =>
      later(() => {
        const dir = i % 2 === 0 ? 1 : -1;
        physRef.current = tickle(physRef.current, dir);
        softRef.current = softTickle(softRef.current, dir);
        ensureLoop();
      }, ms),
    );
  }, [ensureLoop, later, showFace]);

  const goDizzy = useCallback(
    (dir: number) => {
      squish.dizzy();
      showFace('dizzy', 1500);
      fxRef.current?.react('dizzy', 5);
      [0, 160, 320].forEach((ms) =>
        later(() => {
          physRef.current = tickle(physRef.current, dir);
          softRef.current = softTickle(softRef.current, dir);
          ensureLoop();
        }, ms),
      );
    },
    [ensureLoop, later, showFace],
  );

  // ── 제스처 ─────────────────────────────────────────────

  const beginGesture = useCallback(
    (source: Gesture['source'], pointerId: number, clientX: number, clientY: number) => {
      const stage = stageRef.current;
      const jelly = jellyRef.current;
      let point = { x: 0, y: 0 };
      let radius = 100;
      if (stage && jelly && source === 'pointer') {
        // offset* 는 transform 영향을 받지 않아 흔들리는 중에도 원래 몸 위치를 준다
        const rect = stage.getBoundingClientRect();
        radius = Math.max(1, jelly.offsetWidth / 2);
        const cx = rect.left + jelly.offsetLeft + jelly.offsetWidth / 2;
        const cy = rect.top + jelly.offsetTop + jelly.offsetHeight / 2;
        point = { x: (clientX - cx) / radius, y: (clientY - cy) / radius };
      } else if (jelly) {
        radius = Math.max(1, jelly.offsetWidth / 2);
      }
      const zone = touchZone({ x: BOX_CX + point.x * BODY_UNIT, y: BOX_CY + point.y * BODY_UNIT }, shape);
      const now = performance.now();
      lastActiveRef.current = now;
      yawnedRef.current = false;
      const woke = wake();
      // 3D: 손가락이 닿은 몸 표면에 자국을 낸다 (키보드는 앞면 가운데)
      const view = modeRef.current === '3d' ? viewRef.current : null;
      const hit = view ? (source === 'pointer' ? view.hit(clientX, clientY) : view.frontHit()) : null;
      if (hit) softRef.current = softTouch(softRef.current, hit);
      gestureRef.current = {
        source,
        hit,
        vx: 0,
        vy: 0,
        pointerId,
        startX: clientX,
        startY: clientY,
        startT: now,
        lastX: clientX,
        lastY: clientY,
        lastT: now,
        point,
        zone,
        radius,
        moved: false,
        squishCount: 0,
        stretch: null,
        lastDirX: 0,
        reversals: [],
        keyDisp: { x: 0, y: 0 },
        patPath: 0,
        melted: false,
      };
      physRef.current = press(physRef.current, point, 0.1);
      vibrate(8, reducedRef.current);
      if (!woke) showFace('happy');
      if (source === 'pointer') lookAt(clientX, clientY);
      lastPetRef.current = Math.min(lastPetRef.current, now - PET_INTERVAL_MS);
      ensureLoop();
    },
    [ensureLoop, lookAt, shape, showFace, wake],
  );

  const startDragging = (g: Gesture) => {
    g.moved = true;
    g.stretch = squish.startStretch();
  };

  const endGesture = useCallback(
    (silent: boolean) => {
      const g = gestureRef.current;
      if (!g) return;
      gestureRef.current = null;
      const now = performance.now();
      lastActiveRef.current = now;
      g.stretch?.stop();
      lookBack();

      if (!silent && !g.moved && now - g.startT < TAP_MS && g.source === 'pointer') {
        // 콕 찌르기: 연달아 찌를수록 세게 튀고 눈이 동그래진다. 찌른 곳·애정 단계에 따라 반응이 다르다
        const recent = pokeTimesRef.current.filter((t) => now - t < 1000);
        recent.push(now);
        pokeTimesRef.current = recent;
        const strength = Math.min(1, 0.45 + 0.18 * (recent.length - 1));
        const kind = classifyPoke(g.zone, recent.length, levelRef.current);
        physRef.current = poke(release(physRef.current), g.point, kind === 'pat' ? 0.25 : strength);
        softRef.current = softPoke(softRelease(softRef.current), g.hit, kind === 'pat' ? 0.25 : strength);
        squish.poke(kind === 'pat' ? 0.3 : strength);
        squish.chime(fxSpec.chime, recent.length - 1, { shiny: shinyRef.current });
        fxRef.current?.emit('poke', g.lastX, g.lastY, strength);
        viewRef.current?.pulse(fxSpec.auraPulse * strength);
        if (!reducedRef.current) haptic(fxSpec.pokeHaptic);
        switch (kind) {
          case 'pat':
            patHead(g.lastX, g.lastY);
            break;
          case 'blush': {
            // 볼: 찌를수록 빨개지고 천천히 식는다
            const prev = blushRef.current;
            const b = bumpBlush(coolBlush(prev.level, now - prev.at));
            blushRef.current = { level: b, at: now };
            // 식어서 BLUSH_FACE_AT 아래로 내려갈 때까지 빨간 얼굴
            showFace('blush', Math.max(900, ((b - BLUSH_FACE_AT) / BLUSH_COOL_PER_S) * 1000 + 700));
            break;
          }
          case 'giggle':
            squish.giggle();
            physRef.current = hop(physRef.current, 0.3);
            showFace('happy', 800);
            break;
          case 'laugh':
            pokeTimesRef.current = [];
            laughWiggle();
            break;
          default:
            showFace(recent.length >= 3 ? 'wide' : 'happy', 700);
        }
      } else {
        const intensity = Math.max(
          squashAmount(physRef.current),
          stretchAmount(physRef.current),
          wobbleEnergy(physRef.current),
        );
        physRef.current = release(physRef.current);
        // 튕기듯 놓으면(손가락이 아직 움직이는 중) 그 속도로 출렁인다
        const flicking = g.source === 'pointer' && g.moved && now - g.lastT < 80;
        const toBody = (BODY_UNIT / g.radius) * 1000; // px/ms → 몸 단위/s
        softRef.current = softRelease(
          softRef.current,
          flicking ? { x: g.vx * toBody, y: -g.vy * toBody } : undefined,
        );
        fxRef.current?.endTrail();
        if (!silent) {
          squish.squishRelease(0.25 + 0.75 * intensity, wobbleHz() * 2);
          const px = g.source === 'pointer' ? g.startX : undefined;
          const py = g.source === 'pointer' ? g.startY : undefined;
          fxRef.current?.emit('release', px, py, intensity);
          if (intensity > 0.5) {
            squish.chime(fxSpec.chime, 2, { shiny: shinyRef.current });
            viewRef.current?.pulse(fxSpec.auraPulse * intensity);
          }
          if (flicking && isDizzyFlick(g.vx, g.vy, g.radius, levelRef.current)) {
            goDizzy(g.vx < 0 ? -1 : 1);
          } else {
            showFace('happy', 900);
          }
        } else {
          showFace('default');
        }
      }
      ensureLoop();
    },
    [ensureLoop, fxSpec, goDizzy, later, laughWiggle, lookBack, patHead, showFace],
  );

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gestureRef.current) return; // 두 번째 손가락은 무시
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처 실패해도 계속 동작
    }
    beginGesture('pointer', e.pointerId, e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g) {
      // 마우스를 올려 두면 그쪽을 본다
      if (e.pointerType === 'mouse') lookAt(e.clientX, e.clientY);
      return;
    }
    if (g.source !== 'pointer' || g.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dxTotal = e.clientX - g.startX;
    const dyTotal = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dxTotal, dyTotal) > DRAG_START_PX) startDragging(g);
    lookAt(e.clientX, e.clientY);

    const dt = Math.max(1, now - g.lastT);
    const vx = (e.clientX - g.lastX) / dt; // px/ms
    const vy = (e.clientY - g.lastY) / dt;
    g.vx = g.vx * 0.4 + vx * 0.6;
    g.vy = g.vy * 0.4 + vy * 0.6;
    // 1.5px/ms(빠른 문지르기) 이상이면 최대 속도
    const stepPx = Math.hypot(e.clientX - g.lastX, e.clientY - g.lastY);
    const speed = Math.min(1, stepPx / dt / 1.5);
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.lastT = now;

    if (!g.moved) return;
    physRef.current = drag(physRef.current, { x: dxTotal / g.radius, y: dyTotal / g.radius });
    if (g.hit) {
      softRef.current = softPull(softRef.current, {
        x: (dxTotal / g.radius) * BODY_UNIT,
        y: (-dyTotal / g.radius) * BODY_UNIT,
      });
    }
    g.stretch?.update(stretchAmount(physRef.current), speed);
    fxRef.current?.trail(e.clientX, e.clientY);

    // 머리를 문지르면 쓰다듬기 (애정 2단계)
    if (g.zone === 'head' && isUnlocked('pat', levelRef.current)) {
      g.patPath += stepPx;
      if (g.patPath >= PAT_STROKE_PX) {
        g.patPath = 0;
        patHead(e.clientX, e.clientY);
      }
    }

    // 간질이기: 빠르게 좌우로 문지르면 방향이 자주 바뀐다
    if (Math.abs(vx) > 0.35) {
      const dir = Math.sign(vx);
      if (g.lastDirX !== 0 && dir !== g.lastDirX) g.reversals.push(now);
      g.lastDirX = dir;
      g.reversals = g.reversals.filter((t) => now - t < 700);
      if (g.reversals.length >= 2 && now - lastTickleRef.current > 450) {
        lastTickleRef.current = now;
        g.reversals = [];
        physRef.current = tickle(physRef.current, dir);
        softRef.current = softTickle(softRef.current, dir);
        squish.giggle();
        fxRef.current?.emit('tickle', e.clientX, e.clientY);
        showFace('happy', 900);
        spawnHeart();
        vibrate(8, reducedRef.current);
      }
    }
    ensureLoop();
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.source !== 'pointer' || g.pointerId !== e.pointerId) return;
    endGesture(false);
  };

  const onPointerCancel = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.source !== 'pointer' || g.pointerId !== e.pointerId) return;
    endGesture(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const arrow = ARROWS[e.key];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat || gestureRef.current) return;
      beginGesture('key', -1, 0, 0);
      return;
    }
    if (!arrow) return;
    e.preventDefault();
    let g = gestureRef.current;
    if (g && g.source !== 'key') return;
    if (!g) {
      beginGesture('key', -1, 0, 0);
      g = gestureRef.current;
      if (!g) return;
    }
    if (!g.moved) startDragging(g);
    const nx = g.keyDisp.x + arrow.x * KEY_DRAG_STEP;
    const ny = g.keyDisp.y + arrow.y * KEY_DRAG_STEP;
    const mag = Math.hypot(nx, ny);
    const k = mag > 2 ? 2 / mag : 1;
    g.keyDisp = { x: nx * k, y: ny * k };
    physRef.current = drag(physRef.current, g.keyDisp);
    if (g.hit) {
      softRef.current = softPull(softRef.current, { x: g.keyDisp.x * BODY_UNIT, y: -g.keyDisp.y * BODY_UNIT });
    }
    g.stretch?.update(Math.min(1, Math.hypot(g.keyDisp.x, g.keyDisp.y) / 1.5), 0.5);
    ensureLoop();
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.source !== 'key') return;
    if (e.key === ' ' || e.key === 'Enter' || ARROWS[e.key]) {
      e.preventDefault();
      endGesture(false);
    }
  };

  // ── 사진 찍기 ───────────────────────────────────────────

  const takePhoto = async () => {
    if (photoLockRef.current) return;
    photoLockRef.current = true;
    setPhotoBusy(true);
    squish.shutter();
    lastActiveRef.current = performance.now();
    if (!reducedRef.current) {
      setFlash(true);
      later(() => setFlash(false), 420);
    }
    try {
      const jelly = jellyRef.current;
      const stage = stageRef.current;
      if (!jelly || !stage) throw new Error('no stage');
      // 입자·3D 는 지금 이 순간을 곧바로 복사해 둔다
      const layers: PhotoLayer[] = [];
      const copy = (c: HTMLCanvasElement) => {
        const out = document.createElement('canvas');
        out.width = c.width;
        out.height = c.height;
        out.getContext('2d')?.drawImage(c, 0, 0);
        return out;
      };
      const view = modeRef.current === '3d' ? viewRef.current : null;
      const gl = glRef.current;
      const fxCanvas = fxCanvasRef.current;
      const snap = view?.snapshot() ?? null;
      const fxCopy = fxCanvas ? copy(fxCanvas) : null;
      const fxRect = fxCanvas?.getBoundingClientRect() ?? null;
      const mod = await import('../components/touch3d/photo');
      if (snap && gl) {
        layers.push({ image: snap, rect: toRect(gl.getBoundingClientRect()) });
      } else {
        const svg = jelly.querySelector<SVGSVGElement>('svg');
        if (!svg) throw new Error('no svg');
        const img = await mod.rasterizeVisibleMalang(svg, shape.body, shape.bottom);
        layers.push({ image: img, rect: toRect(svg.getBoundingClientRect()) });
      }
      if (fxCopy && fxRect) layers.push({ image: fxCopy, rect: toRect(fxRect) });
      const stageRect = stage.getBoundingClientRect();
      const top = Math.min(stageRect.top, fxRect?.top ?? stageRect.top, gl?.getBoundingClientRect().top ?? stageRect.top);
      const jr = jelly.getBoundingClientRect();
      const jellyBox = {
        x: stageRect.left + jelly.offsetLeft,
        y: stageRect.top + jelly.offsetTop,
        w: jelly.offsetWidth,
        h: jelly.offsetHeight,
      };
      const blob = await mod.composePhoto({
        id: character.id,
        name: character.name,
        rarity: character.rarity,
        shiny,
        level: levelRef.current,
        jelly: jr.width > 0 ? jellyBox : { x: jr.left, y: jr.top, w: jr.width, h: jr.height },
        bounds: { x: stageRect.left, y: top, w: stageRect.width, h: stageRect.bottom - top },
        layers,
      });
      const fileName = photoFileName(character.id, new Date());
      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob, fileName, canShare: mod.canShareFile(blob, fileName) };
      });
    } catch {
      setNotice('사진을 만들지 못했어요. 다시 찍어 주세요.');
      later(() => setNotice(null), 2600);
    } finally {
      photoLockRef.current = false;
      setPhotoBusy(false);
    }
  };

  const closePhoto = useCallback(() => {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const sharePhoto = async () => {
    if (!photo) return;
    sfx.button();
    const mod = await import('../components/touch3d/photo');
    const r = photo.canShare
      ? await mod.sharePhoto(photo.blob, photo.fileName, `${josa(character.name, '과/와')} 찍은 사진`)
      : mod.savePhoto(photo.blob, photo.fileName);
    if (r === 'shared' || r === 'downloaded' || r === 'opened') {
      setNotice(r === 'shared' ? '사진을 공유했어요' : '사진을 저장했어요');
      later(() => setNotice(null), 2200);
      closePhoto();
    } else if (r === 'failed') {
      // 공유가 막힌 환경: 저장으로
      mod.savePhoto(photo.blob, photo.fileName);
    }
  };

  const savePhoto = async () => {
    if (!photo) return;
    sfx.button();
    const mod = await import('../components/touch3d/photo');
    mod.savePhoto(photo.blob, photo.fileName);
    setNotice('사진을 저장했어요');
    later(() => setNotice(null), 2200);
    closePhoto();
  };

  useEffect(() => {
    if (!photo) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closePhoto();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, closePhoto]);

  // 떠날 때 미리보기 주소 정리
  const photoRef = useRef(photo);
  photoRef.current = photo;
  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    },
    [],
  );

  const shown = useMemo(() => {
    const eyes = face === 'default' ? (blink ? 'sleepy' : character.eyes) : baseEyes(face, character.eyes);
    return eyes === character.eyes ? character : { ...character, eyes };
  }, [character, face, blink]);

  const extras = isExtraFace(face) ? faceExtras(face, shape) : [];

  return (
    <>
      <div className="touch__meter" role="group" aria-label={`${josa(character.name, '과/와')}의 애정`}>
        <div className="touch__meter-row">
          <span className="touch__level">
            <HeartShape className="touch__meter-heart" />
            애정 Lv.{level}
          </span>
          <span
            className="touch__bar"
            role="progressbar"
            aria-label="다음 단계까지"
            aria-valuemin={0}
            aria-valuemax={AFFECTION_PER_LEVEL}
            aria-valuenow={progress}
          >
            <span className="touch__bar-fill" style={{ width: `${(progress / AFFECTION_PER_LEVEL) * 100}%` }} />
          </span>
          <span className="touch__count">
            {progress}/{AFFECTION_PER_LEVEL}
          </span>
        </div>
        <p className="touch__next">
          {upcoming ? (
            <>
              <LockShape className="touch__next-icon" />
              Lv.{upcoming.level}에 {upcoming.label} 반응이 열려요
            </>
          ) : (
            '모든 반응을 열었어요'
          )}
        </p>
      </div>

      <div ref={wrapRef} className="touch__stage-wrap">
        <button
          ref={stageRef}
          type="button"
          className="touch__stage"
          data-mode={mode}
          data-face={face}
          aria-label={`${character.name} 만지기. 스페이스로 꾹 누르고, 화살표로 당겨요.`}
          aria-describedby="touch-hint"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={(e) => {
            if (!gestureRef.current && e.pointerType === 'mouse') lookBack(0);
          }}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => endGesture(true)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="touch__floor" aria-hidden="true" />
          <span ref={jellyRef} className={`touch__jelly${dozing ? ' touch__jelly--doze' : ''}`}>
            <Malang
              character={shown}
              size={230}
              animation="none"
              decorative
              aura="auto"
              shiny={shiny}
            />
            {extras.length > 0 && (
              <svg className="touch__face-extra" viewBox={VIEWBOX_ATTR} aria-hidden="true" focusable="false">
                <g className="touch__face-extra-g" strokeLinecap="round" strokeLinejoin="round">
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
          {/* 3D 젤리 캔버스 (준비되면 2D 말랑이 대신 보인다). 늘어날 자리를 위해 무대 위로 넉넉하게 */}
          {mode !== '2d' && <span ref={glRef} className="touch3d" aria-hidden="true" />}
          {!reduced && <canvas ref={fxCanvasRef} className="touch-fx" aria-hidden="true" />}
          <span className="touch__hearts" aria-hidden="true">
            {hearts.map((h) => (
              <HeartShape
                key={h.id}
                className="touch__heart"
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: h.size, height: h.size }}
                onAnimationEnd={() => setHearts((prev) => prev.filter((p) => p.id !== h.id))}
              />
            ))}
          </span>
        </button>
        <button
          type="button"
          className="touch__camera"
          aria-label="사진 찍기"
          disabled={photoBusy}
          onClick={() => void takePhoto()}
        >
          <CameraShape />
        </button>
        {celebrate !== null && (
          <p className="touch__celebrate" data-rarity={character.rarity} role="status">
            애정이 한 단계 올랐어요. Lv.{celebrate.level}
            {celebrate.unlocked && <span className="touch__celebrate-new">새 반응: {celebrate.unlocked}</span>}
          </p>
        )}
        {notice !== null && (
          <p className="touch__notice" role="status">
            {notice}
          </p>
        )}
        {flash && <span className="touch__flash" aria-hidden="true" />}
      </div>

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

      <p id="touch-hint" className="touch__hint">
        {dozing ? '쿨쿨 자고 있어요. 톡 건드려 깨워 보세요.' : '꾹 누르고, 쭉 당기고, 콕 찔러 보세요.'}
      </p>

      {photo && (
        <div className="touch-photo" role="dialog" aria-modal="true" aria-labelledby="touch-photo-title">
          <div className="touch-photo__panel">
            <h2 id="touch-photo-title" className="touch-photo__title">
              찰칵! 사진을 찍었어요
            </h2>
            <img className="touch-photo__img" src={photo.url} alt={`${character.name} 사진 카드`} />
            <div className="touch-photo__actions">
              <button type="button" className="btn btn--primary" autoFocus onClick={() => void sharePhoto()}>
                <ShareIcon size={22} />
                {photo.canShare ? '공유하기' : '저장하기'}
              </button>
              {photo.canShare && (
                <button type="button" className="btn" onClick={() => void savePhoto()}>
                  저장하기
                </button>
              )}
            </div>
            <button type="button" className="touch-photo__close" aria-label="닫기" onClick={closePhoto}>
              <CloseIcon size={22} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function HeartShape({
  className,
  style,
  onAnimationEnd,
}: {
  className?: string;
  style?: CSSProperties;
  onAnimationEnd?: () => void;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 32 32"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
      onAnimationEnd={onAnimationEnd}
    >
      <path
        d="M16 27 C10 22 4 18 4 11.5 C4 7.5 7 5 10.5 5 C13 5 14.8 6.4 16 8.4 C17.2 6.4 19 5 21.5 5 C25 5 28 7.5 28 11.5 C28 18 22 22 16 27 Z"
        fill="#ff7aa2"
        stroke="#2b2233"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <ellipse cx={10.5} cy={10.5} rx={2.6} ry={1.8} fill="#fff" opacity={0.7} transform="rotate(-30 10.5 10.5)" />
    </svg>
  );
}

/** 사진기: 잉크 외곽선 + 레몬 몸 + 렌즈 */
function CameraShape() {
  return (
    <svg viewBox="0 0 32 32" width={26} height={26} aria-hidden="true" focusable="false">
      <path
        d="M5 11 q0 -3 3 -3 h3 l2 -3 h6 l2 3 h3 q3 0 3 3 v12 q0 3 -3 3 h-16 q-3 0 -3 -3 Z"
        fill="#ffd84d"
        stroke="#2b2233"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx={16} cy={17} r={5.2} fill="#bff3ff" stroke="#2b2233" strokeWidth={2.6} />
      <circle cx={14.4} cy={15.4} r={1.4} fill="#fff" />
      <circle cx={24.5} cy={12} r={1.2} fill="#2b2233" />
    </svg>
  );
}

/** 잠긴 반응: 작은 자물쇠 */
function LockShape({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={14} height={14} aria-hidden="true" focusable="false">
      <path d="M10 14 v-4 q0 -6 6 -6 q6 0 6 6 v4" fill="none" stroke="#2b2233" strokeWidth={3} strokeLinecap="round" />
      <rect x={6} y={14} width={20} height={14} rx={4} fill="#ffd84d" stroke="#2b2233" strokeWidth={3} />
    </svg>
  );
}
