import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Character } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { darken, isDark, lighten } from '../../lib/color';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import { STACK_CONFIG as CONFIG, WORLD, createStackState, drop, step, type Block, type StackState } from './logic';
import './Stack.css';

const INK = '#2b2233';
/** 바닥 블록(파트너 색) 위로 순환하는 파스텔 젤리 색 */
const JELLY_COLORS = ['#ff8fab', '#8ecdf7', '#ffd966', '#7fd8be', '#c3a6ff', '#ffb38a'];
const H = CONFIG.blockHeight;
/** 카메라가 0일 때 바닥 블록의 아랫변 y */
const GROUND_Y = WORLD.height - 56;
/** 슬라이더 윗변이 이 y보다 위로 올라가면 카메라가 따라 올라간다 */
const CAMERA_LINE = 150;

interface FallingPiece extends Block {
  y: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  age: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

interface Fx {
  camera: number;
  pieces: FallingPiece[];
  popups: Popup[];
  /** 방금 놓은 블록 출렁임 (0~1) */
  wobble: number;
}

function colorForFloor(index: number, partner: Character): string {
  if (index <= 0) return partner.color;
  return JELLY_COLORS[(index - 1) % JELLY_COLORS.length] ?? JELLY_COLORS[0]!;
}

/** 탑 인덱스 i 블록의 윗변 y (카메라 적용 전) */
const floorTop = (i: number) => GROUND_Y - (i + 1) * H;

/**
 * 파트너 말랑이는 움직이는 블록 위에 올라타 함께 좌우로 오간다 (월드 단위).
 * 몸통 폭 약 40, 몸통 아랫변(viewBox y=108)이 블록 윗변보다 살짝 아래로 파묻힌다.
 */
const SPRITE_WORLD = 64;
const SPRITE_FOOT = 52;

function cameraTarget(state: StackState): number {
  return Math.max(0, CAMERA_LINE - floorTop(state.tower.length));
}

// ── 렌더링 ────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawJelly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
  opts: { face?: boolean; squash?: number; happy?: boolean } = {},
) {
  const squash = opts.squash ?? 0;
  ctx.save();
  // 아랫변 중심 기준으로 말랑하게 눌림
  ctx.translate(x + w / 2, y + H);
  ctx.scale(1 + squash * 0.06, 1 - squash * 0.14);
  const left = -w / 2;
  const top = -H;
  const grad = ctx.createLinearGradient(0, top, 0, 0);
  grad.addColorStop(0, lighten(color, 0.45));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, darken(color, 0.15));
  roundRect(ctx, left, top, w, H, 9);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 하이라이트
  if (w > 18) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    roundRect(ctx, left + 6, top + 4, Math.min(w * 0.35, 40), 4, 2);
    ctx.fill();
  }
  // 얼굴
  if (opts.face !== false && w >= 26) {
    const feature = isDark(color) ? '#fff6e6' : INK;
    const gap = Math.min(12, w * 0.2);
    ctx.fillStyle = feature;
    ctx.strokeStyle = feature;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (opts.happy) {
      for (const ex of [-gap, gap]) {
        ctx.beginPath();
        ctx.arc(ex, top + 13, 3, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else {
      for (const ex of [-gap, gap]) {
        ctx.beginPath();
        ctx.arc(ex, top + 12, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (w >= 44) {
      ctx.fillStyle = 'rgba(255,111,145,0.45)';
      ctx.beginPath();
      ctx.ellipse(-gap - 7, top + 16, 3.5, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(gap + 7, top + 16, 3.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, state: StackState, partner: Character, fx: Fx) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  ctx.translate(0, fx.camera);

  // 선반 바닥
  ctx.fillStyle = '#e9c99a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fillRect(-4, GROUND_Y, WORLD.width + 8, WORLD.height);
  ctx.beginPath();
  ctx.moveTo(-4, GROUND_Y);
  ctx.lineTo(WORLD.width + 4, GROUND_Y);
  ctx.stroke();

  // 탑 (화면에 보이는 층만)
  const topIndex = state.tower.length - 1;
  state.tower.forEach((b, i) => {
    const y = floorTop(i);
    if (y + fx.camera > WORLD.height + H || y + fx.camera < -H * 2) return;
    const isTop = i === topIndex;
    drawJelly(ctx, b.x, y, b.w, colorForFloor(i, partner), {
      face: isTop || i === 0,
      squash: isTop ? fx.wobble : 0,
      happy: isTop && state.perfectStreak > 0,
    });
  });

  // 움직이는 블록
  if (!state.finished) {
    const i = state.tower.length;
    drawJelly(ctx, state.slider.x, floorTop(i), state.slider.w, colorForFloor(i, partner));
  }

  // 잘려서 떨어지는 조각
  for (const p of fx.pieces) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.age / 1200);
    ctx.translate(p.x + p.w / 2, p.y + H / 2);
    ctx.rotate(p.rot);
    drawJelly(ctx, -p.w / 2, -H / 2, p.w, p.color, { face: false });
    ctx.restore();
  }

  // 점수 팝업
  ctx.textAlign = 'center';
  ctx.font = '20px "Jua", "NanumSquareRound", "Pretendard Variable", sans-serif';
  ctx.lineJoin = 'round';
  for (const p of fx.popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 800);
    const py = p.y - p.age * 0.04;
    ctx.strokeStyle = '#fffcf5';
    ctx.lineWidth = 5;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function StackGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropBtnRef = useRef<HTMLButtonElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  /** CSS px / 월드 단위 */
  const scaleRef = useRef(1);
  const [spritePx, setSpritePx] = useState(56);
  const stateRef = useRef<StackState>(createStackState());
  const fxRef = useRef<Fx>({ camera: 0, pieces: [], popups: [], wobble: 0 });
  const startedRef = useRef(false);
  const reportedRef = useRef(false);
  const [hud, setHud] = useState({
    score: 0,
    timeLeft: CONFIG.durationMs / 1000,
    floors: 0,
    streak: 0,
  });
  const [ended, setEnded] = useState<StackState['endReason']>(null);

  startedRef.current = started;

  const syncHud = useCallback((s: StackState) => {
    setHud({
      score: s.score,
      timeLeft: Math.max(0, (CONFIG.durationMs - s.elapsedMs) / 1000),
      floors: s.floors,
      streak: s.perfectStreak,
    });
  }, []);

  /** 말랑이를 움직이는 블록 위로 (끝나면 탑 꼭대기 블록 위로). 리렌더 없이 transform만 바꾼다. */
  const placeSprite = (s: StackState, fx: Fx) => {
    const el = spriteRef.current;
    if (!el) return;
    const k = scaleRef.current;
    const size = SPRITE_WORLD * k;
    const top = s.tower[s.tower.length - 1];
    const ride = s.finished ? top : s.slider;
    if (!ride) return;
    const floor = s.finished ? s.tower.length - 1 : s.tower.length;
    const footY = floorTop(floor) + 3 + fx.camera;
    const cx = ride.x + ride.w / 2;
    el.style.transform = `translate(${(cx * k - size / 2).toFixed(1)}px, ${((footY - SPRITE_FOOT) * k).toFixed(1)}px)`;
  };

  // 캔버스 해상도: 논리 월드를 devicePixelRatio에 맞춰 선명하게
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.clientWidth <= 0) return;
      scaleRef.current = canvas.clientWidth / WORLD.width;
      setSpritePx(Math.round(SPRITE_WORLD * scaleRef.current));
      placeSprite(stateRef.current, fxRef.current);
      const scale = (canvas.clientWidth / WORLD.width) * dpr;
      if (scale <= 0) return;
      canvas.width = Math.round(WORLD.width * scale);
      canvas.height = Math.round(WORLD.height * scale);
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(scale, 0, 0, scale, 0, 0);
      if (ctx) drawScene(ctx, stateRef.current, partner, fxRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [partner]);

  // 내려놓기 (포인터/키보드 공용)
  const doDrop = useCallback(() => {
    if (!startedRef.current) return;
    const prev = stateRef.current;
    if (prev.finished) return;
    const { state, result } = drop(prev);
    if (result.kind === 'ignored') return;
    stateRef.current = state;
    const fx = fxRef.current;
    const floor = prev.tower.length; // 이번 블록의 탑 인덱스
    const y = floorTop(floor);
    const color = colorForFloor(floor, partner);
    const spin = (dir: number) => (reduced ? 0 : dir * (2 + Math.random() * 2));

    if (result.kind === 'miss') {
      fx.pieces.push({ ...result.lost, y, vy: 0, rot: 0, vr: spin(result.lost.x < WORLD.width / 2 ? -1 : 1), color, age: 0 });
      sfx.fail();
      buddyRef.current?.setBase('sad');
      buddyRef.current?.react('oops', 600);
      setEnded('miss');
    } else {
      sfx.tap(Math.min(12, Math.floor(state.floors / 3)));
      fx.wobble = reduced ? 0 : 1;
      const cx = result.placed.x + result.placed.w / 2;
      buddyRef.current?.react(result.kind === 'perfect' ? 'wow' : 'happy', result.kind === 'perfect' ? 700 : 400);
      if (result.kind === 'perfect') {
        sfx.pickup();
        fx.popups.push({ x: cx, y: y - 6, text: result.grew ? '딱 맞음! 넓어졌어요' : '딱 맞음!', color: '#e84d74', age: 0 });
      } else {
        const dir = result.cut.x > result.placed.x ? 1 : -1;
        fx.pieces.push({ ...result.cut, y, vy: 0, rot: 0, vr: spin(dir), color, age: 0 });
        fx.popups.push({ x: cx, y: y - 6, text: `+${result.points}`, color: INK, age: 0 });
      }
    }
    syncHud(state);
  }, [partner, reduced, sfx, syncHud]);

  // 키보드: Space / Enter (자동 반복 무시). 다른 버튼에 포커스가 있으면 그 버튼에 맡긴다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const target = e.target as Element | null;
      if (target && target !== dropBtnRef.current && target.closest('button, a, input, select, textarea')) return;
      e.preventDefault();
      if (e.repeat) return;
      doDrop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doDrop]);

  // 게임 루프 (종료 후에도 떨어지는 조각 연출을 위해 렌더는 계속)
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    dropBtnRef.current?.focus({ preventScroll: true });
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const frame = (t: number) => {
      const dt = Math.min(50, Math.max(0, t - last));
      last = t;
      const prev = stateRef.current;
      const s = step(prev, dt);
      stateRef.current = s;
      if (s.finished && !prev.finished && s.endReason === 'time') {
        sfx.success();
        buddyRef.current?.setBase('happy');
        setEnded('time');
      }

      const fx = fxRef.current;
      const target = cameraTarget(s);
      fx.camera = reduced ? target : fx.camera + (target - fx.camera) * Math.min(1, dt / 140);
      fx.wobble = Math.max(0, fx.wobble - dt / 220);
      fx.pieces = fx.pieces
        .map((p) => ({ ...p, age: p.age + dt, vy: p.vy + 1400 * (dt / 1000), y: p.y + (p.vy * dt) / 1000, rot: p.rot + (p.vr * dt) / 1000 }))
        .filter((p) => p.age < 1200);
      fx.popups = fx.popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 800);
      drawScene(ctx, s, partner, fx);
      placeSprite(s, fx);

      hudAcc += dt;
      if (!s.finished && hudAcc > 100) {
        hudAcc = 0;
        syncHud(s);
      } else if (s.finished && !prev.finished) {
        syncHud(s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, partner, reduced, sfx, syncHud]);

  // 종료 처리: onFinish는 한 번만
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(
      () => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const s = stateRef.current;
        onFinish({ score: s.score, stats: { 층수: s.floors, '딱 맞음': s.perfects, '최대 연속': s.maxPerfectStreak } });
      },
      reduced ? 250 : 1100,
    );
    return () => window.clearTimeout(id);
  }, [ended, onFinish, reduced]);

  const onCanvasPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    doDrop();
  };

  const onDropBtnPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    doDrop();
  };

  return (
    <div className="st">
      <GameHud timeLeft={hud.timeLeft} totalTime={CONFIG.durationMs / 1000} score={hud.score} onExit={onExit} />
      <p className="st__info small" aria-live="off">
        <span className="st__floors">{hud.floors}층</span>
        {hud.streak >= 2 ? (
          <span className="st__streak">딱 맞음 {hud.streak}연속!</span>
        ) : (
          <span className="muted">아래 블록에 딱 맞춰 내려놓아요</span>
        )}
      </p>
      <div className="st__stage">
        <div ref={spriteRef} className="st__partner" style={{ width: spritePx, height: spritePx }}>
          <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={spritePx} animation="none" />
        </div>
        <canvas
          ref={canvasRef}
          className="st__canvas"
          role="img"
          aria-label="말랑 쌓기 게임 화면. 화면을 누르거나 Space, Enter 키로 블록을 내려놓으세요."
          onPointerDown={onCanvasPointer}
        />
        <Countdown count={count} />
        {ended && (
          <div className="countdown" role="status">
            <span>{ended === 'miss' ? '앗!' : '끝!'}</span>
          </div>
        )}
      </div>
      <button
        ref={dropBtnRef}
        type="button"
        className="btn btn--primary st__drop"
        disabled={!started || ended !== null}
        onPointerDown={onDropBtnPointer}
        // 포인터와 키보드는 위 핸들러가 처리하므로 click은 무시 (중복 방지)
        onClick={(e) => e.preventDefault()}
      >
        내려놓기
      </button>
    </div>
  );
}

function StackIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="34" width="32" height="9" rx="4" fill="#ffb8c9" stroke="#2b2233" strokeWidth="3" />
      <rect x="11" y="24" width="26" height="9" rx="4" fill="#8ecdf7" stroke="#2b2233" strokeWidth="3" />
      <rect x="14" y="14" width="22" height="9" rx="4" fill="#ffd966" stroke="#2b2233" strokeWidth="3" />
      <circle cx="21" cy="18.5" r="1.6" fill="#2b2233" />
      <circle cx="29" cy="18.5" r="1.6" fill="#2b2233" />
      <path d="M24 4 v6 M20 7 l4 4 l4 -4" stroke="#2b2233" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const stack: MiniGame = {
  id: 'stack',
  name: '말랑 쌓기',
  description: '움직이는 젤리 블록을 딱 맞게 내려놓아 높이 쌓아요.',
  controls: '화면 터치, 클릭, Space 또는 Enter',
  durationMs: CONFIG.durationMs,
  blurb: '딱 맞춰 쌓기',
  tags: ['focus', 'record'],
  icon: StackIcon,
  Component: StackGame,
};

export default stack;
