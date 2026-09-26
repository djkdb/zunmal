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
import { Malang } from '../components/Malang';
import { VIEWBOX } from '../components/malang/helpers';
import type { JellyFace, JellyView } from '../components/touch3d/jellyScene';
import {
  getLoadedJelly3d,
  isJelly3dUnsupported,
  markJelly3dUnsupported,
  preloadJelly3d,
} from '../components/touch3d/loadJelly3d';
import { getCharacter, type Character, type MalangEyes } from '../data/characters';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGameStore } from '../store/useGameStore';
import {
  createTouchState,
  drag,
  isAtRest,
  poke,
  press,
  release,
  setReducedMotion,
  snapToTargets,
  squashAmount,
  step,
  stretchAmount,
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

/** 애정 이만큼마다 한 단계. 애정은 코인을 주지 않는 순수한 교감 수치다. */
const AFFECTION_PER_LEVEL = 50;
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

/** 3D 모듈을 이 시간 안에 못 받으면 이번에는 2D 로 (ms) */
const LOAD_WAIT_MS = 1500;
/** physics 정규화 단위(말랑이 상자 반폭)를 3D 몸 좌표로 */
const BODY_UNIT = VIEWBOX.w / 2;
/** 눈 깜빡임 간격 (ms) 과 길이 */
const BLINK_MIN_MS = 2600;
const BLINK_RANGE_MS = 3200;
const BLINK_MS = 140;
/** 3D 에서 구워 두는 얼굴 */
const JELLY_FACES: readonly JellyFace[] = ['default', 'happy', 'sleepy', 'wide'];

type RenderMode = 'loading' | '3d' | '2d';

const ARROWS: Partial<Record<string, { x: number; y: number }>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

type Face = 'default' | 'happy' | 'sleepy' | 'wide';

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
}

interface Heart {
  id: number;
  x: number;
  y: number;
  size: number;
}

function vibrate(ms: number, reduced: boolean) {
  if (reduced) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 지원하지 않는 기기
  }
}

function levelOf(affection: number) {
  return Math.floor(affection / AFFECTION_PER_LEVEL) + 1;
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

  const stageRef = useRef<HTMLButtonElement>(null);
  const jellyRef = useRef<HTMLSpanElement>(null);
  const physRef = useRef<TouchState>(createTouchState({ reducedMotion: reduced }));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const lastPetRef = useRef(0);
  const pokeTimesRef = useRef<number[]>([]);
  const lastTickleRef = useRef(0);
  const faceTimerRef = useRef<number | null>(null);
  const heartIdRef = useRef(0);
  const reducedRef = useRef(reduced);
  // 3D 젤리
  const softRef = useRef<SoftState>(createSoftState({ reducedMotion: reduced }));
  const viewRef = useRef<JellyView | null>(null);
  const glRef = useRef<HTMLSpanElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);

  const [face, setFace] = useState<Face>('default');
  const [blink, setBlink] = useState(false);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [mode, setMode] = useState<RenderMode>(() => (reduced || isJelly3dUnsupported() ? '2d' : 'loading'));
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const level = levelOf(affection);
  const progress = affection % AFFECTION_PER_LEVEL;

  useEffect(() => {
    reducedRef.current = reduced;
    physRef.current = setReducedMotion(physRef.current, reduced);
    softRef.current = setSoftReducedMotion(softRef.current, reduced);
    // 움직임 줄이기에서는 하트 애니메이션이 없어 animationend 가 오지 않으므로 바로 비운다
    if (reduced) setHearts([]);
  }, [reduced]);

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

  const showFace = useCallback((f: Face, holdMs?: number) => {
    if (faceTimerRef.current !== null) window.clearTimeout(faceTimerRef.current);
    faceTimerRef.current = null;
    setFace(f);
    if (holdMs !== undefined) {
      faceTimerRef.current = window.setTimeout(() => {
        faceTimerRef.current = null;
        setFace('default');
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

      // 누르고만 있는 동안: 점점 세게 눌리고, 눌리는 소리를 낸다
      if (g && !g.moved) {
        const held = now - g.startT;
        const pressure = Math.min(1, held / 900);
        physRef.current = press(physRef.current, g.point, pressure);
        softRef.current = softPress(softRef.current, pressure);
        if (g.squishCount === 0 && held > TAP_MS) {
          g.squishCount = 1;
          squish.squishPress(0.45);
        } else if (g.squishCount === 1 && held > 900) {
          g.squishCount = 2;
          squish.squishPress(1);
          vibrate(10, reducedRef.current);
        }
        if (held > SLEEPY_MS) setFace((f) => (f === 'sleepy' ? f : 'sleepy'));
      }
      if (g) pet(now);

      physRef.current = step(physRef.current, ts - last);
      const view = modeRef.current === '3d' ? viewRef.current : null;
      if (view) softRef.current = stepSoft(softRef.current, ts - last);
      // 3D 는 숨쉬기·출렁임까지 멈춰야 쉰다 → 멈추면 그리기도 멈춘다 (배터리)
      const resting = !g && isAtRest(physRef.current) && (!view || isSoftAtRest(softRef.current));
      if (resting) {
        physRef.current = snapToTargets(physRef.current);
        softRef.current = snapSoft(softRef.current);
      }
      if (view) view.draw(composePose(physRef.current, softRef.current, BODY_UNIT), softRef.current);
      else applyTransform();

      if (!resting) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
        lastTsRef.current = null;
      }
    },
    [applyTransform, pet],
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
  }, [reduced, shapeKey]);

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

  // 애정 레벨 업 축하
  const prevLevelRef = useRef(level);
  useEffect(() => {
    if (level > prevLevelRef.current) {
      squish.happy();
      setCelebrate(level);
      spawnHeart(5);
      showFace('happy', 1400);
      const t = window.setTimeout(() => setCelebrate(null), 2200);
      prevLevelRef.current = level;
      return () => window.clearTimeout(t);
    }
    prevLevelRef.current = level;
    return undefined;
  }, [level, spawnHeart, showFace]);

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
      const now = performance.now();
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
        radius,
        moved: false,
        squishCount: 0,
        stretch: null,
        lastDirX: 0,
        reversals: [],
        keyDisp: { x: 0, y: 0 },
      };
      physRef.current = press(physRef.current, point, 0.1);
      vibrate(8, reducedRef.current);
      showFace('happy');
      lastPetRef.current = Math.min(lastPetRef.current, now - PET_INTERVAL_MS);
      ensureLoop();
    },
    [ensureLoop, showFace],
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
      g.stretch?.stop();

      if (!silent && !g.moved && now - g.startT < TAP_MS && g.source === 'pointer') {
        // 콕 찌르기: 연달아 찌를수록 세게 튀고 눈이 동그래진다
        const recent = pokeTimesRef.current.filter((t) => now - t < 1000);
        recent.push(now);
        pokeTimesRef.current = recent;
        const strength = Math.min(1, 0.45 + 0.18 * (recent.length - 1));
        physRef.current = poke(release(physRef.current), g.point, strength);
        softRef.current = softPoke(softRelease(softRef.current), g.hit, strength);
        squish.poke(strength);
        vibrate(12, reducedRef.current);
        showFace(recent.length >= 3 ? 'wide' : 'happy', 700);
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
        if (!silent) squish.squishRelease(0.25 + 0.75 * intensity, wobbleHz() * 2);
        showFace('happy', 900);
      }
      ensureLoop();
    },
    [ensureLoop, showFace],
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
    if (!g || g.source !== 'pointer' || g.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dxTotal = e.clientX - g.startX;
    const dyTotal = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dxTotal, dyTotal) > DRAG_START_PX) startDragging(g);

    const dt = Math.max(1, now - g.lastT);
    const vx = (e.clientX - g.lastX) / dt; // px/ms
    const vy = (e.clientY - g.lastY) / dt;
    g.vx = g.vx * 0.4 + vx * 0.6;
    g.vy = g.vy * 0.4 + vy * 0.6;
    // 1.5px/ms(빠른 문지르기) 이상이면 최대 속도
    const speed = Math.min(1, Math.hypot(e.clientX - g.lastX, e.clientY - g.lastY) / dt / 1.5);
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

  const shown = useMemo(() => {
    const eyes: MalangEyes | undefined = face === 'default' ? (blink ? 'sleepy' : undefined) : face;
    return eyes ? { ...character, eyes } : character;
  }, [character, face, blink]);

  return (
    <>
      <div className="touch__meter" role="group" aria-label={`${josa(character.name, '과/와')}의 애정`}>
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

      <div className="touch__stage-wrap">
        <button
          ref={stageRef}
          type="button"
          className="touch__stage"
          data-mode={mode}
          aria-label={`${character.name} 만지기. 스페이스로 꾹 누르고, 화살표로 당겨요.`}
          aria-describedby="touch-hint"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => endGesture(true)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="touch__floor" aria-hidden="true" />
          <span ref={jellyRef} className="touch__jelly">
            <Malang
              character={shown}
              size={230}
              animation="none"
              decorative
              aura="auto"
              shiny={shiny}
            />
          </span>
          {/* 3D 젤리 캔버스 (준비되면 2D 말랑이 대신 보인다). 늘어날 자리를 위해 무대 위로 넉넉하게 */}
          {mode !== '2d' && <span ref={glRef} className="touch3d" aria-hidden="true" />}
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
        {celebrate !== null && (
          <p className="touch__celebrate" role="status">
            애정이 한 단계 올랐어요. Lv.{celebrate}
          </p>
        )}
      </div>

      {/* 3D 텍스처로 구울 원본 그림 (화면 밖). 실제 <Malang> 을 그대로 쓰므로 모든 말랑이가 똑같이 보인다 */}
      {mode !== '2d' && (
        <div ref={srcRef} className="touch3d-src" aria-hidden="true">
          {JELLY_FACES.map((f) => (
            <span key={f} data-face={f}>
              <Malang
                character={f === 'default' ? character : { ...character, eyes: f }}
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
        꾹 누르고, 쭉 당기고, 콕 찔러 보세요.
      </p>
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
