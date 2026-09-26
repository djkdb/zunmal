import { describe, expect, it } from 'vitest';
import { MAT_PATTERNS, matBackgroundCss, matTileDataUrl, matTileSvg } from './matPatterns';
import {
  DEFAULT_MAT,
  MAT_PATTERN_IDS,
  MAX_PROPS,
  PROPS,
  PROP_IDS,
  isMatPatternId,
  isPropId,
  propSpot,
  sanitizeMatId,
  sanitizeProps,
  withProp,
  withoutProp,
} from './playroomDecor';

describe('매트 무늬', () => {
  it('4~6가지, 기본은 하늘 도트, 이름이 모두 다르다', () => {
    expect(MAT_PATTERN_IDS.length).toBeGreaterThanOrEqual(4);
    expect(MAT_PATTERN_IDS.length).toBeLessThanOrEqual(6);
    expect(DEFAULT_MAT).toBe('sky-dots');
    const labels = MAT_PATTERN_IDS.map((id) => MAT_PATTERNS[id].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(MAT_PATTERN_IDS)('%s 타일은 온전한 SVG 한 장이다', (id) => {
    const p = MAT_PATTERNS[id];
    const svg = matTileSvg(id);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`width="${p.tile}"`);
    expect(svg).toContain(`fill="${p.base}"`);
    // 여는·닫는 태그 짝 (자기 닫힘 제외)
    const opens = (svg.match(/<(svg|g)[\s>]/g) ?? []).length;
    const closes = (svg.match(/<\/(svg|g)>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(p.tile).toBeGreaterThanOrEqual(24);
    expect(p.base).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('CSS 배경은 data: URL 타일 + 바탕색, 외부 파일이 없다', () => {
    for (const id of MAT_PATTERN_IDS) {
      const css = matBackgroundCss(id);
      expect(css).toContain('url("data:image/svg+xml,');
      expect(css).not.toMatch(/https?:/);
      expect(css.endsWith(MAT_PATTERNS[id].base)).toBe(true);
      expect(decodeURIComponent(matTileDataUrl(id).slice('data:image/svg+xml,'.length))).toBe(matTileSvg(id));
    }
  });

  it('모르는 무늬는 기본 무늬로', () => {
    expect(isMatPatternId('cloud')).toBe(true);
    expect(isMatPatternId('gingham')).toBe(false);
    expect(sanitizeMatId('star-night')).toBe('star-night');
    for (const v of [undefined, null, 3, 'x', {}]) expect(sanitizeMatId(v)).toBe(DEFAULT_MAT);
  });
});

describe('소품', () => {
  it('몇 가지 소품이 있고 부딪힘 크기가 말랑이보다 작다', () => {
    expect(PROP_IDS.length).toBeGreaterThanOrEqual(3);
    expect(MAX_PROPS).toBe(3);
    for (const id of PROP_IDS) {
      const p = PROPS[id];
      expect(isPropId(id)).toBe(true);
      expect(p.r).toBeGreaterThan(0.1);
      expect(p.r).toBeLessThan(0.4);
      expect(p.h).toBeGreaterThan(0.1);
      expect(p.h).toBeLessThan(0.8);
      expect(p.w).toBeGreaterThan(p.r);
    }
    expect(isPropId('sofa')).toBe(false);
  });

  it('sanitize: 모르는 id·중복·이상한 좌표를 버리고 0..1 로 자르고 3개까지', () => {
    const raw = [
      { id: 'cushion', x: -1, y: 2 },
      { id: 'cushion', x: 0.5, y: 0.5 },
      { id: 'sofa', x: 0.5, y: 0.5 },
      { id: 'plant', x: Number.NaN, y: 0.5 },
      { id: 'plant', x: '0.3', y: 0.5 },
      null,
      'gift-box',
      { id: 'gift-box', x: 0.3, y: 0.4 },
      { id: 'star-lamp', x: 0.9, y: 0.1 },
      { id: 'plant', x: 0.2, y: 0.2 },
    ];
    const s = sanitizeProps(raw);
    expect(s).toEqual([
      { id: 'cushion', x: 0, y: 1 },
      { id: 'gift-box', x: 0.3, y: 0.4 },
      { id: 'star-lamp', x: 0.9, y: 0.1 },
    ]);
    for (const v of [undefined, null, {}, 'x', 5]) expect(sanitizeProps(v)).toEqual([]);
  });

  it('놓기·옮기기·치우기, 가득 차면 새 소품은 안 들어간다', () => {
    let list = withProp([], 'cushion', 0.2, 0.3);
    list = withProp(list, 'plant', 2, -1);
    expect(list).toEqual([
      { id: 'cushion', x: 0.2, y: 0.3 },
      { id: 'plant', x: 1, y: 0 },
    ]);
    list = withProp(list, 'cushion', 0.6, 0.7);
    expect(list[0]).toEqual({ id: 'cushion', x: 0.6, y: 0.7 });
    list = withProp(list, 'gift-box', 0.5, 0.5);
    const full = withProp(list, 'star-lamp', 0.5, 0.5);
    expect(full).toHaveLength(MAX_PROPS);
    expect(full.some((p) => p.id === 'star-lamp')).toBe(false);
    expect(withoutProp(full, 'plant').map((p) => p.id)).toEqual(['cushion', 'gift-box']);
  });

  it('새 자리는 이미 있는 것들에서 먼 가장자리', () => {
    const first = propSpot([], 1);
    expect(first.x === 0.5 && first.y === 0.5).toBe(false);
    const s = propSpot([{ x: 0.14, y: 0.12 }], 1.2);
    expect(Math.hypot(s.x - 0.14, s.y - 0.12)).toBeGreaterThan(0.5);
    // 말랑이 네 마리가 네 구석에 있으면 가운데 줄 가장자리
    const corners = [
      { x: 0.14, y: 0.12 },
      { x: 0.86, y: 0.12 },
      { x: 0.12, y: 0.9 },
      { x: 0.88, y: 0.9 },
    ];
    const mid = propSpot(corners, 1);
    expect(corners.some((c) => c.x === mid.x && c.y === mid.y)).toBe(false);
    expect(propSpot([], Number.NaN)).toEqual(first);
  });
});
