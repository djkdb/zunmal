import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Sfx } from '../../audio/sfx';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { lighten } from '../../lib/color';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import type { PartnerMood } from '../shared/partner';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  MALANG_JUMP_CONFIG as CONFIG,
  WORLD,
  createJumpState,
  stepJump,
  type Candy,
  type JumpEvent,
  type JumpState,
  type Platform,
} from './logic';
import './MalangJump.css';
import { ArrowIcon } from '../shared/ArrowIcon';

const INK = '#2b2233';
const PAPER = '#fffcf5';
const PLATFORM_COLORS: Record<Platform['kind'], string> = {
  normal: '#8fd9a8',
  moving: '#8ecdf7',
  crumble: '#f2c48d',
  spring: '#8fd9a8',
};
const CANDY_COLORS = ['#ff8fab', '#ffd966', '#c3a6ff', '#7fd8be'];

function playJump(sfx: Sfx) {
  sfx.jump();
}

interface Popup {
  x: number;
  /** 월드 높이 */
  y: number;
  text: string;
  age: number;
}

// ── 렌더링 (순수 그리기 함수) ───────────────────────────────

/** 월드 높이 → 캔버스 y */
const toScreenY = (y: number, cameraY: number) => WORLD.height - (y - cameraY);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, cameraY: number) {
  const w = CONFIG.platformWidth;
  const h = CONFIG.platformHeight;
  const sy = toScreenY(p.y, cameraY);
  ctx.save();
  ctx.translate(p.x, sy);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  const color = PLATFORM_COLORS[p.kind];

  if (p.broken) {
    // 두 조각으로 갈라져 떨어진다
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate((side * w) / 4, 0);
      ctx.rotate(side * 0.35);
      ctx.fillStyle = color;
      roundRect(ctx, -w / 4, 0, w / 2 - 2, h, 5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, 0, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  // 젤리 광택
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  roundRect(ctx, -w / 2 + 7, 3, w * 0.35, 3, 1.5);
  ctx.fill();

  if (p.kind === 'crumble') {
    // 색 이외의 구분: 금 간 선
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(2, h * 0.5);
    ctx.lineTo(-2, h - 1);
    ctx.moveTo(w * 0.28, 1);
    ctx.lineTo(w * 0.22, h * 0.6);
    ctx.stroke();
  } else if (p.kind === 'moving') {
    // 색 이외의 구분: 양쪽 화살표
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * (w / 2 - 4), h / 2);
      ctx.lineTo(side * (w / 2 - 10), h / 2 - 4);
      ctx.lineTo(side * (w / 2 - 10), h / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }
  } else if (p.kind === 'spring') {
    // 발판 위 스프링
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    for (let i = 0; i < 4; i++) ctx.lineTo(i % 2 === 0 ? 7 : -7, -4 - i * 4);
    ctx.stroke();
    ctx.fillStyle = '#ffd966';
    ctx.lineWidth = 3;
    roundRect(ctx, -12, -22, 24, 7, 3.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawCandy(ctx: CanvasRenderingContext2D, c: Candy, cameraY: number, t: number) {
  const r = CONFIG.candyRadius * 0.75;
  const sy = toScreenY(c.y, cameraY) + Math.sin(t / 300 + c.id) * 2;
  ctx.save();
  ctx.translate(c.x, sy);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const color = CANDY_COLORS[c.hue] ?? CANDY_COLORS[0]!;
  ctx.fillStyle = lighten(color, 0.3);
  // 포장지 양 끝
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.8, 0);
    ctx.lineTo(side * r * 1.9, -r * 0.7);
    ctx.lineTo(side * r * 1.9, r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 파트너 말랑이 스프라이트 (월드 단위). 몸통 폭이 약 44가 되게 그리고,
 * 몸통 아랫변(viewBox y=108)이 발 위치에 오도록 위로 올린다.
 */
const SPRITE_WORLD = 71;
const SPRITE_FOOT = 60;

function drawScene(ctx: CanvasRenderingContext2D, s: JumpState, popups: Popup[]) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  // 높이 눈금: 100점마다 점선 + 숫자
  const step = CONFIG.heightPerPoint * 100;
  ctx.save();
  ctx.strokeStyle = 'rgba(43,34,51,0.14)';
  ctx.fillStyle = 'rgba(43,34,51,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.font = '14px "Cafe24 Ssurround", Jua, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const first = Math.ceil(s.cameraY / step) * step;
  for (let h = first; h < s.cameraY + WORLD.height + step; h += step) {
    if (h <= 0) continue;
    const sy = toScreenY(h + 40, s.cameraY);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD.width, sy);
    ctx.stroke();
    ctx.fillText(`${h / CONFIG.heightPerPoint}`, WORLD.width - 6, sy - 3);
  }
  ctx.restore();

  for (const p of s.platforms) drawPlatform(ctx, p, s.cameraY);
  for (const c of s.candies) drawCandy(ctx, c, s.cameraY, s.elapsedMs);

  // 말랑이는 캔버스 위 DOM(SVG) 스프라이트로 그린다 (placeSprites)

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '18px "Cafe24 Ssurround", Jua, sans-serif';
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 700);
    ctx.fillStyle = '#e0457b';
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4;
    const py = toScreenY(p.y, s.cameraY) - p.age * 0.04;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function MalangJumpGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** [본체, 화면 반대편 끝에 걸친 복사본] */
  const spriteRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const buddyRefs = useRef<(PartnerBuddyHandle | null)[]>([null, null]);
  /** CSS px / 월드 단위 */
  const scaleRef = useRef(1);
  const [spritePx, setSpritePx] = useState(60);
  const stateRef = useRef<JumpState | null>(null);
  if (stateRef.current === null) stateRef.current = createJumpState(defaultRng);
  /** 입력 원천: 키보드 좌/우, 캔버스 터치(포인터별 방향), 화면 버튼 */
  const keysRef = useRef({ left: false, right: false });
  const pointersRef = useRef(new Map<number, -1 | 1>());
  const [hud, setHud] = useState({ score: 0, timeLeft: CONFIG.durationMs / 1000, height: 0 });
  const [finished, setFinished] = useState<null | 'fall' | 'time'>(null);
  const reportedRef = useRef(false);

  const currentDirection = (): -1 | 0 | 1 => {
    let d = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
    for (const v of pointersRef.current.values()) d += v;
    return d === 0 ? 0 : d < 0 ? -1 : 1;
  };

  const react = (mood: PartnerMood, ms?: number) => {
    for (const b of buddyRefs.current) b?.react(mood, ms, false);
  };
  const setBase = (mood: PartnerMood) => {
    for (const b of buddyRefs.current) b?.setBase(mood);
  };

  /** 말랑이 스프라이트를 발 위치로 (좌우 끝에 걸치면 반대편에도). 리렌더 없이 transform만 바꾼다. */
  const placeSprites = (s: JumpState, squash: number) => {
    const k = scaleRef.current;
    const size = SPRITE_WORLD * k;
    // 착지 직후 납작, 빠르게 오를 때 살짝 길쭉
    const stretch = Math.max(-0.12, Math.min(0.12, s.vy / 6000));
    const sx = 1 + squash * 0.25 - stretch * 0.5;
    const sy = 1 - squash * 0.25 + stretch;
    const tilt = s.facing * Math.min(8, Math.abs(s.vy) / 200);
    const top = (toScreenY(s.y, s.cameraY) - SPRITE_FOOT) * k;
    const edge = SPRITE_WORLD / 2;
    const mirrorX = s.x < edge ? s.x + WORLD.width : s.x > WORLD.width - edge ? s.x - WORLD.width : null;
    const xs = [s.x, mirrorX];
    for (let i = 0; i < xs.length; i++) {
      const el = spriteRefs.current[i];
      const x = xs[i];
      if (!el) continue;
      if (x === null || x === undefined) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${(x * k - size / 2).toFixed(1)}px, ${top.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    }
  };

  // 캔버스 해상도: 논리 월드를 devicePixelRatio에 맞춰 선명하게
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      if (cssW <= 0) return;
      scaleRef.current = cssW / WORLD.width;
      setSpritePx(Math.round(SPRITE_WORLD * scaleRef.current));
      if (stateRef.current) placeSprites(stateRef.current, 0);
      const scale = (cssW / WORLD.width) * dpr;
      canvas.width = Math.round(WORLD.width * scale);
      canvas.height = Math.round(WORLD.height * scale);
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(scale, 0, 0, scale, 0, 0);
      if (ctx && stateRef.current) drawScene(ctx, stateRef.current, []);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [partner]);

  // 키보드 입력
  useEffect(() => {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keysRef.current.left = down;
      else if (k === 'arrowright' || k === 'd') keysRef.current.right = down;
      else return;
      e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const reset = () => {
      keysRef.current = { left: false, right: false };
      pointersRef.current.clear();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', reset);
    };
  }, []);

  // 게임 루프
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;
    let popups: Popup[] = [];
    let squash = 0;

    const handleEvents = (events: JumpEvent[]) => {
      for (const ev of events) {
        if (ev.type === 'bounce') {
          playJump(sfx);
          if (ev.kind === 'spring') {
            sfx.tap(8);
            react('wow', 700);
          }
          squash = 1;
        } else if (ev.type === 'candy') {
          sfx.pickup();
          react('happy', 500);
          popups.push({ x: ev.x, y: ev.y + 10, text: `+${ev.points}`, age: 0 });
        } else if (ev.type === 'fall') {
          sfx.fail();
          setBase('sad');
          if (!reduced) {
            wrapRef.current?.animate(
              [
                { transform: 'translateY(0)' },
                { transform: 'translateY(6px)' },
                { transform: 'translateY(-4px)' },
                { transform: 'translateY(2px)' },
                { transform: 'translateY(0)' },
              ],
              { duration: 280 },
            );
          }
        } else {
          sfx.success();
          setBase('happy');
        }
      }
    };

    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      const prev = stateRef.current ?? createJumpState(defaultRng);
      const out = stepJump(prev, dt, { direction: currentDirection() }, defaultRng);
      stateRef.current = out.state;
      handleEvents(out.events);
      popups = popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 700);
      squash = Math.max(0, squash - dt / 140);
      drawScene(ctx, out.state, reduced ? [] : popups);
      placeSprites(out.state, reduced ? 0 : squash);

      hudAcc += dt;
      if (hudAcc > 100 || out.state.finished) {
        hudAcc = 0;
        setHud({
          score: out.state.score,
          timeLeft: Math.max(0, (CONFIG.durationMs - out.state.elapsedMs) / 1000),
          height: Math.floor(out.state.maxHeight / CONFIG.heightPerPoint),
        });
      }
      if (out.state.finished) {
        setFinished(out.state.endReason ?? 'time');
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, partner, reduced, sfx]);

  // 종료 처리 (onFinish는 딱 한 번)
  useEffect(() => {
    if (!finished) return;
    const s = stateRef.current;
    if (!s) return;
    const id = window.setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onFinish({
        score: s.score,
        stats: {
          최고높이: Math.floor(s.maxHeight / CONFIG.heightPerPoint),
          사탕: s.candiesCollected,
          스프링: s.springs,
        },
      });
    }, reduced ? 200 : 900);
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced]);

  // 터치/마우스: 캔버스 왼쪽 절반 = 왼쪽, 오른쪽 절반 = 오른쪽 (누르고 있는 동안)
  const sideOf = (clientX: number): -1 | 1 => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return clientX - rect.left < rect.width / 2 ? -1 : 1;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, sideOf(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, sideOf(e.clientX));
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
  };

  // 화면 버튼 (접근성/대체 조작) — 포인터 id를 음수로 구분
  const holdButton = (dir: -1 | 1) => {
    const key = dir === -1 ? -1 : -2;
    const release = () => {
      pointersRef.current.delete(key);
    };
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        e.preventDefault();
        pointersRef.current.set(key, dir);
      },
      onPointerUp: release,
      onPointerLeave: release,
      onPointerCancel: release,
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          pointersRef.current.set(key, dir);
        }
      },
      onKeyUp: (e: ReactKeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') release();
      },
      onBlur: release,
    };
  };

  const statusText =
    finished === 'fall'
      ? '앗, 떨어졌어요!'
      : finished === 'time'
        ? '시간 끝!'
        : started
          ? `높이 ${hud.height.toLocaleString()}`
          : '발판을 밟고 위로 올라가요';

  return (
    <div className="mj">
      <GameHud
        timeLeft={hud.timeLeft}
        totalTime={CONFIG.durationMs / 1000}
        score={hud.score}
        onExit={onExit}
      />
      <p className="mj__status small" aria-live="off">
        {statusText}
      </p>
      <div ref={wrapRef} className="mj__stage">
        {[0, 1].map((i) => (
          <div
            key={i}
            ref={(el) => {
              spriteRefs.current[i] = el;
            }}
            className="mj__partner"
            style={{ width: spritePx, height: spritePx, visibility: i === 0 ? undefined : 'hidden' }}
          >
            <PartnerBuddy
              ref={(h) => {
                buddyRefs.current[i] = h;
              }}
              partner={partner}
              shiny={partnerShiny}
              size={spritePx}
              animation="none"
              emote={i === 0}
            />
          </div>
        ))}
        <canvas
          ref={canvasRef}
          className="mj__canvas"
          role="img"
          aria-label="말랑 점프 게임 화면. 좌우 방향키 또는 A, D 키로 움직이세요."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onContextMenu={(e) => e.preventDefault()}
        />
        <Countdown count={count} />
        {finished && (
          <div className="countdown" role="status">
            <span>{finished === 'fall' ? '앗!' : '끝!'}</span>
          </div>
        )}
      </div>
      <div className="mj__controls">
        <button type="button" className="btn mj__move" aria-label="왼쪽으로 이동 (누르고 있기)" {...holdButton(-1)}>
          <ArrowIcon dir="left" />
        </button>
        <p className="small muted mj__help">화면 좌우를 눌러 움직여요</p>
        <button type="button" className="btn mj__move" aria-label="오른쪽으로 이동 (누르고 있기)" {...holdButton(1)}>
          <ArrowIcon dir="right" />
        </button>
      </div>
    </div>
  );
}

function MalangJumpIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="38" width="32" height="6" rx="3" fill="#8fd9a8" stroke="#2b2233" strokeWidth="3" />
      <path
        d="M12 31 C10 17 17 8 24 8 C31 8 38 17 36 31 Q24 34 12 31 Z"
        fill="#ffb8c9"
        stroke="#2b2233"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="2" fill="#2b2233" />
      <circle cx="28" cy="20" r="2" fill="#2b2233" />
      <path d="M21.5 25 q2.5 2.5 5 0" fill="none" stroke="#2b2233" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 35 v1.5 M24 35.5 v1.5 M30 35 v1.5" stroke="#2b2233" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const malangJump: MiniGame = {
  id: 'malang-jump',
  name: '말랑 점프',
  description: '발판을 밟고 통통 튀어 60초 동안 최대한 높이 올라가요.',
  controls: '화면 왼쪽/오른쪽 누르기, 방향키 또는 A/D, 화면 버튼',
  icon: MalangJumpIcon,
  Component: MalangJumpGame,
};

export default malangJump;
