/**
 * 말랑 만지기 입자 — 순수 모듈 (DOM/React 무관, RNG·dt 주입).
 *
 * - 등급 표(`TOUCH_FX`)와 캐릭터(신화·시크릿은 epic/themes 의 모티프)로 입자 모양·색·움직임(`FxStyleSet`)을 정한다.
 * - 입자는 크기가 고정된 풀(`FX_MAX_PARTICLES`)을 고리처럼 돌려 쓴다 → 할당 없음, 가득 차면 가장 오래된 것부터 덮어쓴다.
 * - 좌표는 입자 캔버스의 CSS px, 시간은 초.
 * 그리기는 `touchFxDraw.ts` (Canvas 2D).
 */
import type { Character } from '../data/characters';
import { SHINY_TOUCH_FX, type TouchFxSpec } from '../data/rarity';
import { epicMotifFor, EPIC_THEMES, type EpicMotif } from '../components/epic/themes';
import type { RNG } from '../lib/rng';

/** 동시에 살아 있는 입자 상한 (저사양 폰에서도 Canvas 2D 로 60fps) */
export const FX_MAX_PARTICLES = 120;

export type FxShape =
  | 'bubble'
  | 'sparkle'
  | 'star'
  | 'dot'
  | 'ember'
  | 'heart'
  | 'shard'
  | 'feather'
  | 'drop'
  | 'arc'
  | 'ring'
  | 'glow'
  | 'z';

/** 입자가 태어나는 자리: 손가락 / 몸 가운데 / 머리 위 (후광) */
export type FxAnchor = 'origin' | 'center' | 'head';

export interface FxStyle {
  shapes: readonly FxShape[];
  palette: readonly string[];
  /** 식으며 바뀌는 색 (불씨) */
  fadeTo?: string;
  /** 수명 (초) */
  life: readonly [number, number];
  /** 크기 (px, 반지름 정도) */
  size: readonly [number, number];
  /** 처음 속도 (px/s) */
  speed: readonly [number, number];
  /** 아래로 당기는 힘 (px/s²). 음수면 떠오른다 */
  gravity: number;
  /** 모양별 중력 (고래: 거품은 뜨고 별 물방울은 떨어진다) */
  shapeGravity?: Partial<Record<FxShape, number>>;
  /** 속도 감쇠 (1/s) */
  drag: number;
  /** 몸 가운데를 도는 속도 (rad/s) — 은하 */
  swirl: number;
  /** 뿜는 방향 (rad, -π/2 = 위) 과 퍼짐 (rad, 2π = 사방) */
  dir: number;
  spread: number;
  /** 최대 회전 속도 (rad/s) */
  spin: number;
  /** 반짝반짝 크기가 깜빡인다 */
  twinkle: boolean;
  /** 불꽃처럼 밝기가 일렁인다 */
  flicker: boolean;
  /** 최대 불투명도 */
  alpha: number;
  anchor: FxAnchor;
}

export interface FxStyleSet {
  /** 찌르기·누르기·놓기 */
  main: FxStyle;
  /** 끄는 동안 꼬리 */
  trail: FxStyle;
  /** 한 번 만질 때마다 하나씩 더하는 장치 (금빛 번짐·불꽃 일렁임·잔물결·후광 반짝) */
  accent: FxStyle | null;
  /** 가만히 있을 때 떠다니는 입자 (시크릿) */
  ambient: FxStyle | null;
  /** 애정 단계 축하 */
  milestone: FxStyle;
  /** 반짝 말랑이의 무지개 반짝이 */
  shiny: FxStyle;
  /** 3D 몸 뒤 빛 색 */
  auraColor: string;
  motif: EpicMotif | null;
}

export interface FxParticle {
  alive: boolean;
  shape: FxShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  vrot: number;
  gravity: number;
  drag: number;
  swirl: number;
  cx: number;
  cy: number;
  r: number;
  g: number;
  b: number;
  r2: number;
  g2: number;
  b2: number;
  twinkle: boolean;
  flicker: boolean;
  alpha: number;
  /** 깜빡임 위상 */
  phase: number;
}

export interface FxSystem {
  pool: FxParticle[];
  /** 다음에 쓸 칸 (가장 오래된 칸) */
  cursor: number;
  alive: number;
}

export type FxEvent = 'poke' | 'press' | 'pull' | 'release' | 'tickle' | 'milestone' | 'ambient';

export interface Point {
  x: number;
  y: number;
}

export interface EmitOptions {
  /** 0..1 세기 */
  strength?: number;
  /** 몸 가운데 (은하 소용돌이·후광·축하 기준) */
  center: Point;
  /** 몸 반지름 (px) */
  radius: number;
  /** 머리 꼭대기 (후광 반짝 자리). 없으면 가운데에서 반지름만큼 위 */
  head?: Point;
  shiny?: boolean;
}

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
const RAINBOW = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'] as const;
const HEART_PINKS = ['#ff7aa2', '#ff8fab', '#ffb3c8'] as const;

// ── 색 ───────────────────────────────────────────────────

/** '#rgb' / '#rrggbb' → [r,g,b]. 못 읽으면 흰색 */
export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return [255, 255, 255];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── 풀 ───────────────────────────────────────────────────

function blank(): FxParticle {
  return {
    alive: false,
    shape: 'dot',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    size: 1,
    rot: 0,
    vrot: 0,
    gravity: 0,
    drag: 0,
    swirl: 0,
    cx: 0,
    cy: 0,
    r: 255,
    g: 255,
    b: 255,
    r2: 255,
    g2: 255,
    b2: 255,
    twinkle: false,
    flicker: false,
    alpha: 1,
    phase: 0,
  };
}

export function createFxSystem(cap = FX_MAX_PARTICLES): FxSystem {
  const n = Math.max(1, Math.floor(cap));
  return { pool: Array.from({ length: n }, blank), cursor: 0, alive: 0 };
}

export function clearFx(sys: FxSystem): void {
  for (const p of sys.pool) p.alive = false;
  sys.alive = 0;
}

export function isFxIdle(sys: FxSystem): boolean {
  return sys.alive === 0;
}

function range(rng: RNG, r: readonly [number, number]): number {
  return r[0] + rng() * (r[1] - r[0]);
}

function pick<T>(rng: RNG, items: readonly T[], fallback: T): T {
  if (items.length === 0) return fallback;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] ?? fallback;
}

/** 입자 하나. 풀이 가득 차면 가장 오래된 칸을 덮어쓴다. */
export function spawnOne(sys: FxSystem, style: FxStyle, at: Point, center: Point, rng: RNG): FxParticle {
  const p = sys.pool[sys.cursor] ?? blank();
  sys.cursor = (sys.cursor + 1) % sys.pool.length;
  if (!p.alive) sys.alive++;
  const shape = pick(rng, style.shapes, 'dot');
  const angle = style.dir + (rng() - 0.5) * style.spread;
  const speed = range(rng, style.speed);
  const [r, g, b] = parseHex(pick(rng, style.palette, '#ffffff'));
  const [r2, g2, b2] = style.fadeTo ? parseHex(style.fadeTo) : [r, g, b];
  p.alive = true;
  p.shape = shape;
  p.x = at.x;
  p.y = at.y;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.age = 0;
  p.life = Math.max(0.05, range(rng, style.life));
  p.size = range(rng, style.size);
  p.rot = rng() * TAU;
  p.vrot = (rng() * 2 - 1) * style.spin;
  p.gravity = style.shapeGravity?.[shape] ?? style.gravity;
  p.drag = style.drag;
  p.swirl = style.swirl;
  p.cx = center.x;
  p.cy = center.y;
  p.r = r;
  p.g = g;
  p.b = b;
  p.r2 = r2;
  p.g2 = g2;
  p.b2 = b2;
  p.twinkle = style.twinkle;
  p.flicker = style.flicker;
  p.alpha = style.alpha;
  p.phase = rng() * TAU;
  return p;
}

/** 입자를 dt 초만큼 움직이고 수명이 다한 것을 끈다. 살아 있는 수를 돌려준다. */
export function stepFx(sys: FxSystem, dt: number): number {
  const d = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
  let alive = 0;
  for (const p of sys.pool) {
    if (!p.alive) continue;
    p.age += d;
    if (p.age >= p.life) {
      p.alive = false;
      continue;
    }
    alive++;
    p.vy += p.gravity * d;
    const k = Math.exp(-p.drag * d);
    p.vx *= k;
    p.vy *= k;
    p.x += p.vx * d;
    p.y += p.vy * d;
    p.rot += p.vrot * d;
    if (p.swirl !== 0) {
      // 몸 가운데를 돈다 (멀수록 천천히 — 은하 팔처럼)
      const dx = p.x - p.cx;
      const dy = p.y - p.cy;
      const dist = Math.hypot(dx, dy);
      const a = (p.swirl * d) / (1 + dist / 160);
      const c = Math.cos(a);
      const s = Math.sin(a);
      p.x = p.cx + dx * c - dy * s;
      p.y = p.cy + dx * s + dy * c;
    }
  }
  sys.alive = alive;
  return alive;
}

// ── 등급 → 입자 수 ───────────────────────────────────────

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 한 번의 손짓에 나오는 주 입자 수 */
export function burstCount(spec: TouchFxSpec, event: FxEvent, strength = 1): number {
  const s = clamp01(strength);
  switch (event) {
    case 'poke':
      // 연달아 세게 찌를수록(0.45 → 1) 1배 → 1.5배
      return Math.round(spec.poke * (1 + 0.5 * clamp01((s - 0.45) / 0.55)));
    case 'press':
      return Math.round(spec.press * (0.5 + 0.5 * s));
    case 'release':
      return Math.round(spec.release * s);
    case 'tickle':
      return Math.ceil(spec.poke / 2);
    case 'pull':
      return spec.trailPx > 0 ? 1 : 0;
    case 'milestone':
      return spec.milestone;
    case 'ambient':
      return spec.ambientPerSec > 0 ? 1 : 0;
  }
}

/** 반짝 무지개 반짝이 수 (주 입자가 있는 손짓에만) */
export function shinyCount(event: FxEvent, perBurst: number): number {
  if (event === 'pull' || event === 'ambient') return 0;
  return event === 'milestone' ? perBurst * 3 : perBurst;
}

/**
 * 가만히 있을 때 떠다니는 입자: 누적 시간으로 이번 프레임에 낳을 수를 정한다.
 * 한 프레임에 너무 많이 몰리지 않게 (탭이 오래 숨었다 돌아와도) 최대 2개.
 */
export function ambientDue(acc: number, perSec: number, dt: number): { count: number; acc: number } {
  if (!(perSec > 0) || !(dt > 0)) return { count: 0, acc: 0 };
  const total = acc + perSec * Math.min(dt, 0.5);
  const count = Math.min(2, Math.floor(total));
  return { count, acc: Math.min(1, total - count) };
}

function anchorPoint(style: FxStyle, origin: Point, o: EmitOptions): Point {
  if (style.anchor === 'center') return o.center;
  if (style.anchor === 'head') return o.head ?? { x: o.center.x, y: o.center.y - o.radius };
  return origin;
}

/**
 * 손짓 한 번의 입자를 낳는다. 낳은 수를 돌려준다.
 * main (+ 반짝 무지개) + accent 하나. pull 은 꼬리 하나, ambient 는 몸 둘레 아무 데서나 하나.
 */
export function emitTouch(
  sys: FxSystem,
  set: FxStyleSet,
  spec: TouchFxSpec,
  event: FxEvent,
  origin: Point,
  rng: RNG,
  o: EmitOptions,
): number {
  const strength = o.strength ?? 1;
  let n = 0;
  if (event === 'pull') {
    if (burstCount(spec, 'pull') > 0) {
      spawnOne(sys, set.trail, origin, o.center, rng);
      n++;
    }
    return n;
  }
  if (event === 'ambient') {
    if (!set.ambient || burstCount(spec, 'ambient') === 0) return 0;
    const a = rng() * TAU;
    const rr = o.radius * (0.7 + rng() * 0.6);
    spawnOne(sys, set.ambient, { x: o.center.x + Math.cos(a) * rr, y: o.center.y + Math.sin(a) * rr * 0.8 }, o.center, rng);
    return 1;
  }
  const main = event === 'milestone' ? set.milestone : set.main;
  const count = burstCount(spec, event, strength);
  const at = event === 'milestone' ? o.center : origin;
  for (let i = 0; i < count; i++) {
    spawnOne(sys, main, at, o.center, rng);
    n++;
  }
  if (o.shiny) {
    const extra = shinyCount(event, SHINY_TOUCH_FX.sparkles);
    for (let i = 0; i < extra; i++) {
      spawnOne(sys, set.shiny, at, o.center, rng);
      n++;
    }
  }
  if (set.accent && count > 0 && event !== 'tickle') {
    spawnOne(sys, set.accent, anchorPoint(set.accent, origin, o), o.center, rng);
    n++;
  }
  return n;
}

// ── 등급·모티프 → 모양 ────────────────────────────────────

function style(partial: Partial<FxStyle> & Pick<FxStyle, 'shapes' | 'palette'>): FxStyle {
  return {
    life: [0.5, 0.9],
    size: [4, 9],
    speed: [80, 180],
    gravity: 0,
    drag: 2,
    swirl: 0,
    dir: UP,
    spread: TAU,
    spin: 0,
    twinkle: false,
    flicker: false,
    alpha: 1,
    anchor: 'origin',
    ...partial,
  };
}

function trailOf(main: FxStyle, extraColor?: string): FxStyle {
  return {
    ...main,
    palette: extraColor ? [...main.palette, extraColor] : main.palette,
    life: [0.45, 0.8],
    size: [main.size[0] * 0.6, main.size[1] * 0.7],
    speed: [5, 30],
    gravity: main.gravity * 0.3,
    swirl: main.swirl * 0.6,
    alpha: main.alpha * 0.85,
  };
}

function milestoneOf(main: FxStyle): FxStyle {
  return {
    ...main,
    shapes: ['heart', 'heart', ...main.shapes],
    palette: [...HEART_PINKS, ...main.palette],
    speed: [140, 300],
    life: [0.8, 1.3],
    size: [main.size[0] * 1.1, main.size[1] * 1.3],
    anchor: 'center',
  };
}

const SHINY_STYLE = style({
  shapes: ['sparkle'],
  palette: RAINBOW,
  life: [0.5, 0.85],
  size: [4, 8],
  speed: [110, 220],
  gravity: 30,
  drag: 2.6,
  twinkle: true,
});

function motifStyles(motif: EpicMotif): Pick<FxStyleSet, 'main' | 'accent' | 'ambient'> {
  const theme = EPIC_THEMES[motif];
  switch (motif) {
    case 'galaxy': {
      // 작은 별들이 몸 둘레를 소용돌이친다
      const main = style({
        shapes: ['star', 'sparkle', 'dot', 'sparkle'],
        palette: theme.palette,
        life: [1, 1.6],
        size: [3.5, 8],
        speed: [40, 110],
        drag: 1.4,
        swirl: 2.6,
        twinkle: true,
      });
      const ambient = { ...main, life: [2.4, 3.4] as const, speed: [4, 14] as const, swirl: 0.8, alpha: 0.75 };
      return { main, accent: null, ambient };
    }
    case 'phoenix': {
      // 불씨가 솟아오르며 식는다 + 따뜻한 불빛 일렁임
      const main = style({
        shapes: ['ember', 'ember', 'dot'],
        palette: theme.palette,
        fadeTo: theme.fadeTo,
        life: [0.7, 1.2],
        size: [3, 6.5],
        speed: [50, 140],
        gravity: -150,
        drag: 1.8,
        spread: Math.PI * 1.1,
        flicker: true,
      });
      const accent = style({
        shapes: ['glow'],
        palette: ['#ffb13d', '#ff7a45'],
        life: [0.45, 0.6],
        size: [34, 46],
        speed: [0, 0],
        flicker: true,
        alpha: 0.55,
      });
      const ambient = { ...main, life: [1.8, 2.6] as const, speed: [5, 20] as const, gravity: -30, alpha: 0.8 };
      return { main, accent, ambient };
    }
    case 'rainbow': {
      // 무지개 하트와 작은 무지개 다리
      const main = style({
        shapes: ['heart', 'arc', 'heart', 'sparkle'],
        palette: RAINBOW,
        life: [0.8, 1.3],
        size: [5, 10],
        speed: [70, 160],
        gravity: -60,
        drag: 2,
        spin: 1.5,
        twinkle: false,
      });
      const ambient = { ...main, life: [2.6, 3.6] as const, speed: [4, 14] as const, gravity: -10, alpha: 0.7 };
      return { main, accent: null, ambient };
    }
    case 'ocean': {
      // 거품은 떠오르고 별 물방울은 튀었다 떨어진다 + 잔물결
      const main = style({
        shapes: ['bubble', 'drop', 'star', 'bubble', 'drop'],
        palette: theme.palette,
        life: [0.8, 1.3],
        size: [3, 7.5],
        speed: [90, 190],
        gravity: 0,
        shapeGravity: { bubble: -90, drop: 320, star: 40 },
        drag: 1.4,
        spread: Math.PI * 1.2,
      });
      const accent = style({
        shapes: ['ring'],
        palette: ['#7fe0ff'],
        life: [0.6, 0.75],
        size: [14, 18],
        speed: [0, 0],
        alpha: 0.85,
      });
      const ambient = {
        ...main,
        shapes: ['bubble', 'bubble', 'star'] as const,
        life: [2.6, 3.6] as const,
        speed: [4, 12] as const,
        shapeGravity: { bubble: -14, star: 0 },
        alpha: 0.75,
      };
      return { main, accent, ambient };
    }
    case 'prism': {
      // 빛 조각과 깃털이 흩날리고 머리 위 후광이 반짝
      const main = style({
        shapes: ['shard', 'feather', 'shard', 'sparkle'],
        palette: theme.palette,
        life: [0.8, 1.3],
        size: [4, 9],
        speed: [90, 200],
        gravity: 45,
        drag: 2.4,
        spin: 5,
        twinkle: true,
      });
      const accent = style({
        shapes: ['ring'],
        palette: ['#ffe07a'],
        life: [0.55, 0.7],
        size: [22, 26],
        speed: [0, 0],
        alpha: 0.95,
        anchor: 'head',
      });
      const ambient = {
        ...main,
        shapes: ['feather', 'sparkle', 'shard'] as const,
        life: [2.6, 3.6] as const,
        speed: [4, 12] as const,
        gravity: 6,
        spin: 1.2,
        alpha: 0.75,
      };
      return { main, accent, ambient };
    }
  }
}

/** 캐릭터(등급·모티프)와 반짝 여부로 입자 모양 한 벌을 정한다 */
export function fxStylesFor(
  character: Pick<Character, 'id' | 'effect' | 'rarity' | 'color'>,
  spec: TouchFxSpec,
): FxStyleSet {
  const body = character.color;
  let main: FxStyle;
  let accent: FxStyle | null = null;
  let ambient: FxStyle | null = null;
  let auraColor = '#ffe07a';
  let motif: EpicMotif | null = null;

  switch (spec.particle) {
    case 'bubble':
      main = style({
        shapes: ['bubble'],
        palette: [body, '#ffffff', body],
        life: [0.6, 1],
        size: [4, 9],
        speed: [60, 140],
        gravity: -70,
        drag: 1.8,
        spread: Math.PI * 1.3,
      });
      break;
    case 'sparkle':
      main =
        character.rarity === 'epic'
          ? style({
              shapes: ['sparkle', 'sparkle', 'dot', 'star'],
              palette: ['#b98cff', '#ff8fd1', '#ffffff', '#8ff0ff'],
              life: [0.5, 0.9],
              size: [5, 11],
              speed: [100, 210],
              gravity: 40,
              drag: 2.4,
              twinkle: true,
            })
          : style({
              shapes: ['sparkle', 'sparkle', 'dot'],
              palette: ['#5cc8ff', '#ffffff', '#bff3ff', '#ffe07a'],
              life: [0.45, 0.8],
              size: [4, 9],
              speed: [90, 190],
              gravity: 40,
              drag: 2.4,
              twinkle: true,
            });
      break;
    case 'star':
      main = style({
        shapes: ['star', 'star', 'sparkle', 'dot'],
        palette: ['#ffc02e', '#ffe07a', '#fff6c9', '#ffffff'],
        life: [0.6, 1],
        size: [5, 11],
        speed: [110, 230],
        gravity: 170,
        drag: 1.6,
        spin: 4,
        twinkle: true,
      });
      accent = style({
        shapes: ['glow'],
        palette: ['#ffd23f'],
        life: [0.45, 0.55],
        size: [40, 50],
        speed: [0, 0],
        alpha: 0.5,
      });
      break;
    case 'motif': {
      motif = epicMotifFor(character);
      const m = motifStyles(motif);
      main = m.main;
      accent = m.accent;
      ambient = spec.ambientPerSec > 0 ? m.ambient : null;
      auraColor = EPIC_THEMES[motif].core;
      break;
    }
  }

  return {
    main,
    trail: trailOf(main, spec.particle === 'motif' ? undefined : body),
    accent,
    ambient,
    milestone: milestoneOf(main),
    shiny: SHINY_STYLE,
    auraColor,
    motif,
  };
}

// ── 반응 입자 (등급과 무관) ──────────────────────────────────

export const REACTION_STYLES = {
  /** 머리 쓰다듬기·애교 점프: 작은 하트가 몽글몽글 */
  hearts: style({
    shapes: ['heart'],
    palette: HEART_PINKS,
    life: [0.8, 1.2],
    size: [5, 8.5],
    speed: [50, 120],
    gravity: -80,
    drag: 2,
    spread: Math.PI * 0.9,
    spin: 1,
  }),
  /** 졸 때: z 가 오른쪽 위로 천천히 */
  zzz: style({
    shapes: ['z'],
    palette: ['#6f63c9', '#4aa8e0'],
    life: [2, 2.4],
    size: [6, 10],
    speed: [22, 30],
    dir: UP + 0.55,
    spread: 0.35,
    gravity: -4,
    drag: 0.3,
    alpha: 0.9,
    anchor: 'head',
  }),
  /** 빙글빙글: 머리 둘레를 도는 별 */
  dizzy: style({
    shapes: ['star', 'star', 'sparkle'],
    palette: ['#ffd23f', '#ffffff', '#ffe07a'],
    life: [1.2, 1.5],
    size: [4.5, 7],
    speed: [0, 0],
    drag: 0,
    swirl: 4.5,
    twinkle: true,
  }),
} as const satisfies Record<string, FxStyle>;

export type ReactionFx = keyof typeof REACTION_STYLES;

/**
 * 반응 입자 count 개. ring > 0 이면 at 둘레 납작한 고리 위에 고르게 놓고 at 를 중심으로 돈다 (빙글빙글 별).
 * 낳은 수를 돌려준다.
 */
export function emitStyle(
  sys: FxSystem,
  st: FxStyle,
  count: number,
  at: Point,
  rng: RNG,
  ring = 0,
): number {
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) {
    if (ring > 0) {
      const a = (i / n) * TAU + rng() * 0.3;
      spawnOne(sys, st, { x: at.x + Math.cos(a) * ring, y: at.y + Math.sin(a) * ring * 0.35 }, at, rng);
    } else {
      spawnOne(sys, st, at, at, rng);
    }
  }
  return n;
}
