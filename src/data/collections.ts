import { CHARACTERS } from './characters';

/** 세트 보상 등급 — 실제 코인은 economy/config.ts의 SET_REWARD_COINS */
export type CollectionTier = 'small' | 'medium' | 'large' | 'legend' | 'ultimate';

export interface Collection {
  id: string;
  name: string;
  description: string;
  /** 세트를 대표하는 색 (카드 배경) */
  color: string;
  memberIds: readonly string[];
  tier: CollectionTier;
}

/**
 * 테마 컬렉션. 한 말랑이가 여러 세트에 속할 수 있다.
 * 세트를 모두 모으면 코인 보상을 한 번 받는다.
 */
export const COLLECTIONS: readonly Collection[] = [
  {
    id: 'dessert-shop',
    name: '디저트 가게',
    description: '달콤한 간식 말랑이들',
    color: '#ffd3de',
    memberIds: ['peach-mochi', 'custard-bun', 'strawberry-daifuku', 'choco-chip', 'marshmallow', 'bubble-tea'],
    tier: 'small',
  },
  {
    id: 'fruit-basket',
    name: '과일 바구니',
    description: '새콤달콤 과일 말랑이들',
    color: '#ffe7b3',
    memberIds: ['grape-jelly', 'tangerine', 'ribbon-berry', 'lemon-sprout', 'cherry-twin'],
    tier: 'small',
  },
  {
    id: 'spring-picnic',
    name: '봄 소풍',
    description: '꽃이 피면 모이는 친구들',
    color: '#ffe0ec',
    memberIds: ['matcha-bean', 'marshmallow', 'lemon-sprout', 'sakura-spirit', 'peach-mochi'],
    tier: 'medium',
  },
  {
    id: 'weather-fairies',
    name: '날씨 요정',
    description: '맑음부터 번개까지',
    color: '#d6ecff',
    memberIds: ['soda-drop', 'milk-cloud', 'rainy-day', 'snow-scarf', 'sunset-king', 'thunder-dragon'],
    tier: 'large',
  },
  {
    id: 'night-sky',
    name: '밤하늘 산책',
    description: '별과 달이 뜨는 밤의 말랑이',
    color: '#d9d6ff',
    memberIds: ['starry-night', 'moon-bunny', 'aurora-angel', 'galaxy-malang'],
    tier: 'large',
  },
  {
    id: 'mythic-creatures',
    name: '전설의 생물',
    description: '이야기 속에서 튀어나온 말랑이',
    color: '#ffe0cc',
    memberIds: ['ember-imp', 'thunder-dragon', 'crystal-queen', 'phoenix'],
    tier: 'legend',
  },
  {
    id: 'deep-sea',
    name: '깊은 바다',
    description: '파도 아래 반짝이는 친구들',
    color: '#cdf3ee',
    memberIds: ['jellyfish', 'coral-mermaid', 'milkyway-whale'],
    tier: 'legend',
  },
  {
    id: 'dream-end',
    name: '꿈의 끝',
    description: '시크릿 말랑이 셋을 모두 만난 사람만',
    color: '#2d1b5e',
    memberIds: ['dream-unicorn', 'milkyway-whale', 'prism-seraph'],
    tier: 'ultimate',
  },
];

const COLLECTION_IDS = new Set(COLLECTIONS.map((c) => c.id));

export function isCollectionId(id: unknown): id is string {
  return typeof id === 'string' && COLLECTION_IDS.has(id);
}

export function getCollection(id: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/** 세트 진행도 */
export function collectionProgress(collection: Collection, ownedIds: ReadonlySet<string>) {
  const owned = collection.memberIds.filter((id) => ownedIds.has(id)).length;
  return { owned, total: collection.memberIds.length, complete: owned === collection.memberIds.length };
}

/** 개발 중 데이터 오류를 빨리 잡기 위한 검증 (테스트에서 사용) */
export function findUnknownMembers(): string[] {
  const ids = new Set(CHARACTERS.map((c) => c.id));
  return COLLECTIONS.flatMap((c) => c.memberIds.filter((id) => !ids.has(id)));
}
