import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { darken, lighten } from '../../lib/color';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  BALLOON_CONFIG as CONFIG,
  PLAYER_X,
  WORLD,
  createBalloonState,
  flap,
  step,
  type BalloonEvent,
  type BalloonState,
  type Pillar,
  type Star,
} from './logic';
import './BalloonFloat.css';

const INK = '#2b2233';
const PAPER = '#fffcf5';
const BERRY = '#ff7aa2';
const LEMON = '#ffd23f';
const SODA = '#5cc8ff';
/** 풍선 색: [마지막까지 남는 풍선, 먼저 터지는 풍선] — 상단 풍선 표시와 같은 순서 */
const BALLOON_COLORS = [BERRY, SODA] as const;

/** 말랑이 SVG에서 몸통 중심이 놓이는 비율 (viewBox -14..134 기준) */
const MALANG_ANCHOR_Y = 0.56;
/** 말랑이 SVG 폭 (월드 단위). 몸통은 이 폭의 약 70% */
const MALANG_WORLD_SIZE = 62;

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  /** 누른 직후 풍선이 훅 부풀고 말랑이가 길쭉해지는 정도 (0~1) */
  puff: number;
  shake: number;
  shards: Shard[];
  popups: Popup[];
  /** 게임이 끝난 뒤 떨어지는 말랑이 (연출용) */
  fallY: number | null;
  fallVy: number;
  time: number;
}

// ── 렌더링 (순수 그리기 함수) ───────────────────────────────

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

/** 뭉게구름 한 덩이 (배경용, 외곽선 없음) */
function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
  ctx.arc(x + 16 * s, y - 8 * s, 18 * s, 0, Math.PI * 2);
  ctx.arc(x + 34 * s, y, 13 * s, 0, Math.PI * 2);
  ctx.rect(x, y, 34 * s, 12 * s);
  ctx.fill();
}

/** 배경 구름 배치 (고정 무늬를 반복) */
const FAR_CLOUDS = [
  { x: 20, y: 70, s: 0.9 },
  { x: 170, y: 40, s: 0.7 },
  { x: 280, y: 110, s: 1 },
  { x: 390, y: 60, s: 0.8 },
] as const;
const NEAR_CLOUDS = [
  { x: 60, y: 300, s: 1.3 },
  { x: 260, y: 350, s: 1.1 },
  { x: 420, y: 280, s: 1.4 },
] as const;

function drawSky(ctx: CanvasRenderingContext2D, distance: number) {
  const layers = [
    { clouds: FAR_CLOUDS, factor: 0.12, span: 480, color: 'rgba(255,255,255,0.75)' },
    { clouds: NEAR_CLOUDS, factor: 0.35, span: 560, color: 'rgba(255,255,255,0.55)' },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    const offset = (distance * layer.factor) % layer.span;
    for (const c of layer.clouds) {
      for (const k of [0, 1]) {
        const x = c.x - offset + k * layer.span;
        if (x > -80 && x < WORLD.width + 20) drawPuff(ctx, x, c.y, c.s);
      }
    }
  }
}

/** 사탕 지팡이 기둥 (위/아래 한 쌍) */
function drawCanePillar(ctx: CanvasRenderingContext2D, p: Pillar) {
  const w = CONFIG.pillarWidth;
  const capH = 20;
  const parts = [
    { x: p.x, y: -10, w, h: p.gapTop + 10, cap: { y: p.gapTop - capH } },
    { x: p.x, y: p.gapBottom, w, h: CONFIG.groundY - p.gapBottom + 10, cap: { y: p.gapBottom } },
  ];
  for (const part of parts) {
    if (part.h <= 0) continue;
    for (const r of [
      { x: part.x + 4, y: part.y, w: part.w - 8, h: part.h, rad: 0 },
      { x: part.x - 5, y: part.cap.y, w: part.w + 10, h: capH, rad: 9 },
    ]) {
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, r.rad);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.clip();
      // 사선 줄무늬 (기둥 위치에 붙어 함께 흐른다)
      ctx.strokeStyle = BERRY;
      ctx.lineWidth = 9;
      for (let yy = r.y - r.w - 20; yy < r.y + r.h + 20; yy += 24) {
        ctx.beginPath();
        ctx.moveTo(r.x - 4, yy + r.w + 8);
        ctx.lineTo(r.x + r.w + 4, yy);
        ctx.stroke();
      }
      // 광택
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(r.x + 5, r.y, 5, r.h);
      ctx.restore();
      roundRect(ctx, r.x, r.y, r.w, r.h, r.rad);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

/** 구름 기둥: 기둥 몸통 + 틈 쪽 끝에 뭉게뭉게 */
function drawCloudPillar(ctx: CanvasRenderingContext2D, p: Pillar) {
  const w = CONFIG.pillarWidth;
  const cx = p.x + w / 2;
  const shapes = (paint: () => void) => {
    for (const [top, y0, y1] of [
      [true, -10, p.gapTop - 10],
      [false, p.gapBottom + 10, CONFIG.groundY + 10],
    ] as const) {
      if (y1 - y0 > 0) {
        ctx.beginPath();
        ctx.rect(p.x + 3, y0, w - 6, y1 - y0);
        paint();
      }
      const edge = top ? p.gapTop - 12 : p.gapBottom + 12;
      ctx.beginPath();
      ctx.arc(cx - 17, edge, 15, 0, Math.PI * 2);
      paint();
      ctx.beginPath();
      ctx.arc(cx + 17, edge, 15, 0, Math.PI * 2);
      paint();
      ctx.beginPath();
      ctx.arc(cx, edge + (top ? 3 : -3), 19, 0, Math.PI * 2);
      paint();
    }
  };
  // 외곽선을 먼저 두껍게 그린 뒤 속을 채워, 겹친 부분 안쪽 선을 지운다
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  shapes(() => ctx.stroke());
  ctx.fillStyle = '#eef3ff';
  shapes(() => ctx.fill());
  // 아래쪽 그늘
  ctx.fillStyle = 'rgba(92,200,255,0.18)';
  ctx.fillRect(p.x + w - 16, -10, 13, p.gapTop - 24);
  ctx.fillRect(p.x + w - 16, p.gapBottom + 30, 13, CONFIG.groundY - p.gapBottom - 20);
}

function drawStar(ctx: CanvasRenderingContext2D, st: Star, t: number) {
  const r = CONFIG.starRadius + 2;
  ctx.save();
  ctx.translate(st.x, st.y + Math.sin(t / 260 + st.id) * 2.5);
  ctx.rotate(Math.sin(t / 400 + st.id) * 0.15);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = LEMON;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(-3, -3, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, distance: number) {
  const gy = CONFIG.groundY;
  ctx.fillStyle = '#9be27a';
  ctx.fillRect(-4, gy, WORLD.width + 8, WORLD.height - gy + 4);
  // 스프링클 무늬 (지면과 함께 흐름)
  const colors = [BERRY, LEMON, SODA, PAPER];
  const off = distance % 40;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = -1; i < WORLD.width / 40 + 2; i++) {
    const x = i * 40 - off;
    ctx.strokeStyle = colors[(i + Math.floor(distance / 40) + 400) % colors.length] ?? PAPER;
    ctx.beginPath();
    ctx.moveTo(x + 8, gy + 14);
    ctx.lineTo(x + 15, gy + 10);
    ctx.moveTo(x + 26, gy + 28);
    ctx.lineTo(x + 30, gy + 22);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, gy);
  ctx.lineTo(WORLD.width + 4, gy);
  ctx.stroke();
}

/** 풍선 위치 (몸통 중심 기준). 개수에 따라 배치가 달라진다. */
function balloonSpots(count: number): { dx: number; dy: number; color: string }[] {
  if (count >= 2) {
    return [
      { dx: -13, dy: -50, color: BALLOON_COLORS[0] },
      { dx: 7, dy: -56, color: BALLOON_COLORS[1] },
    ];
  }
  if (count === 1) return [{ dx: -4, dy: -54, color: BALLOON_COLORS[0] }];
  return [];
}

function drawBalloons(ctx: CanvasRenderingContext2D, y: number, count: number, vy: number, puff: number, alpha: number) {
  const tilt = Math.max(-0.25, Math.min(0.25, vy / 1600));
  const anchorY = y - 14;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const b of balloonSpots(count)) {
    const bx = PLAYER_X + b.dx - tilt * 20;
    const by = y + b.dy;
    // 줄
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(PLAYER_X, anchorY);
    ctx.quadraticCurveTo(PLAYER_X + (bx - PLAYER_X) * 0.2 + 4, (anchorY + by) / 2, bx, by + 20);
    ctx.stroke();
    // 풍선 (누르면 훅 부푼다)
    const sx = 1 + puff * 0.14;
    const sy = 1 + puff * 0.06;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-tilt);
    ctx.scale(sx, sy);
    const grad = ctx.createRadialGradient(-5, -8, 2, 0, 0, 20);
    grad.addColorStop(0, lighten(b.color, 0.6));
    grad.addColorStop(0.6, b.color);
    grad.addColorStop(1, darken(b.color, 0.15));
    ctx.fillStyle = grad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 매듭
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.lineTo(-4, 22);
    ctx.lineTo(4, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 광택
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-6, -7, 3.2, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, s: BalloonState, fx: Fx, reduced: boolean) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  if (fx.shake > 0) {
    const a = fx.shake * 5;
    ctx.translate(Math.sin(fx.time * 0.09) * a, Math.cos(fx.time * 0.11) * a * 0.6);
  }
  drawSky(ctx, reduced ? 0 : s.distance);
  for (const p of s.pillars) {
    if (p.x > WORLD.width + 20 || p.x + CONFIG.pillarWidth < -20) continue;
    if (p.kind === 'cane') drawCanePillar(ctx, p);
    else drawCloudPillar(ctx, p);
  }
  for (const st of s.stars) drawStar(ctx, st, reduced ? 0 : fx.time);
  drawGround(ctx, s.distance);

  // 풍선 (무적 중에는 깜빡임)
  const y = fx.fallY ?? s.y;
  const blink = s.invulnMs > 0 && !s.finished ? (Math.floor(s.invulnMs / 120) % 2 === 0 ? 0.35 : 1) : 1;
  drawBalloons(ctx, y, s.balloons, s.vy, fx.puff, blink);

  // 풍선 조각
  for (const sh of fx.shards) {
    ctx.globalAlpha = Math.max(0, 1 - sh.age / 600);
    ctx.fillStyle = sh.color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, 4, 2.5, sh.age / 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 점수 팝업
  ctx.textAlign = 'center';
  ctx.font = '18px "Jua", "NanumSquareRound", "Pretendard Variable", sans-serif';
  ctx.lineJoin = 'round';
  for (const p of fx.popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 700);
    const py = p.y - p.age * 0.04;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 5;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function BalloonFloatGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const malangRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const flapBtnRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<BalloonState | null>(null);
  if (stateRef.current === null) stateRef.current = createBalloonState(defaultRng);
  const fxRef = useRef<Fx>({ puff: 0, shake: 0, shards: [], popups: [], fallY: null, fallVy: 0, time: 0 });
  const startedRef = useRef(false);
  const reportedRef = useRef(false);
  const [hud, setHud] = useState({
    score: 0,
    timeLeft: CONFIG.durationMs / 1000,
    balloons: CONFIG.startBalloons as number,
    stars: 0,
    waiting: true,
  });
  const [ended, setEnded] = useState<BalloonState['endReason']>(null);

  startedRef.current = started;

  const syncHud = useCallback((s: BalloonState) => {
    setHud({
      score: s.score,
      timeLeft: Math.max(0, (CONFIG.durationMs - s.elapsedMs) / 1000),
      balloons: s.balloons,
      stars: s.starsCollected,
      waiting: s.waiting,
    });
  }, []);

  /** DOM 말랑이를 월드 좌표에 맞춰 옮긴다 (말랑이는 SVG로 캔버스 위에 그린다) */
  const placeMalang = useCallback(
    (s: BalloonState, fx: Fx) => {
      const el = malangRef.current;
      if (!el) return;
      const y = fx.fallY ?? s.y;
      const stretch = reduced ? 0 : fx.puff;
      const lean = reduced ? 0 : Math.max(-12, Math.min(18, s.vy / 22));
      el.style.top = `${(y / WORLD.height) * 100}%`;
      el.style.transform = `translate(-50%, -${MALANG_ANCHOR_Y * 100}%) rotate(${fx.fallY !== null ? lean * 2 : lean}deg) scale(${1 - stretch * 0.1}, ${1 + stretch * 0.14})`;
      const blink = s.invulnMs > 0 && !s.finished && Math.floor(s.invulnMs / 120) % 2 === 0;
      el.style.opacity = blink ? '0.45' : '1';
    },
    [reduced],
  );

  // 캔버스 해상도: 논리 월드를 devicePixelRatio에 맞춰 선명하게
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (canvas.clientWidth / WORLD.width) * dpr;
      if (scale <= 0) return;
      canvas.width = Math.round(WORLD.width * scale);
      canvas.height = Math.round(WORLD.height * scale);
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(scale, 0, 0, scale, 0, 0);
      const s = stateRef.current;
      if (ctx && s) {
        drawScene(ctx, s, fxRef.current, reduced);
        placeMalang(s, fxRef.current);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [reduced, placeMalang]);

  const doFlap = useCallback(() => {
    if (!startedRef.current) return;
    const prev = stateRef.current;
    if (!prev || prev.finished) return;
    stateRef.current = flap(prev);
    fxRef.current.puff = 1;
    sfx.tap(5);
    if (prev.waiting) syncHud(stateRef.current);
  }, [sfx, syncHud]);

  // 키보드: Space / ArrowUp / Enter (자동 반복 무시). 다른 버튼에 포커스가 있으면 그 버튼에 맡긴다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      const target = e.target as Element | null;
      if (e.key !== 'ArrowUp' && target && target !== flapBtnRef.current && target.closest('button, a, input, select, textarea')) {
        return;
      }
      e.preventDefault();
      if (e.repeat) return;
      doFlap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doFlap]);

  // 게임 루프 (끝난 뒤에도 떨어지는 연출을 위해 잠깐 더 그린다)
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    flapBtnRef.current?.focus({ preventScroll: true });
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const handleEvents = (s: BalloonState, events: BalloonEvent[]) => {
      const fx = fxRef.current;
      for (const ev of events) {
        if (ev.type === 'pass') {
          sfx.flip();
        } else if (ev.type === 'star') {
          sfx.pickup();
          buddyRef.current?.react('happy', 600, false);
          fx.popups.push({ x: ev.x, y: ev.y - 8, text: `+${ev.points}`, color: '#c98a00', age: 0 });
        } else if (ev.type === 'hit') {
          sfx.hit();
          buddyRef.current?.react('oops', 900);
          // 터진 풍선 자리에서 조각이 흩어진다
          const spot = balloonSpots(ev.balloonsLeft + 1)[ev.balloonsLeft] ?? { dx: 0, dy: -52, color: BERRY };
          if (!reduced) {
            fx.shake = 1;
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              fx.shards.push({
                x: PLAYER_X + spot.dx,
                y: s.y + spot.dy,
                vx: Math.cos(a) * 160,
                vy: Math.sin(a) * 160 - 40,
                color: spot.color,
                age: 0,
              });
            }
          }
          fx.popups.push({
            x: PLAYER_X + 44,
            // 천장 근처에서도 글자가 잘리지 않게
            y: Math.max(40, s.y + spot.dy),
            text: ev.balloonsLeft > 0 ? '뻥! 하나 남았어요' : '뻥!',
            color: '#e8527f',
            age: 0,
          });
        } else if (ev.type === 'pop') {
          sfx.fail();
          buddyRef.current?.setBase('sad');
          fx.fallY = s.y;
          fx.fallVy = -120;
          setEnded('pop');
        } else if (ev.type === 'timeUp') {
          sfx.success();
          buddyRef.current?.setBase('wow');
          if (ev.bonus > 0) {
            fx.popups.push({ x: WORLD.width / 2, y: WORLD.height * 0.4, text: `완주 +${ev.bonus}`, color: '#e8527f', age: 0 });
          }
          setEnded('time');
        }
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(50, Math.max(0, t - last));
      last = t;
      const prev = stateRef.current ?? createBalloonState(defaultRng);
      const out = step(prev, dt, defaultRng);
      stateRef.current = out.state;
      handleEvents(out.state, out.events);

      const fx = fxRef.current;
      fx.time += dt;
      fx.puff = Math.max(0, fx.puff - dt / 180);
      fx.shake = Math.max(0, fx.shake - dt / 260);
      fx.shards = fx.shards
        .map((sh) => ({ ...sh, age: sh.age + dt, x: sh.x + (sh.vx * dt) / 1000, y: sh.y + (sh.vy * dt) / 1000, vy: sh.vy + (600 * dt) / 1000 }))
        .filter((sh) => sh.age < 600);
      fx.popups = fx.popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 700);
      if (fx.fallY !== null && !reduced) {
        fx.fallVy += (1400 * dt) / 1000;
        fx.fallY = Math.min(WORLD.height + 60, fx.fallY + (fx.fallVy * dt) / 1000);
      }
      drawScene(ctx, out.state, fx, reduced);
      placeMalang(out.state, fx);

      hudAcc += dt;
      if (hudAcc > 100 || (out.state.finished && !prev.finished)) {
        hudAcc = 0;
        syncHud(out.state);
      }
      // 끝난 뒤에는 조각·떨어지는 연출이 끝날 때까지만 그린다
      if (out.state.finished && fx.shards.length === 0 && fx.popups.length === 0 && (fx.fallY === null || fx.fallY >= WORLD.height + 60 || reduced)) {
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, reduced, sfx, syncHud, placeMalang]);

  // 종료 처리: onFinish는 한 번만
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(
      () => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const s = stateRef.current;
        if (!s) return;
        onFinish({ score: s.score, stats: { 기둥: s.passed, 별: s.starsCollected, '남은 풍선': s.balloons } });
      },
      reduced ? 250 : 1100,
    );
    return () => window.clearTimeout(id);
  }, [ended, onFinish, reduced]);

  // 화면 어디를 눌러도 떠오른다 (다른 버튼 제외)
  const onRootPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as Element;
    const btn = target.closest('button, a');
    if (btn && btn !== flapBtnRef.current) return;
    e.preventDefault();
    doFlap();
  };

  const statusText = ended === 'pop' ? '풍선이 모두 터졌어요' : ended === 'time' ? '끝까지 날았어요!' : hud.waiting && started ? '눌러서 출발해요' : null;

  return (
    <div className="bf" onPointerDown={onRootPointer}>
      <GameHud timeLeft={hud.timeLeft} totalTime={CONFIG.durationMs / 1000} score={hud.score} onExit={onExit} />
      <p className="bf__info small" aria-live="off">
        <span className="bf__balloons" aria-label={`남은 풍선 ${hud.balloons}개`}>
          {Array.from({ length: CONFIG.startBalloons }, (_, i) => (
            <BalloonMark key={i} filled={i < hud.balloons} color={BALLOON_COLORS[i] ?? BERRY} />
          ))}
        </span>
        {statusText ? (
          <span className="bf__status">{statusText}</span>
        ) : (
          <span className="bf__stars">
            <StarMark />
            {hud.stars}
          </span>
        )}
      </p>
      <div className="bf__stage">
        <canvas
          ref={canvasRef}
          className="bf__canvas"
          role="img"
          aria-label="풍선 말랑 게임 화면. 화면을 누르거나 Space, 위쪽 방향키로 떠오르세요."
          onContextMenu={(e) => e.preventDefault()}
        />
        <div
          ref={malangRef}
          className="bf__malang"
          style={{ left: `${(PLAYER_X / WORLD.width) * 100}%`, width: `${(MALANG_WORLD_SIZE / WORLD.width) * 100}%` }}
          aria-hidden="true"
        >
          <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={80} animation="none" />
        </div>
        <Countdown count={count} />
        {ended && (
          <div className="countdown" role="status">
            <span>{ended === 'pop' ? '앗!' : '끝!'}</span>
          </div>
        )}
      </div>
      <button
        ref={flapBtnRef}
        type="button"
        className="btn btn--primary bf__flap"
        disabled={!started || ended !== null}
        // 누르기는 위 onPointerDown(루트)과 키보드 핸들러가 처리하므로 click은 무시 (중복 방지)
        onClick={(e) => e.preventDefault()}
      >
        떠오르기
      </button>
    </div>
  );
}

function BalloonMark({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg className={`bf__mark${filled ? '' : ' is-gone'}`} viewBox="0 0 20 28" width="18" height="25" aria-hidden="true">
      <path d="M10 18 q-1 4 1 9" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="10" cy="10" rx="7.5" ry="8.5" fill={filled ? color : 'none'} stroke={INK} strokeWidth="2.2" strokeDasharray={filled ? undefined : '3 3'} />
      {filled && <ellipse cx="7" cy="7" rx="1.6" ry="2.6" fill="#fff" opacity="0.8" />}
    </svg>
  );
}

function StarMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 2.5 l2.8 6 6.5 .7 -4.9 4.4 1.4 6.4 L12 16.8 6.2 20 7.6 13.6 2.7 9.2 9.2 8.5 Z"
        fill={LEMON}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BalloonFloatIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 21 q-2 6 5 12 M30 19 q2 7 -6 14" fill="none" stroke="#2b2233" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="16" cy="12" rx="8" ry="9.5" fill="#5cc8ff" stroke="#2b2233" strokeWidth="3" />
      <ellipse cx="30" cy="10" rx="8" ry="9.5" fill="#ff7aa2" stroke="#2b2233" strokeWidth="3" />
      <ellipse cx="27.5" cy="6.5" rx="1.8" ry="3" fill="#fff" opacity="0.8" />
      <path
        d="M13 44 C11 35 17 30 24 30 C31 30 37 35 35 44 Q24 46 13 44 Z"
        fill="#ffd23f"
        stroke="#2b2233"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="20.5" cy="37" r="1.8" fill="#2b2233" />
      <circle cx="27.5" cy="37" r="1.8" fill="#2b2233" />
    </svg>
  );
}

const balloonFloat: MiniGame = {
  id: 'balloon-float',
  name: '풍선 말랑',
  description: '풍선을 훅 불어 기둥 사이를 날아요. 풍선 2개가 모두 터지면 끝나요.',
  controls: '화면 누르기, Space 또는 위쪽 방향키, 떠오르기 버튼',
  durationMs: CONFIG.durationMs,
  blurb: '톡톡 날아가기',
  icon: BalloonFloatIcon,
  Component: BalloonFloatGame,
};

export default balloonFloat;
