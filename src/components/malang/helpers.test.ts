import { describe, expect, it } from 'vitest';
import { auraLevel, avoidFace, hexToHsl, hslToHex, hueRotate, rayPaths, shinyColor, sparklePath } from './helpers';

describe('color helpers', () => {
  it('round-trips hex through HSL', () => {
    for (const hex of ['#ff5d7a', '#a8dcff', '#2b2233', '#ffffff', '#000000', '#7fe0d6']) {
      const [h, s, l] = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
  });

  it('hueRotate by 360 keeps the color and by 120 turns red into green', () => {
    expect(hueRotate('#ff5d7a', 360)).toBe('#ff5d7a');
    expect(hueRotate('#ff0000', 120)).toBe('#00ff00');
  });

  it('shinyColor changes every character color visibly', () => {
    for (const hex of ['#ffb8c9', '#f5f1e8', '#fff4fb', '#4b3a8f', '#ffdc8f']) {
      const shiny = shinyColor(hex);
      expect(shiny).not.toBe(hex);
      expect(shiny).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('auraLevel', () => {
  it('is none unless aura is auto and rarity is above common', () => {
    expect(auraLevel('legendary', undefined)).toBe('none');
    expect(auraLevel('legendary', 'none')).toBe('none');
    expect(auraLevel(undefined, 'auto')).toBe('none');
    expect(auraLevel('common', 'auto')).toBe('none');
    expect(auraLevel('secret', 'auto')).toBe('secret');
    expect(auraLevel('rare', 'auto')).toBe('rare');
  });
});

describe('geometry helpers', () => {
  it('sparklePath is a closed path around the center', () => {
    const d = sparklePath(10, 10, 5);
    expect(d.startsWith('M10 5')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('rayPaths returns one wedge per ray', () => {
    expect(rayPaths(0, 0, 12, 10, 50, 4)).toHaveLength(12);
  });

  it('avoidFace drops points on the face', () => {
    const kept = avoidFace(
      [
        { x: 60, y: 72 },
        { x: 20, y: 100 },
      ],
      70,
    );
    expect(kept).toEqual([{ x: 20, y: 100 }]);
  });
});
