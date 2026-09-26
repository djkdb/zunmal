import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { createSeededRng } from '../lib/rng';
import {
  CARD_H,
  CARD_W,
  FRAME_MIN_W,
  fitContain,
  frameGroup,
  groupCaption,
  groupRarityChips,
  groupTitle,
  layoutChipRow,
  nameFontSize,
  patternPlacement,
  photoCardLayout,
  photoFileName,
  type Rect,
} from './photoCard';

const inside = (r: Rect, outer: Rect, eps = 1e-6) =>
  r.x >= outer.x - eps &&
  r.y >= outer.y - eps &&
  r.x + r.w <= outer.x + outer.w + eps &&
  r.y + r.h <= outer.y + outer.h + eps;

describe('photo card layout', () => {
  it('is an Instagram 4:5 card with everything inside the frame', () => {
    const L = photoCardLayout('은하수 고래 말랑', createSeededRng(1));
    expect(L.width / L.height).toBeCloseTo(4 / 5);
    expect(L.width).toBe(CARD_W);
    expect(L.height).toBe(CARD_H);
    expect(inside(L.photo, L.card)).toBe(true);
    expect(L.chips.x).toBeGreaterThan(L.photo.x);
    expect(L.chips.y - L.chips.h / 2).toBeGreaterThan(L.photo.y);
    expect(L.chips.maxRight).toBeLessThan(L.photo.x + L.photo.w);
    expect(L.name.y - L.name.size / 2).toBeGreaterThan(L.photo.y + L.photo.h);
    expect(L.line.y - L.line.size / 2).toBeGreaterThan(L.name.y + L.name.size / 2 - 8);
    expect(L.logo.y).toBeGreaterThan(L.line.y + L.line.size / 2);
    expect(L.logo.y + L.logo.size / 2).toBeLessThan(L.card.y + L.card.h);
    for (const b of L.bubbles) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(CARD_W);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(CARD_H);
      expect(b.r).toBeGreaterThan(0);
    }
  });

  it('every malang name and every group title fits the card width', () => {
    const titles = [...CHARACTERS.map((c) => c.name), groupTitle(2), groupTitle(5)];
    for (const name of titles) {
      const size = nameFontSize(name, CARD_W - 228);
      expect(size * [...name].length * 1.02).toBeLessThanOrEqual(CARD_W - 228 + size);
      expect(size).toBeGreaterThanOrEqual(52);
      expect(size).toBeLessThanOrEqual(96);
    }
  });

  it('fits a scene inside a slot keeping aspect ratio', () => {
    const slot = { x: 100, y: 100, w: 800, h: 600 };
    const r = fitContain(400, 400, slot);
    expect(r.w).toBe(600);
    expect(r.h).toBe(600);
    expect(r.x).toBe(200);
    expect(inside(r, slot)).toBe(true);
    expect(fitContain(0, 10, slot).w).toBe(0);
  });

  it('names the file with id and local time', () => {
    expect(photoFileName('galaxy-malang', new Date(2026, 8, 6, 7, 5))).toBe('malang-galaxy-malang-20260906-0705.png');
    expect(photoFileName('../x', new Date(2026, 0, 1, 0, 0))).toBe('malang-x-20260101-0000.png');
  });
});

describe('group framing', () => {
  const unit = 120;
  const aspect = 900 / 880;

  it('includes every malang with padding and matches the slot aspect', () => {
    const boxes: Rect[] = [
      { x: 20, y: 150, w: 120, h: 120 },
      { x: 230, y: 420, w: 120, h: 120 },
      { x: 120, y: 280, w: 120, h: 120 },
    ];
    const f = frameGroup(boxes, aspect, unit);
    expect(f.w / f.h).toBeCloseTo(aspect, 6);
    for (const b of boxes) {
      expect(inside(b, f)).toBe(true);
      // 위쪽 여백(장식·입자)이 있다
      expect(b.y - f.y).toBeGreaterThanOrEqual(unit * 0.2 - 1e-6);
    }
  });

  it('centres a single malang horizontally and never zooms in past the minimum width', () => {
    const one = { x: 100, y: 300, w: unit, h: unit };
    const f = frameGroup([one], aspect, unit);
    expect(f.w).toBeGreaterThanOrEqual(unit * FRAME_MIN_W - 1e-6);
    expect(f.x + f.w / 2).toBeCloseTo(one.x + one.w / 2, 6);
    expect(inside(one, f)).toBe(true);
  });

  it('a wide row grows vertically (cover), a tall column grows sideways', () => {
    const row = [
      { x: 0, y: 300, w: unit, h: unit },
      { x: 600, y: 300, w: unit, h: unit },
    ];
    const f = frameGroup(row, aspect, unit);
    expect(f.w).toBeCloseTo(720 + unit * 0.32, 6);
    expect(f.h).toBeCloseTo(f.w / aspect, 6);
    const col = [
      { x: 100, y: 0, w: unit, h: unit },
      { x: 100, y: 700, w: unit, h: unit },
    ];
    const g = frameGroup(col, aspect, unit);
    expect(g.h).toBeCloseTo(820 + unit * 0.34, 6);
    expect(g.x + g.w / 2).toBeCloseTo(160, 6);
    for (const b of [...row]) expect(inside(b, f)).toBe(true);
    for (const b of [...col]) expect(inside(b, g)).toBe(true);
  });

  it('ignores broken boxes and survives bad input', () => {
    const f = frameGroup([{ x: Number.NaN, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 5 }], Number.NaN, -1);
    expect(f.w).toBeGreaterThan(0);
    expect(f.h).toBeGreaterThan(0);
    expect(Number.isFinite(f.x + f.y + f.w + f.h)).toBe(true);
  });

  it('places the mat pattern where it sits on screen, scaled like the scene', () => {
    const slot = { x: 90, y: 90, w: 900, h: 880 };
    const cap = { x: 30, y: 100, w: 300, h: 293 };
    const p = patternPlacement(slot, cap, { x: 10, y: 10 });
    expect(p.scale).toBeCloseTo(3);
    expect(p.x).toBeCloseTo(90 + (10 - 30) * 3);
    expect(p.y).toBeCloseTo(90 + (10 - 100) * 3);
  });
});

describe('group chips and caption', () => {
  it('counts rarities, highest first', () => {
    expect(groupRarityChips(['common', 'legendary', 'common', 'secret'])).toEqual([
      { rarity: 'secret', count: 1 },
      { rarity: 'legendary', count: 1 },
      { rarity: 'common', count: 2 },
    ]);
    expect(groupRarityChips([])).toEqual([]);
  });

  it('lays chips left to right and drops the ones that do not fit', () => {
    expect(layoutChipRow([100, 80, 120], 10, 400, 12)).toEqual([10, 122, 214]);
    expect(layoutChipRow([100, 80, 120], 10, 300, 12)).toEqual([10, 122]);
    expect(layoutChipRow([500], 10, 300, 12)).toEqual([]);
  });

  it('joins names with the right particle', () => {
    expect(groupCaption(['복숭아 모찌', '소다 방울'])).toBe('복숭아 모찌와 소다 방울');
    expect(groupCaption(['소다 방울', '복숭아 모찌'])).toBe('소다 방울과 복숭아 모찌');
    expect(groupCaption(['말차 콩', '소다 방울', '은하 말랑'])).toBe('말차 콩, 소다 방울과 은하 말랑');
    expect(groupCaption(['은하수 고래 말랑', '프리즘 세라핌', '복숭아 모찌', '소다 방울'])).toBe('은하수 고래 말랑과 친구 3마리');
    expect(groupCaption(['말차 콩'])).toBe('말차 콩');
    expect(groupCaption([])).toBe('');
    expect(groupTitle(3)).toBe('말랑이 3마리와 함께');
  });
});
