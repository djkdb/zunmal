import type { Rarity } from './rarity';

/** 몸통 실루엣 */
export type MalangShape = 'round' | 'drop' | 'bun' | 'bean' | 'cloud' | 'heart' | 'star';
/** 눈 모양 */
export type MalangEyes = 'dot' | 'happy' | 'sleepy' | 'sparkle' | 'wink' | 'wide';
/** 머리/몸 장식 */
export type MalangAccessory =
  | 'none'
  | 'leaf'
  | 'bow'
  | 'glasses'
  | 'sprout'
  | 'stars'
  | 'horns'
  | 'scarf'
  | 'crown'
  | 'halo'
  | 'cosmos';
/** 몸통 무늬 */
export type MalangPattern = 'none' | 'dots' | 'stripes' | 'sparkles';

export interface Character {
  id: string;
  name: string;
  rarity: Rarity;
  /** 몸통 기본 색 (hex). 음영/하이라이트는 Malang 컴포넌트에서 파생한다. */
  color: string;
  shape: MalangShape;
  eyes: MalangEyes;
  accessory: MalangAccessory;
  pattern: MalangPattern;
  description: string;
}

/**
 * 말랑이 15종 (전부 오리지널 디자인).
 * 밸런스용 숫자는 넣지 않는다 — 확률은 rarity.ts, 환급은 economy/config.ts.
 */
export const CHARACTERS: readonly Character[] = [
  // ── 일반 6 ──────────────────────────────────────────
  {
    id: 'peach-mochi',
    name: '복숭아 모찌',
    rarity: 'common',
    color: '#ffb8c9',
    shape: 'round',
    eyes: 'dot',
    accessory: 'none',
    pattern: 'none',
    description: '누르면 “뽀옥” 소리를 내는 가장 흔한 말랑이. 볼이 늘 발그레하다.',
  },
  {
    id: 'soda-drop',
    name: '소다 방울',
    rarity: 'common',
    color: '#a8dcff',
    shape: 'drop',
    eyes: 'happy',
    accessory: 'none',
    pattern: 'dots',
    description: '몸속에서 작은 기포가 보글보글 올라온다. 흔들면 더 신난다.',
  },
  {
    id: 'custard-bun',
    name: '커스터드 빵',
    rarity: 'common',
    color: '#ffdc8f',
    shape: 'bun',
    eyes: 'sleepy',
    accessory: 'none',
    pattern: 'none',
    description: '따뜻한 곳을 좋아해서 늘 반쯤 졸고 있다. 달콤한 냄새가 난다.',
  },
  {
    id: 'matcha-bean',
    name: '말차 콩',
    rarity: 'common',
    color: '#b9e2a0',
    shape: 'bean',
    eyes: 'dot',
    accessory: 'leaf',
    pattern: 'none',
    description: '머리 위 잎사귀로 기분을 표현한다. 쌉쌀한 농담을 좋아한다.',
  },
  {
    id: 'milk-cloud',
    name: '우유 구름',
    rarity: 'common',
    color: '#f5f1e8',
    shape: 'cloud',
    eyes: 'happy',
    accessory: 'none',
    pattern: 'none',
    description: '폭신폭신한 우유색 말랑이. 비 오는 날엔 살짝 무거워진다.',
  },
  {
    id: 'grape-jelly',
    name: '포도 젤리',
    rarity: 'common',
    color: '#cdb6ff',
    shape: 'round',
    eyes: 'wide',
    accessory: 'none',
    pattern: 'dots',
    description: '호기심이 많아 눈이 늘 동그랗다. 탱글탱글 탄력이 최고.',
  },
  // ── 레어 3 ──────────────────────────────────────────
  {
    id: 'ribbon-berry',
    name: '리본 베리',
    rarity: 'rare',
    color: '#ff9fb0',
    shape: 'heart',
    eyes: 'wink',
    accessory: 'bow',
    pattern: 'none',
    description: '커다란 리본이 자랑. 윙크 한 번이면 모두 말랑해진다.',
  },
  {
    id: 'mint-scholar',
    name: '민트 박사',
    rarity: 'rare',
    color: '#9fe7cf',
    shape: 'drop',
    eyes: 'dot',
    accessory: 'glasses',
    pattern: 'stripes',
    description: '동그란 안경을 쓴 똑똑이. 뽑기 확률표를 외우고 다닌다.',
  },
  {
    id: 'lemon-sprout',
    name: '레몬 새싹',
    rarity: 'rare',
    color: '#fff08c',
    shape: 'bun',
    eyes: 'happy',
    accessory: 'sprout',
    pattern: 'none',
    description: '햇빛을 받으면 새싹이 쑥쑥 자란다. 새콤한 에너지 담당.',
  },
  // ── 에픽 3 ──────────────────────────────────────────
  {
    id: 'starry-night',
    name: '별밤 말랑',
    rarity: 'epic',
    color: '#7f8ce0',
    shape: 'round',
    eyes: 'sparkle',
    accessory: 'stars',
    pattern: 'sparkles',
    description: '밤하늘 조각으로 만들어졌다는 소문이 있다. 몸에서 별이 반짝인다.',
  },
  {
    id: 'ember-imp',
    name: '불씨 도깨비',
    rarity: 'epic',
    color: '#ff9a76',
    shape: 'bean',
    eyes: 'wide',
    accessory: 'horns',
    pattern: 'none',
    description: '작은 뿔이 달린 장난꾸러기. 화가 나면 몸이 따끈해진다.',
  },
  {
    id: 'snow-scarf',
    name: '눈송이 목도리',
    rarity: 'epic',
    color: '#e6f0ff',
    shape: 'cloud',
    eyes: 'sleepy',
    accessory: 'scarf',
    pattern: 'dots',
    description: '겨울에만 깨어나는 말랑이. 손뜨개 목도리를 절대 벗지 않는다.',
  },
  // ── 전설 2 ──────────────────────────────────────────
  {
    id: 'sunset-king',
    name: '노을 왕',
    rarity: 'legendary',
    color: '#ffab5e',
    shape: 'drop',
    eyes: 'sparkle',
    accessory: 'crown',
    pattern: 'stripes',
    description: '저녁 하늘빛을 두른 말랑 왕국의 왕. 왕관이 조금 크다.',
  },
  {
    id: 'aurora-angel',
    name: '오로라 천사',
    rarity: 'legendary',
    color: '#8ff0da',
    shape: 'cloud',
    eyes: 'happy',
    accessory: 'halo',
    pattern: 'sparkles',
    description: '빛의 커튼 속에서 태어났다. 머리 위 고리가 은은하게 빛난다.',
  },
  // ── 신화 1 ──────────────────────────────────────────
  {
    id: 'galaxy-malang',
    name: '은하 말랑',
    rarity: 'mythic',
    color: '#4b3a8f',
    shape: 'star',
    eyes: 'sparkle',
    accessory: 'cosmos',
    pattern: 'sparkles',
    description: '우주 전체가 말랑하게 뭉쳐 태어난 단 하나의 말랑이.',
  },
];

const CHARACTER_BY_ID: ReadonlyMap<string, Character> = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string): Character | undefined {
  return CHARACTER_BY_ID.get(id);
}

export function isCharacterId(id: unknown): id is string {
  return typeof id === 'string' && CHARACTER_BY_ID.has(id);
}

/** 희귀도별 캐릭터 풀 */
export const CHARACTERS_BY_RARITY: Readonly<Record<Rarity, readonly Character[]>> = {
  common: CHARACTERS.filter((c) => c.rarity === 'common'),
  rare: CHARACTERS.filter((c) => c.rarity === 'rare'),
  epic: CHARACTERS.filter((c) => c.rarity === 'epic'),
  legendary: CHARACTERS.filter((c) => c.rarity === 'legendary'),
  mythic: CHARACTERS.filter((c) => c.rarity === 'mythic'),
};

/** 신규 플레이어가 고를 수 있는 시작 말랑이 (일반 등급 — 파트너 보너스 0%라 경제에 영향 없음). */
export const STARTER_CHARACTER_IDS: readonly string[] = ['peach-mochi', 'soda-drop', 'matcha-bean'];
