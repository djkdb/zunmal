/**
 * 말랑이마다 촉감 id — 아주 작은 표만 따로 둔다 (홈의 디저트 가게 카드가 첫 화면 번들에서 읽는다).
 * 촉감의 물리·겉모습 숫자는 data/materials.ts (놀이방 청크).
 */
export const MATERIAL_IDS = ['slowRise', 'jelly', 'stretchy', 'sticky'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** 말랑이마다 촉감 (이름·설명에서 골랐다). 목록에 없으면 `DEFAULT_MATERIAL` */
export const MATERIAL_BY_ID: Readonly<Record<string, MaterialId>> = {
  // 일반
  'peach-mochi': 'slowRise', // 모찌: 폭 들어갔다 천천히
  'soda-drop': 'jelly', // 소다 젤리
  'custard-bun': 'slowRise', // 빵
  'matcha-bean': 'stretchy', // 쫀득한 말차 떡
  'milk-cloud': 'stretchy', // 구름처럼 늘어난다
  'grape-jelly': 'jelly', // 탱글탱글 탄력 최고
  'strawberry-daifuku': 'stretchy', // 찹쌀떡은 쭉 늘어난다
  tangerine: 'jelly', // 과즙 가득
  'choco-chip': 'slowRise', // 쿠키 반죽
  marshmallow: 'slowRise', // 세상에서 제일 푹신
  // 레어
  'ribbon-berry': 'jelly',
  'mint-scholar': 'slowRise', // 민트 푸딩 같은 폭신함
  'lemon-sprout': 'jelly',
  'bubble-tea': 'sticky', // 쫀득한 펄
  'rainy-day': 'sticky', // 빗물 슬라임
  jellyfish: 'sticky', // 해파리
  'cherry-twin': 'sticky', // 둘이 붙어 한 몸이 됐다
  // 에픽
  'starry-night': 'jelly',
  'ember-imp': 'stretchy', // 따끈하게 녹아 늘어난다
  'snow-scarf': 'slowRise', // 눈 뭉치
  'sakura-spirit': 'slowRise', // 벚꽃 떡
  'moon-bunny': 'stretchy', // 떡 찧는 토끼
  'coral-mermaid': 'sticky', // 바다 슬라임
  // 전설
  'sunset-king': 'jelly',
  'aurora-angel': 'stretchy', // 빛의 커튼처럼
  'thunder-dragon': 'jelly', // 찌릿찌릿 탱탱
  'crystal-queen': 'jelly', // 수정 젤리
  // 신화
  'galaxy-malang': 'sticky', // 은하 슬라임
  phoenix: 'slowRise', // 재 속에서 천천히 다시 부푼다
  // 시크릿
  'dream-unicorn': 'stretchy', // 솜사탕 꿈
  'milkyway-whale': 'jelly',
  'prism-seraph': 'jelly',
};

export const DEFAULT_MATERIAL: MaterialId = 'jelly';

/** 캐릭터 id → 촉감 id (없으면 기본) */
export function materialIdFor(id: string): MaterialId {
  return MATERIAL_BY_ID[id] ?? DEFAULT_MATERIAL;
}
