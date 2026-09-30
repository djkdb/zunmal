/**
 * 신화·시크릿 등장 연출의 캐릭터별 테마 — 순수 데이터 (three.js/DOM 무관).
 * 말랑이마다 상징(모티프)이 달라서 같은 등급이라도 전혀 다른 장면이 나온다.
 */
import type { Character, MalangEffect } from '../../data/characters';
import { pose, type WorldShot } from './director';

/**
 * 장면의 핵심 장치.
 *  - galaxy: 나선 은하가 소용돌이치며 펼쳐진다
 *  - phoenix: 불씨가 솟구치고 불꽃 날개가 퍼덕인다
 *  - rainbow: 무지개 아치와 하트 비눗방울
 *  - ocean: 별빛 워프 → 잔물결 고리 → 별 물줄기
 *  - prism: 궤도를 도는 수정 조각, 후광, 무지갯빛 광선
 */
export type EpicMotif = 'galaxy' | 'phoenix' | 'rainbow' | 'ocean' | 'prism';

export type EpicParticleShape = 'dot' | 'star' | 'ember' | 'heart' | 'shard';

/**
 * 모티프 세계 컷 — 말랑이마다 하나뿐인 장면 (director가 "world" 컷에 넣는다).
 *  - spiral-travel: 위에서 내려다본 나선 은하 속으로 별줄기를 가르며 날아 들어간다
 *  - fire-ascent: 불씨를 뚫고 솟구치며 빛 뒤로 불꽃 날개가 펼쳐진다
 *  - rainbow-sky: 꿈빛 하늘을 올려다보면 무지개 아치가 차례로 걸리고 하트가 떠오른다
 *  - starsea-warp: 별빛 바다를 워프하다 고래 그림자가 지나가며 별 물줄기를 뿜는다
 *  - prism-sanctum: 수정 조각이 궤도를 돌고 후광 뒤로 프리즘 광선이 갈라진다
 */
export type EpicWorldId = 'spiral-travel' | 'fire-ascent' | 'rainbow-sky' | 'starsea-warp' | 'prism-sanctum';

export interface EpicWorld extends WorldShot {
  id: EpicWorldId;
  /** 장면 한 줄 (문서·테스트용) */
  label: string;
}

export interface EpicTheme {
  motif: EpicMotif;
  /** 배경 안쪽/바깥쪽 색 */
  bgInner: string;
  bgOuter: string;
  /** 성운 색 3개 */
  nebula: readonly [string, string, string];
  /** 캡슐 윗면/아랫면, 안쪽 빛, 금 사이로 새는 빛 */
  capsuleTop: string;
  capsuleBottom: string;
  core: string;
  crack: string;
  /** 무지갯빛 코팅 (0~1) */
  iridescence: number;
  /** 입자 색과 모양 */
  palette: readonly string[];
  shapes: readonly EpicParticleShape[];
  /** 입자가 식으며 바뀌는 색 (없으면 그대로) */
  fadeTo?: string;
  /** 입자에 걸리는 위아래 힘 (음수면 떠오름) */
  gravity: number;
  /** 소용돌이 세기 */
  swirl: number;
  /** 광선 수와 색 */
  rays: number;
  rayColors: readonly string[];
  /** 빛 번짐 세기 */
  bloom: number;
  /** 이름 아래 한 줄 */
  tagline: string;
  /** 모티프 세계 컷 */
  world: EpicWorld;
}

const RAINBOW = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'] as const;

export const EPIC_THEMES: Record<EpicMotif, EpicTheme> = {
  galaxy: {
    motif: 'galaxy',
    bgInner: '#2b1a5c',
    bgOuter: '#05020f',
    nebula: ['#ff8fd1', '#6b4bff', '#3fd0ff'],
    capsuleTop: '#6b4bff',
    capsuleBottom: '#f4ecff',
    core: '#ffc2ec',
    crack: '#ffd6f4',
    iridescence: 0.6,
    palette: ['#ff8fd1', '#b98cff', '#7fb8ff', '#ffffff', '#ffe07a'],
    shapes: ['dot', 'dot', 'star'],
    gravity: 0,
    swirl: 1.4,
    rays: 10,
    rayColors: ['#ff8fd1', '#b98cff', '#7fb8ff'],
    bloom: 1.25,
    tagline: '은하 한가운데서 굴러 나왔어요',
    world: {
      id: 'spiral-travel',
      label: '나선 은하 속으로 날아 들어가기',
      camera: { kind: 'travel', from: pose({ dist: 24, pitch: 1.15, yaw: 0.5 }), to: pose({ dist: 10, pitch: 0.5, yaw: -0.3, roll: -0.12 }), ease: 'inOut' },
    },
  },
  phoenix: {
    motif: 'phoenix',
    bgInner: '#5c1a0f',
    bgOuter: '#120304',
    nebula: ['#ff5a1f', '#ffb13d', '#ff2d55'],
    capsuleTop: '#ff5a1f',
    capsuleBottom: '#fff1d6',
    core: '#ffe14d',
    crack: '#fff2a8',
    iridescence: 0.15,
    palette: ['#ffe14d', '#ffb13d', '#ff7a45', '#fff6c9'],
    shapes: ['ember', 'ember', 'dot'],
    fadeTo: '#ff2d20',
    gravity: -2.2,
    swirl: 0.2,
    rays: 8,
    rayColors: ['#ffe14d', '#ff7a45'],
    bloom: 1.45,
    tagline: '불꽃 속에서 다시 태어났어요',
    world: {
      id: 'fire-ascent',
      label: '불씨를 뚫고 솟구쳐 날개 펼치기',
      camera: { kind: 'travel', from: pose({ dist: 12, pitch: -0.35, lift: -3.5, roll: 0.1 }), to: pose({ dist: 10.5, pitch: 0.02, lift: 0.4 }), ease: 'out' },
      cues: [{ kind: 'whoosh', at: 650 }],
    },
  },
  rainbow: {
    motif: 'rainbow',
    bgInner: '#4a2d7a',
    bgOuter: '#140a2a',
    nebula: ['#ff9fd1', '#b98cff', '#8ff0ff'],
    capsuleTop: '#f2d9ff',
    capsuleBottom: '#ffffff',
    core: '#ffffff',
    crack: '#ffe6fb',
    iridescence: 1,
    palette: [...RAINBOW, '#ffffff'],
    shapes: ['heart', 'star', 'dot', 'star'],
    gravity: -0.5,
    swirl: 0.35,
    rays: 14,
    rayColors: RAINBOW,
    bloom: 1.1,
    tagline: '꿈속에서 무지개를 건너왔어요',
    world: {
      id: 'rainbow-sky',
      label: '꿈빛 하늘에 무지개 아치가 걸리기',
      camera: { kind: 'low', from: pose({ dist: 12.5, pitch: -0.4, lift: -1.2 }), to: pose({ dist: 10.5, pitch: 0.02, lift: 0.3 }), ease: 'out' },
      cues: [{ kind: 'chime', at: 700 }],
    },
  },
  ocean: {
    motif: 'ocean',
    bgInner: '#12306e',
    bgOuter: '#01030f',
    nebula: ['#3fd0ff', '#2a3b8f', '#b98cff'],
    capsuleTop: '#1f3fa8',
    capsuleBottom: '#e8f6ff',
    core: '#9ff0ff',
    crack: '#c8f8ff',
    iridescence: 0.7,
    palette: ['#7fe0ff', '#ffffff', '#b8c8ff', '#ffe07a'],
    shapes: ['star', 'dot', 'dot'],
    gravity: 1.6,
    swirl: 0.25,
    rays: 0,
    rayColors: ['#7fe0ff'],
    bloom: 1.2,
    tagline: '은하수 바다를 헤엄쳐 왔어요',
    world: {
      id: 'starsea-warp',
      label: '별빛 바다 워프, 고래가 지나가며 물줄기',
      camera: { kind: 'travel', from: pose({ dist: 13, yaw: -0.3, roll: 0.1 }), to: pose({ dist: 9.5, yaw: 0.22, roll: -0.05 }), ease: 'inOut' },
      cues: [{ kind: 'whoosh', at: 450 }],
    },
  },
  prism: {
    motif: 'prism',
    bgInner: '#5a4310',
    bgOuter: '#0c0712',
    nebula: ['#ffd23f', '#ff9fd1', '#8ff0ff'],
    capsuleTop: '#ffd23f',
    capsuleBottom: '#fffbe6',
    core: '#fff6c9',
    crack: '#ffffff',
    iridescence: 1,
    palette: ['#fff6c9', '#ffd23f', '#ffffff', ...RAINBOW],
    shapes: ['shard', 'star', 'dot'],
    gravity: 0.3,
    swirl: 0.15,
    rays: 18,
    rayColors: ['#ffe07a', '#fff6c9', ...RAINBOW],
    bloom: 1.35,
    tagline: '여섯 날개로 빛을 가르고 내려왔어요',
    world: {
      id: 'prism-sanctum',
      label: '수정 조각 궤도와 후광, 프리즘 광선',
      camera: { kind: 'orbit', from: pose({ dist: 11, yaw: -0.8, pitch: 0.2 }), to: pose({ dist: 9, yaw: 0.6, pitch: -0.12 }), ease: 'inOut' },
      cues: [{ kind: 'chime', at: 600 }],
    },
  },
};

/** 캐릭터 id별 모티프 — 목록에 없으면 효과(effect)로, 그것도 없으면 등급으로 정한다 */
const MOTIF_BY_ID: Readonly<Record<string, EpicMotif>> = {
  'galaxy-malang': 'galaxy',
  phoenix: 'phoenix',
  'dream-unicorn': 'rainbow',
  'milkyway-whale': 'ocean',
  'prism-seraph': 'prism',
};

const MOTIF_BY_EFFECT: Partial<Record<MalangEffect, EpicMotif>> = {
  galaxy: 'galaxy',
  fire: 'phoenix',
  holo: 'rainbow',
  crystal: 'prism',
  aurora: 'rainbow',
};

export function epicMotifFor(character: Pick<Character, 'id' | 'effect' | 'rarity'>): EpicMotif {
  return (
    MOTIF_BY_ID[character.id] ??
    MOTIF_BY_EFFECT[character.effect] ??
    (character.rarity === 'secret' ? 'ocean' : 'galaxy')
  );
}

export function epicThemeFor(character: Pick<Character, 'id' | 'effect' | 'rarity'>): EpicTheme {
  return EPIC_THEMES[epicMotifFor(character)];
}
