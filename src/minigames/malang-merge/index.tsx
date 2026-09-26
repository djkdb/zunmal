import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Malang } from '../../components/Malang';
import { getCharacter, type Character } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  MAX_TIER,
  MERGE_CONFIG as CONFIG,
  TIER_CHARACTER_IDS,
  WORLD,
  canDrop,
  createMergeState,
  drop,
  radiusOf,
  setAim,
  step,
  type MergeEvent,
  type MergeState,
} from './logic';
import './MalangMerge.css';

const INK = '#2b2233';

/** 원(물리) 지름 대비 Malang SVG 크기. 몸통은 viewBox 120 중 약 92px 폭이라, 살짝 크게 그려 맞닿은 곳이 말랑하게 겹쳐 보이게 한다. */
const SPRITE_SCALE = 120 / 86;
/** SVG 안에서 몸통 중심의 세로 위치 비율 */
const BODY_CENTER_Y = 0.57;
/** 움직일 때 기울기: 속도(월드 px/초)당 라디안, 최대값 */
const LEAN_PER_SPEED = 0.0012;
const MAX_LEAN = 0.3;
/** 화살표 키/버튼을 누르고 있을 때 조준 이동 속도 (월드 px/초) */
const AIM_SPEED = 240;
/** 화살표를 한 번 눌렀을 때 이동 거리 */
const AIM_NUDGE = 14;

const TIER_CHARACTERS: readonly Character[] = TIER_CHARACTER_IDS.map((id) => {
  const c = getCharacter(id);
  if (!c) throw new Error(`malang-merge: unknown character ${id}`);
  return c;
});
const characterOf = (tier: number): Character => TIER_CHARACTERS[Math.max(0, Math.min(MAX_TIER, tier))]!;

function spriteSize(tier: number): number {
  return Math.round(radiusOf(tier) * 2 * SPRITE_SCALE);
}

interface BodyView {
  id: number;
  tier: number;
  born: boolean;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  text: string;
  big: boolean;
}

/** 합쳐져 태어난 말랑이는 BORN_MS 동안 is-born(쫀득하게 부풀기) 클래스를 유지한다. */
const BORN_MS = 600;

function bodyViews(state: MergeState, bornAt: Map<number, number>, now: number): BodyView[] {
  for (const [id, t] of bornAt) if (now - t > BORN_MS) bornAt.delete(id);
  return state.bodies.map((b) => ({ id: b.id, tier: b.tier, born: bornAt.has(b.id) }));
}

/** 한 프레임의 합치기 이벤트 중 가장 큰 것 하나로 소리를 낸다. */
function playMergeSound(sfx: MiniGameProps['sfx'], events: readonly MergeEvent[]) {
  let top = -1;
  let vanished = false;
  for (const e of events) {
    if (e.kind === 'merge') top = Math.max(top, e.tier);
    if (e.kind === 'vanish') vanished = true;
  }
  if (vanished) sfx.success();
  else if (top >= 6) sfx.coin();
  else if (top >= 4) sfx.pickup();
  else if (top >= 1) sfx.tap(3 + top * 2);
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function MalangMergeGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });

  const stateRef = useRef<MergeState>(createMergeState(defaultRng));
  const jarRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const dropBtnRef = useRef<HTMLButtonElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const dangerRef = useRef(false);
  const bodyEls = useRef(new Map<number, HTMLDivElement>());
  const squashEls = useRef(new Map<number, HTMLDivElement>());
  const startedRef = useRef(false);
  const reportedRef = useRef(false);
  const draggingRef = useRef<number | null>(null);
  /** 화살표 키/버튼을 누르고 있는 방향 */
  const holdDirRef = useRef<{ key: number; button: number }>({ key: 0, button: 0 });
  const burstId = useRef(0);
  const bornAt = useRef(new Map<number, number>());

  const [bodies, setBodies] = useState<BodyView[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [held, setHeld] = useState({ current: stateRef.current.current, next: stateRef.current.next });
  const [hud, setHud] = useState({ score: 0, timeLeft: CONFIG.durationMs / 1000, maxTier: 0, danger: false });
  const [ended, setEnded] = useState<MergeState['endReason']>(null);

  startedRef.current = started;
  const playing = started && ended === null;

  // 월드(300×420 px)를 병 크기에 맞춰 확대/축소
  useEffect(() => {
    const jar = jarRef.current;
    const world = worldRef.current;
    if (!jar || !world) return;
    const resize = () => {
      const k = jar.clientWidth / WORLD.width;
      if (k > 0) world.style.transform = `scale(${k})`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(jar);
    return () => ro.disconnect();
  }, []);

  /** 물리 상태를 DOM 위치에 반영 (리렌더 없이) */
  const paint = useCallback(
    (s: MergeState) => {
      for (const b of s.bodies) {
        const el = bodyEls.current.get(b.id);
        if (!el) continue;
        const size = spriteSize(b.tier);
        // 굴러가는 대신 움직이는 방향으로 살짝 기울기만 한다 (얼굴은 늘 위를 본다)
        const lean = reduced ? 0 : Math.max(-MAX_LEAN, Math.min(MAX_LEAN, b.vx * LEAN_PER_SPEED));
        el.style.transform = `translate(${b.x - size / 2}px, ${b.y - size * BODY_CENTER_Y}px) rotate(${lean}rad)`;
      }
      const ready = canDrop(s);
      const heldEl = heldRef.current;
      if (heldEl) {
        const size = spriteSize(s.current);
        heldEl.style.transform = `translate(${s.aimX - size / 2}px, ${CONFIG.dropY - size * BODY_CENTER_Y}px)`;
        heldEl.classList.toggle('is-waiting', !ready);
      }
      const guide = guideRef.current;
      if (guide) {
        guide.style.transform = `translateX(${s.aimX}px)`;
        guide.classList.toggle('is-waiting', !ready);
      }
    },
    [reduced],
  );

  const moveAim = useCallback(
    (x: number) => {
      if (!startedRef.current) return;
      const next = setAim(stateRef.current, x);
      if (next === stateRef.current) return;
      stateRef.current = next;
      paint(next);
    },
    [paint],
  );

  const doDrop = useCallback(() => {
    if (!startedRef.current) return;
    const prev = stateRef.current;
    const next = drop(prev, defaultRng);
    if (next === prev) return;
    stateRef.current = next;
    sfx.tap(0);
    buddyRef.current?.poke();
    setBodies(bodyViews(next, bornAt.current, performance.now()));
    setHeld({ current: next.current, next: next.next });
    paint(next);
  }, [paint, sfx]);

  const addBurst = useCallback(
    (e: Extract<MergeEvent, { kind: 'merge' | 'vanish' }>) => {
      const id = ++burstId.current;
      const big = e.kind === 'vanish' || e.tier >= 5;
      const burst: Burst = {
        id,
        x: e.x,
        y: e.y,
        r: radiusOf(e.kind === 'vanish' ? MAX_TIER : e.tier),
        color: characterOf(e.kind === 'vanish' ? MAX_TIER : e.tier).color,
        text: e.kind === 'vanish' ? `+${e.points} 대단해요!` : `+${e.points}`,
        big,
      };
      setBursts((list) => [...list.slice(-6), burst]);
      window.setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), reduced ? 500 : 800);
    },
    [reduced],
  );

  // 키보드: ←/→ 조준, Space/Enter 떨어뜨리기. 다른 버튼에 포커스가 있으면 그 버튼에 맡긴다.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (!e.repeat) moveAim(stateRef.current.aimX + dir * AIM_NUDGE);
        holdDirRef.current.key = dir;
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const target = e.target as Element | null;
      if (target && target !== dropBtnRef.current && target.closest('button, a, input, select, textarea')) return;
      e.preventDefault();
      if (e.repeat) return;
      doDrop();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') holdDirRef.current.key = 0;
    };
    const onBlur = () => {
      holdDirRef.current = { key: 0, button: 0 };
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [doDrop, moveAim]);

  // 게임 루프
  useEffect(() => {
    if (!started) return;
    dropBtnRef.current?.focus({ preventScroll: true });
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const frame = (t: number) => {
      const dt = Math.min(CONFIG.maxDtMs, Math.max(0, t - last));
      last = t;

      const hold = holdDirRef.current.key || holdDirRef.current.button;
      if (hold !== 0) {
        const aimed = setAim(stateRef.current, stateRef.current.aimX + (hold * AIM_SPEED * dt) / 1000);
        stateRef.current = aimed;
      }

      const prev = stateRef.current;
      const { state: s, events } = step(prev, dt);
      stateRef.current = s;

      if (events.length > 0) {
        let changed = false;
        for (const e of events) {
          if (e.kind === 'merge') {
            bornAt.current.set(e.id, t);
            changed = true;
            addBurst(e);
          } else if (e.kind === 'vanish') {
            changed = true;
            addBurst(e);
          } else if (e.kind === 'land' && !reduced) {
            const el = squashEls.current.get(e.id);
            const amount = Math.min(1, e.speed / 900);
            el?.animate(
              [
                { transform: 'scale(1, 1)' },
                { transform: `scale(${1 + 0.16 * amount + 0.04}, ${1 - 0.2 * amount - 0.04})` },
                { transform: `scale(${1 - 0.05 * amount}, ${1 + 0.06 * amount})` },
                { transform: 'scale(1, 1)' },
              ],
              { duration: 320, easing: 'ease-out' },
            );
          }
        }
        if (changed) {
          setBodies(bodyViews(s, bornAt.current, t));
          playMergeSound(sfx, events);
          // 파트너 반응: 큰 말랑이가 태어날수록 신난다
          let top = -1;
          let vanished = false;
          for (const e of events) {
            if (e.kind === 'merge') top = Math.max(top, e.tier);
            if (e.kind === 'vanish') vanished = true;
          }
          if (vanished || top >= 6) buddyRef.current?.react('wow', 1000);
          else if (top >= 3) buddyRef.current?.react('happy', 600);
        }
      }

      paint(s);

      // 넘칠 것 같으면 파트너가 식은땀
      const danger = s.dangerMs > 0;
      if (danger !== dangerRef.current) {
        dangerRef.current = danger;
        buddyRef.current?.setBase(danger ? 'oops' : 'idle');
      }

      hudAcc += dt;
      if (hudAcc > 100 || s.finished) {
        hudAcc = 0;
        setHud({
          score: s.score,
          timeLeft: Math.max(0, (CONFIG.durationMs - s.elapsedMs) / 1000),
          maxTier: s.maxTier,
          danger: s.dangerMs > 0,
        });
      }

      if (s.finished) {
        if (s.endReason === 'overflow') sfx.fail();
        else sfx.success();
        buddyRef.current?.setBase(s.endReason === 'overflow' ? 'sad' : 'happy');
        setEnded(s.endReason ?? 'time');
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, addBurst, paint, reduced, sfx]);

  // 새로 그려진 말랑이도 바로 제자리에
  useEffect(() => {
    paint(stateRef.current);
  }, [bodies, held, paint]);

  // 종료 처리: onFinish는 한 번만
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(
      () => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const s = stateRef.current;
        onFinish({ score: s.score, stats: { 합치기: s.merges, 최고단계: s.maxTier + 1, 떨어뜨림: s.drops } });
      },
      reduced ? 300 : 1300,
    );
    return () => window.clearTimeout(id);
  }, [ended, onFinish, reduced]);

  // ── 포인터: 병 안에서 끌어서 조준, 떼면 떨어뜨리기 ──
  const worldX = (clientX: number) => {
    const rect = jarRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return stateRef.current.aimX;
    return ((clientX - rect.left) / rect.width) * WORLD.width;
  };

  const onJarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveAim(worldX(e.clientX));
  };
  const onJarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 마우스는 누르지 않아도 따라가고, 터치는 누른 채 끌 때만
    if (draggingRef.current === e.pointerId || e.pointerType === 'mouse') moveAim(worldX(e.clientX));
  };
  const onJarUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== e.pointerId) return;
    draggingRef.current = null;
    moveAim(worldX(e.clientX));
    doDrop();
  };
  const onJarCancel = () => {
    draggingRef.current = null;
  };

  // ── 화살표 버튼: 누르고 있으면 계속 움직이고, 키보드로 누르면 한 칸 ──
  const arrowHandlers = (dir: -1 | 1) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      moveAim(stateRef.current.aimX + dir * AIM_NUDGE);
      holdDirRef.current.button = dir;
    },
    onPointerUp: () => {
      holdDirRef.current.button = 0;
    },
    onPointerLeave: () => {
      holdDirRef.current.button = 0;
    },
    onPointerCancel: () => {
      holdDirRef.current.button = 0;
    },
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
      // detail 0 = 키보드(Enter/Space)로 누름. 포인터는 위에서 처리했다.
      if (e.detail === 0) moveAim(stateRef.current.aimX + dir * AIM_NUDGE);
    },
  });

  const onDropBtnPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    doDrop();
  };

  const nextCharacter = characterOf(held.next);

  return (
    <div className={`mm${reduced ? ' mm--reduced' : ''}`}>
      <GameHud timeLeft={hud.timeLeft} totalTime={CONFIG.durationMs / 1000} score={hud.score} onExit={onExit} />

      <div className="mm__bar">
        <ol className="mm__ladder" aria-label={`만든 가장 큰 말랑이: ${characterOf(hud.maxTier).name}`}>
          {TIER_CHARACTERS.map((c, tier) => (
            <li key={c.id} className={`mm__rung${tier <= hud.maxTier ? ' is-reached' : ''}`}>
              <Malang
                character={c}
                size={14 + tier * 2.2}
                animation="none"
                silhouette={tier > hud.maxTier}
                decorative
              />
            </li>
          ))}
        </ol>
        <div className="mm__next" aria-label={`다음 말랑이: ${nextCharacter.name}`}>
          {/* 파트너가 다음 말랑이 방울을 들고 기다린다 */}
          <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={46} className="mm__buddy" />
          <span className="mm__next-bubble" aria-hidden="true">
            <Malang character={nextCharacter} size={34} animation="none" decorative />
            <span className="mm__next-label">다음</span>
          </span>
        </div>
      </div>

      <div
        ref={jarRef}
        className={`mm__jar${hud.danger && playing ? ' is-danger' : ''}`}
        role="img"
        aria-label="말랑 합치기 병. 끌어서 위치를 정하고 손을 떼면 떨어져요. 화살표 키로 옮기고 Space나 Enter로 떨어뜨려요."
        onPointerDown={onJarDown}
        onPointerMove={onJarMove}
        onPointerUp={onJarUp}
        onPointerCancel={onJarCancel}
      >
        <div ref={worldRef} className="mm__world" style={{ width: WORLD.width, height: WORLD.height }}>
          <div className="mm__danger" style={{ top: CONFIG.dangerY }} aria-hidden="true" />
          <div ref={guideRef} className="mm__guide" style={{ top: CONFIG.dropY }} aria-hidden="true" />
          {ended === null && (
            <div ref={heldRef} className="mm__held" aria-hidden="true">
              <Malang character={characterOf(held.current)} size={spriteSize(held.current)} animation="none" decorative />
            </div>
          )}
          {bodies.map((b) => {
            const size = spriteSize(b.tier);
            return (
              <div
                key={b.id}
                className="mm__body"
                style={{ width: size, height: size }}
                ref={(el) => {
                  if (el) bodyEls.current.set(b.id, el);
                  else bodyEls.current.delete(b.id);
                }}
                aria-hidden="true"
              >
                <div
                  className={`mm__squash${b.born ? ' is-born' : ''}`}
                  ref={(el) => {
                    if (el) squashEls.current.set(b.id, el);
                    else squashEls.current.delete(b.id);
                  }}
                >
                  <Malang character={characterOf(b.tier)} size={size} animation="none" decorative />
                </div>
              </div>
            );
          })}
          {bursts.map((b) => (
            <div
              key={b.id}
              className={`mm__burst${b.big ? ' is-big' : ''}`}
              style={{ left: b.x, top: b.y, width: b.r * 2, height: b.r * 2, color: b.color }}
              aria-hidden="true"
            >
              <span className="mm__ring" />
              <span className="mm__points">{b.text}</span>
            </div>
          ))}
        </div>
        <Countdown count={count} />
        {ended && (
          <div className="countdown" role="status">
            <span>{ended === 'overflow' ? '넘쳤어요!' : '끝!'}</span>
          </div>
        )}
      </div>

      <div className="mm__controls">
        <button
          type="button"
          className="btn mm__arrow"
          aria-label="왼쪽으로 옮기기"
          disabled={!playing}
          {...arrowHandlers(-1)}
        >
          <ArrowGlyph dir={-1} />
        </button>
        <button
          ref={dropBtnRef}
          type="button"
          className="btn btn--primary mm__drop"
          disabled={!playing}
          onPointerDown={onDropBtnPointer}
          // 포인터와 키보드는 위 핸들러가 처리하므로 click은 무시 (중복 방지)
          onClick={(e) => e.preventDefault()}
        >
          떨어뜨리기
        </button>
        <button
          type="button"
          className="btn mm__arrow"
          aria-label="오른쪽으로 옮기기"
          disabled={!playing}
          {...arrowHandlers(1)}
        >
          <ArrowGlyph dir={1} />
        </button>
      </div>
    </div>
  );
}

function ArrowGlyph({ dir }: { dir: -1 | 1 }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={dir < 0 ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}
        fill="none"
        stroke={INK}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 로비 아이콘: 병 속 작은 말랑이 둘 위로 큰 말랑이가 쏙 */
function MalangMergeIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M9 12 V38 Q9 44 15 44 H33 Q39 44 39 38 V12"
        fill="#e8f6ff"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 21 H35" stroke="#ff7aa2" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      <circle cx="17" cy="37" r="5" fill="#ffb8c9" stroke={INK} strokeWidth="2.5" />
      <circle cx="31" cy="37" r="5" fill="#ffb8c9" stroke={INK} strokeWidth="2.5" />
      <circle cx="24" cy="29" r="7.5" fill="#b9e2a0" stroke={INK} strokeWidth="2.5" />
      <circle cx="21.5" cy="28.5" r="1.2" fill={INK} />
      <circle cx="26.5" cy="28.5" r="1.2" fill={INK} />
      <path d="M22.5 31.5 q1.5 1.2 3 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M24 4 v7 M20.5 8 l3.5 3.5 l3.5 -3.5" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const malangMerge: MiniGame = {
  id: 'malang-merge',
  name: '말랑 합치기',
  description: '같은 말랑이끼리 닿으면 더 큰 말랑이가 돼요. 병이 넘치지 않게 합쳐 보세요.',
  controls: '끌어서 위치를 정하고 손을 떼기, 화살표 키와 Space 또는 Enter',
  icon: MalangMergeIcon,
  Component: MalangMergeGame,
};

export default malangMerge;
