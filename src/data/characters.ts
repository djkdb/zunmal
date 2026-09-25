import type { Rarity } from './rarity';

/** 몸통 실루엣 */
export type MalangShape = 'round' | 'drop' | 'bun' | 'bean' | 'cloud' | 'heart' | 'star' | 'crystal';
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
  | 'cosmos'
  // 확장
  | 'strawberryTop' // 딸기 꼭지
  | 'tangerineLeaf' // 귤 꼭지 + 잎
  | 'straw' // 버블티 빨대
  | 'umbrella' // 작은 우산
  | 'tentacles' // 해파리 다리
  | 'bunnyEars' // 토끼 귀 + 초승달
  | 'flowerCrown' // 벚꽃 화관
  | 'fins' // 인어 지느러미
  | 'dragonWings' // 번개 용 날개 + 뿔
  | 'tiara' // 수정 티아라
  | 'flameWings' // 불꽃 날개 + 불꽃 볏
  | 'unicorn' // 뿔 + 무지개 갈기 + 작은 날개
  | 'whaleTail' // 고래 꼬리 + 물줄기
  | 'seraphWings'; // 여섯 장의 빛 날개 + 후광
/** 몸통 무늬 */
export type MalangPattern = 'none' | 'dots' | 'stripes' | 'sparkles' | 'chips' | 'boba';
/**
 * 몸통 재질 효과. 등급이 높을수록 화려한 재질을 쓴다.
 *  - none: 기본 젤리 그라데이션
 *  - glow: 은은한 발광
 *  - fire: 불꽃 그라데이션
 *  - crystal: 각진 수정 반사
 *  - aurora: 오로라 색 흐름
 *  - galaxy: 우주 + 별
 *  - holo: 무지개 홀로그램 (움직임)
 */
export type MalangEffect = 'none' | 'glow' | 'fire' | 'crystal' | 'aurora' | 'galaxy' | 'holo';

export interface Character {
  id: string;
  name: string;
  rarity: Rarity;
  /** 몸통 기본 색 (hex). 음영/하이라이트는 Malang 컴포넌트에서 파생한다. */
  color: string;
  /** 보조 색 (그라데이션/재질 효과용, 선택) */
  accentColor?: string;
  shape: MalangShape;
  eyes: MalangEyes;
  accessory: MalangAccessory;
  pattern: MalangPattern;
  effect: MalangEffect;
  description: string;
}

/**
 * 말랑이 32종 (전부 오리지널 디자인).
 * 밸런스용 숫자는 넣지 않는다 — 확률은 rarity.ts, 환급은 economy/config.ts.
 */
export const CHARACTERS: readonly Character[] = [
  // ── 일반 10 ─────────────────────────────────────────
  {
    id: 'peach-mochi',
    name: '복숭아 모찌',
    rarity: 'common',
    color: '#ffb8c9',
    shape: 'round',
    eyes: 'dot',
    accessory: 'none',
    pattern: 'none',
    effect: 'none',
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
    effect: 'none',
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
    effect: 'none',
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
    effect: 'none',
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
    effect: 'none',
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
    effect: 'none',
    description: '호기심이 많아 눈이 늘 동그랗다. 탱글탱글 탄력이 최고.',
  },
  {
    id: 'strawberry-daifuku',
    name: '딸기 찹쌀떡',
    rarity: 'common',
    color: '#fff0f3',
    accentColor: '#ff5d7a',
    shape: 'round',
    eyes: 'happy',
    accessory: 'strawberryTop',
    pattern: 'none',
    effect: 'none',
    description: '하얀 떡 속에 새콤한 딸기를 숨기고 있다. 쫀득함 만점.',
  },
  {
    id: 'tangerine',
    name: '귤 말랑',
    rarity: 'common',
    color: '#ffb347',
    shape: 'round',
    eyes: 'dot',
    accessory: 'tangerineLeaf',
    pattern: 'dots',
    effect: 'none',
    description: '겨울 이불 속 단골손님. 까면 속까지 말랑하다.',
  },
  {
    id: 'choco-chip',
    name: '초코칩 쿠키',
    rarity: 'common',
    color: '#e8b98a',
    accentColor: '#6b3f2a',
    shape: 'bun',
    eyes: 'wink',
    accessory: 'none',
    pattern: 'chips',
    effect: 'none',
    description: '몸에 박힌 초코칩을 하나씩 자랑한다. 우유랑 단짝.',
  },
  {
    id: 'marshmallow',
    name: '마시멜로',
    rarity: 'common',
    color: '#ffe3f1',
    shape: 'bean',
    eyes: 'sleepy',
    accessory: 'none',
    pattern: 'none',
    effect: 'none',
    description: '세상에서 제일 푹신한 말랑이. 따뜻하면 스르르 녹아 잠든다.',
  },
  // ── 레어 7 ──────────────────────────────────────────
  {
    id: 'ribbon-berry',
    name: '리본 베리',
    rarity: 'rare',
    color: '#ff9fb0',
    shape: 'heart',
    eyes: 'wink',
    accessory: 'bow',
    pattern: 'none',
    effect: 'none',
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
    effect: 'none',
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
    effect: 'none',
    description: '햇빛을 받으면 새싹이 쑥쑥 자란다. 새콤한 에너지 담당.',
  },
  {
    id: 'bubble-tea',
    name: '버블티 말랑',
    rarity: 'rare',
    color: '#e9c9a4',
    accentColor: '#3b2a2a',
    shape: 'bun',
    eyes: 'wide',
    accessory: 'straw',
    pattern: 'boba',
    effect: 'none',
    description: '쫀득한 펄을 가득 품었다. 빨대로 쪽 빨면 간지럼을 탄다.',
  },
  {
    id: 'rainy-day',
    name: '장마 말랑',
    rarity: 'rare',
    color: '#b7c8ff',
    accentColor: '#ffd23f',
    shape: 'drop',
    eyes: 'sleepy',
    accessory: 'umbrella',
    pattern: 'none',
    effect: 'none',
    description: '노란 우산을 쓰고 빗소리를 들으며 산책하는 걸 좋아한다.',
  },
  {
    id: 'jellyfish',
    name: '해파리 말랑',
    rarity: 'rare',
    color: '#d7c4ff',
    accentColor: '#ff9fd1',
    shape: 'bun',
    eyes: 'happy',
    accessory: 'tentacles',
    pattern: 'none',
    effect: 'glow',
    description: '밤바다에서 은은하게 빛난다. 둥실둥실 떠다니며 노래한다.',
  },
  {
    id: 'cherry-twin',
    name: '체리 쌍둥이',
    rarity: 'rare',
    color: '#ff5d7a',
    shape: 'heart',
    eyes: 'sparkle',
    accessory: 'tangerineLeaf',
    pattern: 'none',
    effect: 'glow',
    description: '늘 둘이 붙어 다니다 한 몸이 됐다. 반짝이는 눈이 매력.',
  },
  // ── 에픽 6 ──────────────────────────────────────────
  {
    id: 'starry-night',
    name: '별밤 말랑',
    rarity: 'epic',
    color: '#7f8ce0',
    shape: 'round',
    eyes: 'sparkle',
    accessory: 'stars',
    pattern: 'sparkles',
    effect: 'glow',
    description: '밤하늘 조각으로 만들어졌다는 소문이 있다. 몸에서 별이 반짝인다.',
  },
  {
    id: 'ember-imp',
    name: '불씨 도깨비',
    rarity: 'epic',
    color: '#ff9a76',
    accentColor: '#ffd23f',
    shape: 'bean',
    eyes: 'wide',
    accessory: 'horns',
    pattern: 'none',
    effect: 'fire',
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
    effect: 'none',
    description: '겨울에만 깨어나는 말랑이. 손뜨개 목도리를 절대 벗지 않는다.',
  },
  {
    id: 'sakura-spirit',
    name: '벚꽃 요정',
    rarity: 'epic',
    color: '#ffd1e0',
    accentColor: '#ff8fb5',
    shape: 'round',
    eyes: 'happy',
    accessory: 'flowerCrown',
    pattern: 'none',
    effect: 'glow',
    description: '봄바람이 불면 꽃잎을 흩뿌리며 춤춘다. 화관은 직접 엮었다.',
  },
  {
    id: 'moon-bunny',
    name: '달토끼 말랑',
    rarity: 'epic',
    color: '#f7f2ff',
    accentColor: '#ffe07a',
    shape: 'bean',
    eyes: 'sparkle',
    accessory: 'bunnyEars',
    pattern: 'none',
    effect: 'glow',
    description: '보름달에서 떡을 찧다 굴러 내려왔다. 귀가 기분 따라 움직인다.',
  },
  {
    id: 'coral-mermaid',
    name: '산호 인어',
    rarity: 'epic',
    color: '#7fe0d6',
    accentColor: '#ff9f8f',
    shape: 'drop',
    eyes: 'wink',
    accessory: 'fins',
    pattern: 'dots',
    effect: 'aurora',
    description: '산호초 사이를 헤엄치며 반짝이는 조개를 모은다.',
  },
  // ── 전설 4 ──────────────────────────────────────────
  {
    id: 'sunset-king',
    name: '노을 왕',
    rarity: 'legendary',
    color: '#ffab5e',
    accentColor: '#ff6f91',
    shape: 'drop',
    eyes: 'sparkle',
    accessory: 'crown',
    pattern: 'stripes',
    effect: 'fire',
    description: '저녁 하늘빛을 두른 말랑 왕국의 왕. 왕관이 조금 크다.',
  },
  {
    id: 'aurora-angel',
    name: '오로라 천사',
    rarity: 'legendary',
    color: '#8ff0da',
    accentColor: '#b98cff',
    shape: 'cloud',
    eyes: 'happy',
    accessory: 'halo',
    pattern: 'sparkles',
    effect: 'aurora',
    description: '빛의 커튼 속에서 태어났다. 머리 위 고리가 은은하게 빛난다.',
  },
  {
    id: 'thunder-dragon',
    name: '번개 용',
    rarity: 'legendary',
    color: '#8fb8ff',
    accentColor: '#ffe14d',
    shape: 'bean',
    eyes: 'wide',
    accessory: 'dragonWings',
    pattern: 'none',
    effect: 'glow',
    description: '작은 날개로 구름 위를 날아다닌다. 기분 좋으면 찌릿찌릿.',
  },
  {
    id: 'crystal-queen',
    name: '수정 여왕',
    rarity: 'legendary',
    color: '#bfe9ff',
    accentColor: '#e0c8ff',
    shape: 'crystal',
    eyes: 'sparkle',
    accessory: 'tiara',
    pattern: 'none',
    effect: 'crystal',
    description: '동굴 깊은 곳에서 천 년 동안 자란 수정 말랑이. 빛을 무지개로 쪼갠다.',
  },
  // ── 신화 2 ──────────────────────────────────────────
  {
    id: 'galaxy-malang',
    name: '은하 말랑',
    rarity: 'mythic',
    color: '#4b3a8f',
    accentColor: '#ff8fd1',
    shape: 'star',
    eyes: 'sparkle',
    accessory: 'cosmos',
    pattern: 'sparkles',
    effect: 'galaxy',
    description: '우주 전체가 말랑하게 뭉쳐 태어난 말랑이.',
  },
  {
    id: 'phoenix',
    name: '불사조 말랑',
    rarity: 'mythic',
    color: '#ff7a45',
    accentColor: '#ffe14d',
    shape: 'drop',
    eyes: 'sparkle',
    accessory: 'flameWings',
    pattern: 'none',
    effect: 'fire',
    description: '재 속에서 몇 번이고 다시 말랑하게 태어난다. 날갯짓마다 불꽃 가루가 날린다.',
  },
  // ── 시크릿 3 ────────────────────────────────────────
  {
    id: 'dream-unicorn',
    name: '꿈빛 유니콘',
    rarity: 'secret',
    color: '#fff4fb',
    accentColor: '#b98cff',
    shape: 'round',
    eyes: 'sparkle',
    accessory: 'unicorn',
    pattern: 'sparkles',
    effect: 'holo',
    description: '잠든 아이들의 꿈을 건너다니는 전설 속 말랑이. 본 사람은 거의 없다.',
  },
  {
    id: 'milkyway-whale',
    name: '은하수 고래',
    rarity: 'secret',
    color: '#2a3b8f',
    accentColor: '#7fe0ff',
    shape: 'bean',
    eyes: 'happy',
    accessory: 'whaleTail',
    pattern: 'sparkles',
    effect: 'galaxy',
    description: '밤하늘 바다를 천천히 헤엄치며 별을 뿜는다. 노랫소리가 우주에 울린다.',
  },
  {
    id: 'prism-seraph',
    name: '프리즘 세라핌',
    rarity: 'secret',
    color: '#fffbe6',
    accentColor: '#ffd23f',
    shape: 'crystal',
    eyes: 'sparkle',
    accessory: 'seraphWings',
    pattern: 'none',
    effect: 'holo',
    description: '빛 그 자체로 이루어진 말랑이. 여섯 장의 날개가 무지개를 흩뿌린다.',
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
  secret: CHARACTERS.filter((c) => c.rarity === 'secret'),
};

/** 신규 플레이어가 고를 수 있는 시작 말랑이 (일반 등급 — 파트너 보너스 0%라 경제에 영향 없음). */
export const STARTER_CHARACTER_IDS: readonly string[] = ['peach-mochi', 'soda-drop', 'matcha-bean'];
