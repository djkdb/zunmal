import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Character } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { darken, isDark, lighten } from '../../lib/color';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  CAPSULE_CATCH_CONFIG as CONFIG,
  WORLD,
  createCatchState,
  stepCatch,
  type CatchEvent,
  type CatchInput,
  type CatchState,
  type FallingItem,
} from './logic';
import './CapsuleCatch.css';

const INK = '#2b2233';
const CAPSULE_COLORS = ['#ff8fab', '#7fd8be', '#8ecdf7', '#c3a6ff', '#ffd966'];

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

// ── 렌더링 (순수 그리기 함수) ───────────────────────────────

function drawCapsule(ctx: CanvasRenderingContext2D, item: FallingItem, r: number) {
  const top = item.kind === 'gold' ? '#ffc94d' : (CAPSULE_COLORS[item.hue] ?? CAPSULE_COLORS[0]!);
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.y / 60);
  if (item.kind === 'gold') {
    ctx.shadowColor = 'rgba(255, 201, 77, 0.9)';
    ctx.shadowBlur = 12;
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#fffdf8';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.5, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (item.kind === 'gold') {
    // 색 이외의 구분: 별 표시
    ctx.fillStyle = INK;
    ctx.font = `${r}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, r * 0.45);
  }
  ctx.restore();
}

function drawBomb(ctx: CanvasRenderingContext2D, item: FallingItem, r: number, t: number) {
  ctx.save();
  ctx.translate(item.x, item.y);
  // 가시 (색 이외의 형태 구분)
  ctx.fillStyle = '#5e5266';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 === 0 ? r * 1.25 : r * 0.95;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a3040';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  // 화난 눈
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.2);
  ctx.lineTo(-r * 0.15, r * 0.05);
  ctx.moveTo(r * 0.5, -r * 0.2);
  ctx.lineTo(r * 0.15, r * 0.05);
  ctx.stroke();
  // 심지 불꽃
  ctx.fillStyle = Math.floor(t / 100) % 2 === 0 ? '#ffd966' : '#ff8a5c';
  ctx.beginPath();
  ctx.arc(r * 0.6, -r * 1.25, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, partner: Character, stunned: boolean, squash: number) {
  const w = CONFIG.playerWidth;
  const h = CONFIG.playerHeight;
  const y = CONFIG.playerY;
  ctx.save();
  ctx.translate(x, y + h / 2);
  ctx.scale(1 + squash * 0.15, 1 - squash * 0.2);
  ctx.translate(0, -h / 2);
  // 몸통 (말랑이 = 바구니)
  const grad = ctx.createRadialGradient(-w * 0.2, -h * 0.4, 2, 0, 0, w * 0.7);
  grad.addColorStop(0, lighten(partner.color, 0.5));
  grad.addColorStop(0.5, partner.color);
  grad.addColorStop(1, darken(partner.color, 0.2));
  ctx.fillStyle = grad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.35);
  ctx.bezierCurveTo(-w / 2, h * 0.7, w / 2, h * 0.7, w / 2, -h * 0.35);
  ctx.bezierCurveTo(w * 0.3, -h * 0.55, -w * 0.3, -h * 0.55, -w / 2, -h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 입구 (바구니 느낌)
  ctx.fillStyle = 'rgba(43,34,51,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.4, w * 0.4, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // 얼굴
  const featureColor = isDark(partner.color) ? '#fff6e6' : INK;
  ctx.fillStyle = featureColor;
  ctx.strokeStyle = featureColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  if (stunned) {
    for (const ex of [-12, 12]) {
      ctx.beginPath();
      ctx.moveTo(ex - 4, 0);
      ctx.lineTo(ex + 4, 8);
      ctx.moveTo(ex + 4, 0);
      ctx.lineTo(ex - 4, 8);
      ctx.stroke();
    }
  } else {
    for (const ex of [-12, 12]) {
      ctx.beginPath();
      ctx.arc(ex, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,122,156,0.5)';
  ctx.beginPath();
  ctx.ellipse(-21, 11, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(21, 11, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: CatchState,
  partner: Character,
  popups: Popup[],
  squash: number,
) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  // 바닥
  ctx.fillStyle = 'rgba(43,34,51,0.08)';
  ctx.fillRect(0, WORLD.height - 14, WORLD.width, 14);
  const r = CONFIG.itemRadius;
  for (const item of state.items) {
    if (item.kind === 'bomb') drawBomb(ctx, item, r, state.elapsedMs);
    else drawCapsule(ctx, item, r);
  }
  drawPlayer(ctx, state.playerX, partner, state.elapsedMs < state.stunnedUntilMs, squash);
  ctx.textAlign = 'center';
  ctx.font = '20px Jua, sans-serif';
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 700);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#fffdf8';
    ctx.lineWidth = 4;
    const py = p.y - p.age * 0.05;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function CapsuleCatchGame({ partner, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<CatchState>(createCatchState());
  const inputRef = useRef<CatchInput>({ direction: 0, targetX: null });
  const keysRef = useRef({ left: false, right: false });
  const [hud, setHud] = useState({ score: 0, timeLeft: CONFIG.durationMs / 1000, streak: 0 });
  const [finished, setFinished] = useState(false);

  // 캔버스 해상도: 논리 월드를 devicePixelRatio에 맞춰 선명하게
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const scale = (cssW / WORLD.width) * dpr;
      canvas.width = Math.round(WORLD.width * scale);
      canvas.height = Math.round(WORLD.height * scale);
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(scale, 0, 0, scale, 0, 0);
      if (ctx) drawScene(ctx, stateRef.current, partner, [], 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [partner]);

  // 키보드 입력
  useEffect(() => {
    const sync = () => {
      const { left, right } = keysRef.current;
      inputRef.current.direction = left === right ? 0 : left ? -1 : 1;
      if (left || right) inputRef.current.targetX = null;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keysRef.current.left = down;
      else if (k === 'arrowright' || k === 'd') keysRef.current.right = down;
      else return;
      e.preventDefault();
      sync();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
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

    const handleEvents = (events: CatchEvent[]) => {
      for (const ev of events) {
        if (ev.type === 'catch') {
          if (ev.kind === 'gold') sfx.coin();
          else sfx.pickup();
          squash = 1;
          popups.push({ x: ev.x, y: ev.y - 10, text: `+${ev.points}`, color: ev.kind === 'gold' ? '#e08a00' : '#ff5d8f', age: 0 });
        } else if (ev.type === 'bomb') {
          sfx.hit();
          if (!reduced) {
            wrapRef.current?.animate(
              [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(-3px)' },
                { transform: 'translateX(0)' },
              ],
              { duration: 260 },
            );
          }
          popups.push({ x: ev.x, y: ev.y - 10, text: `${ev.points}`, color: '#2b2233', age: 0 });
        }
      }
    };

    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      const out = stepCatch(stateRef.current, dt, inputRef.current, defaultRng);
      stateRef.current = out.state;
      handleEvents(out.events);
      popups = popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 700);
      squash = Math.max(0, squash - dt / 150);
      drawScene(ctx, out.state, partner, popups, reduced ? 0 : squash);

      hudAcc += dt;
      if (hudAcc > 100 || out.state.finished) {
        hudAcc = 0;
        setHud({
          score: out.state.score,
          timeLeft: Math.max(0, (CONFIG.durationMs - out.state.elapsedMs) / 1000),
          streak: out.state.streak,
        });
      }
      if (out.state.finished) {
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, partner, reduced, sfx]);

  // 종료 처리
  useEffect(() => {
    if (!finished) return;
    const s = stateRef.current;
    sfx.success();
    const id = window.setTimeout(
      () =>
        onFinish({
          score: s.score,
          stats: { 받은캡슐: s.caught, 황금캡슐: s.goldCaught, 폭탄: s.bombsHit, 최대연속: s.maxStreak },
        }),
      reduced ? 200 : 900,
    );
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  // 터치/마우스: 누른 위치로 따라가기
  const toWorldX = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return ((clientX - rect.left) / rect.width) * WORLD.width;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // 손가락이 캔버스 밖으로 나가도 계속 추적
    if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current.targetX = toWorldX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // 마우스는 버튼 없이 움직여도 따라가고, 터치/펜은 누르고 있을 때만
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    inputRef.current.targetX = toWorldX(e.clientX);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') inputRef.current.targetX = null;
  };

  // 화면 버튼 (접근성/대체 조작)
  const holdButton = (dir: -1 | 1) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      inputRef.current = { direction: dir, targetX: null };
    },
    onPointerUp: () => {
      inputRef.current.direction = 0;
    },
    onPointerLeave: () => {
      inputRef.current.direction = 0;
    },
    onPointerCancel: () => {
      inputRef.current.direction = 0;
    },
  });

  return (
    <div className="cc">
      <GameHud
        timeLeft={hud.timeLeft}
        totalTime={CONFIG.durationMs / 1000}
        score={hud.score}
        onExit={onExit}
      />
      <p className="cc__streak small" aria-live="off">
        {hud.streak >= 2 ? `${hud.streak}연속 받기!` : '캡슐은 받고, 가시 폭탄은 피해요'}
      </p>
      <div ref={wrapRef} className="cc__stage">
        <canvas
          ref={canvasRef}
          className="cc__canvas"
          role="img"
          aria-label="캡슐 받기 게임 화면. 좌우 방향키 또는 A, D 키로 움직이세요."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
        />
        <Countdown count={count} />
        {finished && (
          <div className="countdown" role="status">
            <span>끝!</span>
          </div>
        )}
      </div>
      <div className="cc__controls">
        <button type="button" className="btn cc__move" aria-label="왼쪽으로 이동 (누르고 있기)" {...holdButton(-1)}>
          ◀
        </button>
        <p className="small muted cc__help">화면을 누른 채 좌우로 밀거나 방향키로 움직여요</p>
        <button type="button" className="btn cc__move" aria-label="오른쪽으로 이동 (누르고 있기)" {...holdButton(1)}>
          ▶
        </button>
      </div>
    </div>
  );
}

function CapsuleCatchIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 16 a8 8 0 0 1 16 0 Z" fill="#8ecdf7" stroke="#2b2233" strokeWidth="2.5" />
      <path d="M12 16 a8 8 0 0 0 16 0 Z" fill="#fffdf8" stroke="#2b2233" strokeWidth="2.5" />
      <path d="M8 34 C8 46 40 46 40 34 C34 30 14 30 8 34 Z" fill="#ffb8c9" stroke="#2b2233" strokeWidth="3" />
      <circle cx="19" cy="38" r="1.8" fill="#2b2233" />
      <circle cx="29" cy="38" r="1.8" fill="#2b2233" />
      <path d="M36 8 l2 4 M40 14 l-4 1" stroke="#2b2233" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const capsuleCatch: MiniGame = {
  id: 'capsule-catch',
  name: '캡슐 받기',
  description: '30초 동안 떨어지는 캡슐을 받아요. 황금 캡슐은 보너스, 가시 폭탄은 조심!',
  controls: '화면 드래그, 방향키 또는 A/D, 화면 버튼',
  icon: CapsuleCatchIcon,
  Component: CapsuleCatchGame,
};

export default capsuleCatch;
