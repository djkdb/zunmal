import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CHARACTERS, type Character } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { darken, isDark, lighten } from '../../lib/color';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { hasPartnerFlair, partnerTrailColor } from '../shared/partner';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  JELLY_SLICE_CONFIG as CONFIG,
  WORLD,
  createSliceState,
  stepSlice,
  type Flyer,
  type SliceEvent,
  type SliceState,
  type SwipeSegment,
} from './logic';
import './JellySlice.css';

const INK = '#2b2233';
const GOLD = '#ffc94d';
/** 시크릿 말랑이는 던지지 않는다 */
const POOL: readonly Character[] = CHARACTERS.filter((c) => c.rarity !== 'secret');
const TRAIL_MS = 170;
const HALF_LIFE_MS = 1100;

function jellyColor(f: Flyer): string {
  if (f.kind === 'gold') return GOLD;
  return POOL[f.variant % POOL.length]?.color ?? '#ffb8c9';
}

// ── 연출용 상태 (게임 규칙과 무관, 컴포넌트 안에서만) ─────────────

interface Half {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  cutAngle: number;
  side: 1 | -1;
  flyer: Flyer;
  age: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  age: number;
  life: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

interface Burst {
  x: number;
  y: number;
  age: number;
}

/** 칼날 자국 모양: 파트너 색, 전설 이상이면 칼끝에 반짝 별 (장식만) */
interface BladeStyle {
  color: string;
  sparkle: boolean;
}

const DEFAULT_BLADE: BladeStyle = { color: '#ff7aa2', sparkle: false };

interface TrailPoint {
  x: number;
  y: number;
  t: number;
  stroke: number;
}

interface Fx {
  halves: Half[];
  drops: Drop[];
  popups: Popup[];
  bursts: Burst[];
}

// ── 그리기 ─────────────────────────────────────────────────

function jellyPath(ctx: CanvasRenderingContext2D, r: number) {
  // 아래가 살짝 평평한 말랑 젤리 실루엣
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.3);
  ctx.bezierCurveTo(-r * 1.02, -r * 1.12, r * 1.02, -r * 1.12, r, r * 0.3);
  ctx.bezierCurveTo(r * 0.95, r * 0.92, -r * 0.95, r * 0.92, -r, r * 0.3);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? outer : outer * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** 원점 기준 젤리 한 개 (회전은 호출 쪽에서) */
function drawJellyBody(ctx: CanvasRenderingContext2D, f: Flyer, cut: boolean) {
  const r = f.r;
  const color = jellyColor(f);
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.45, 2, 0, 0, r * 1.3);
  grad.addColorStop(0, lighten(color, 0.55));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, darken(color, 0.18));
  ctx.fillStyle = grad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  jellyPath(ctx, r);
  ctx.fill();
  ctx.stroke();
  // 광택
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.42, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // 얼굴
  const feature = isDark(color) ? '#fff6e6' : INK;
  ctx.fillStyle = feature;
  ctx.strokeStyle = feature;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  if (cut) {
    // 잘린 반쪽: 놀란 > < 눈
    for (const s of [-1, 1]) {
      const ex = s * r * 0.34;
      ctx.beginPath();
      ctx.moveTo(ex - s * 4, -2);
      ctx.lineTo(ex + s * 2, 2);
      ctx.lineTo(ex - s * 4, 6);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 0.34, 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 7, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,122,156,0.45)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.6, 9, 4.5, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.6, 9, 4.5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (f.kind === 'gold') {
    // 색 이외의 구분: 머리 위 별
    ctx.fillStyle = '#fffcf5';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    starPath(ctx, 0, -r * 0.62, r * 0.3);
    ctx.fill();
    ctx.stroke();
  }
}

function drawJelly(ctx: CanvasRenderingContext2D, f: Flyer) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle * 0.35);
  if (f.kind === 'gold') {
    ctx.shadowColor = 'rgba(255, 201, 77, 0.95)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = GOLD;
    jellyPath(ctx, f.r);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  drawJellyBody(ctx, f, false);
  ctx.restore();
}

function drawBomb(ctx: CanvasRenderingContext2D, f: Flyer, t: number) {
  const r = f.r;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);
  // 가시 (색 이외의 형태 구분)
  ctx.fillStyle = '#6b5a80';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r * 1.35 : r * 0.92;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3f3350';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 얼굴과 심지는 회전하지 않음 (읽기 쉽게)
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.25);
  ctx.lineTo(-r * 0.15, r * 0.02);
  ctx.moveTo(r * 0.55, -r * 0.25);
  ctx.lineTo(r * 0.15, r * 0.02);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r * 0.3, -r * 0.85);
  ctx.quadraticCurveTo(r * 0.5, -r * 1.35, r * 0.85, -r * 1.3);
  ctx.stroke();
  ctx.fillStyle = Math.floor(t / 90) % 2 === 0 ? '#ffd23f' : '#ff8a5c';
  ctx.beginPath();
  ctx.arc(r * 0.9, -r * 1.32, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHalf(ctx: CanvasRenderingContext2D, h: Half) {
  const alpha = Math.max(0, 1 - Math.max(0, h.age - HALF_LIFE_MS * 0.6) / (HALF_LIFE_MS * 0.4));
  const r = h.flyer.r;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  // 자른 선 기준 한쪽만 남긴다
  ctx.rotate(h.cutAngle);
  ctx.beginPath();
  ctx.rect(-r * 2, h.side > 0 ? 0 : -r * 2, r * 4, r * 2);
  ctx.clip();
  ctx.rotate(-h.cutAngle);
  drawJellyBody(ctx, h.flyer, true);
  // 단면
  ctx.rotate(h.cutAngle);
  ctx.strokeStyle = lighten(jellyColor(h.flyer), 0.6);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, 0);
  ctx.lineTo(r * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

/** 스트로크 하나를 꼬리는 가늘고 머리는 굵은 칼날 모양 다각형으로 채운다. */
function fillTaper(ctx: CanvasRenderingContext2D, pts: TrailPoint[], widths: number[]) {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = (widths[i] ?? 0) / 2;
    left.push([p.x - dy * w, p.y + dx * w]);
    right.push([p.x + dy * w, p.y - dx * w]);
  }
  ctx.beginPath();
  left.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]![0], right[i]![1]);
  ctx.closePath();
  ctx.fill();
  // 머리 끝은 둥글게
  const head = pts[pts.length - 1]!;
  ctx.beginPath();
  ctx.arc(head.x, head.y, (widths[widths.length - 1] ?? 0) / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: TrailPoint[], now: number, blade: BladeStyle) {
  // 스트로크별로 나눈다
  const strokes: TrailPoint[][] = [];
  for (const p of trail) {
    const last = strokes[strokes.length - 1];
    if (last && last[0]?.stroke === p.stroke) last.push(p);
    else strokes.push([p]);
  }
  for (const pts of strokes) {
    if (pts.length < 2) continue;
    const n = pts.length;
    // 오래된 점일수록, 꼬리 쪽일수록 가늘게
    const k = pts.map((p, i) => Math.max(0, 1 - (now - p.t) / TRAIL_MS) * (0.15 + (0.85 * i) / (n - 1)));
    ctx.fillStyle = blade.color;
    fillTaper(
      ctx,
      pts,
      k.map((v) => v * 13),
    );
    ctx.fillStyle = '#fffcf5';
    fillTaper(
      ctx,
      pts,
      k.map((v) => v * 6),
    );
    if (blade.sparkle) {
      const head = pts[n - 1]!;
      const life = k[n - 1] ?? 0;
      if (life > 0.2) {
        ctx.fillStyle = GOLD;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        starPath(ctx, head.x, head.y, 5 + life * 4);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: SliceState,
  fx: Fx,
  trail: TrailPoint[],
  now: number,
  blade: BladeStyle = DEFAULT_BLADE,
) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  // 즙 방울 (뒤)
  for (const d of fx.drops) {
    ctx.globalAlpha = Math.max(0, 1 - d.age / d.life);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const h of fx.halves) drawHalf(ctx, h);
  for (const f of state.flyers) if (f.kind !== 'bomb') drawJelly(ctx, f);
  // 폭탄은 젤리 위에 그려 가려지지 않게
  for (const f of state.flyers) if (f.kind === 'bomb') drawBomb(ctx, f, state.elapsedMs);
  // 폭탄 터짐: 잉크 가시 고리
  for (const b of fx.bursts) {
    const k = b.age / 420;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#ff5b5b';
    ctx.lineWidth = 3;
    const rr = 18 + k * 70;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r2 = i % 2 === 0 ? rr : rr * 0.7;
      ctx.lineTo(b.x + Math.cos(a) * r2, b.y + Math.sin(a) * r2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawTrail(ctx, trail, now, blade);
  ctx.textAlign = 'center';
  ctx.font = '20px "Jua", "NanumSquareRound", "Pretendard Variable", sans-serif';
  for (const p of fx.popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 750);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#fffcf5';
    ctx.lineWidth = 5;
    const py = p.y - p.age * 0.04;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
}

function stepFx(fx: Fx, dt: number): Fx {
  const sec = dt / 1000;
  const g = CONFIG.gravity;
  return {
    halves: fx.halves
      .map((h) => ({
        ...h,
        x: h.x + h.vx * sec,
        y: h.y + h.vy * sec,
        vy: h.vy + g * sec,
        angle: h.angle + h.spin * sec,
        age: h.age + dt,
      }))
      .filter((h) => h.age < HALF_LIFE_MS && h.y - h.flyer.r < WORLD.height),
    drops: fx.drops
      .map((d) => ({ ...d, x: d.x + d.vx * sec, y: d.y + d.vy * sec, vy: d.vy + g * 0.7 * sec, age: d.age + dt }))
      .filter((d) => d.age < d.life),
    popups: fx.popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 750),
    bursts: fx.bursts.map((b) => ({ ...b, age: b.age + dt })).filter((b) => b.age < 420),
  };
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function LivesMeter({ lives }: { lives: number }) {
  return (
    <span className="js__lives" role="img" aria-label={`목숨 ${CONFIG.lives}개 중 ${lives}개 남음`}>
      {Array.from({ length: CONFIG.lives }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 32 32"
          width="26"
          height="26"
          aria-hidden="true"
          className={i < lives ? '' : 'is-lost'}
        >
          <path
            d="M16 27 C6 20 3 14 5.5 9.5 C8 5 13.5 5.5 16 10 C18.5 5.5 24 5 26.5 9.5 C29 14 26 20 16 27 Z"
            fill={i < lives ? '#ff7aa2' : '#fffcf5'}
            stroke={INK}
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          {i < lives && <ellipse cx="11" cy="11" rx="2.6" ry="1.6" fill="#fffcf5" transform="rotate(-30 11 11)" />}
        </svg>
      ))}
    </span>
  );
}

function JellySliceGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const bladeColor = partnerTrailColor(partner);
  const bladeSparkle = hasPartnerFlair(partner.rarity);
  const stateRef = useRef<SliceState>(createSliceState());
  const segmentsRef = useRef<SwipeSegment[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const pointersRef = useRef(new Map<number, { x: number; y: number; stroke: number }>());
  const strokeSeq = useRef(0);
  const reported = useRef(false);
  const [hud, setHud] = useState<{ score: number; timeLeft: number; lives: number; combo: number }>({
    score: 0,
    timeLeft: CONFIG.durationMs / 1000,
    lives: CONFIG.lives,
    combo: 0,
  });
  const [finished, setFinished] = useState<null | 'time' | 'out'>(null);

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
      if (ctx) drawScene(ctx, stateRef.current, { halves: [], drops: [], popups: [], bursts: [] }, [], 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
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
    let fx: Fx = { halves: [], drops: [], popups: [], bursts: [] };
    let comboShown = 0;
    const blade: BladeStyle = { color: bladeColor, sparkle: bladeSparkle };

    const splash = (x: number, y: number, color: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = defaultRng() * Math.PI * 2;
        const sp = 60 + defaultRng() * 180;
        fx.drops.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          r: 2 + defaultRng() * 3.5,
          color,
          age: 0,
          life: 450 + defaultRng() * 350,
        });
      }
    };

    const handleEvents = (events: SliceEvent[]) => {
      for (const ev of events) {
        if (ev.type === 'slice') {
          const f = ev.flyer;
          if (ev.kind === 'gold') sfx.coin();
          else sfx.tap(Math.min(12, (ev.combo - 1) * 3));
          const nx = -Math.sin(ev.cutAngle);
          const ny = Math.cos(ev.cutAngle);
          const push = reduced ? 30 : 70;
          for (const side of [1, -1] as const) {
            fx.halves.push({
              x: f.x,
              y: f.y,
              vx: f.vx * 0.5 + nx * push * side,
              vy: Math.min(f.vy, 0) * 0.3 + ny * push * side - 40,
              angle: f.angle * 0.35,
              spin: reduced ? 0 : side * (2 + defaultRng() * 2),
              cutAngle: ev.cutAngle,
              side,
              flyer: f,
              age: 0,
            });
          }
          splash(f.x, f.y, darken(jellyColor(f), 0.12), reduced ? 4 : 12);
          const text = ev.combo >= 2 ? `${ev.combo}콤보 +${ev.points}` : `+${ev.points}`;
          fx.popups.push({ x: f.x, y: f.y - f.r - 4, text, color: ev.kind === 'gold' ? '#c47a00' : '#e8527f', age: 0 });
          if (ev.combo >= 3) sfx.pickup();
          comboShown = ev.combo;
          buddyRef.current?.react(ev.combo >= 3 || ev.kind === 'gold' ? 'wow' : 'happy', 600);
        } else if (ev.type === 'bomb') {
          sfx.hit();
          buddyRef.current?.react('oops', 900);
          fx.bursts.push({ x: ev.flyer.x, y: ev.flyer.y, age: 0 });
          splash(ev.flyer.x, ev.flyer.y, INK, reduced ? 3 : 10);
          fx.popups.push({
            x: ev.flyer.x,
            y: ev.flyer.y - 30,
            text: ev.lostLife ? '앗, 가시!' : '휴, 괜찮아요',
            color: INK,
            age: 0,
          });
          comboShown = 0;
          if (!reduced) {
            wrapRef.current?.animate(
              [
                { transform: 'translate(0,0)' },
                { transform: 'translate(-7px,2px)' },
                { transform: 'translate(7px,-2px)' },
                { transform: 'translate(-3px,1px)' },
                { transform: 'translate(0,0)' },
              ],
              { duration: 280 },
            );
          }
        }
      }
    };

    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      const segs = segmentsRef.current;
      segmentsRef.current = [];
      const out = stepSlice(stateRef.current, dt, segs, defaultRng);
      stateRef.current = out.state;
      handleEvents(out.events);
      fx = stepFx(fx, Math.min(dt, 50));
      trailRef.current = trailRef.current.filter((p) => t - p.t < TRAIL_MS);
      drawScene(ctx, out.state, fx, trailRef.current, t, blade);

      hudAcc += dt;
      if (hudAcc > 100 || out.events.some((e) => e.type === 'bomb') || out.state.finished) {
        hudAcc = 0;
        setHud({
          score: out.state.score,
          timeLeft: Math.max(0, (CONFIG.durationMs - out.state.elapsedMs) / 1000),
          lives: out.state.lives,
          combo: comboShown,
        });
      }
      if (out.state.finished) {
        setFinished(out.state.knockedOut ? 'out' : 'time');
        // 마지막 조각이 떨어지는 모습을 잠깐 더 그린다
        const tail = (t2: number) => {
          const d2 = t2 - last;
          last = t2;
          fx = stepFx(fx, Math.min(d2, 50));
          drawScene(ctx, out.state, fx, [], t2, blade);
          if (fx.halves.length + fx.drops.length + fx.bursts.length > 0) raf = requestAnimationFrame(tail);
        };
        raf = requestAnimationFrame(tail);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, reduced, sfx, bladeColor, bladeSparkle]);

  // 종료 처리 (onFinish는 정확히 한 번)
  useEffect(() => {
    if (!finished) return;
    if (finished === 'out') sfx.fail();
    else sfx.success();
    buddyRef.current?.setBase(finished === 'out' ? 'sad' : 'happy');
    const id = window.setTimeout(
      () => {
        if (reported.current) return;
        reported.current = true;
        const s = stateRef.current;
        onFinish({
          score: s.score,
          stats: { 자른젤리: s.sliced, 황금젤리: s.goldSliced, 최대콤보: s.maxCombo, 가시폭탄: s.bombsHit },
        });
      },
      reduced ? 300 : 1100,
    );
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  // 포인터 → 월드 좌표 스와이프 조각
  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * WORLD.width,
      y: ((clientY - rect.top) / rect.height) * WORLD.height,
    };
  };
  const active = () => started && !stateRef.current.finished;

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처가 안 돼도 게임은 진행
    }
    strokeSeq.current += 1;
    const stroke = strokeSeq.current;
    pointersRef.current.set(e.pointerId, { ...p, stroke });
    // 탭만 해도 잘리도록 길이 0 조각을 넣는다
    segmentsRef.current.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, strokeId: stroke });
    trailRef.current.push({ ...p, t: performance.now(), stroke });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev || !active()) return;
    const now = performance.now();
    // 빠른 스와이프는 합쳐진 이벤트까지 모두 사용해 궤적을 촘촘하게
    const samples = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const list = samples.length > 0 ? samples : [e.nativeEvent];
    let from = prev;
    for (const ev of list) {
      const p = toWorld(ev.clientX, ev.clientY);
      if (!p) continue;
      segmentsRef.current.push({ x1: from.x, y1: from.y, x2: p.x, y2: p.y, strokeId: prev.stroke });
      trailRef.current.push({ ...p, t: now, stroke: prev.stroke });
      from = { ...p, stroke: prev.stroke };
    }
    pointersRef.current.set(e.pointerId, from);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
  };

  return (
    <div className={`js${reduced ? ' js--reduced' : ''}`}>
      <GameHud timeLeft={hud.timeLeft} totalTime={CONFIG.durationMs / 1000} score={hud.score} onExit={onExit} />
      <div className="js__sub">
        <LivesMeter lives={hud.lives} />
        <p className="js__combo" aria-live="off">
          {hud.combo >= 2 ? (
            <>
              <strong>{hud.combo}</strong>개 한 번에!
            </>
          ) : (
            '가시 폭탄은 피해서 그어요'
          )}
        </p>
      </div>
      <div ref={wrapRef} className="js__stage">
        <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={64} className="js__buddy" />
        <canvas
          ref={canvasRef}
          className="js__canvas"
          role="img"
          aria-label="말랑 슬라이스 게임 화면. 튀어 오르는 젤리를 손가락으로 긋거나 눌러서 자르세요."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onContextMenu={(e) => e.preventDefault()}
        />
        <Countdown count={count} />
        {finished && (
          <div className="countdown js__end" role="status">
            <span>{finished === 'out' ? '목숨을 다 썼어요' : '끝!'}</span>
          </div>
        )}
      </div>
      <p className="small muted js__help">
        화면을 쓱 그어서 자르세요. 눌러도 잘려요. 한 번에 여러 개를 자르면 콤보 점수!
      </p>
    </div>
  );
}

function JellySliceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* 왼쪽 반쪽 */}
      <path
        d="M7 30 C6 16 14 9 21 10 L17 38 C11 37 7 34 7 30 Z"
        fill="#ffb8c9"
        stroke="#2b2233"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 오른쪽 반쪽 (살짝 벌어짐) */}
      <path
        d="M26 11 C34 11 41 18 40 31 C40 35 35 39 29 39 Z"
        fill="#ff9fb0"
        stroke="#2b2233"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="13" cy="18" rx="3" ry="1.8" fill="#fffcf5" transform="rotate(-35 13 18)" />
      <circle cx="13" cy="26" r="1.8" fill="#2b2233" />
      <circle cx="33" cy="26" r="1.8" fill="#2b2233" />
      {/* 칼자국 */}
      <path d="M30 3 L17 45" stroke="#2b2233" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 3 L17 45" stroke="#fffcf5" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="40" r="2" fill="#ff7aa2" stroke="#2b2233" strokeWidth="1.5" />
      <circle cx="42" cy="42" r="1.6" fill="#ff7aa2" stroke="#2b2233" strokeWidth="1.5" />
    </svg>
  );
}

const jellySlice: MiniGame = {
  id: 'jelly-slice',
  name: '말랑 슬라이스',
  description: '45초 동안 튀어 오르는 젤리를 쓱 그어 잘라요. 가시 폭탄은 피하세요!',
  controls: '스와이프 또는 탭 (터치, 마우스)',
  icon: JellySliceIcon,
  Component: JellySliceGame,
};

export default jellySlice;
