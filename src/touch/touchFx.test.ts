import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '../data/characters';
import { RARITIES, SHINY_TOUCH_FX, TOUCH_FX, rarityRank } from '../data/rarity';
import { createSeededRng } from '../lib/rng';
import {
  FX_MAX_PARTICLES,
  ambientDue,
  burstCount,
  createFxSystem,
  emitTouch,
  fxStylesFor,
  isFxIdle,
  parseHex,
  spawnOne,
  stepFx,
  type FxSystem,
} from './touchFx';

const center = { x: 150, y: 200 };
const opts = { center, radius: 80 };

function aliveOf(sys: FxSystem) {
  return sys.pool.filter((p) => p.alive);
}

function charOf(rarity: (typeof RARITIES)[number]) {
  const c = CHARACTERS.find((x) => x.rarity === rarity);
  if (!c) throw new Error(rarity);
  return c;
}

describe('TOUCH_FX intensity ladder', () => {
  it('never gets weaker as rarity goes up', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const lo = TOUCH_FX[RARITIES[i - 1]!];
      const hi = TOUCH_FX[RARITIES[i]!];
      expect(hi.poke).toBeGreaterThanOrEqual(lo.poke);
      expect(hi.press).toBeGreaterThanOrEqual(lo.press);
      expect(hi.release).toBeGreaterThanOrEqual(lo.release);
      expect(hi.milestone).toBeGreaterThan(lo.milestone);
      expect(hi.aura).toBeGreaterThanOrEqual(lo.aura);
    }
  });

  it('common is quiet; trail from epic, aura from legendary, ambient only for secret', () => {
    expect(TOUCH_FX.common.chime).toBe('none');
    for (const r of RARITIES) {
      const fx = TOUCH_FX[r];
      expect(fx.trailPx > 0).toBe(rarityRank(r) >= rarityRank('epic'));
      expect(fx.aura > 0).toBe(rarityRank(r) >= rarityRank('legendary'));
      expect(fx.ambientPerSec > 0).toBe(r === 'secret');
    }
  });

  it('spawn counts per poke scale with rarity and poke strength (max 1.5x)', () => {
    const counts = RARITIES.map((r) => burstCount(TOUCH_FX[r], 'poke', 0.45));
    expect(counts).toEqual([3, 5, 7, 8, 10, 12]);
    for (const r of RARITIES) {
      const fx = TOUCH_FX[r];
      expect(burstCount(fx, 'poke', 1)).toBe(Math.round(fx.poke * 1.5));
      expect(burstCount(fx, 'release', 0)).toBe(0);
      expect(burstCount(fx, 'release', 1)).toBe(fx.release);
      expect(burstCount(fx, 'milestone')).toBe(fx.milestone);
    }
  });
});

describe('fxStylesFor', () => {
  it('uses per-character motifs for mythic and secret, all different', () => {
    const ids = ['galaxy-malang', 'phoenix', 'dream-unicorn', 'milkyway-whale', 'prism-seraph'];
    const motifs = ids.map((id) => {
      const c = getCharacter(id)!;
      return fxStylesFor(c, TOUCH_FX[c.rarity]).motif;
    });
    expect(motifs).toEqual(['galaxy', 'phoenix', 'rainbow', 'ocean', 'prism']);
  });

  it('matches the ladder: bubbles, sparkles, golden stars', () => {
    expect(fxStylesFor(charOf('common'), TOUCH_FX.common).main.shapes).toEqual(['bubble']);
    expect(fxStylesFor(charOf('rare'), TOUCH_FX.rare).main.shapes).toContain('sparkle');
    expect(fxStylesFor(charOf('epic'), TOUCH_FX.epic).main.shapes).toContain('sparkle');
    const leg = fxStylesFor(charOf('legendary'), TOUCH_FX.legendary);
    expect(leg.main.shapes).toContain('star');
    expect(leg.accent?.shapes).toEqual(['glow']);
  });

  it('only secret gets idle ambient particles', () => {
    for (const c of CHARACTERS) {
      const set = fxStylesFor(c, TOUCH_FX[c.rarity]);
      expect(set.ambient !== null).toBe(c.rarity === 'secret');
    }
  });

  it('galaxy swirls, phoenix embers rise, ocean drops fall while bubbles rise', () => {
    const galaxy = fxStylesFor(getCharacter('galaxy-malang')!, TOUCH_FX.mythic).main;
    expect(galaxy.swirl).toBeGreaterThan(0);
    const phoenix = fxStylesFor(getCharacter('phoenix')!, TOUCH_FX.mythic).main;
    expect(phoenix.gravity).toBeLessThan(0);
    expect(phoenix.fadeTo).toBeDefined();
    const ocean = fxStylesFor(getCharacter('milkyway-whale')!, TOUCH_FX.secret).main;
    expect(ocean.shapeGravity?.bubble).toBeLessThan(0);
    expect(ocean.shapeGravity?.drop).toBeGreaterThan(0);
  });
});

describe('particle pool', () => {
  it('emits exactly burst + accent (+ shiny) particles', () => {
    for (const r of RARITIES) {
      const c = charOf(r);
      const spec = TOUCH_FX[r];
      const set = fxStylesFor(c, spec);
      const sys = createFxSystem();
      const n = emitTouch(sys, set, spec, 'poke', { x: 100, y: 100 }, createSeededRng(1), { ...opts, strength: 0.45 });
      expect(n).toBe(spec.poke + (set.accent ? 1 : 0));
      expect(sys.alive).toBe(n);
      const shinySys = createFxSystem();
      const m = emitTouch(shinySys, set, spec, 'poke', { x: 100, y: 100 }, createSeededRng(1), {
        ...opts,
        strength: 0.45,
        shiny: true,
      });
      expect(m).toBe(n + SHINY_TOUCH_FX.sparkles);
    }
  });

  it('never exceeds the cap and overwrites the oldest', () => {
    const c = getCharacter('prism-seraph')!;
    const set = fxStylesFor(c, TOUCH_FX.secret);
    const sys = createFxSystem();
    const rng = createSeededRng(7);
    for (let i = 0; i < 50; i++) emitTouch(sys, set, TOUCH_FX.secret, 'milestone', center, rng, { ...opts, shiny: true });
    expect(sys.pool.length).toBe(FX_MAX_PARTICLES);
    expect(sys.alive).toBeLessThanOrEqual(FX_MAX_PARTICLES);
    expect(aliveOf(sys).length).toBe(sys.alive);
  });

  it('lifetimes stay inside the style range and everything dies (loop can pause)', () => {
    for (const c of CHARACTERS) {
      const spec = TOUCH_FX[c.rarity];
      const set = fxStylesFor(c, spec);
      const sys = createFxSystem();
      const rng = createSeededRng(3);
      for (const ev of ['poke', 'press', 'release', 'tickle', 'milestone'] as const) {
        emitTouch(sys, set, spec, ev, { x: 120, y: 160 }, rng, { ...opts, shiny: true });
      }
      for (const p of aliveOf(sys)) {
        expect(p.life).toBeGreaterThan(0.2);
        expect(p.life).toBeLessThanOrEqual(1.7);
      }
      let t = 0;
      while (!isFxIdle(sys) && t < 5) {
        stepFx(sys, 1 / 60);
        t += 1 / 60;
      }
      expect(isFxIdle(sys)).toBe(true);
      expect(t).toBeLessThanOrEqual(1.75);
    }
  });

  it('is deterministic for a seeded rng', () => {
    const c = getCharacter('galaxy-malang')!;
    const set = fxStylesFor(c, TOUCH_FX.mythic);
    const run = () => {
      const sys = createFxSystem();
      emitTouch(sys, set, TOUCH_FX.mythic, 'poke', { x: 50, y: 60 }, createSeededRng(11), opts);
      stepFx(sys, 0.2);
      return aliveOf(sys).map((p) => [p.x.toFixed(3), p.y.toFixed(3)]);
    };
    expect(run()).toEqual(run());
  });

  it('swirl orbits around the body centre, gravity pulls, bad dt is ignored', () => {
    const galaxy = fxStylesFor(getCharacter('galaxy-malang')!, TOUCH_FX.mythic).main;
    const sys = createFxSystem(4);
    const p = spawnOne(sys, { ...galaxy, speed: [0, 0] }, { x: center.x + 50, y: center.y }, center, createSeededRng(2));
    stepFx(sys, 0.1);
    expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(50, 3);
    expect(p.y).not.toBe(center.y);
    const before = { x: p.x, y: p.y };
    stepFx(sys, Number.NaN);
    expect(p.x).toBe(before.x);
    expect(p.y).toBe(before.y);
  });

  it('trail spawns one particle only for rarities with a trail', () => {
    for (const r of RARITIES) {
      const spec = TOUCH_FX[r];
      const set = fxStylesFor(charOf(r), spec);
      const sys = createFxSystem();
      const n = emitTouch(sys, set, spec, 'pull', { x: 1, y: 1 }, createSeededRng(5), opts);
      expect(n).toBe(spec.trailPx > 0 ? 1 : 0);
    }
  });
});

describe('ambientDue', () => {
  it('accumulates fractional particles and caps a long gap', () => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 600; i++) {
      const d = ambientDue(acc, 1.4, 1 / 60);
      acc = d.acc;
      total += d.count;
    }
    expect(total).toBeGreaterThanOrEqual(13);
    expect(total).toBeLessThanOrEqual(14);
    expect(ambientDue(0, 1.4, 30).count).toBeLessThanOrEqual(2);
    expect(ambientDue(0, 0, 1).count).toBe(0);
  });
});

describe('parseHex', () => {
  it('reads short and long hex, falls back to white', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('nope')).toEqual([255, 255, 255]);
  });
});
