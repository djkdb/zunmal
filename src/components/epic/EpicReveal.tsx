import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { playRarityFanfare, sfx } from '../../audio/sfx';
import type { Rarity } from '../../data/rarity';
import type { ResolvedPull } from '../../gacha/engine';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Malang } from '../Malang';
import { lifeRatio, spawnBurst, spawnInward, spawnRain, spawnWarp, stepParticles, type Particle } from './particles';
import './EpicReveal.css';

/** 신화 이상만 이 연출을 쓴다 */
export function isEpicRarity(rarity: Rarity): boolean {
  return rarity === 'mythic' || rarity === 'secret';
}

type Phase = 'charge' | 'burst' | 'reveal' | 'title';

interface Script {
  /** 모으기 길이 (ms) — 이 시점에 폭발 */
  charge: number;
  /** 폭발 → 말랑이 등장까지 */
  reveal: number;
  /** 등장 → 제목 도장까지 */
  title: number;
  /** 제목 이후 자동으로 넘어가기까지 */
  hold: number;
  colors: readonly string[];
  burstKind: Particle['kind'];
  title1: string;
}

const SCRIPTS: Record<'mythic' | 'secret', Script> = {
  mythic: {
    charge: 1500,
    reveal: 350,
    title: 800,
    hold: 2600,
    colors: ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff', '#ffffff'],
    burstKind: 'dot',
    title1: '신화!',
  },
  secret: {
    charge: 2600,
    reveal: 450,
    title: 1000,
    hold: 3400,
    colors: ['#ffe07a', '#ffffff', '#cdb2ff', '#7fe0ff', '#ff9fd1'],
    burstKind: 'star',
    title1: '시크릿!!',
  },
};

interface EpicRevealProps {
  item: ResolvedPull;
  onDone(): void;
}

/** 4각 별 경로 */
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

/**
 * 신화·시크릿 등장 전체 화면 연출.
 * 모으기(캡슐 떨림 + 빛 흡수) → 폭발(섬광·충격파·입자) → 등장(광선 + 말랑이) → 제목 도장.
 * 화면을 누르면 바로 넘어간다. 움직임 줄이기 설정이면 정지된 짧은 카드만 보여준다.
 */
export function EpicReveal({ item, onDone }: EpicRevealProps) {
  const reduced = useReducedMotion();
  const tier = item.rarity === 'secret' ? 'secret' : 'mythic';
  const script = SCRIPTS[tier];
  const [phase, setPhase] = useState<Phase>(reduced ? 'title' : 'charge');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const mountedAt = useRef(performance.now());
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  // 타임라인
  useEffect(() => {
    if (reduced) {
      playRarityFanfare(sfx, item.rarity, item.shiny);
      const id = window.setTimeout(finish, 2200);
      return () => window.clearTimeout(id);
    }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    sfx.epicRiser(script.charge / 1000);
    if (tier === 'secret') at(200, () => sfx.secretTease());
    at(script.charge, () => {
      setPhase('burst');
      sfx.epicImpact();
      try {
        navigator.vibrate?.([40, 30, 90]);
      } catch {
        // 진동 미지원 기기 무시
      }
    });
    at(script.charge + script.reveal, () => {
      setPhase('reveal');
      playRarityFanfare(sfx, item.rarity, item.shiny);
    });
    at(script.charge + script.reveal + script.title, () => {
      setPhase('title');
      sfx.shinyChime();
    });
    at(script.charge + script.reveal + script.title + script.hold, finish);
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduced, script, tier, item.rarity, item.shiny, finish]);

  // 입자 캔버스 루프
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rng = defaultRng;
    let raf = 0;
    let last = performance.now();
    let spawnAcc = 0;
    let burstDone = false;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h * 0.45;
      const ph = phaseRef.current;
      spawnAcc += dt;
      if (spawnAcc > 40) {
        spawnAcc = 0;
        if (ph === 'charge') {
          particles.current.push(...spawnInward(rng, tier === 'secret' ? 5 : 4, w, h, cx, cy, script.colors));
          if (tier === 'secret') particles.current.push(...spawnWarp(rng, 6, cx, cy, ['#ffffff', '#cdb2ff', '#7fe0ff']));
        } else if (ph === 'reveal' || ph === 'title') {
          if (rng() < 0.6) particles.current.push(...spawnRain(rng, 2, w, script.colors, tier === 'secret' ? 'star' : 'dot'));
        }
      }
      if ((ph === 'burst' || ph === 'reveal') && !burstDone) {
        burstDone = true;
        particles.current.push(...spawnBurst(rng, tier === 'secret' ? 260 : 200, cx, cy, script.colors, script.burstKind, 1.1));
        particles.current.push(...spawnBurst(rng, 90, cx, cy, ['#ffffff'], 'dot', 0.6));
      }
      // 입자 수 상한 (저사양 기기 보호)
      if (particles.current.length > 900) particles.current = particles.current.slice(-900);
      particles.current = stepParticles(particles.current, dt);
      ctx.clearRect(0, 0, w, h);
      drawParticles(ctx, particles.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduced, script, tier]);

  // 키보드: Enter/Space/Esc로 넘어가기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const showMalang = phase === 'reveal' || phase === 'title';
  const style = { '--charge': `${script.charge}ms` } as CSSProperties;

  return (
    <div
      className={`epic epic--${tier} epic--${phase}${reduced ? ' epic--still' : ''}${item.shiny ? ' is-shiny' : ''}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={`${tier === 'secret' ? '시크릿' : '신화'} 말랑이 등장`}
      onPointerDown={() => {
        // 캡슐을 연 손가락이 그대로 한 번 더 닿아 바로 넘어가지 않도록 처음 0.5초는 무시
        if (performance.now() - mountedAt.current > 500) finish();
      }}
    >
      <div className="epic__bg" aria-hidden="true" />
      {tier === 'secret' && <div className="epic__nebula" aria-hidden="true" />}
      <div className="epic__rays" aria-hidden="true" />
      <canvas ref={canvasRef} className="epic__canvas" aria-hidden="true" />

      {(phase === 'charge' || phase === 'burst') && !reduced && (
        <div className="epic__capsule" aria-hidden="true">
          <svg viewBox="-60 -60 120 120" width="100%" height="100%">
            <defs>
              <radialGradient id="epic-cap" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor={tier === 'secret' ? '#8f6bff' : '#fff6c9'} />
                <stop offset="0.6" stopColor={tier === 'secret' ? '#2d1b5e' : '#ff8fab'} />
                <stop offset="1" stopColor={tier === 'secret' ? '#120a2e' : '#b98cff'} />
              </radialGradient>
            </defs>
            <g className="epic__half epic__half--top">
              <path d="M-48 0 A48 48 0 0 1 48 0 Z" fill="url(#epic-cap)" stroke="#2b2233" strokeWidth="5" />
              <ellipse cx="-18" cy="-26" rx="12" ry="6" fill="#fff" opacity="0.7" transform="rotate(-30 -18 -26)" />
            </g>
            <g className="epic__half epic__half--bottom">
              <path d="M-48 0 A48 48 0 0 0 48 0 Z" fill="#fffdf8" stroke="#2b2233" strokeWidth="5" />
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

      {phase === 'burst' && (
        <>
          <div className="epic__flash" aria-hidden="true" />
          <div className="epic__shock epic__shock--1" aria-hidden="true" />
          <div className="epic__shock epic__shock--2" aria-hidden="true" />
          <div className="epic__shock epic__shock--3" aria-hidden="true" />
        </>
      )}

      {showMalang && (
        <div className="epic__stage">
          <div className="epic__malang">
            <Malang character={item.character} size={230} animation="bounce" decorative aura="auto" shiny={item.shiny} />
          </div>
        </div>
      )}

      {phase === 'title' && (
        <div className="epic__titles">
          <p className="epic__title">{script.title1}</p>
          <p className="epic__name">
            {item.shiny ? '반짝 ' : ''}
            {item.character.name}
          </p>
        </div>
      )}

      <p className="epic__skip">{phase === 'title' ? '화면을 누르면 계속' : '화면을 누르면 건너뛰기'}</p>
    </div>
  );
}
