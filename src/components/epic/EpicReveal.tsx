import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { playRarityFanfare, sfx } from '../../audio/sfx';
import type { ResolvedPull } from '../../gacha/engine';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Malang } from '../Malang';
import { buildTimeline, skipTarget, timelineCues, type TimedCue } from './director';
import { runFallback2d } from './fallback2d';
import { getLoadedScene3d, preloadScene3d } from './loadScene3d';
import type { EpicScene } from './scene3d';
import { epicThemeFor } from './themes';
import './EpicReveal.css';

export { isEpicRarity } from './epicRarity';
export { preloadScene3d } from './loadScene3d';

/** 3D 모듈을 아직 못 받았으면 이만큼만 기다렸다가 2D 연출로 시작한다 */
const LOAD_WAIT_MS = 1500;
/** 캡슐을 연 손가락이 그대로 한 번 더 닿아 바로 넘어가지 않도록 처음 이만큼은 건너뛰기를 무시 */
const SKIP_GUARD_MS = 500;
/** 움직임 줄이기: 정지 카드만 이만큼 보여 준다 */
const STILL_MS = 2200;
/** 3D 첫 프레임(셰이더 컴파일)을 이만큼까지만 기다렸다가 시계를 켠다 */
const FIRST_FRAME_WAIT_MS = 700;

const TITLE1 = { mythic: '신화!', secret: '시크릿!!' } as const;

interface EpicRevealProps {
  item: ResolvedPull;
  onDone(): void;
}

type Mode = 'loading' | '3d' | '2d';

function vibrate(pattern: readonly number[]) {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    // 진동 미지원 기기 무시
  }
}

/**
 * 신화·시크릿 등장 전체 화면 연출 — 여러 컷으로 편집된 짧은 영상.
 * 컷 목록·길이·카메라·전환·소리는 감독 표(director.ts) 하나가 정하고, 이 컴포넌트는 시계를 돌리며
 * 소리 신호를 울리고 DOM 층(영화 띠·전환·번쩍임·말랑이·제목)을 컷에 맞춰 바꾼다. 그림은 3D(scene3d.ts)나
 * 2D 대체(fallback2d.ts)가 같은 시계로 그린다. 말랑이와 글자는 항상 DOM(SVG)이 캔버스 위에 그린다.
 * 화면을 누르면(0.5초 뒤부터) 마지막 카드로 건너뛰고, 마지막 카드에서 누르면 끝난다.
 * 움직임 줄이기면 번쩍임·전환 없이 정지 카드만 보여 준다.
 */
export function EpicReveal({ item, onDone }: EpicRevealProps) {
  const reduced = useReducedMotion();
  const tier = item.rarity === 'secret' ? 'secret' : 'mythic';
  const theme = epicThemeFor(item.character);
  const timeline = useMemo(() => buildTimeline(tier, theme.world), [tier, theme]);
  const finalIndex = timeline.shots.length - 1;
  const [shotIndex, setShotIndex] = useState(reduced ? finalIndex : 0);
  const [mode, setMode] = useState<Mode>(() => (reduced ? '2d' : getLoadedScene3d() ? '3d' : 'loading'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EpicScene | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const mountedAt = useRef(performance.now());
  /** 타임라인 0ms의 performance.now() — 건너뛰면 옮긴다 */
  const originRef = useRef(performance.now());
  const timersRef = useRef<number[]>([]);
  const playedRef = useRef(new Set<string>());

  /** 시계가 돌기 시작했는지 (3D는 첫 프레임을 그린 뒤 — 셰이더 컴파일 동안 첫 컷이 잘리지 않게) */
  const [clockOn, setClockOn] = useState(false);
  const clockOnRef = useRef(false);
  const clock = useCallback(() => (clockOnRef.current ? performance.now() - originRef.current : 0), []);
  const shot = timeline.shots[Math.min(shotIndex, finalIndex)]!;
  const shotIndexRef = useRef(shotIndex);
  shotIndexRef.current = shotIndex;
  const started = mode !== 'loading';
  const startClock = useCallback(() => setClockOn(true), []);

  // 2D·움직임 줄이기는 바로, 3D는 첫 프레임 뒤(늦어도 FIRST_FRAME_WAIT_MS) 시계를 켠다
  useEffect(() => {
    if (!started || clockOn) return;
    if (mode !== '3d' || reduced) {
      setClockOn(true);
      return;
    }
    const id = window.setTimeout(startClock, FIRST_FRAME_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [started, clockOn, mode, reduced, startClock]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  const playCue = useCallback(
    (c: TimedCue) => {
      playedRef.current.add(c.kind);
      switch (c.kind) {
        case 'tease':
          return sfx.secretTease();
        case 'riser':
          return sfx.epicRiser(c.seconds ?? 1);
        case 'whoosh':
          return sfx.whoosh();
        case 'land':
          return sfx.cometLand();
        case 'ringLock':
          return sfx.ringLock(c.index ?? 0);
        case 'implode':
          return sfx.epicImplode(c.seconds ?? 0.3);
        case 'hush':
          return sfx.hush(c.seconds ?? 0.5);
        case 'impact':
          return sfx.epicImpact();
        case 'boom':
          return sfx.secretBoom();
        case 'fanfare':
          return playRarityFanfare(sfx, item.rarity, item.shiny);
        case 'chime':
          return sfx.shinyChime();
        case 'vibrate':
          return vibrate(c.pattern ?? [40]);
      }
    },
    [item.rarity, item.shiny],
  );

  /** fromMs부터 남은 컷 바꾸기·소리·끝내기를 예약한다 */
  const schedule = useCallback(
    (fromMs: number) => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      const at = (ms: number, fn: () => void) => timersRef.current.push(window.setTimeout(fn, Math.max(0, ms - fromMs)));
      timeline.shots.forEach((s, i) => {
        if (s.start > fromMs) at(s.start, () => setShotIndex(i));
      });
      for (const c of timelineCues(timeline)) if (c.time >= fromMs) at(c.time, () => playCue(c));
      at(timeline.total, finish);
    },
    [timeline, playCue, finish],
  );

  // 3D 모듈이 아직이면 잠깐 기다린다
  useEffect(() => {
    if (mode !== 'loading') return;
    let alive = true;
    const timer = window.setTimeout(() => alive && setMode('2d'), LOAD_WAIT_MS);
    void preloadScene3d().then((m) => {
      if (alive) setMode(m ? '3d' : '2d');
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mode]);

  // 시계 시작 + 예약 (움직임 줄이기면 정지 카드 + 팡파레만)
  useEffect(() => {
    if (!clockOn) return;
    if (reduced) {
      playRarityFanfare(sfx, item.rarity, item.shiny);
      const id = window.setTimeout(finish, STILL_MS);
      return () => window.clearTimeout(id);
    }
    originRef.current = performance.now();
    clockOnRef.current = true;
    setShotIndex(0);
    schedule(0);
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [clockOn, reduced, schedule, finish, item.rarity, item.shiny]);

  // 3D 장면 만들기 — 실패하면 2D로
  useEffect(() => {
    if (mode !== '3d' || reduced) return;
    const mod = getLoadedScene3d();
    const box = glRef.current;
    if (!mod || !box) return;
    try {
      sceneRef.current = mod.createEpicScene(box, { theme, timeline, shiny: item.shiny, clock, onFirstFrame: startClock });
    } catch {
      setMode('2d');
      return;
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [mode, reduced, theme, timeline, item.shiny, clock, startClock]);

  // 2D 대체 캔버스 루프
  useEffect(() => {
    if (reduced || mode !== '2d') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return runFallback2d(canvas, { timeline, theme, rng: defaultRng, clock, root: rootRef.current });
  }, [reduced, mode, timeline, theme, clock]);

  /** 건너뛰기: 마지막 카드 전이면 마지막 카드로, 마지막 카드면 끝 */
  const skip = useCallback(() => {
    if (performance.now() - mountedAt.current < SKIP_GUARD_MS) return;
    if (reduced || !clockOn) return finish();
    // 화면에 아직 마지막 카드가 안 보이면(바쁜 기기에서 예약이 밀려도) 끝내지 말고 마지막 카드로 간다
    const target = skipTarget(timeline, clock()) ?? (shotIndexRef.current < finalIndex ? timeline.finalStart : null);
    if (target === null) return finish();
    originRef.current = performance.now() - target;
    setShotIndex(finalIndex);
    // 팡파레 전에 건너뛰었으면 여기서 울린다 (착지 소리가 빠지지 않게)
    if (!playedRef.current.has('fanfare')) {
      playedRef.current.add('fanfare');
      playRarityFanfare(sfx, item.rarity, item.shiny);
    }
    schedule(target);
  }, [reduced, clockOn, finish, timeline, clock, finalIndex, schedule, item.rarity, item.shiny]);

  // 전체 화면 창이 뜨면 초점을 안으로 (화면 읽기가 뒤 뽑기 화면에 머물지 않게). 끝나면 결과 창이 초점을 가져간다
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // 키보드: Enter/Space/Esc로 건너뛰기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const live = clockOn && !reduced;
  const flat = mode !== '3d';
  const isFinal = shotIndex >= finalIndex;
  const style = {
    '--epic-in': theme.bgInner,
    '--epic-out': theme.bgOuter,
    '--epic-a': theme.nebula[0],
    '--epic-b': theme.nebula[1],
    '--epic-c': theme.nebula[2],
    '--epic-core': theme.core,
    '--epic-crack': theme.crack,
    '--shot-ms': `${shot.duration}ms`,
  } as CSSProperties;
  const malang = reduced ? 'full' : live ? shot.malang : 'hidden';
  const showTitle = reduced || (live && shot.title);
  const classes = [
    'epic',
    `epic--${tier}`,
    `epic--m-${theme.motif}`,
    `epic--s-${reduced ? 'title' : shot.id}`,
    `epic--${mode}`,
    live && shot.letterbox ? 'epic--bars' : '',
    reduced ? 'epic--still' : '',
    item.shiny ? 'is-shiny' : '',
  ];

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={`${tier === 'secret' ? '시크릿' : '신화'} 말랑이 등장`}
      data-shot={reduced ? 'title' : shot.id}
      onPointerDown={skip}
    >
      <div className="epic__bg" aria-hidden="true" />
      {mode === '3d' && !reduced && <div ref={glRef} className="epic__gl" aria-hidden="true" />}
      {flat && (
        <>
          <div className="epic__nebula" aria-hidden="true" />
          <div className="epic__rays" aria-hidden="true" />
          {theme.motif === 'rainbow' && <div className="epic__arches" aria-hidden="true" />}
          <div className="epic__orb" aria-hidden="true" />
        </>
      )}
      {flat && !reduced && <canvas ref={canvasRef} className="epic__canvas" aria-hidden="true" />}

      {flat && live && shot.id === 'chute' && <div className="epic__chute" aria-hidden="true" />}
      {flat && live && shot.capsule && (
        <div className="epic__capsule" aria-hidden="true">
          <svg viewBox="-60 -60 120 120" width="100%" height="100%">
            <defs>
              <radialGradient id="epic-cap" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="0.35" stopColor={theme.capsuleTop} />
                <stop offset="1" stopColor={theme.capsuleTop} stopOpacity="0.85" />
              </radialGradient>
            </defs>
            <g className="epic__half epic__half--top">
              <path d="M-48 0 A48 48 0 0 1 48 0 Z" fill="url(#epic-cap)" />
              <ellipse cx="-18" cy="-26" rx="12" ry="6" fill="#fff" opacity="0.7" transform="rotate(-30 -18 -26)" />
            </g>
            <g className="epic__half epic__half--bottom">
              <path d="M-48 0 A48 48 0 0 0 48 0 Z" fill={theme.capsuleBottom} />
              <rect x="-49" y="-3" width="98" height="6" rx="3" fill="#ffffff" />
            </g>
            {/* 빛이 새어 나오는 금 */}
            <g className="epic__cracks" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M-6 -44 L2 -30 L-8 -18 L4 -6" />
              <path d="M26 -36 L18 -22 L30 -12" />
              <path d="M-34 -26 L-22 -16 L-30 -4" />
              <path d="M10 8 L-2 22 L8 36" />
            </g>
          </svg>
        </div>
      )}

      {/* 컷 전환 (컷이 바뀔 때마다 새로 그려 애니메이션을 다시 튼다) */}
      {live && shot.transitionIn !== 'none' && shot.transitionIn !== 'cut' && shot.transitionIn !== 'letterbox' && (
        <div key={`tx${shotIndex}`} className={`epic__tx epic__tx--${shot.transitionIn}`} aria-hidden="true" />
      )}
      {live &&
        shot.flashes.map((f, i) =>
          f.kind === 'white' ? (
            <div
              key={`fl${shotIndex}-${i}`}
              className="epic__flash"
              aria-hidden="true"
              style={{ '--flash-at': `${f.at}ms`, '--flash-ms': `${f.ms}ms`, '--flash-peak': f.peak } as CSSProperties}
            />
          ) : null,
        )}
      {live && shot.id === 'omen' && (
        <p className="epic__omen" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </p>
      )}

      <div className="epic__bars" aria-hidden="true" />

      {malang !== 'hidden' && (
        <div className={`epic__stage epic__stage--${malang}`}>
          <div className="epic__malang">
            <Malang character={item.character} size={230} animation="bounce" decorative aura={malang === 'silhouette' ? 'none' : 'auto'} shiny={item.shiny} />
          </div>
        </div>
      )}

      {showTitle && (
        <div className="epic__titles">
          <p className="epic__title" aria-label={TITLE1[tier]}>
            {/* 시크릿은 글자가 하나씩 쾅쾅 찍힌다 */}
            {tier === 'secret'
              ? [...TITLE1[tier]].map((ch, i) => (
                  <span key={i} aria-hidden="true" style={{ '--i': i } as CSSProperties}>
                    {ch}
                  </span>
                ))
              : TITLE1[tier]}
          </p>
          <p className="epic__name">
            {item.shiny ? '반짝 ' : ''}
            {item.character.name}
          </p>
          <p className="epic__tagline">{theme.tagline}</p>
        </div>
      )}

      <p className="epic__skip">{isFinal || reduced ? '화면을 누르면 계속' : '화면을 누르면 건너뛰기'}</p>
    </div>
  );
}
