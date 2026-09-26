/**
 * 놀이방 (/touch, /touch/:id) — 화면 전체가 책상 위 놀이 매트. 말랑이 2~5마리를 꺼내 함께 만진다.
 *
 * 구성:
 *  - 물리: 매트 세계 하나(touch/world.ts, 몸 전체 위치·충돌·쌓기·던지기) + 말랑이마다 MalangActor(몸 안쪽 출렁임·반응).
 *  - 그림: 3D 무대 하나(touch3d/jellyScene.ts, 렌더러 하나에 몸 N개) 또는 2D SVG 스프라이트 — 같은 세계 좌표(touch/matView.ts).
 *  - 입자: 캔버스 한 장(touch3d/fxLayer.ts), 말랑이마다 출처 하나.
 *  - 선반(아래), 봉인 캡슐 열기, 반응 방법 보기 + 손가락 시범, 사진(매트 전체).
 *  - 촉감(data/materials.ts): 몸 재질(세계)·손맛(MalangActor)·소리가 말랑이마다 다르다. 전설 이상은 몸속 특별한 속.
 *  - 말랑이끼리(touch/interactions.ts): 세계 맞닿음·부딪힘에서 볼 비비기·끙·덮치기·쿵·붙기·흘끔·같이 졸기.
 * 그리기는 무언가 움직일 때만 한다 (세계가 멈추고 모든 말랑이가 쉬면 루프를 멈춘다).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import * as squish from '../audio/squish';
import { sfx } from '../audio/sfx';
import { CloseIcon, ShareIcon } from '../components/icons';
import { VIEWBOX } from '../components/malang/helpers';
import { SHAPES } from '../components/malang/shapes';
import { bodyKey, type BodyRec, type MatKind } from '../components/playroom/bodyRec';
import { CAPSULE_TOP, CapsuleArt } from '../components/playroom/CapsuleArt';
import { MalangActor, TAP_MS } from '../components/playroom/malangActor';
import { MatBody, bodyFrac, type RenderMode } from '../components/playroom/MatBody';
import { MatCapsule } from '../components/playroom/MatCapsule';
import { FillingIcon, MaterialIcon } from '../components/playroom/MaterialIcon';
import {
  GhostFinger,
  ReactionGuide,
  demoFor,
  markDemoSeen,
  readSeenDemos,
  type DemoSpec,
} from '../components/playroom/ReactionGuide';
import { Shelf } from '../components/playroom/Shelf';
import { createFxLayer, type FxLayer } from '../components/touch3d/fxLayer';
import type { JellyStage } from '../components/touch3d/jellyScene';
import {
  getLoadedJelly3d,
  isJelly3dUnsupported,
  markJelly3dUnsupported,
  preloadJelly3d,
} from '../components/touch3d/loadJelly3d';
import type { PhotoLayer } from '../components/touch3d/photo';
import { getCharacter, type Character } from '../data/characters';
import { fillingOf, materialOf } from '../data/materials';
import { RARITY_META, TOUCH_FX } from '../data/rarity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptic } from '../lib/haptics';
import { josa } from '../lib/josa';
import { useGameStore } from '../store/useGameStore';
import {
  holdProgress,
  ratchetIndex,
  readTwoFinger,
  registerCapsuleTap,
  type Pt,
} from '../touch/capsule';
import {
  INTERACT_TUNING,
  createInteractState,
  forgetBody,
  idleInteractions,
  stepInteractions,
  type InteractBody,
  type InteractEvent,
} from '../touch/interactions';
import { computeMatLayout, matBounds, squeezePose, toScreen, toWorld, type MatLayout } from '../touch/matView';
import { createPerf, looksLikePhone, samplePerf, type PerfState } from '../touch/perfGovernor';
import { photoFileName } from '../touch/photoCard';
import { fxStylesFor } from '../touch/touchFx';
import {
  AFFECTION_PER_LEVEL,
  levelOf,
  nextUnlock,
  unlocksAt,
  type ReactionUnlock,
} from '../touch/reactions';
import { buildShelf, shelfAction, type ShelfEntry } from '../touch/shelf';
import { REST_POSE } from '../touch/softbody';
import {
  addBody,
  createWorld,
  findDropSpot,
  getBody,
  grabBody,
  isWorldAtRest,
  moveHeld,
  nudgeBody,
  popBody,
  releaseBody,
  removeBody,
  resizeWorld,
  setWorldCap,
  setWorldReducedMotion,
  settleWorld,
  stepWorld,
  type WorldEvent,
} from '../touch/world';
import './TouchPage.css';

/** 3D 모듈을 이 시간 안에 못 받으면 이번에는 2D 로 (ms) */
const LOAD_WAIT_MS = 1500;
/** 떨어뜨려 넣는 높이 (세계 단위) */
const DROP_Z = 1.3;
/** 캡슐 반지름 (세계 단위) */
const CAPSULE_R = 0.2;
/** 캡슐은 조금만 끌어도 옮긴다 (말랑이는 촉감 표의 carryFrac) */
const CAPSULE_CARRY_FRAC = 0.3;
/** 꾹 누르기 열기는 이만큼 누른 뒤부터 센다 (톡과 구분) */
const CAPSULE_HOLD_DELAY = 220;
/** 졸 때 3D 는 이 간격으로만 다시 그린다 (배터리) */
const DOZE_FRAME_MS = 50;

const ARROWS: Partial<Record<string, { x: number; y: number }>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

interface PointerRec {
  key: string;
  kind: MatKind;
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
  grab: { dx: number; dy: number } | null;
  startAnchor: { x: number; y: number };
  moved: boolean;
}

interface CapState {
  taps: number[];
  pointers: number[];
  a0: Pt | null;
  b0: Pt | null;
  ratchet: number;
  holdStart: number | null;
  opening: boolean;
}

interface Burst {
  key: number;
  x: number;
  y: number;
  size: number;
  rarity: Character['rarity'];
}

interface Toast {
  name: string;
  level: number;
  rarity: Character['rarity'];
  unlocked: ReactionUnlock | null;
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

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function TouchPage() {
  const hasAny = useGameStore((s) => Object.keys(s.ownedMalangs).length > 0);
  if (!hasAny) {
    return (
      <section className="page touch-empty" aria-labelledby="touch-title">
        <h1 id="touch-title" className="page-title">
          놀이방
        </h1>
        <p className="page-subtitle">아직 함께하는 말랑이가 없어요.</p>
        <Link to="/" className="btn btn--primary">
          처음 화면으로 가기
        </Link>
      </section>
    );
  }
  return <Playroom />;
}

function Playroom() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();
  const owned = useGameStore((s) => s.ownedMalangs);
  const unboxedList = useGameStore((s) => s.unboxed);
  const out = useGameStore((s) => s.playroom.out);
  const affection = useGameStore((s) => s.affection);
  const partnerId = useGameStore((s) => s.partnerId);
  const partnerShiny = useGameStore((s) => s.partnerShiny);

  const unboxed = useMemo(() => new Set(unboxedList), [unboxedList]);
  const [capsules, setCapsules] = useState<string[]>([]);
  const onMat = useMemo(() => out.filter((id) => owned[id] && unboxed.has(id)), [out, owned, unboxed]);
  const capsulesOnMat = useMemo(
    () => capsules.filter((id) => owned[id] && !unboxed.has(id)),
    [capsules, owned, unboxed],
  );
  const matCount = onMat.length + capsulesOnMat.length;

  const [mode, setMode] = useState<RenderMode>(() => (reduced || isJelly3dUnsupported() ? '2d' : 'loading'));
  const [stage, setStage] = useState<JellyStage | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [demo, setDemo] = useState<{ spec: DemoSpec; box: { left: number; top: number; size: number } } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [layout, setLayout] = useState<MatLayout | null>(null);
  const [, setViewTick] = useState(0);

  // ── 엔진 상태 (ref) ─────────────────────────────────────
  const phone = useMemo(
    () =>
      looksLikePhone(
        typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches,
        typeof window !== 'undefined' ? window.innerWidth : 360,
        typeof window !== 'undefined' ? window.innerHeight : 640,
      ),
    [],
  );
  const perfRef = useRef<PerfState>(createPerf({ phone, quality: mode === '2d' ? '2d' : '3d' }));
  const [cap, setCap] = useState(perfRef.current.cap);
  const capRef = useRef(cap);
  capRef.current = cap;
  const worldRef = useRef(createWorld({ w: 3, d: 3 }, { cap: 5, reducedMotion: reduced }));
  const recsRef = useRef(new Map<string, BodyRec>());
  const layoutRef = useRef<MatLayout | null>(null);
  const stageRef = useRef<JellyStage | null>(null);
  stageRef.current = stage;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const fxLayerRef = useRef<FxLayer | null>(null);
  const pointersRef = useRef(new Map<number, PointerRec>());
  const capStateRef = useRef(new Map<string, CapState>());
  const spawnRef = useRef(new Map<string, { x: number; y: number; z: number; pop: boolean }>());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastDrawRef = useRef(0);
  const affectionRef = useRef(affection);
  affectionRef.current = affection;
  const timersRef = useRef<number[]>([]);
  const burstIdRef = useRef(0);
  const photoLockRef = useRef(false);
  const interactRef = useRef(createInteractState());

  const matRef = useRef<HTMLElement>(null);
  const stageElRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((x) => x !== t);
      fn();
    }, ms);
    timersRef.current.push(t);
  }, []);

  const say = useCallback(
    (text: string, ms = 2400) => {
      setNotice(text);
      later(() => setNotice((n) => (n === text ? null : n)), ms);
    },
    [later],
  );

  const shinyOf = useCallback(
    (id: string) => (owned[id]?.shinyCount ?? 0) > 0 && (id !== partnerId || partnerShiny),
    [owned, partnerId, partnerShiny],
  );

  // ── 화면 배치 ───────────────────────────────────────────

  /** 스프라이트 상자 (client px) */
  const spriteBox = useCallback((rec: BodyRec) => {
    const L = layoutRef.current;
    const wb = getBody(worldRef.current, rec.key);
    if (!L || !wb) return null;
    const spot = toScreen(L, wb.x, wb.y, wb.z);
    const S = L.sprite;
    if (rec.kind === 'capsule') return { left: spot.x - S * 0.26, top: spot.y - S * 0.46, size: S * 0.52 };
    const frac = bodyFrac(SHAPES[rec.character.shape]);
    return { left: spot.x - S / 2, top: spot.y - S * frac.bottom, size: S };
  }, []);

  // ── 루프 ────────────────────────────────────────────────

  const frameRef = useRef<(ts: number) => void>(() => undefined);
  const requestFrame = useCallback(() => {
    if (rafRef.current === null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame((ts) => frameRef.current(ts));
    }
  }, []);

  // ── 기록 (말랑이·캡슐) ───────────────────────────────────

  const getRec = useCallback(
    (kind: MatKind, id: string): BodyRec | null => {
      const key = bodyKey(kind, id);
      const existing = recsRef.current.get(key);
      if (existing) return existing;
      const character = getCharacter(id);
      if (!character) return null;
      const rec: BodyRec = {
        key,
        id,
        kind,
        character,
        shiny: kind === 'malang' && shinyOf(id),
        actor: null,
        fx: null,
        view: null,
        els: { wrap: null, sprite: null, shadow: null, button: null },
        listeners: new Set(),
        still: false,
        lastSqueeze: 0,
      };
      if (kind === 'malang') {
        const shape = SHAPES[character.shape];
        const fxSpec = TOUCH_FX[character.rarity];
        rec.actor = new MalangActor({
          character,
          shape,
          fxSpec,
          material: materialOf(character),
          filling: fillingOf(character),
          shiny: rec.shiny,
          reduced: () => reducedRef.current,
          level: () => levelOf(affectionRef.current[id] ?? 0),
          geom: () => spriteBox(rec),
          view: () => rec.view,
          fx: () => rec.fx,
          requestFrame,
          pet: () => useGameStore.getState().petMalang(id, 1),
          onChange: () => rec.listeners.forEach((l) => l()),
        });
      }
      recsRef.current.set(key, rec);
      return rec;
    },
    [requestFrame, shinyOf, spriteBox],
  );

  /** 입자 출처 붙이기 (입자 캔버스가 있을 때만) */
  const attachFx = useCallback(
    (rec: BodyRec, styles: Parameters<FxLayer['source']>[0]['styles']) => {
      const layer = fxLayerRef.current;
      if (!layer || rec.fx || rec.kind !== 'malang') return;
      rec.fx = layer.source({
        styles,
        spec: TOUCH_FX[rec.character.rarity],
        shiny: rec.shiny,
        getBody: () => {
          const box = spriteBox(rec);
          if (!box) return null;
          const shape = SHAPES[rec.character.shape];
          const k = box.size / VIEWBOX.w;
          return {
            x: box.left + (60 - VIEWBOX.x) * k,
            y: box.top + ((shape.top + shape.bottom) / 2 - VIEWBOX.y) * k,
            r: ((shape.right - shape.left) / 2) * k,
            headY: box.top + (shape.top - VIEWBOX.y) * k,
          };
        },
      });
      rec.fx.setAmbient(!document.hidden);
    },
    [spriteBox],
  );

  // ── 매트 배치 측정 ──────────────────────────────────────

  const measure = useCallback(() => {
    const mat = matRef.current;
    if (!mat) return;
    const r = mat.getBoundingClientRect();
    const hudBottom = (hudRef.current?.getBoundingClientRect().bottom ?? 80) - r.top;
    const shelfTop = (shelfRef.current?.getBoundingClientRect().top ?? r.bottom - 70) - r.top;
    const L = computeMatLayout(r.width, r.height, { top: hudBottom, bottom: shelfTop });
    // 매트가 화면 (0,0)에 붙어 있지 않을 수도 있으니 client 좌표로 옮긴다
    const Lc: MatLayout = { ...L, floorLeft: L.floorLeft + r.left, floorTop: L.floorTop + r.top };
    layoutRef.current = Lc;
    resizeWorld(worldRef.current, matBounds(Lc));
    setLayout(Lc);
    stageRef.current?.layout();
    fxLayerRef.current?.resize();
    for (const rec of recsRef.current.values()) rec.still = false;
    requestFrame();
  }, [requestFrame]);

  useLayoutEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (matRef.current) ro?.observe(matRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [measure]);

  // ── 세계와 매트 위 물건 맞추기 ───────────────────────────

  const wantedKeys = useMemo(
    () => [...onMat.map((id) => bodyKey('malang', id)), ...capsulesOnMat.map((id) => bodyKey('capsule', id))],
    [onMat, capsulesOnMat],
  );

  useLayoutEffect(() => {
    const L = layoutRef.current;
    if (!L) return;
    const world = worldRef.current;
    setWorldCap(world, Math.max(capRef.current, wantedKeys.length));
    const want = new Set(wantedKeys);
    for (const b of [...world.bodies]) {
      if (!want.has(b.id)) {
        removeBody(world, b.id);
        forgetBody(interactRef.current, b.id);
      }
    }
    for (const [key, rec] of [...recsRef.current]) {
      if (want.has(key)) continue;
      rec.actor?.dispose();
      rec.fx?.dispose();
      rec.fx = null;
      recsRef.current.delete(key);
    }
    for (const key of wantedKeys) {
      if (getBody(world, key)) continue;
      const [kind, id] = key.split(':') as [MatKind, string];
      const rec = getRec(kind, id);
      if (!rec) continue;
      const shape = SHAPES[rec.character.shape];
      const r = kind === 'capsule' ? CAPSULE_R : (((shape.right - shape.left) / 2) / VIEWBOX.w) * 0.95;
      const h = kind === 'capsule' ? CAPSULE_R * 2 : ((shape.bottom - shape.top) / VIEWBOX.w) * 0.92;
      const spawn = spawnRef.current.get(key);
      spawnRef.current.delete(key);
      const spot = spawn ?? { ...findDropSpot(world, r, Math.random), z: reducedRef.current ? 0 : DROP_Z, pop: false };
      const material = kind === 'malang' ? materialOf(rec.character).world : undefined;
      addBody(world, { id: key, x: spot.x, y: spot.y, z: spot.z, r, h, material });
      if (spawn?.pop) {
        if (!reducedRef.current) popBody(world, key, 4.2);
        later(() => rec.actor?.hello(), 80);
      }
    }
    requestFrame();
  }, [wantedKeys, layout, getRec, later, requestFrame]);

  // 처음 들어올 때: 주소의 말랑이(도감 "만지러 가기")를 꺼내 두고, 매트가 비었으면 파트너를 꺼낸다
  const openedParamRef = useRef(false);
  useEffect(() => {
    if (openedParamRef.current) return;
    openedParamRef.current = true;
    const st = useGameStore.getState();
    const target = paramId && st.ownedMalangs[paramId] ? paramId : null;
    const onMatNow = st.playroom.out.filter((id) => st.unboxed.includes(id));
    if (target) {
      if (st.unboxed.includes(target)) {
        if (!onMatNow.includes(target)) {
          if (onMatNow.length >= capRef.current && onMatNow[0]) st.putBackMalang(onMatNow[0]);
          st.takeOutMalang(target, capRef.current);
        }
      } else {
        if (onMatNow.length >= capRef.current && onMatNow[0]) st.putBackMalang(onMatNow[0]);
        setCapsules((c) => (c.includes(target) ? c : [...c, target]));
      }
      setFocusId(target);
    } else if (onMatNow.length === 0) {
      const first = [st.partnerId, ...st.unboxed].find((id) => id && st.ownedMalangs[id]);
      if (first) st.takeOutMalang(first, capRef.current);
    }
  }, [paramId]);

  // 집중한 말랑이: 없거나 매트에서 사라지면 첫 말랑이로
  useEffect(() => {
    if (focusId && onMat.includes(focusId)) return;
    setFocusId(onMat[onMat.length - 1] ?? null);
  }, [onMat, focusId]);

  // ── 3D 무대 ─────────────────────────────────────────────

  const is2d = mode === '2d';
  useEffect(() => {
    if (is2d) return undefined;
    if (reduced || isJelly3dUnsupported()) {
      setMode('2d');
      return undefined;
    }
    let cancelled = false;
    let st: JellyStage | null = null;
    let timer: number | undefined;
    const fallback = () => {
      cancelled = true;
      st?.dispose();
      st = null;
      setStage(null);
      setMode('2d');
    };
    const start = (mod: NonNullable<ReturnType<typeof getLoadedJelly3d>>) => {
      const c = glRef.current;
      if (cancelled || !c) return;
      try {
        st = mod.createJellyStage({ container: c, onLost: fallback });
      } catch {
        // WebGL 을 만들 수 없는 기기 → 이번 방문 동안 2D
        markJelly3dUnsupported();
        fallback();
        return;
      }
      setStage(st);
      setMode('3d');
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
      st?.dispose();
      setStage(null);
    };
  }, [is2d, reduced]);

  useEffect(() => {
    if (reduced) setMode('2d');
    setWorldReducedMotion(worldRef.current, reduced);
    for (const rec of recsRef.current.values()) rec.actor?.setReduced(reduced);
  }, [reduced]);

  const onView = useCallback(() => {
    setViewTick((n) => n + 1);
    requestFrame();
  }, [requestFrame]);

  // ── 입자 캔버스 (움직임 줄이기면 없음) ────────────────────

  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (reduced || !canvas) return undefined;
    const layer = createFxLayer({ canvas });
    fxLayerRef.current = layer;
    const onVisible = () => {
      for (const rec of recsRef.current.values()) rec.fx?.setAmbient(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      for (const rec of recsRef.current.values()) {
        rec.fx?.dispose();
        rec.fx = null;
      }
      layer.dispose();
      if (fxLayerRef.current === layer) fxLayerRef.current = null;
    };
  }, [reduced]);

  // 매트에 올라온 말랑이마다 입자 출처
  useEffect(() => {
    if (reduced) return;
    for (const rec of recsRef.current.values()) {
      if (rec.kind === 'malang' && !rec.fx) attachFx(rec, fxStylesFor(rec.character, TOUCH_FX[rec.character.rarity]));
    }
  }, [wantedKeys, reduced, attachFx]);

  // ── 세계 사건 → 반응·소리 ───────────────────────────────

  const handleEvents = useCallback((events: WorldEvent[]) => {
    const recs = recsRef.current;
    for (const ev of events) {
      if (ev.kind === 'land') {
        const rec = recs.get(ev.id);
        const s = clamp01((ev.speed - 1) / 7);
        if (rec?.actor) rec.actor.bumped(0, s);
        if (rec?.kind === 'capsule') squish.capsuleTick();
        squish.land(rec?.kind === 'capsule' ? s * 0.5 : s, rec?.actor?.flavor ?? 'plain');
        if (s > 0.55 && !reducedRef.current) haptic('tap');
      } else if (ev.kind === 'bump') {
        const s = clamp01(ev.speed / 6);
        recs.get(ev.a)?.actor?.bumped(ev.nx, s * 0.7);
        recs.get(ev.b)?.actor?.bumped(-ev.nx, s * 0.7);
        squish.bump(s, recs.get(ev.a)?.actor?.flavor ?? 'plain');
      } else {
        const s = clamp01(ev.speed / 8);
        recs.get(ev.id)?.actor?.bumped(ev.nx, s * 0.6);
        squish.bump(s * 0.7);
      }
    }
  }, []);

  // ── 말랑이끼리 ──────────────────────────────────────────

  /** 판정용 몸 목록 (말랑이만) */
  const interactBodies = useCallback((now: number): InteractBody[] => {
    const world = worldRef.current;
    const out: InteractBody[] = [];
    for (const rec of recsRef.current.values()) {
      const a = rec.actor;
      const wb = getBody(world, rec.key);
      if (!a || !wb) continue;
      out.push({
        id: rec.key,
        material: a.env.material.id,
        x: wb.x,
        y: wb.y,
        z: wb.z,
        r: wb.r,
        touched: a.touched || wb.held,
        idleMs: a.idleFor(now),
        dozing: a.dozing,
      });
    }
    return out;
  }, []);

  /** 이 말랑이 얼굴 가운데 (client px) — 흘끔·볼 비비기 때 서로 쳐다본다 */
  const faceSpot = useCallback(
    (rec: BodyRec) => {
      const box = spriteBox(rec);
      if (!box) return null;
      const k = box.size / VIEWBOX.w;
      return { x: box.left + (60 - VIEWBOX.x) * k, y: box.top + (SHAPES[rec.character.shape].faceY - VIEWBOX.y) * k };
    },
    [spriteBox],
  );

  const lookEachOther = useCallback(
    (a: BodyRec, b: BodyRec, ms?: number) => {
      const fa = faceSpot(a);
      const fb = faceSpot(b);
      if (fb) a.actor?.glanceAt(fb.x, fb.y, ms);
      if (fa) b.actor?.glanceAt(fa.x, fa.y, ms);
    },
    [faceSpot],
  );

  const handlePairs = useCallback(
    (events: InteractEvent[]) => {
      const recs = recsRef.current;
      const world = worldRef.current;
      const reducedNow = reducedRef.current;
      for (const ev of events) {
        switch (ev.kind) {
          case 'cheekRub': {
            const a = recs.get(ev.a);
            const b = recs.get(ev.b);
            if (!a?.actor || !b?.actor) break;
            // a 는 b 에서 +nx 쪽에 있다 → a 의 짝은 −nx 쪽
            a.actor.cheekRub(-ev.nx);
            b.actor.cheekRub(ev.nx);
            lookEachOther(a, b, 1500);
            squish.cheekRub();
            if (!reducedNow) haptic('tap');
            const store = useGameStore.getState();
            if (ev.petA) store.petMalang(a.id, INTERACT_TUNING.rubAffection);
            if (ev.petB) store.petMalang(b.id, INTERACT_TUNING.rubAffection);
            break;
          }
          case 'stack': {
            recs.get(ev.bottom)?.actor?.squishedUnder();
            recs.get(ev.top)?.actor?.onTop();
            squish.groan();
            break;
          }
          case 'dropOn': {
            const top = recs.get(ev.top);
            const bottom = recs.get(ev.bottom);
            const s = clamp01(ev.speed / 7);
            if (!reducedNow) {
              popBody(world, ev.top, 2.4 + 2 * s);
              popBody(world, ev.bottom, 1.6 + 1.6 * s);
            }
            bottom?.actor?.squishedUnder();
            top?.actor?.onTop();
            squish.boing(s);
            break;
          }
          case 'bumpHard': {
            const a = recs.get(ev.a);
            const b = recs.get(ev.b);
            a?.actor?.startled();
            b?.actor?.startled();
            const s = clamp01(ev.speed / 6);
            if (ev.same === 'jelly') {
              // 탱탱 젤리끼리: 더 멀리 튕겨 나간다
              const wa = getBody(world, ev.a);
              const wb = getBody(world, ev.b);
              if (wa && wb && !reducedNow) {
                const dx = wa.x - wb.x;
                const dy = wa.y - wb.y;
                const d = Math.hypot(dx, dy) || 1;
                nudgeBody(world, ev.a, dx / d, dy / d, 0.6 + 0.6 * s);
                nudgeBody(world, ev.b, -dx / d, -dy / d, 0.6 + 0.6 * s);
              }
              squish.boing(s);
            } else {
              squish.surprised();
            }
            break;
          }
          case 'stickTogether': {
            const a = recs.get(ev.a);
            const b = recs.get(ev.b);
            a?.actor?.showFace('happy', 1200);
            b?.actor?.showFace('happy', 1200);
            if (a && b) lookEachOther(a, b, 1200);
            squish.squishPress(0.3, 'sticky');
            break;
          }
          case 'unstick': {
            recs.get(ev.a)?.actor?.showFace('wide', 600);
            recs.get(ev.b)?.actor?.showFace('wide', 600);
            squish.peel(0.6);
            break;
          }
          case 'glance': {
            const from = recs.get(ev.from);
            const to = recs.get(ev.to);
            const f = to ? faceSpot(to) : null;
            if (from?.actor && f) from.actor.glanceAt(f.x, f.y);
            break;
          }
          case 'dozeTogether': {
            const me = recs.get(ev.id)?.actor;
            const other = recs.get(ev.with)?.actor;
            // 숨 위상을 옆 말랑이와 맞춘다
            if (me && other) me.dozeOff(other.soft.timeMs);
            break;
          }
        }
      }
      requestFrame();
    },
    [faceSpot, lookEachOther, requestFrame],
  );

  // ── 캡슐 모양·열기 ──────────────────────────────────────

  const setCapVisual = useCallback((rec: BodyRec, twistRad: number, gapPx: number, crack: number, hold: number) => {
    const el = rec.els.sprite;
    if (!el) return;
    el.style.setProperty('--cap-twist', `${((twistRad * 180) / Math.PI).toFixed(1)}deg`);
    el.style.setProperty('--cap-gap', `${gapPx.toFixed(1)}px`);
    el.style.setProperty('--cap-crack', crack.toFixed(2));
    el.style.setProperty('--cap-hold', hold.toFixed(3));
  }, []);

  const openCapsule = useCallback(
    (rec: BodyRec) => {
      const st = capStateRef.current.get(rec.key);
      if (st?.opening) return;
      if (st) st.opening = true;
      const world = worldRef.current;
      const wb = getBody(world, rec.key);
      const L = layoutRef.current;
      const id = rec.id;
      if (wb && L) {
        const spot = toScreen(L, wb.x, wb.y, wb.z);
        spawnRef.current.set(bodyKey('malang', id), { x: wb.x, y: wb.y, z: 0.02, pop: true });
        burstIdRef.current += 1;
        const burst: Burst = { key: burstIdRef.current, x: spot.x, y: spot.y, size: L.sprite * 0.52, rarity: rec.character.rarity };
        setBursts((b) => [...b, burst]);
        later(() => setBursts((b) => b.filter((x) => x.key !== burst.key)), 1000);
      }
      for (const [pid, p] of pointersRef.current) if (p.key === rec.key) pointersRef.current.delete(pid);
      capStateRef.current.delete(rec.key);
      squish.capsuleClick();
      later(() => squish.popOut(), 90);
      if (!reducedRef.current) haptic(TOUCH_FX[rec.character.rarity].milestoneHaptic);
      useGameStore.getState().unboxMalang(id, Math.max(capRef.current, 1));
      setCapsules((c) => c.filter((x) => x !== id));
      setFocusId(id);
      say(`${josa(rec.character.name, '이/가')} 나왔어요!`, 2600);
    },
    [later, say],
  );

  const capsuleTap = useCallback(
    (rec: BodyRec) => {
      const st = capStateRef.current.get(rec.key) ?? newCapState();
      capStateRef.current.set(rec.key, st);
      const r = registerCapsuleTap(st.taps, performance.now());
      st.taps = r.taps;
      squish.capsuleTick();
      if (!reducedRef.current) {
        popBody(worldRef.current, rec.key, 1.6);
        haptic('tap');
      }
      setCapVisual(rec, 0.18 * (r.taps.length % 2 === 0 ? -1 : 1), 0, r.progress, 0);
      if (r.progress >= 1) openCapsule(rec);
      requestFrame();
    },
    [openCapsule, requestFrame, setCapVisual],
  );

  // ── 한 프레임 ────────────────────────────────────────────

  frameRef.current = (ts: number) => {
    rafRef.current = null;
    const L = layoutRef.current;
    if (!L) return;
    const last = lastTsRef.current;
    lastTsRef.current = ts;
    const dt = last === null ? 16 : Math.min(50, ts - last);
    const now = performance.now();
    const world = worldRef.current;
    const worldEvents = stepWorld(world, dt);
    handleEvents(worldEvents);
    const pairEvents = stepInteractions(interactRef.current, {
      now,
      bodies: interactBodies(now),
      contacts: world.touching,
      events: worldEvents,
    });
    if (pairEvents.length > 0) handlePairs(pairEvents);

    let busy = false;
    let dozeOnly = true;
    let any3d = false;
    const st = stageRef.current;
    // 한 손가락으로 꾹 누르는 캡슐
    for (const [key, cs] of capStateRef.current) {
      if (cs.holdStart === null || cs.pointers.length !== 1 || cs.opening) continue;
      const rec = recsRef.current.get(key);
      if (!rec) continue;
      const hp = holdProgress(now - cs.holdStart - CAPSULE_HOLD_DELAY);
      setCapVisual(rec, Math.sin(now / 40) * 0.05 * hp, hp * 3, hp, hp);
      busy = true;
      if (hp >= 1) openCapsule(rec);
    }
    const viewH = L.floorTop + L.floorH / 2;
    for (const rec of recsRef.current.values()) {
      const wb = getBody(world, rec.key);
      const els = rec.els;
      if (!wb || !els.wrap) continue;
      const spot = toScreen(L, wb.x, wb.y, wb.z);
      els.wrap.style.transform = `translate3d(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px, 0)`;
      els.wrap.style.zIndex = String(Math.round(spot.depth));
      if (els.shadow) {
        const k = Math.max(0.45, 1 - spot.lift / (L.sprite * 1.6));
        els.shadow.style.transform = `translate(-50%, calc(-50% + ${spot.lift.toFixed(1)}px)) scale(${k.toFixed(3)})`;
        els.shadow.style.opacity = String(k);
      }
      const actor = rec.actor;
      if (!actor) {
        // 캡슐: 구르는 쪽으로 살짝 기운다 (멈추면 똑바로 — 비틀어 열기 좋게)
        if (els.sprite) els.sprite.style.rotate = `${Math.max(-28, Math.min(28, wb.vx * 9)).toFixed(1)}deg`;
        continue;
      }
      const moving = actor.frame(dt, now, rec.view !== null);
      busy = busy || moving;
      const fill = actor.env.filling ? actor.fill : null;
      if (!actor.dozeOnly()) dozeOnly = false;
      const sq = Math.hypot(wb.squeezeX, wb.squeezeY, wb.squeezeZ);
      const sqChanged = Math.abs(sq - rec.lastSqueeze) > 1e-4;
      rec.lastSqueeze = sq;
      const gaze = actor.gazeNow();
      if (rec.view) {
        any3d = true;
        if (rec.view.busy()) busy = true;
        rec.view.place({
          x: spot.x,
          y: spot.y,
          unit: L.sprite / VIEWBOX.w,
          depth: spot.depth - viewH,
          lift: spot.lift,
        });
        if (moving || sqChanged || !rec.still) {
          rec.view.update(squeezePose(actor.pose(), wb.squeezeX, wb.squeezeY, wb.squeezeZ), actor.soft);
          rec.still = !moving && !sqChanged;
        }
        rec.view.setGaze(gaze.x, gaze.y);
        if (fill) rec.view.setFill(fill.glow, fill.swirl);
      }
      if (els.sprite && (!rec.view || modeRef.current !== '3d')) {
        const t = actor.transform2d();
        const sqp = squeezePose(REST_POSE, wb.squeezeX, wb.squeezeY, wb.squeezeZ);
        const r = L.sprite / 2;
        els.sprite.style.transform =
          `translate(${(t.translateX * r).toFixed(2)}px, ${(t.translateY * r).toFixed(2)}px) ` +
          `skewX(${(t.skewXDeg - sqp.lean * 20).toFixed(2)}deg) ` +
          `scale(${(t.scaleX * sqp.scaleX).toFixed(4)}, ${(t.scaleY * sqp.scaleY).toFixed(4)})`;
        els.sprite.style.setProperty('--gaze-x', gaze.x.toFixed(2));
        els.sprite.style.setProperty('--gaze-y', gaze.y.toFixed(2));
        if (fill) {
          els.sprite.style.setProperty('--fill-glow', fill.glow.toFixed(3));
          els.sprite.style.setProperty('--fill-swirl', `${fill.swirl.toFixed(3)}rad`);
        }
      }
    }
    const worldMoving = !isWorldAtRest(world);
    if (st && any3d) {
      const throttled = dozeOnly && !worldMoving && pointersRef.current.size === 0;
      if (!throttled || ts - lastDrawRef.current >= DOZE_FRAME_MS) {
        lastDrawRef.current = ts;
        st.render();
      }
    }
    // 성능: 연속으로 그리는 프레임 간격만
    if (last !== null && !keep3dForTests()) {
      const next = samplePerf(perfRef.current, ts - last);
      if (next !== perfRef.current) {
        const prev = perfRef.current;
        perfRef.current = next;
        if (next.cap !== prev.cap) setCap(next.cap);
        if (next.quality === '2d' && prev.quality === '3d' && modeRef.current !== '2d') setMode('2d');
      }
    }
    if (busy || worldMoving || pointersRef.current.size > 0) {
      // 이 프레임 안의 반응(부딪힘·말랑이끼리)이 이미 requestFrame 으로 다음 프레임을 잡았으면 또 잡지 않는다 —
      // 두 번 잡으면 루프가 프레임마다 두 배로 불어나 (벽에 대고 끌 때 등) 화면이 멈춘다
      if (rafRef.current === null) rafRef.current = requestAnimationFrame((t) => frameRef.current(t));
    } else if (rafRef.current === null) {
      settleWorld(world);
      lastTsRef.current = null;
    }
  };


  useEffect(() => {
    setWorldCap(worldRef.current, Math.max(cap, worldRef.current.bodies.length));
  }, [cap]);

  // 개발 중 확인용: 브라우저 자동 검사에서 세계 상태를 읽는다
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const w = window as unknown as { __playroomWorld?: unknown };
    w.__playroomWorld = worldRef.current;
    return () => {
      delete w.__playroomWorld;
    };
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      timersRef.current.forEach((t) => window.clearTimeout(t));
      for (const rec of recsRef.current.values()) {
        rec.actor?.dispose();
        rec.fx?.dispose();
      }
    },
    [],
  );

  // 가만히 두면 하품·졸기 (말랑이마다 따로), 졸면 z z. 이웃끼리 흘끔·같이 졸기
  useEffect(() => {
    let tick = 0;
    let last = performance.now();
    const t = window.setInterval(() => {
      tick++;
      const now = performance.now();
      for (const rec of recsRef.current.values()) {
        const a = rec.actor;
        if (!a) continue;
        a.idleTick(now, document.hidden);
        if (a.dozing && tick % 2 === 0 && !document.hidden) rec.fx?.react('zzz', 1);
      }
      if (!document.hidden) {
        const ev = idleInteractions(interactRef.current, interactBodies(now), now, now - last, Math.random);
        if (ev.length > 0) handlePairs(ev);
      }
      last = now;
    }, 1000);
    return () => window.clearInterval(t);
  }, [handlePairs, interactBodies]);

  // ── 애정 단계 축하 + 새 반응 시범 ─────────────────────────

  const prevLevelsRef = useRef<Record<string, number>>({});
  const showDemo = useCallback(
    (spec: DemoSpec, id?: string | null) => {
      const target = id ?? focusId;
      const rec = target ? recsRef.current.get(bodyKey('malang', target)) : undefined;
      const box = rec ? spriteBox(rec) : null;
      if (!box) return;
      setDemo({ spec, box });
      markDemoSeen(spec.key);
    },
    [focusId, spriteBox],
  );

  useEffect(() => {
    for (const id of onMat) {
      const lv = levelOf(affection[id] ?? 0);
      const prev = prevLevelsRef.current[id];
      prevLevelsRef.current[id] = lv;
      if (prev === undefined || lv <= prev) continue;
      const rec = recsRef.current.get(bodyKey('malang', id));
      const c = rec?.character;
      if (!rec || !c) continue;
      rec.actor?.celebrate(TOUCH_FX[c.rarity].milestoneHearts);
      const opened = unlocksAt(lv)[0] ?? null;
      setToast({ name: c.name, level: lv, rarity: c.rarity, unlocked: opened });
      later(() => setToast(null), opened ? 5200 : 2600);
      if (opened) {
        const spec = demoFor(opened.id);
        if (spec) later(() => showDemo(spec, id), 700);
      }
    }
  }, [affection, onMat, later, showDemo]);

  // 처음 놀이방에 온 사람에게는 손가락 시범 한 번
  useEffect(() => {
    if (!layout || onMat.length === 0) return undefined;
    if (readSeenDemos().has('intro')) return undefined;
    const t = window.setTimeout(() => {
      markDemoSeen('intro');
      const spec = demoFor('squish');
      if (spec) showDemo(spec, onMat[0]);
    }, 900);
    return () => window.clearTimeout(t);
  }, [layout, onMat, showDemo]);

  // ── 손가락 ──────────────────────────────────────────────

  const hitTest = useCallback((x: number, y: number): { rec: BodyRec; hit: ReturnType<JellyStage['pick']> } | null => {
    const L = layoutRef.current;
    if (!L) return null;
    const world = worldRef.current;
    const S = L.sprite;
    const sorted = [...recsRef.current.values()]
      .map((rec) => ({ rec, wb: getBody(world, rec.key) }))
      .filter((e): e is { rec: BodyRec; wb: NonNullable<typeof e.wb> } => e.wb !== undefined)
      .map((e) => ({ ...e, spot: toScreen(L, e.wb.x, e.wb.y, e.wb.z) }))
      .sort((a, b) => b.spot.depth - a.spot.depth);
    // 캡슐은 3D 캔버스 위에 그린다 → 먼저
    for (const e of sorted) {
      if (e.rec.kind !== 'capsule') continue;
      if (Math.hypot(x - e.spot.x, y - (e.spot.y - S * 0.2)) < S * 0.32) return { rec: e.rec, hit: null };
    }
    const st = stageRef.current;
    if (st && modeRef.current === '3d') {
      const p = st.pick(x, y);
      if (p) {
        for (const e of sorted) if (e.rec.view === p.body) return { rec: e.rec, hit: p };
      }
    }
    for (const e of sorted) {
      if (e.rec.kind !== 'malang' || (e.rec.view && modeRef.current === '3d')) continue;
      const frac = bodyFrac(SHAPES[e.rec.character.shape]);
      const cx = e.spot.x;
      const cy = e.spot.y - S * (frac.bottom - (frac.top + frac.bottom) / 2);
      const rx = (S * (frac.right - frac.left)) / 2 + 6;
      const ry = (S * (frac.bottom - frac.top)) / 2 + 6;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return { rec: e.rec, hit: null };
    }
    // 폰에서 손가락이 커도 잘 잡히게: 몸 가운데에서 가까우면 그 말랑이
    let best: { rec: BodyRec; d: number } | null = null;
    for (const e of sorted) {
      if (e.rec.kind !== 'malang') continue;
      const frac = bodyFrac(SHAPES[e.rec.character.shape]);
      const d = Math.hypot(x - e.spot.x, y - (e.spot.y - S * (frac.bottom - frac.top) * 0.5));
      if (d < S * 0.42 && (!best || d < best.d)) best = { rec: e.rec, d };
    }
    return best ? { rec: best.rec, hit: null } : null;
  }, []);

  const anchorOf = (key: string) => {
    const L = layoutRef.current;
    const wb = getBody(worldRef.current, key);
    if (!L || !wb) return { x: 0, y: 0 };
    const s = toScreen(L, wb.x, wb.y, wb.z);
    return { x: s.x, y: s.y };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (demo) setDemo(null);
    const t = hitTest(e.clientX, e.clientY);
    if (!t) return;
    const { rec } = t;
    const now = performance.now();
    if (rec.kind === 'malang') {
      const actor = rec.actor;
      if (!actor || actor.held) return; // 한 말랑이에 손가락 하나
      actor.begin('pointer', e.clientX, e.clientY, t.hit?.hit ?? null);
      setFocusId(rec.id);
    } else {
      const cs = capStateRef.current.get(rec.key) ?? newCapState();
      capStateRef.current.set(rec.key, cs);
      if (cs.pointers.length >= 2) return;
      cs.pointers.push(e.pointerId);
      if (cs.pointers.length === 2) {
        // 두 손가락: 비틀기·벌리기. 옮기던 것은 내려놓는다
        const first = cs.pointers[0] !== undefined ? pointersRef.current.get(cs.pointers[0]) : undefined;
        cs.a0 = first ? { x: first.lastX, y: first.lastY } : { x: e.clientX - 30, y: e.clientY };
        cs.b0 = { x: e.clientX, y: e.clientY };
        cs.holdStart = null;
        cs.ratchet = 0;
        if (first?.grab) {
          releaseBody(worldRef.current, rec.key, 0, 0);
          first.grab = null;
        }
      } else {
        cs.holdStart = now;
      }
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처 실패해도 계속 동작
    }
    pointersRef.current.set(e.pointerId, {
      key: rec.key,
      kind: rec.kind,
      startX: e.clientX,
      startY: e.clientY,
      startT: now,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: now,
      vx: 0,
      vy: 0,
      grab: null,
      startAnchor: anchorOf(rec.key),
      moved: false,
    });
    requestFrame();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointersRef.current.get(e.pointerId);
    const L = layoutRef.current;
    if (!p || !L) {
      // 마우스를 올려 두면 집중한 말랑이가 그쪽을 본다
      if (e.pointerType === 'mouse' && focusId) recsRef.current.get(bodyKey('malang', focusId))?.actor?.lookAt(e.clientX, e.clientY);
      return;
    }
    const rec = recsRef.current.get(p.key);
    if (!rec) return;
    const now = performance.now();
    const dt = Math.max(1, now - p.lastT);
    p.vx = p.vx * 0.4 + ((e.clientX - p.lastX) / dt) * 0.6;
    p.vy = p.vy * 0.4 + ((e.clientY - p.lastY) / dt) * 0.6;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    p.lastT = now;
    const travel = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (travel > 10) p.moved = true;
    const world = worldRef.current;
    const carryTo = () => {
      const w = toWorld(L, e.clientX, e.clientY);
      if (p.grab) moveHeld(world, p.key, w.x + p.grab.dx, w.y + p.grab.dy);
    };
    const startCarry = () => {
      const wb = getBody(world, p.key);
      if (!wb) return;
      // 처음 누른 자리 기준: 몸은 제자리에 있었으니 손가락을 따라잡으며 "딸려 온다"
      const w = toWorld(L, p.startX, p.startY);
      grabBody(world, p.key);
      p.grab = { dx: wb.x - w.x, dy: wb.y - w.y };
    };
    if (rec.kind === 'malang' && rec.actor) {
      const actor = rec.actor;
      // 쭉쭉이는 멀리 늘어난 뒤에야 따라온다 (촉감 표의 carryFrac)
      if (!actor.carrying && actor.travel(e.clientX, e.clientY) > L.sprite * actor.env.material.carryFrac) {
        startCarry();
        actor.startCarry();
      }
      if (actor.carrying) carryTo();
      const a = anchorOf(p.key);
      actor.move(e.clientX, e.clientY, a.x - p.startAnchor.x, a.y - p.startAnchor.y);
    } else {
      const cs = capStateRef.current.get(p.key);
      if (!cs) return;
      if (cs.pointers.length === 2 && cs.a0 && cs.b0) {
        const [ia, ib] = cs.pointers;
        const pa = ia !== undefined ? pointersRef.current.get(ia) : undefined;
        const pb = ib !== undefined ? pointersRef.current.get(ib) : undefined;
        if (pa && pb) {
          const r = readTwoFinger(cs.a0, cs.b0, { x: pa.lastX, y: pa.lastY }, { x: pb.lastX, y: pb.lastY });
          const idx = ratchetIndex(r.twist);
          if (idx !== cs.ratchet) {
            cs.ratchet = idx;
            squish.capsuleTick();
            if (!reducedRef.current) haptic('tap');
          }
          setCapVisual(rec, r.twist, r.spread * L.sprite * 0.3, r.progress, 0);
          if (r.progress >= 1) openCapsule(rec);
        }
      } else if (cs.pointers.length === 1) {
        if (p.moved) cs.holdStart = null;
        if (!p.grab && travel > L.sprite * CAPSULE_CARRY_FRAC) startCarry();
        if (p.grab) carryTo();
      }
    }
    requestFrame();
  };

  const finishPointer = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.delete(e.pointerId);
    const rec = recsRef.current.get(p.key);
    const L = layoutRef.current;
    if (!rec || !L) return;
    const world = worldRef.current;
    const now = performance.now();
    const recent = now - p.lastT < 80;
    // 손가락 속도 px/ms → 세계 단위/s
    const toWorldV = (v: number) => (recent && !cancelled ? (v * 1000) / L.sprite : 0);
    if (rec.kind === 'malang' && rec.actor) {
      const carrying = rec.actor.carrying;
      rec.actor.end(cancelled);
      if (carrying) releaseBody(world, p.key, toWorldV(p.vx), toWorldV(p.vy));
    } else {
      const cs = capStateRef.current.get(p.key);
      if (cs && !cs.opening) {
        const wasTwo = cs.pointers.length === 2;
        cs.pointers = cs.pointers.filter((id) => id !== e.pointerId);
        cs.holdStart = null;
        if (p.grab) releaseBody(world, p.key, toWorldV(p.vx), toWorldV(p.vy));
        if (wasTwo) {
          // 덜 열었으면 다시 닫힌다
          cs.a0 = null;
          cs.b0 = null;
          for (const id of cs.pointers) pointersRef.current.delete(id);
          cs.pointers = [];
          setCapVisual(rec, 0, 0, 0, 0);
        } else if (!cancelled && !p.moved && now - p.startT < TAP_MS + 60) {
          capsuleTap(rec);
        } else {
          setCapVisual(rec, 0, 0, 0, 0);
        }
      }
    }
    requestFrame();
  };

  // ── 키보드 ──────────────────────────────────────────────

  const onBodyKeyDown = useCallback(
    (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => {
      const arrow = ARROWS[e.key];
      if (rec.kind === 'capsule') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) capsuleTap(rec);
        }
        return;
      }
      const actor = rec.actor;
      if (!actor) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat || actor.held) return;
        actor.begin('key', 0, 0, null);
        requestFrame();
        return;
      }
      if (!arrow) return;
      e.preventDefault();
      if (actor.isKeyGesture()) {
        actor.keyPull(arrow.x, arrow.y);
      } else {
        // 화살표만: 그쪽으로 톡 민다
        nudgeBody(worldRef.current, rec.key, arrow.x, arrow.y * 0.8);
        actor.bumped(-arrow.x, 0.3);
        squish.poke(0.3);
      }
      requestFrame();
    },
    [capsuleTap, requestFrame],
  );

  const onBodyKeyUp = useCallback(
    (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => {
      if (rec.kind !== 'malang' || !rec.actor?.isKeyGesture()) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        rec.actor.end(false);
        requestFrame();
      }
    },
    [requestFrame],
  );

  const onBodyFocus = useCallback((rec: BodyRec) => {
    if (rec.kind === 'malang') setFocusId(rec.id);
  }, []);

  const onBodyBlur = useCallback(
    (rec: BodyRec) => {
      if (rec.actor?.isKeyGesture()) {
        rec.actor.end(true);
        requestFrame();
      }
    },
    [requestFrame],
  );

  // ── 선반 ────────────────────────────────────────────────

  const shelfEntries = useMemo(() => {
    const items = Object.entries(owned)
      .map(([id, o]) => {
        const c = getCharacter(id);
        return c ? { id, rarity: c.rarity, firstObtainedAt: o.firstObtainedAt } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return buildShelf(items, unboxed, new Set(onMat), new Set(capsulesOnMat));
  }, [owned, unboxed, onMat, capsulesOnMat]);
  const sealedCount = shelfEntries.filter((e) => e.sealed && !e.out).length;
  const shinyIds = useMemo(() => new Set(Object.keys(owned).filter(shinyOf)), [owned, shinyOf]);

  const onShelfPick = useCallback(
    (entry: ShelfEntry) => {
      const st = useGameStore.getState();
      const action = shelfAction(entry, matCount, cap);
      const c = getCharacter(entry.id);
      if (action === 'full') {
        squish.bump(0.3);
        say(`매트에는 ${cap}마리까지 놓을 수 있어요. 하나를 선반에 넣어 주세요.`, 3000);
        return;
      }
      sfx.button();
      if (action === 'put-back') {
        if (entry.sealed) setCapsules((cs) => cs.filter((x) => x !== entry.id));
        else st.putBackMalang(entry.id);
        if (c) say(`${josa(entry.sealed ? '캡슐' : c.name, '을/를')} 선반에 넣었어요`);
        return;
      }
      if (entry.sealed) setCapsules((cs) => (cs.includes(entry.id) ? cs : [...cs, entry.id]));
      else st.takeOutMalang(entry.id, cap);
      if (!entry.sealed) setFocusId(entry.id);
      setShelfOpen(false);
    },
    [cap, matCount, say],
  );

  const toggleShelf = useCallback(() => {
    sfx.button();
    setShelfOpen((o) => !o);
  }, []);

  // ── 사진 ────────────────────────────────────────────────

  const focusChar = focusId ? getCharacter(focusId) : undefined;
  const focusMaterial = focusChar ? materialOf(focusChar) : null;
  const focusFilling = focusChar ? fillingOf(focusChar) : null;

  const takePhoto = async () => {
    if (photoLockRef.current) return;
    const L = layoutRef.current;
    const recs = [...recsRef.current.values()].filter((r) => r.kind === 'malang');
    if (!L || recs.length === 0) return;
    photoLockRef.current = true;
    setPhotoBusy(true);
    squish.shutter();
    if (!reducedRef.current) {
      setFlash(true);
      later(() => setFlash(false), 420);
    }
    try {
      const copy = (c: HTMLCanvasElement) => {
        const o = document.createElement('canvas');
        o.width = c.width;
        o.height = c.height;
        o.getContext('2d')?.drawImage(c, 0, 0);
        return o;
      };
      const st = modeRef.current === '3d' ? stageRef.current : null;
      const snap = st?.snapshot() ?? null;
      const fxCanvas = fxCanvasRef.current;
      const fxCopy = fxCanvas ? copy(fxCanvas) : null;
      const mod = await import('../components/touch3d/photo');
      const layers: PhotoLayer[] = [];
      // 앞뒤 순서대로 (뒤 말랑이부터)
      const ordered = recs
        .map((r) => ({ r, wb: getBody(worldRef.current, r.key) }))
        .sort((a, b) => (a.wb?.y ?? 0) - (b.wb?.y ?? 0));
      if (snap && st) layers.push({ image: snap, rect: toRect(st.canvas.getBoundingClientRect()) });
      for (const { r } of ordered) {
        if (snap && r.view) continue;
        const svg = r.els.sprite?.querySelector<SVGSVGElement>('svg');
        if (!svg) continue;
        const shape = SHAPES[r.character.shape];
        const img = await mod.rasterizeVisibleMalang(svg, shape.body, shape.bottom);
        const sr = svg.getBoundingClientRect();
        const px = sr.width * mod.RASTER_PAD;
        const py = sr.height * mod.RASTER_PAD;
        layers.push({ image: img, rect: { x: sr.left - px, y: sr.top - py, w: sr.width + 2 * px, h: sr.height + 2 * py } });
      }
      if (fxCopy && fxCanvas) layers.push({ image: fxCopy, rect: toRect(fxCanvas.getBoundingClientRect()) });
      // 사진 칸은 모든 말랑이를 감싸는 상자에 맞춘다
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const r of recs) {
        const b = spriteBox(r);
        if (!b) continue;
        x0 = Math.min(x0, b.left);
        y0 = Math.min(y0, b.top);
        x1 = Math.max(x1, b.left + b.size);
        y1 = Math.max(y1, b.top + b.size);
      }
      const matRect = matRef.current?.getBoundingClientRect();
      const main = focusChar ?? recs[0]!.character;
      const group = recs.length > 1;
      const top = recs.reduce((best, r) => (RARITY_META[r.character.rarity].stars > RARITY_META[best.rarity].stars ? r.character : best), main);
      const blob = await mod.composePhoto({
        id: group ? recs.map((r) => r.id).join('-') : main.id,
        name: group ? `말랑이 ${recs.length}마리` : main.name,
        rarity: group ? top.rarity : main.rarity,
        shiny: group ? false : recs[0]!.shiny,
        level: levelOf(affectionRef.current[main.id] ?? 0),
        caption: group ? '놀이방에서 함께 놀았어요' : undefined,
        group,
        jelly: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) },
        bounds: matRect ? toRect(matRect) : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
        layers,
      });
      const fileName = photoFileName(group ? 'playroom' : main.id, new Date());
      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob, fileName, canShare: mod.canShareFile(blob, fileName) };
      });
    } catch {
      say('사진을 만들지 못했어요. 다시 찍어 주세요.', 2600);
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
    const r = photo.canShare ? await mod.sharePhoto(photo.blob, photo.fileName, '놀이방에서 찍은 사진') : mod.savePhoto(photo.blob, photo.fileName);
    if (r === 'shared' || r === 'downloaded' || r === 'opened') {
      say(r === 'shared' ? '사진을 공유했어요' : '사진을 저장했어요', 2200);
      closePhoto();
    } else if (r === 'failed') {
      mod.savePhoto(photo.blob, photo.fileName);
    }
  };

  const savePhoto = async () => {
    if (!photo) return;
    sfx.button();
    const mod = await import('../components/touch3d/photo');
    mod.savePhoto(photo.blob, photo.fileName);
    say('사진을 저장했어요', 2200);
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

  const photoRef = useRef(photo);
  photoRef.current = photo;
  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    },
    [],
  );

  // ── 나가기 ──────────────────────────────────────────────

  const exit = () => {
    sfx.button();
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  // ── 화면 ────────────────────────────────────────────────

  const level = levelOf(focusId ? (affection[focusId] ?? 0) : 0);
  const progress = (focusId ? (affection[focusId] ?? 0) : 0) % AFFECTION_PER_LEVEL;
  const upcoming = nextUnlock(level);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  const endDemo = useCallback(() => setDemo(null), []);

  const matStyle = { '--pr-sprite': `${layout?.sprite ?? 120}px` } as CSSProperties;

  return (
    <section ref={matRef} className="playroom" style={matStyle} aria-labelledby="pr-title" data-mode={mode}>
      <h1 id="pr-title" className="visually-hidden">
        놀이방
      </h1>
      <div className="playroom__desk" aria-hidden="true">
        <div className="playroom__cloth" />
      </div>

      {/* 위 HUD 를 먼저 둔다: 키보드 Tab 순서가 나가기 → 정보 → 방법 → 사진 → 매트 위 말랑이 → 선반 */}
      <div ref={hudRef} className="playroom__hud">
        <div className="pr-hud-col">
          <button type="button" className="pr-round pr-exit" aria-label="놀이방 나가기" onClick={exit}>
            <BackShape />
          </button>
        </div>
        {focusChar ? (
          <div className="pr-info" role="group" aria-label={`${josa(focusChar.name, '과/와')}의 애정`}>
            <p className="pr-info__row">
              <span className="pr-info__name">{focusChar.name}</span>
              <span className="pr-info__level">
                <HeartShape />
                Lv.{level}
              </span>
            </p>
            {focusMaterial && (
              <p className="pr-info__feel">
                <span className="pr-chip" data-material={focusMaterial.id}>
                  <MaterialIcon material={focusMaterial.id} size={14} />
                  {focusMaterial.label}
                </span>
                {focusFilling && (
                  <span className="pr-chip pr-chip--filling" title={focusFilling.label}>
                    <FillingIcon kind={focusFilling.kind} colors={focusFilling.colors} size={14} />
                    <span className="pr-chip__text">{focusFilling.label}</span>
                  </span>
                )}
              </p>
            )}
            <span
              className="pr-info__bar"
              role="progressbar"
              aria-label="다음 단계까지"
              aria-valuemin={0}
              aria-valuemax={AFFECTION_PER_LEVEL}
              aria-valuenow={progress}
            >
              <span style={{ width: `${(progress / AFFECTION_PER_LEVEL) * 100}%` }} />
            </span>
            <p className="pr-info__next">
              {upcoming ? (
                <>
                  <LockShape />
                  <span>
                    Lv.{upcoming.level} {upcoming.label}: {upcoming.howTo}
                  </span>
                </>
              ) : (
                '모든 반응을 열었어요'
              )}
            </p>
          </div>
        ) : (
          <div className="pr-info pr-info--empty">
            <p className="pr-info__next">말랑이를 꺼내 함께 놀아요</p>
          </div>
        )}
        <div className="pr-hud-col">
          <button
            type="button"
            className="pr-round pr-guide-btn"
            aria-label="만지는 방법 보기"
            onClick={() => {
              sfx.button();
              setGuideOpen(true);
            }}
          >
            <HandShape />
          </button>
          <button
            type="button"
            className="pr-round pr-camera"
            aria-label="매트 사진 찍기"
            disabled={photoBusy || onMat.length === 0}
            onClick={() => void takePhoto()}
          >
            <CameraShape />
          </button>
        </div>
      </div>

      <div
        ref={stageElRef}
        className="playroom__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishPointer(e, false)}
        onPointerCancel={(e) => finishPointer(e, true)}
        onLostPointerCapture={(e) => finishPointer(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {mode !== '2d' && <div ref={glRef} className="playroom__gl" aria-hidden="true" />}
        <div className="playroom__bodies" role="group" aria-label="매트 위 말랑이">
          {onMat.map((id) => {
            const rec = getRec('malang', id);
            if (!rec) return null;
            return (
              <MatBody
                key={rec.key}
                rec={rec}
                mode={mode}
                stage={stage}
                reduced={reduced}
                focused={focusId === id}
                level={levelOf(affection[id] ?? 0)}
                onKeyDown={onBodyKeyDown}
                onKeyUp={onBodyKeyUp}
                onFocus={onBodyFocus}
                onBlur={onBodyBlur}
                onView={onView}
              />
            );
          })}
          {capsulesOnMat.map((id) => {
            const rec = getRec('capsule', id);
            if (!rec) return null;
            return <MatCapsule key={rec.key} rec={rec} onKeyDown={onBodyKeyDown} onKeyUp={onBodyKeyUp} />;
          })}
          {bursts.map((b) => (
            <span
              key={b.key}
              className="pr-burst"
              style={{ left: b.x, top: b.y, width: b.size, height: b.size }}
              data-rarity={b.rarity}
              aria-hidden="true"
            >
              <span className="pr-burst__top">
                <CapsuleArt rarity={b.rarity} />
              </span>
              <span className="pr-burst__bottom">
                <CapsuleArt rarity={b.rarity} />
              </span>
              <span className="pr-burst__ring" style={{ '--c': capsuleGlow(b.rarity) } as CSSProperties} />
            </span>
          ))}
        </div>
        {!reduced && <canvas ref={fxCanvasRef} className="playroom__fx" aria-hidden="true" />}
        {matCount === 0 && (
          <p className="playroom__empty">
            매트가 비었어요. 아래 선반을 열어 말랑이를 꺼내 보세요.
          </p>
        )}
      </div>

      {demo && <GhostFinger demo={demo.spec} box={demo.box} reduced={reduced} onDone={endDemo} />}
      {demo && (
        <p className="pr-demo-caption" role="status">
          <strong>{demo.spec.label}</strong> {demo.spec.howTo}
        </p>
      )}

      {toast && (
        <p className="pr-toast" data-rarity={toast.rarity} role="status">
          <span className="pr-toast__main">
            {josa(toast.name, '과/와')} 애정이 올랐어요. Lv.{toast.level}
          </span>
          {toast.unlocked && (
            <span className="pr-toast__new">
              <b>새 반응: {toast.unlocked.label}</b>
              {toast.unlocked.howTo}
            </span>
          )}
        </p>
      )}
      {notice && (
        <p className="pr-notice" role="status">
          {notice}
        </p>
      )}

      <div ref={shelfRef} className="playroom__shelf-anchor">
        <Shelf
          open={shelfOpen}
          entries={shelfEntries}
          onMat={matCount}
          cap={Math.max(cap, matCount)}
          shinyIds={shinyIds}
          onToggle={toggleShelf}
          onPick={onShelfPick}
          sealedCount={sealedCount}
        />
      </div>

      {guideOpen && (
        <ReactionGuide
          level={level}
          name={focusChar?.name ?? '말랑이'}
          material={focusMaterial?.id ?? null}
          filling={focusFilling}

          onClose={closeGuide}
          onShow={(d) => {
            setGuideOpen(false);
            showDemo(d);
          }}
        />
      )}

      {flash && <span className="pr-flash" aria-hidden="true" />}
      {photo && (
        <div className="touch-photo" role="dialog" aria-modal="true" aria-labelledby="touch-photo-title">
          <div className="touch-photo__panel">
            <h2 id="touch-photo-title" className="touch-photo__title">
              찰칵! 사진을 찍었어요
            </h2>
            <img className="touch-photo__img" src={photo.url} alt="놀이방 매트 사진 카드" />
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
    </section>
  );
}

/** 개발 서버에서만: 소프트웨어 WebGL(swiftshader)로 3D 화면을 확인할 때 성능 조절(2D 전환·상한 줄이기)을 끈다 */
function keep3dForTests(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('playroom-keep-3d') === '1';
  } catch {
    return false;
  }
}

function newCapState(): CapState {
  return { taps: [], pointers: [], a0: null, b0: null, ratchet: 0, holdStart: null, opening: false };
}

function capsuleGlow(rarity: Character['rarity']): string {
  const top = CAPSULE_TOP[rarity];
  if (top === 'rainbow') return '#ff9dbb';
  if (top === 'cosmic') return '#b9a2ff';
  return top;
}

function HeartShape() {
  return (
    <svg className="pr-heart" viewBox="0 0 32 32" width={14} height={14} aria-hidden="true" focusable="false">
      <path
        d="M16 27 C10 22 4 18 4 11.5 C4 7.5 7 5 10.5 5 C13 5 14.8 6.4 16 8.4 C17.2 6.4 19 5 21.5 5 C25 5 28 7.5 28 11.5 C28 18 22 22 16 27 Z"
        fill="#ff9fb8"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 나가기: 둥근 선 왼쪽 꺾쇠 (글자 기호 대신 SVG) */
function BackShape() {
  return (
    <svg viewBox="0 0 32 32" width={24} height={24} aria-hidden="true" focusable="false">
      <path d="M19 7 L10 16 L19 25" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 사진기: 둥근 선 + 레몬 몸 + 하늘 렌즈 */
function CameraShape() {
  return (
    <svg viewBox="0 0 32 32" width={24} height={24} aria-hidden="true" focusable="false">
      <path
        d="M5 11 q0 -3 3 -3 h3 l2 -3 h6 l2 3 h3 q3 0 3 3 v12 q0 3 -3 3 h-16 q-3 0 -3 -3 Z"
        fill="#ffe7a3"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <circle cx={16} cy={17} r={5.2} fill="#dcebff" stroke="currentColor" strokeWidth={2.2} />
      <circle cx={14.4} cy={15.4} r={1.4} fill="#fff" />
    </svg>
  );
}

/** 손바닥: 만지는 방법 */
function HandShape() {
  return (
    <svg viewBox="0 0 32 32" width={24} height={24} aria-hidden="true" focusable="false">
      <path
        d="M11 29 C7 26 5 22 5 18 L5 14 C5 12 8 12 8 14 L8 17 L9 6 C9 4 12 4 12 6 L12 15 L13 4 C13 2 16 2 16 4 L16 15 L17 6 C17 4 20 4 20 6 L20 16 L21 10 C21 8 24 8 24 10 L24 20 C24 25 21 29 17 29 Z"
        fill="#ffe3ec"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockShape() {
  return (
    <svg className="pr-lock" viewBox="0 0 32 32" width={13} height={13} aria-hidden="true" focusable="false">
      <path d="M10 14 v-4 q0 -6 6 -6 q6 0 6 6 v4" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" />
      <rect x={6} y={14} width={20} height={14} rx={4} fill="#ffe7a3" stroke="currentColor" strokeWidth={2.8} />
    </svg>
  );
}
