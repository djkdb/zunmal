import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../lib/rng';
import { lifeRatio, spawnBurst, spawnInward, spawnRain, spawnSpiral, spawnStream, spawnWarp, stepParticles } from './particles';

const COLORS = ['#fff', '#ffd23f'];

describe('epic particles', () => {
  it('각 스폰 함수는 요청한 개수를 만든다', () => {
    const rng = createSeededRng(1);
    expect(spawnInward(rng, 30, 360, 740, 180, 370, COLORS)).toHaveLength(30);
    expect(spawnBurst(rng, 50, 180, 370, COLORS, 'star')).toHaveLength(50);
    expect(spawnRain(rng, 20, 360, COLORS)).toHaveLength(20);
    expect(spawnWarp(rng, 40, 180, 370, COLORS)).toHaveLength(40);
  });

  it('빨려 드는 입자는 수명이 끝날 때쯤 중심 근처에 있다', () => {
    const rng = createSeededRng(2);
    for (const start of spawnInward(rng, 20, 360, 740, 180, 370, COLORS)) {
      let ps = [start];
      let last = start;
      while (ps.length) {
        last = ps[0]!;
        ps = stepParticles(ps, 16);
      }
      // 사라지기 직전 위치가 중심에서 가깝다
      expect(Math.hypot(last.x - 180, last.y - 370)).toBeLessThan(40);
    }
  });

  it('폭발 입자는 중심에서 멀어지고 수명이 다하면 사라진다', () => {
    const rng = createSeededRng(3);
    let ps = spawnBurst(rng, 30, 100, 100, COLORS);
    ps = stepParticles(ps, 50);
    ps.forEach((p) => expect(Math.hypot(p.x - 100, p.y - 100)).toBeGreaterThan(0));
    for (let i = 0; i < 200; i++) ps = stepParticles(ps, 50);
    expect(ps).toHaveLength(0);
  });

  it('소용돌이 입자는 돌면서 중심으로 다가간다', () => {
    const rng = createSeededRng(5);
    for (const start of spawnSpiral(rng, 20, 360, 740, 180, 370, COLORS, 0.8)) {
      const d0 = Math.hypot(start.x - 180, start.y - 370);
      // 접선 성분이 있다 (안쪽을 곧장 향하지 않음)
      const cross = (start.x - 180) * start.vy - (start.y - 370) * start.vx;
      expect(Math.abs(cross)).toBeGreaterThan(0);
      const [later] = stepParticles([start], 200);
      expect(Math.hypot(later!.x - 180, later!.y - 370)).toBeLessThan(d0);
    }
  });

  it('세로 빛줄기는 방향대로 화면을 가로지른다', () => {
    const rng = createSeededRng(6);
    const down = spawnStream(rng, 10, 360, 740, COLORS, 1);
    const up = spawnStream(rng, 10, 360, 740, COLORS, -1);
    down.forEach((p) => {
      expect(p.y).toBeLessThan(0);
      expect(p.vy).toBeGreaterThan(0);
      expect(p.y + (p.vy * p.life) / 1000).toBeGreaterThan(740);
    });
    up.forEach((p) => expect(p.vy).toBeLessThan(0));
  });

  it('큰 dt는 잘라서 처리하고 수명 비율은 0~1', () => {
    const rng = createSeededRng(4);
    const [p] = spawnRain(rng, 1, 360, COLORS);
    const [q] = stepParticles([p!], 10_000);
    expect(q!.maxLife - q!.life).toBeCloseTo(50, 5);
    expect(lifeRatio(q!)).toBeGreaterThan(0);
    expect(lifeRatio(q!)).toBeLessThanOrEqual(1);
  });
});
