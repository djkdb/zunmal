import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Malang } from '../../components/Malang';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { darken, lighten } from '../../lib/color';
import { haptic } from '../../lib/haptics';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { hasPartnerFlair, partnerTrailColor } from '../shared/partner';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  GROUND_Y,
  SLING,
  SLING_CONFIG as CONFIG,
  WORLD,
  clampPull,
  createSlingState,
  fire,
  launchVelocity,
  previewTrajectory,
  pullFromAngle,
  step,
  timeLeft,
  type Body,
  type SlingEvent,
  type SlingPhase,
  type SlingState,
  type Vec,
} from './logic';
import './MalangSling.css';

const INK = '#2b2233';
const FONT = "'Jua', 'NanumSquareRound', 'Pretendard Variable', sans-serif";
const JELLY_COLORS = ['#ff8fab', '#7fd8be', '#8ecdf7', '#ffd966'];
const ENEMY_COLORS = ['#b98cff', '#8fd14f', '#ff9f5a'];
const CHOCO = '#8b5a3c';
/** 새총 갈래 끝 (뒤: 오른쪽, 앞: 왼쪽) */
const PRONG_BACK = { x: SLING.x + 11, y: SLING.y - 8 };
const PRONG_FRONT = { x: SLING.x - 12, y: SLING.y - 6 };
/** 말랑이 SVG 크기 / 충돌 지름 (SVG 여백 보정) */
const MALANG_SCALE = 1.3;
/** 키보드 조준 범위 */
const KB = { angleMin: -15, angleMax: 85, angleStep: 3, powerMin: 0.2, powerStep: 0.05 };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
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

interface Fx {
  particles: Particle[];
  popups: Popup[];
  trail: Vec[];
  shake: number;
  squash: number;
  squashAngle: number;
  spin: number;
  /** 비행이 끝난 말랑이가 사라지는 정도 (0~1) */
  fade: number;
  lastImpactSound: number;
}

type AimSource = 'none' | 'drag' | 'key';

interface Banner {
  text: string;
  sub?: string;
  key: number;
}

const newFx = (): Fx => ({
  particles: [],
  popups: [],
  trail: [],
  shake: 0,
  squash: 0,
  squashAngle: 0,
  spin: 0,
  fade: 0,
  lastImpactSound: -1000,
});

// ── 그리기 ──────────────────────────────────────────────────

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

function drawCracks(ctx: CanvasRenderingContext2D, b: Body, left: number, top: number) {
  const ratio = b.hp / b.maxHp;
  if (ratio > 0.65) return;
  ctx.strokeStyle = 'rgba(43,34,51,0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const cx = left + b.w * 0.55;
  ctx.moveTo(cx, top + 1);
  ctx.lineTo(cx - b.w * 0.12, top + b.h * 0.35);
  ctx.lineTo(cx + b.w * 0.08, top + b.h * 0.55);
  if (ratio < 0.35) {
    ctx.lineTo(cx - b.w * 0.1, top + b.h - 1);
    ctx.moveTo(cx - b.w * 0.12, top + b.h * 0.35);
    ctx.lineTo(left + 2, top + b.h * 0.45);
  }
  ctx.stroke();
}

function drawBlock(ctx: CanvasRenderingContext2D, b: Body) {
  const left = b.x - b.w / 2;
  const top = b.y - b.h / 2;
  if (b.kind === 'shelf') {
    ctx.fillStyle = '#e9c99a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    // 벽 받침대
    ctx.beginPath();
    ctx.moveTo(left + b.w - 4, top + b.h);
    ctx.lineTo(left + b.w - 4, top + b.h + 40);
    ctx.lineTo(left + b.w - 40, top + b.h);
    ctx.closePath();
    ctx.fillStyle = '#d4a86a';
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, left, top, b.w + 6, b.h, 4);
    ctx.fillStyle = '#e9c99a';
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (b.kind === 'choco') {
    roundRect(ctx, left, top, b.w, b.h, 4);
    ctx.fillStyle = CHOCO;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // 초코 칸 무늬
    ctx.strokeStyle = darken(CHOCO, 0.35);
    ctx.lineWidth = 1.5;
    const cell = 13;
    ctx.beginPath();
    for (let y = top + cell; y < top + b.h - 2; y += cell) {
      ctx.moveTo(left, y);
      ctx.lineTo(left + b.w, y);
    }
    for (let x = left + cell; x < left + b.w - 2; x += cell) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + b.h);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(left + 3, top + 3, Math.max(2, b.w * 0.25), Math.max(2, Math.min(b.h - 6, 10)));
    ctx.restore();
  } else {
    const color = JELLY_COLORS[b.id % JELLY_COLORS.length] ?? JELLY_COLORS[0]!;
    const grad = ctx.createLinearGradient(0, top, 0, top + b.h);
    grad.addColorStop(0, lighten(color, 0.45));
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, darken(color, 0.12));
    roundRect(ctx, left, top, b.w, b.h, 6);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    roundRect(ctx, left + 4, top + 3, Math.min(b.w * 0.4, 22), 3, 1.5);
    ctx.fill();
  }
  roundRect(ctx, left, top, b.w, b.h, b.kind === 'choco' ? 4 : 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawCracks(ctx, b, left, top);
}

/** 심술 사탕: 양옆 포장지 매듭 + 찌푸린 얼굴 */
function drawEnemy(ctx: CanvasRenderingContext2D, b: Body, t: number, reduced: boolean) {
  const r = b.w / 2;
  const color = ENEMY_COLORS[b.id % ENEMY_COLORS.length] ?? ENEMY_COLORS[0]!;
  const hurt = b.hp < b.maxHp;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (!reduced && !b.awake) ctx.rotate(Math.sin(t / 380 + b.id) * 0.08);
  else if (b.awake) ctx.rotate(b.vx / 400);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  // 포장지 매듭
  ctx.fillStyle = lighten(color, 0.35);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * (r - 2), 0);
    ctx.lineTo(dir * (r + 8), -7);
    ctx.lineTo(dir * (r + 6), 0);
    ctx.lineTo(dir * (r + 8), 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 몸통
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
  grad.addColorStop(0, lighten(color, 0.5));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // 소용돌이 줄무늬
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(r * 0.2, r * 0.9, r * 0.9, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // 얼굴
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // 찌푸린 눈썹
  ctx.moveTo(-r * 0.62, -r * 0.38);
  ctx.lineTo(-r * 0.18, -r * 0.18);
  ctx.moveTo(r * 0.62, -r * 0.38);
  ctx.lineTo(r * 0.18, -r * 0.18);
  ctx.stroke();
  if (hurt) {
    // 어질어질한 눈
    ctx.lineWidth = 1.6;
    for (const ex of [-r * 0.36, r * 0.36]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, -r * 0.02 - 2.5);
      ctx.lineTo(ex + 2.5, -r * 0.02 + 2.5);
      ctx.moveTo(ex + 2.5, -r * 0.02 - 2.5);
      ctx.lineTo(ex - 2.5, -r * 0.02 + 2.5);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = INK;
    for (const ex of [-r * 0.36, r * 0.36]) {
      ctx.beginPath();
      ctx.arc(ex, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 삐죽 입
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.52);
  ctx.quadraticCurveTo(0, r * 0.28, r * 0.3, r * 0.52);
  ctx.stroke();
  ctx.restore();
}

function drawSlingBack(ctx: CanvasRenderingContext2D) {
  const baseY = GROUND_Y + 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 기둥 + 갈래 (잉크 외곽선 → 막대사탕 색)
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(SLING.x - 1, baseY);
    ctx.lineTo(SLING.x - 1, SLING.y + 18);
    ctx.lineTo(PRONG_FRONT.x, PRONG_FRONT.y);
    ctx.moveTo(SLING.x - 1, SLING.y + 18);
    ctx.lineTo(PRONG_BACK.x, PRONG_BACK.y);
  };
  path();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 13;
  ctx.stroke();
  path();
  ctx.strokeStyle = '#fff4f7';
  ctx.lineWidth = 7;
  ctx.stroke();
  // 사탕 줄무늬
  ctx.save();
  path();
  ctx.strokeStyle = '#ff7aa2';
  ctx.lineWidth = 7;
  ctx.setLineDash([5, 6]);
  ctx.stroke();
  ctx.restore();
}

function drawBand(ctx: CanvasRenderingContext2D, from: Vec, to: Vec) {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = '#e8527f';
  ctx.lineWidth = 3.5;
  ctx.stroke();
}

interface View {
  aimPull: Vec | null;
  malang: Vec;
  loaded: boolean;
  /** 비행 꼬리 색 (파트너 색) */
  trailColor: string;
  /** 전설 이상 파트너: 꼬리에 작은 별이 섞인다 (장식만) */
  sparkle: boolean;
}

/** 네 갈래 반짝 별 */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const p = r * 0.25;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + p, y - p, x + r, y);
  ctx.quadraticCurveTo(x + p, y + p, x, y + r);
  ctx.quadraticCurveTo(x - p, y + p, x - r, y);
  ctx.quadraticCurveTo(x - p, y - p, x, y - r);
  ctx.fill();
}

function drawScene(ctx: CanvasRenderingContext2D, s: SlingState, view: View, fx: Fx, t: number, reduced: boolean) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  if (fx.shake > 0) ctx.translate(Math.sin(t / 17) * fx.shake * 4, Math.cos(t / 23) * fx.shake * 3);

  // 솜사탕 구름
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, k] of [
    [70, 120, 1],
    [230, 210, 0.8],
    [150, 60, 0.6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx - 18 * k, cy + 4 * k, 14 * k, 0, Math.PI * 2);
    ctx.arc(cx, cy - 6 * k, 20 * k, 0, Math.PI * 2);
    ctx.arc(cx + 20 * k, cy + 3 * k, 15 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // 먼 언덕
  ctx.fillStyle = '#ffe1ec';
  ctx.beginPath();
  ctx.moveTo(-10, GROUND_Y);
  ctx.quadraticCurveTo(70, GROUND_Y - 90, 160, GROUND_Y - 20);
  ctx.quadraticCurveTo(240, GROUND_Y - 110, 330, GROUND_Y - 30);
  ctx.lineTo(330, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // 바닥 (비스킷 선반)
  ctx.fillStyle = '#e9c99a';
  ctx.fillRect(-10, GROUND_Y, WORLD.width + 20, WORLD.height - GROUND_Y + 10);
  ctx.fillStyle = '#d4a86a';
  for (let x = 12; x < WORLD.width; x += 28) {
    ctx.beginPath();
    ctx.arc(x, GROUND_Y + 20, 2.4, 0, Math.PI * 2);
    ctx.arc(x + 14, GROUND_Y + 40, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, GROUND_Y);
  ctx.lineTo(WORLD.width + 10, GROUND_Y);
  ctx.stroke();

  drawSlingBack(ctx);
  // 뒤쪽 고무줄: 장전 중이면 말랑이까지, 아니면 갈래 사이
  if (view.loaded) drawBand(ctx, PRONG_BACK, { x: view.malang.x + 6, y: view.malang.y });
  else drawBand(ctx, PRONG_BACK, PRONG_FRONT);

  // 조준선
  if (view.aimPull) {
    const v = launchVelocity(view.aimPull.x, view.aimPull.y);
    if (v) {
      const dots = previewTrajectory(v, { x: SLING.x + view.aimPull.x, y: SLING.y + view.aimPull.y });
      dots.forEach((d, i) => {
        const r = 4 - i * 0.28;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fffcf5';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    }
  }

  // 비행 궤적 잔상
  if (fx.trail.length > 1) {
    const n = fx.trail.length;
    ctx.fillStyle = view.trailColor;
    fx.trail.forEach((p, i) => {
      if (i % 2) return;
      ctx.globalAlpha = 0.25 + (0.45 * i) / n;
      if (view.sparkle && i % 6 === 0) {
        ctx.fillStyle = '#ffd23f';
        sparkle(ctx, p.x, p.y, 4.5);
        ctx.fillStyle = view.trailColor;
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + (1.4 * i) / n, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  for (const b of s.bodies) {
    if (b.kind === 'enemy') drawEnemy(ctx, b, t, reduced);
    else drawBlock(ctx, b);
  }

  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.age / 90);
    ctx.fillRect(-p.size / 2, -p.size / 5, p.size, (p.size * 2) / 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = `20px ${FONT}`;
  ctx.lineJoin = 'round';
  for (const p of fx.popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 900);
    const py = p.y - (reduced ? 0 : p.age * 0.04);
    ctx.strokeStyle = '#fffcf5';
    ctx.lineWidth = 5;
    ctx.strokeText(p.text, p.x, py);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, py);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function burst(fx: Fx, x: number, y: number, colors: readonly string[], n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 220;
    fx.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 120,
      color: colors[i % colors.length] ?? INK,
      size: 5 + Math.random() * 4,
      age: 0,
      life: 600 + Math.random() * 300,
    });
  }
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function MalangSlingGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const malangRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const trailColor = partnerTrailColor(partner);
  const flair = hasPartnerFlair(partner.rarity);
  const frontBandRef = useRef<SVGLineElement>(null);
  const frontBandInkRef = useRef<SVGLineElement>(null);
  const fireBtnRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<SlingState>(createSlingState(defaultRng));
  const fxRef = useRef<Fx>(newFx());
  const aimRef = useRef<{ pull: Vec; source: AimSource }>({ pull: { x: 0, y: 0 }, source: 'none' });
  const kbRef = useRef({ angle: 35, power: 0.75 });
  const dragRef = useRef<{ id: number; x: number; y: number; level: number } | null>(null);
  const scaleRef = useRef(1);
  const startedRef = useRef(false);
  const reportedRef = useRef(false);
  const bannerKey = useRef(0);
  const [malangPx, setMalangPx] = useState(40);
  const [hud, setHud] = useState({
    score: 0,
    timeLeft: CONFIG.durationMs / 1000,
    stage: 1,
    shotsLeft: CONFIG.shotsPerStage as number,
    phase: 'aim' as SlingPhase,
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [ended, setEnded] = useState(false);

  startedRef.current = started;

  const syncHud = useCallback((s: SlingState) => {
    setHud({ score: s.score, timeLeft: timeLeft(s), stage: s.stageIndex + 1, shotsLeft: s.shotsLeft, phase: s.phase });
  }, []);

  const showBanner = useCallback((text: string, sub?: string) => {
    bannerKey.current += 1;
    setBanner({ text, sub, key: bannerKey.current });
  }, []);

  // 배너는 잠시 뒤 사라진다 (끝 배너는 유지)
  useEffect(() => {
    if (!banner || ended) return;
    const id = window.setTimeout(() => setBanner((b) => (b?.key === banner.key ? null : b)), reduced ? 900 : 1150);
    return () => window.clearTimeout(id);
  }, [banner, ended, reduced]);

  // 캔버스 해상도 + 말랑이 크기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const cssScale = canvas.clientWidth / WORLD.width;
      if (cssScale <= 0) return;
      scaleRef.current = cssScale;
      setMalangPx(Math.round(CONFIG.projectileRadius * 2 * MALANG_SCALE * cssScale));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = cssScale * dpr;
      canvas.width = Math.round(WORLD.width * scale);
      canvas.height = Math.round(WORLD.height * scale);
      canvas.getContext('2d')?.setTransform(scale, 0, 0, scale, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const handleEvents = useCallback(
    (events: SlingEvent[], now: number) => {
      const fx = fxRef.current;
      let hudDirty = false;
      for (const e of events) {
        switch (e.type) {
          case 'launch':
            sfx.jump();
            buddyRef.current?.react('wow', 900, false);
            fx.trail = [];
            fx.fade = 0;
            hudDirty = true;
            break;
          case 'impact': {
            if (!reduced) {
              fx.squash = Math.max(fx.squash, 0.35 + e.strength * 0.65);
              fx.squashAngle = Math.atan2(e.ny, e.nx);
              if (e.strength > 0.55) fx.shake = Math.max(fx.shake, e.strength);
            }
            if (now - fx.lastImpactSound > 90 && e.strength > 0.2) {
              fx.lastImpactSound = now;
              if (e.target === 'ground') sfx.beat(false);
              else if (e.strength > 0.75) {
                sfx.hit();
                buddyRef.current?.react('oops', 500, false);
              }
              else sfx.beat(true);
            }
            break;
          }
          case 'break':
            sfx.flip();
            if (!reduced) burst(fx, e.x, e.y, e.kind === 'choco' ? [CHOCO, '#c98b5e'] : JELLY_COLORS, 8);
            fx.popups.push({ x: e.x, y: e.y - 8, text: `+${e.points}`, color: INK, age: 0 });
            hudDirty = true;
            break;
          case 'pop':
            sfx.pickup();
            buddyRef.current?.react('happy', 800, false);
            if (!reduced) {
              burst(fx, e.x, e.y, ['#ff7aa2', '#ffd23f', '#5cc8ff', '#7ed957', '#b98cff'], 14);
              haptic('tap'); // 진동이 없는 iOS·예외를 던지는 앱 안 브라우저도 안전하게
            }
            fx.popups.push({
              x: Math.max(30, Math.min(WORLD.width - 30, e.x)),
              y: Math.min(e.y, GROUND_Y) - 14,
              text: e.combo > 1 ? `+${e.points} 연속!` : `+${e.points}`,
              color: '#e8527f',
              age: 0,
            });
            hudDirty = true;
            break;
          case 'shotEnd':
            hudDirty = true;
            break;
          case 'stageClear':
            sfx.success();
            buddyRef.current?.setBase('happy');
            showBanner('클리어!', e.leftover > 0 ? `남은 발사 ${e.leftover}번 보너스 +${e.bonus}` : `+${e.bonus}`);
            hudDirty = true;
            break;
          case 'stageFail':
            sfx.fail();
            buddyRef.current?.setBase('sad');
            showBanner('아쉬워요', '다음 스테이지로 가요');
            hudDirty = true;
            break;
          case 'nextStage':
            fxRef.current = newFx();
            buddyRef.current?.setBase('idle');
            showBanner(`스테이지 ${e.stageIndex + 1}`);
            hudDirty = true;
            break;
          case 'finish':
            if (e.reason === 'complete') sfx.success();
            setEnded(true);
            showBanner('끝!');
            hudDirty = true;
            break;
        }
      }
      return hudDirty;
    },
    [reduced, sfx, showBanner],
  );

  const doFire = useCallback(
    (pull: Vec) => {
      if (!startedRef.current) return;
      const r = fire(stateRef.current, pull.x, pull.y);
      if (!r.launched) return;
      stateRef.current = r.state;
      handleEvents(r.events, performance.now());
      syncHud(r.state);
    },
    [handleEvents, syncHud],
  );

  const fireKeyboardAim = useCallback(() => {
    const kb = kbRef.current;
    aimRef.current = { pull: pullFromAngle(kb.angle, kb.power), source: 'key' };
    doFire(aimRef.current.pull);
  }, [doFire]);

  // 키보드: ↑↓ 각도, ←→ 힘, Space/Enter 발사
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!startedRef.current || stateRef.current.finished) return;
      const kb = kbRef.current;
      const target = e.target as Element | null;
      const onOtherControl = !!target && target !== fireBtnRef.current && !!target.closest('button, a, input, select, textarea');
      switch (e.key) {
        case 'ArrowUp':
          kb.angle = Math.min(KB.angleMax, kb.angle + KB.angleStep);
          break;
        case 'ArrowDown':
          kb.angle = Math.max(KB.angleMin, kb.angle - KB.angleStep);
          break;
        case 'ArrowRight':
          kb.power = Math.min(1, kb.power + KB.powerStep);
          break;
        case 'ArrowLeft':
          kb.power = Math.max(KB.powerMin, kb.power - KB.powerStep);
          break;
        case ' ':
        case 'Enter':
          if (onOtherControl) return;
          e.preventDefault();
          if (!e.repeat) fireKeyboardAim();
          return;
        default:
          return;
      }
      e.preventDefault();
      if (dragRef.current) return;
      aimRef.current = { pull: pullFromAngle(kb.angle, kb.power), source: 'key' };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fireKeyboardAim]);

  // 게임 루프
  useEffect(() => {
    if (!started) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    showBanner('스테이지 1');
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const frame = (now: number) => {
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;
      const prev = stateRef.current;
      const { state: s, events } = step(prev, dt);
      stateRef.current = s;
      const fx = fxRef.current;
      const dirty = handleEvents(events, now);

      // 연출 갱신
      const sec = dt / 1000;
      fx.particles = fx.particles
        .map((p) => ({ ...p, age: p.age + dt, vy: p.vy + 900 * sec, x: p.x + p.vx * sec, y: p.y + p.vy * sec }))
        .filter((p) => p.age < p.life);
      fx.popups = fx.popups.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 900);
      fx.shake = Math.max(0, fx.shake - dt / 250);
      fx.squash = Math.max(0, fx.squash - dt / 200);

      const p = s.projectile;
      const aim = aimRef.current;
      const aiming = s.phase === 'aim';
      const aimPull = aiming && aim.source !== 'none' ? clampPull(aim.pull.x, aim.pull.y) : null;
      let malang: Vec = { x: SLING.x, y: SLING.y };
      let visible = aiming;
      if (aimPull) malang = { x: SLING.x + aimPull.x, y: SLING.y + aimPull.y };
      if (!aiming && p) {
        malang = { x: p.x, y: p.y };
        if (p.active) {
          visible = true;
          if (!reduced) {
            fx.spin += (p.vx * sec) / CONFIG.projectileRadius / 2;
            fx.trail.push({ x: p.x, y: p.y });
            if (fx.trail.length > 40) fx.trail.shift();
          }
        } else {
          fx.fade = Math.min(1, fx.fade + dt / 450);
          visible = fx.fade < 1;
        }
      }
      if (aiming) {
        fx.fade = 0;
        fx.spin = 0;
      }

      drawScene(ctx, s, { aimPull, malang, loaded: aiming && !!aimPull, trailColor, sparkle: flair }, fx, now, reduced);

      // DOM 말랑이 (캔버스 위)
      const el = malangRef.current;
      if (el) {
        const sc = scaleRef.current;
        const half = (CONFIG.projectileRadius * MALANG_SCALE) * sc;
        const q = fx.squash;
        const a = fx.squashAngle;
        el.style.opacity = visible ? String(p && !p.active && !aiming ? 1 - fx.fade : 1) : '0';
        el.style.transform =
          `translate(${malang.x * sc - half}px, ${malang.y * sc - half}px) ` +
          `rotate(${a}rad) scale(${1 - q * 0.32}, ${1 + q * 0.18}) rotate(${-a + fx.spin}rad)`;
      }
      // 앞쪽 고무줄 (말랑이 위)
      const bandEnd = aiming && aimPull ? { x: malang.x - 6, y: malang.y } : PRONG_BACK;
      for (const line of [frontBandInkRef.current, frontBandRef.current]) {
        if (!line) continue;
        line.setAttribute('x2', String(bandEnd.x));
        line.setAttribute('y2', String(bandEnd.y));
        line.style.visibility = aiming && aimPull ? 'visible' : 'hidden';
      }

      hudAcc += dt;
      if (dirty || hudAcc > 150 || s.phase !== prev.phase) {
        hudAcc = 0;
        syncHud(s);
      }
      if (!s.finished || fx.particles.length > 0 || fx.popups.length > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, reduced, handleEvents, showBanner, syncHud, trailColor, flair]);

  // 종료 처리: onFinish는 한 번만
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(
      () => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const s = stateRef.current;
        onFinish({ score: s.score, stats: { '심술 사탕': s.pops, '부순 블록': s.blocksBroken, 클리어: s.stagesCleared } });
      },
      reduced ? 250 : 1100,
    );
    return () => window.clearTimeout(id);
  }, [ended, onFinish, reduced]);

  // ── 포인터: 화면 어디서든 끌어서 당기기 ──

  const toWorld = (e: ReactPointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const k = rect && rect.width > 0 ? WORLD.width / rect.width : 1;
    return { x: e.clientX * k, y: e.clientY * k };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!startedRef.current || stateRef.current.phase !== 'aim' || dragRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    dragRef.current = { id: e.pointerId, x: w.x, y: w.y, level: 0 };
    aimRef.current = { pull: { x: 0, y: 0 }, source: 'drag' };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const w = toWorld(e);
    const pull = clampPull(w.x - d.x, w.y - d.y);
    aimRef.current = { pull, source: 'drag' };
    const level = Math.floor((Math.hypot(pull.x, pull.y) / CONFIG.maxPull) * 4 + 1e-6);
    if (level > d.level) sfx.tap(level * 2);
    d.level = level;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const pull = aimRef.current.pull;
    aimRef.current = { pull: { x: 0, y: 0 }, source: 'none' };
    doFire(pull);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    aimRef.current = { pull: { x: 0, y: 0 }, source: 'none' };
  };

  const onFirePointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    fireKeyboardAim();
  };

  const waiting = Math.max(0, hud.phase === 'aim' ? hud.shotsLeft - 1 : hud.shotsLeft);
  const canFire = started && !ended && hud.phase === 'aim';

  return (
    <div className="sl">
      <GameHud timeLeft={hud.timeLeft} totalTime={CONFIG.durationMs / 1000} score={hud.score} onExit={onExit} />
      <p className="sl__info small" aria-live="off">
        <span className="sl__stage-no">
          스테이지 {hud.stage}/{CONFIG.stageCount}
        </span>
        <span className="muted">남은 발사 {hud.shotsLeft}번</span>
      </p>
      <div
        ref={stageRef}
        className="sl__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <canvas
          ref={canvasRef}
          className="sl__canvas"
          role="img"
          aria-label="말랑 새총 게임 화면. 화면을 뒤로 끌었다가 놓으면 말랑이가 날아가요. 키보드는 위아래 방향키로 각도, 좌우 방향키로 힘을 정하고 Space로 발사해요."
        />
        {Array.from({ length: waiting }, (_, i) => (
          <div
            key={i}
            className="sl__waiting"
            style={{ left: `${((SLING.x - 36 - i * 27) / WORLD.width) * 100}%`, top: `${((GROUND_Y - 13) / WORLD.height) * 100}%` }}
            aria-hidden="true"
          >
            <Malang character={partner} size={Math.round(malangPx * 0.62)} animation="none" shiny={partnerShiny} decorative />
          </div>
        ))}
        <div ref={malangRef} className="sl__malang" aria-hidden="true">
          <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={malangPx} animation="none" emote={false} />
        </div>
        <svg className="sl__front" viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} aria-hidden="true">
          <line ref={frontBandInkRef} x1={PRONG_FRONT.x} y1={PRONG_FRONT.y} x2={PRONG_BACK.x} y2={PRONG_BACK.y} stroke={INK} strokeWidth={7} strokeLinecap="round" />
          <line ref={frontBandRef} x1={PRONG_FRONT.x} y1={PRONG_FRONT.y} x2={PRONG_BACK.x} y2={PRONG_BACK.y} stroke="#e8527f" strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={PRONG_FRONT.x} cy={PRONG_FRONT.y} r={4.5} fill="#ff7aa2" stroke={INK} strokeWidth={2.5} />
        </svg>
        <Countdown count={count} />
        {banner && (
          <div className={`sl__banner${ended ? ' is-end' : ''}`} role="status" key={banner.key}>
            <strong>{banner.text}</strong>
            {banner.sub && <span>{banner.sub}</span>}
          </div>
        )}
      </div>
      <div className="sl__controls">
        <p className="sl__help small muted">뒤로 끌었다가 놓으면 날아가요</p>
        <button
          ref={fireBtnRef}
          type="button"
          className="btn btn--primary sl__fire"
          aria-disabled={!canFire}
          aria-keyshortcuts="Space"
          onPointerDown={onFirePointer}
          onFocus={() => {
            if (aimRef.current.source === 'none') {
              const kb = kbRef.current;
              aimRef.current = { pull: pullFromAngle(kb.angle, kb.power), source: 'key' };
            }
          }}
          // 포인터와 키보드는 위 핸들러가 처리하므로 click은 무시 (중복 방지)
          onClick={(e) => e.preventDefault()}
        >
          발사
        </button>
      </div>
    </div>
  );
}

function SlingIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 44 V30 L7 16 M14 30 L21 16" stroke="#2b2233" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 44 V30 L7 16 M14 30 L21 16" stroke="#ff9fbd" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16 Q12 24 21 16" stroke="#e8527f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="15" r="8" fill="#8ecdf7" stroke="#2b2233" strokeWidth="3" />
      <circle cx="30.5" cy="14" r="1.4" fill="#2b2233" />
      <circle cx="35.5" cy="14" r="1.4" fill="#2b2233" />
      <path d="M25 22 l-4 3 M23 18 l-5 1" stroke="#2b2233" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="29" y="34" width="14" height="10" rx="3" fill="#ffd966" stroke="#2b2233" strokeWidth="3" />
      <circle cx="36" cy="28" r="5" fill="#b98cff" stroke="#2b2233" strokeWidth="2.5" />
      <path d="M33.5 26.5 l1.8 1 M38.5 26.5 l-1.8 1" stroke="#2b2233" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const malangSling: MiniGame = {
  id: 'malang-sling',
  name: '말랑 새총',
  description: '새총으로 말랑이를 날려 심술 사탕 탑을 무너뜨려요.',
  controls: '뒤로 끌었다 놓기, 또는 방향키로 조준하고 Space',
  durationMs: CONFIG.durationMs,
  blurb: '새총으로 날리기',
  tags: ['pick', 'feel'],
  icon: SlingIcon,
  Component: MalangSlingGame,
};

export default malangSling;
