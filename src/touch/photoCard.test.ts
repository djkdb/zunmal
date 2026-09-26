import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { createSeededRng } from '../lib/rng';
import {
  CARD_H,
  CARD_W,
  captureRect,
  fitContain,
  nameFontSize,
  photoCardLayout,
  photoFileName,
  type Rect,
} from './photoCard';

const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;

describe('photo card layout', () => {
  it('is an Instagram 4:5 card with everything inside the frame', () => {
    const L = photoCardLayout('은하수 고래 말랑', createSeededRng(1));
    expect(L.width / L.height).toBeCloseTo(4 / 5);
    expect(L.width).toBe(CARD_W);
    expect(L.height).toBe(CARD_H);
    expect(inside(L.photo, L.card)).toBe(true);
    expect(inside(L.badge, L.photo)).toBe(true);
    expect(L.name.y).toBeGreaterThan(L.photo.y + L.photo.h);
    expect(L.level.y).toBeGreaterThan(L.name.y);
    expect(L.logo.y).toBeGreaterThan(L.level.y);
    expect(L.logo.y).toBeLessThan(L.card.y + L.card.h);
    for (const s of L.sprinkles) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(CARD_W);
    }
  });

  it('every malang name fits the card width', () => {
    for (const c of CHARACTERS) {
      const size = nameFontSize(c.name, CARD_W - 228);
      expect(size * [...c.name].length * 1.02).toBeLessThanOrEqual(CARD_W - 228 + size);
      expect(size).toBeGreaterThanOrEqual(52);
      expect(size).toBeLessThanOrEqual(96);
    }
  });

  it('fits the scene inside the photo slot keeping aspect ratio', () => {
    const slot = { x: 100, y: 100, w: 800, h: 600 };
    const r = fitContain(400, 400, slot);
    expect(r.w).toBe(600);
    expect(r.h).toBe(600);
    expect(r.x).toBe(200);
    expect(inside(r, slot)).toBe(true);
    expect(fitContain(0, 10, slot).w).toBe(0);
  });

  it('captures around the jelly box and clips to the stage', () => {
    const jelly = { x: 100, y: 200, w: 200, h: 200 };
    const r = captureRect(jelly, { x: 0, y: 0, w: 360, h: 640 });
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThan(jelly.x);
    expect(r.x + r.w).toBeGreaterThan(jelly.x + jelly.w);
    expect(r.y).toBeLessThan(jelly.y);
    const clipped = captureRect({ x: 0, y: 10, w: 200, h: 200 }, { x: 0, y: 0, w: 360, h: 640 });
    expect(clipped.x).toBe(0);
    expect(clipped.y).toBe(0);
    expect(r.y + r.h).toBeGreaterThan(jelly.y + jelly.h * 0.9);
    expect(r.x + r.w).toBeLessThanOrEqual(360);
  });

  it('names the file with id and local time', () => {
    expect(photoFileName('galaxy-malang', new Date(2026, 8, 6, 7, 5))).toBe('malang-galaxy-malang-20260906-0705.png');
    expect(photoFileName('../x', new Date(2026, 0, 1, 0, 0))).toBe('malang-x-20260101-0000.png');
  });
});
