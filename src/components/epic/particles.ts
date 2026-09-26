/**
 * 신화 이상 등장 연출용 입자 시스템 — 순수 함수 (Canvas/DOM 무관, RNG 주입).
 * 좌표 단위는 CSS 픽셀, 시간은 ms.
 */
import type { RNG } from '../../lib/rng';

export type ParticleKind = 'dot' | 'star' | 'streak';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 남은 수명 (ms) */
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  /** 초당 속도 감쇠 비율 (0~1, 1이면 감쇠 없음) */
  drag: number;
  /** 아래로 당기는 힘 (px/s²) */
  gravity: number;
  /** 회전 (별 모양용) */
  spin: number;
  angle: number;
}

function pick<T>(rng: RNG, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;
}

/** 화면 가장자리에서 중심으로 빨려 들어가는 입자 (모으기 단계) */
export function spawnInward(
  rng: RNG,
  n: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  colors: readonly string[],
): Particle[] {
  const r = Math.hypot(w, h) * 0.55;
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const dist = r * (0.7 + rng() * 0.4);
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist;
    const life = 500 + rng() * 500;
    // 수명 안에 중심에 닿는 속도
    const speed = (dist / life) * 1000;
    return {
      x,
      y,
      vx: -Math.cos(a) * speed,
      vy: -Math.sin(a) * speed,
      life,
      maxLife: life,
      size: 1.5 + rng() * 2.5,
      color: pick(rng, colors),
      kind: 'streak',
      drag: 1,
      gravity: 0,
      spin: 0,
      angle: 0,
    };
  });
}

/** 중심에서 사방으로 터지는 입자 (폭발 단계) */
export function spawnBurst(
  rng: RNG,
  n: number,
  cx: number,
  cy: number,
  colors: readonly string[],
  kind: ParticleKind = 'dot',
  power = 1,
): Particle[] {
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const speed = (250 + rng() * 900) * power;
    const life = 900 + rng() * 1400;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      maxLife: life,
      size: kind === 'star' ? 4 + rng() * 7 : 2 + rng() * 4,
      color: pick(rng, colors),
      kind,
      drag: 0.12 + rng() * 0.2,
      gravity: 120 + rng() * 160,
      spin: (rng() - 0.5) * 12,
      angle: rng() * Math.PI,
    };
  });
}

/** 위에서 천천히 내리는 빛가루 (등장 후 계속) */
export function spawnRain(rng: RNG, n: number, w: number, colors: readonly string[], kind: ParticleKind = 'star'): Particle[] {
  return Array.from({ length: n }, () => {
    const life = 2200 + rng() * 1800;
    return {
      x: rng() * w,
      y: -10 - rng() * 60,
      vx: (rng() - 0.5) * 30,
      vy: 60 + rng() * 90,
      life,
      maxLife: life,
      size: kind === 'star' ? 3 + rng() * 5 : 1.5 + rng() * 2.5,
      color: pick(rng, colors),
      kind,
      drag: 1,
      gravity: 0,
      spin: (rng() - 0.5) * 4,
      angle: rng() * Math.PI,
    };
  });
}

/** 화면 중심에서 바깥으로 길게 늘어나는 별빛 (시크릿 워프) */
export function spawnWarp(rng: RNG, n: number, cx: number, cy: number, colors: readonly string[]): Particle[] {
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const start = 10 + rng() * 60;
    const speed = 300 + rng() * 700;
    const life = 500 + rng() * 600;
    return {
      x: cx + Math.cos(a) * start,
      y: cy + Math.sin(a) * start,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      maxLife: life,
      size: 1 + rng() * 2,
      color: pick(rng, colors),
      kind: 'streak',
      // 음수 감쇠 = 가속 (1.x) — 멀어질수록 빨라져 워프처럼 보인다
      drag: 2.2,
      gravity: 0,
      spin: 0,
      angle: 0,
    };
  });
}

/**
 * dt(ms)만큼 입자를 진행한다. 수명이 다한 입자는 빠진다.
 * drag는 "1초 뒤 남는 속도 비율"이다 (0.2면 1초 뒤 20%, 2.2면 1초 뒤 220%로 가속).
 */
export function stepParticles(particles: readonly Particle[], dtMs: number): Particle[] {
  const dt = Math.max(0, Math.min(dtMs, 50)) / 1000;
  const out: Particle[] = [];
  for (const p of particles) {
    const life = p.life - dt * 1000;
    if (life <= 0) continue;
    const k = p.drag ** dt;
    const vx = p.vx * k;
    const vy = p.vy * k + p.gravity * dt;
    out.push({ ...p, x: p.x + vx * dt, y: p.y + vy * dt, vx, vy, life, angle: p.angle + p.spin * dt });
  }
  return out;
}

/** 0~1: 수명 대비 남은 비율 (투명도 계산용) */
export function lifeRatio(p: Particle): number {
  return Math.max(0, Math.min(1, p.life / p.maxLife));
}
