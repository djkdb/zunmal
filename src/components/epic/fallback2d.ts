/**
 * 신화·시크릿 등장의 2D 대체 (WebGL을 못 쓰거나 3D 모듈을 1.5초 안에 못 받았을 때).
 * 3D와 같은 감독 표(director.ts)·같은 시계를 읽어 컷마다 단순한 입자 장면을 그린다 — 컷 박자가 3D와 같다.
 * 캡슐·배출구·무지개 아치·광선 같은 큰 모양은 DOM(CSS)이 컷 클래스로 그리고, 여기서는 입자와 고리만 그린다.
 * 카메라 구도는 캔버스 확대·기울기(거리 10 = 1배)로 흉내 낸다.
 */
import type { RNG } from '../../lib/rng';
import { RING_LOCKS, RING_LOCK_MS, SUPERNOVA_DELAY, IMPLODE_SUCK_MS, cameraAt, shakeAt, shotAt, type Timeline } from './director';
import { lifeRatio, spawnBurst, spawnInward, spawnRain, spawnSpiral, spawnStream, spawnWarp, stepParticles, type Particle } from './particles';
import type { EpicTheme } from './themes';
import { STAGE_Y } from './stage';

/** 입자 수 상한 (저사양 기기 보호) */
const MAX = 900;

function starPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r, 0);
  ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r);
  ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r, 0);
  ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r);
  ctx.closePath();
}

function drawParticles(ctx: CanvasRenderingContext2D, ps: readonly Particle[]) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const a = lifeRatio(p);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === 'streak') {
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.stroke();
    } else if (p.kind === 'star') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      starPath(ctx, p.size * (0.6 + a * 0.4));
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export interface Fallback2dOptions {
  timeline: Timeline;
  theme: EpicTheme;
  rng: RNG;
  clock(): number;
  /** 컷 구도를 CSS 변수로 알려 줄 요소 (--cam-zoom, --cam-roll) */
  root: HTMLElement | null;
}

/** 캔버스 루프를 시작하고 멈추는 함수를 돌려준다 */
export function runFallback2d(canvas: HTMLCanvasElement, opts: Fallback2dOptions): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const { timeline: tl, theme, rng } = opts;
  const secret = tl.tier === 'secret';
  const colors = theme.palette;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  let ps: Particle[] = [];
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let shotIndex = -1;
  let local = 0;
  const fired = new Set<string>();
  const once = (key: string, at: number) => {
    if (local < at || fired.has(key)) return false;
    fired.add(key);
    return local - at < 150;
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = now - last;
    last = now;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h * STAGE_Y;
    const at = shotAt(tl, Math.max(0, opts.clock()));
    if (at.index !== shotIndex) {
      shotIndex = at.index;
      fired.clear();
      // 딱 끊는 컷은 앞 컷의 입자를 치운다
      if (at.shot.transitionIn !== 'none') ps = [];
    }
    local = at.local;
    const id = at.shot.id;
    const p = at.progress;
    const pose = cameraAt(at.shot.camera, p);
    const zoom = Math.min(2.2, Math.max(0.6, 10 / pose.dist));
    const shake = shakeAt(at.shot.camera, local) * 14;
    opts.root?.style.setProperty('--cam-zoom', zoom.toFixed(3));
    opts.root?.style.setProperty('--cam-roll', `${((pose.roll * 180) / Math.PI).toFixed(2)}deg`);

    acc += dt;
    const tick = acc > 40;
    if (tick) acc = 0;
    switch (id) {
      case 'chute':
        if (tick && rng() < 0.5) ps.push(...spawnRain(rng, 1, w, [theme.crack], 'dot').map((q) => ({ ...q, vy: q.vy * 0.3 })));
        break;
      case 'rise':
        if (tick) ps.push(...spawnSpiral(rng, 5, w, h, cx, cy, colors, 0.9));
        break;
      case 'burst':
      case 'supernova':
        if (once('burst', 0)) {
          ps.push(...spawnBurst(rng, secret ? 220 : 200, cx, cy, colors, secret ? 'star' : 'dot', 1.1));
          ps.push(...spawnBurst(rng, 90, cx, cy, ['#ffffff'], 'dot', 0.6));
        }
        if (id === 'supernova' && once('nova', SUPERNOVA_DELAY)) {
          ps.push(...spawnBurst(rng, 180, cx, cy, ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff', '#ffffff'], 'star', 1.5));
        }
        break;
      case 'world':
        if (!tick) break;
        if (theme.motif === 'galaxy') {
          ps.push(...spawnWarp(rng, 7, cx, cy, colors));
          ps.push(...spawnSpiral(rng, 2, w, h, cx, cy, colors, 1.4));
        } else if (theme.motif === 'phoenix') {
          ps.push(...spawnStream(rng, 5, w, h, colors, 1));
        } else if (theme.motif === 'ocean') {
          ps.push(...spawnWarp(rng, 8, cx, cy, ['#ffffff', '#bfefff', '#7fe0ff']));
        } else if (theme.motif === 'rainbow') {
          ps.push(...spawnRain(rng, 2, w, colors, 'star').map((q) => ({ ...q, y: h + 10, vy: -q.vy })));
        } else {
          ps.push(...spawnRain(rng, 3, w, colors, 'star'));
        }
        break;
      case 'hero':
      case 'title':
      case 'silhouette':
        if (tick && rng() < 0.6) ps.push(...spawnRain(rng, 2, w, colors, secret ? 'star' : 'dot'));
        if (id === 'hero' && once('land', 380)) ps.push(...spawnBurst(rng, 50, cx, cy + 110, [...colors, '#ffffff'], 'star', 0.4));
        if (id === 'silhouette' && once('color', 380)) ps.push(...spawnBurst(rng, 80, cx, cy, [...colors, '#ffffff'], 'star', 0.6));
        break;
      case 'comet': {
        const k = Math.min(1, local / 760);
        const e = k * k;
        if (local < 760) {
          const x = cx + 150 * (1 - e);
          const y = cy - (cy + 40) * (1 - e);
          ps.push(...spawnBurst(rng, 4, x, y, ['#ffffff', theme.core], 'star', 0.08));
        }
        if (once('land', 760)) ps.push(...spawnBurst(rng, 70, cx, cy + 60, colors, 'dot', 0.5));
        break;
      }
      case 'rings':
        if (tick && local > (RING_LOCKS[2] ?? 0)) ps.push(...spawnInward(rng, 6, w, h, cx, cy, colors));
        break;
      case 'implode':
        if (local < IMPLODE_SUCK_MS && tick) ps.push(...spawnInward(rng, 14, w, h, cx, cy, ['#ffffff']).map((q) => ({ ...q, vx: q.vx * 3, vy: q.vy * 3, life: q.life / 3, maxLife: q.maxLife / 3 })));
        if (local >= IMPLODE_SUCK_MS && once('silence', IMPLODE_SUCK_MS)) ps = [];
        break;
      case 'omen':
        break;
    }
    if (ps.length > MAX) ps = ps.slice(-MAX);
    ps = stepParticles(ps, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // 카메라: 무대 가운데를 기준으로 확대·기울기 (+ 흔들림)
    ctx.translate(cx + (rng() - 0.5) * shake, cy + (rng() - 0.5) * shake);
    ctx.rotate(pose.roll);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    drawParticles(ctx, ps);

    // 시크릿 혼천의 고리 (올려다본 타원) — 날아와 잠긴다
    if (secret && (id === 'rings' || id === 'implode' || id === 'title')) {
      const shrink = id === 'implode' ? Math.max(0, 1 - local / IMPLODE_SUCK_MS) : 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 2.5;
      RING_LOCKS.forEach((lockAt, i) => {
        const k = id === 'rings' ? Math.min(1, Math.max(0, (local - (lockAt - RING_LOCK_MS)) / RING_LOCK_MS)) : 1;
        if (k <= 0 || shrink <= 0) return;
        const e = 1 - (1 - k) ** 3;
        const r = 150 * (2.6 - e * 1.6) * shrink;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate([0.2, -0.9, 1.2][i]! + (1 - e) * 4 + now / 1000 * (i % 2 ? -0.4 : 0.4));
        ctx.globalAlpha = e * 0.9;
        ctx.strokeStyle = theme.rayColors[i % theme.rayColors.length] ?? '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * [0.32, 0.45, 0.8][i]!, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // 전조의 별 하나 / 무음 속 바늘 끝 빛
    if (id === 'omen' || (id === 'implode' && local >= IMPLODE_SUCK_MS)) {
      const x = id === 'omen' ? cx + 70 : cx;
      const y = id === 'omen' ? cy - 190 : cy;
      const r = 6 + Math.sin(now / 90) * 2 + (id === 'omen' ? p * 6 : 0);
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      starPath(ctx, r * 2.2);
      ctx.fill();
      ctx.restore();
    }
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
