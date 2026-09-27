/**
 * 말랑이 촉감(재질) 표 — 놀이방에서 말랑이마다 손맛이 다르다. 순수 데이터 (React/DOM 의존 없음).
 *
 * 실제 말랑이 장난감의 네 가지 촉감을 흉내 낸다.
 *  - 슬로우 라이징(slowRise): 메모리폼. 누르면 금방 들어가고 놓으면 자국이 1.5~3초에 걸쳐 천천히 차오른다.
 *  - 탱탱 젤리(jelly): 잘 튀고 빠르게 출렁인다. 높은 "뾰잉".
 *  - 쭉쭉이(stretchy): 당기면 두세 배 멀리 늘어나고 놓으면 넘치듯 튕겨 돌아온다.
 *  - 찐득이(sticky): 손가락을 떼도 잠깐 붙어 있다가 "쩍" 떨어진다. 다른 말랑이·매트에 살짝 달라붙고 천천히 처진다.
 *
 * 컴포넌트는 숫자를 들고 있지 않는다: 물리(`touch/physics.ts`·`softbody.ts`·`world.ts`)가 이 표의 값만 읽는다.
 * 전설 이상은 몸속에 특별한 속(filling)이 있어 누르면 반응한다 (`FILLING_BY_ID`).
 * 저장 데이터가 아니다 — 캐릭터 id 에서 바로 계산하므로 저장 구조를 바꾸지 않는다.
 */
import type { Character } from './characters';
import { RARITIES, type Rarity } from './rarity';

export { MATERIAL_IDS, type MaterialId } from './materialIds';
import { DEFAULT_MATERIAL, MATERIAL_BY_ID, MATERIAL_LABELS, type MaterialId } from './materialIds';

/** 몸 안쪽 출렁임(physics.ts·softbody.ts)에 쓰는 값. 1 = 예전 기본 말랑 */
export interface MaterialFeel {
  /** 눌림·기울기·자국 스프링 강성 배수 (작을수록 느릿느릿) */
  springK: number;
  /** 놓았을 때 감쇠비 배수 (작을수록 오래 출렁) */
  zetaFree: number;
  /**
   * 슬로우 라이징: 놓은 뒤 눌린 자국이 되돌아오는 시정수 (ms). 0 이면 보통 스프링.
   * 누를 때는 빠르고(스프링) 돌아올 때만 느리다 (히스테리시스).
   */
  riseTauMs: number;
  /** 늘어나는 한계 배수 (당김·기울기·옆 이동) */
  stretch: number;
  /** 놓을 때 튕겨 돌아오는 반동 배수 (0 = 반동 없이 스르르) */
  snap: number;
  /** 쉬는 자세의 눌림 (찐득이는 조금 처져 있다) */
  sag: number;
  /** 손가락을 뗄 때 붙어 있는 최대 시간 (ms). 0 = 안 붙는다 */
  stickMs: number;
  /** 매트·다른 말랑이에 부딪힐 때 출렁임 배수 */
  impact: number;
}

/** 매트 세계(world.ts)의 몸 재질 — `BodyMaterial` 과 같은 모양 */
export interface MaterialWorld {
  /** 바닥에 떨어질 때 튀어 오르는 비율 (0..1) */
  bounce: number;
  wallBounce: number;
  /** 매트 위 미끄럼 마찰 */
  friction: number;
  /** 몸끼리 마찰 */
  grip: number;
  /** 몸끼리 밀어내는 강성 배수 */
  stiffness: number;
  mass: number;
  /** 끈적임 0..1 — 맞닿은 말랑이를 잠깐 붙잡는다 */
  stick: number;
}

/**
 * 3D 겉모습 (`components/touch3d/jellyScene.ts` 가 읽는다) — 실제 말랑이 장난감 사진처럼 보이게 하는 값.
 * 셰이더 하나(MeshPhysicalMaterial + 덧붙인 GLSL)가 이 값만 바꿔 네 재질을 그린다. 2D 대체 화면은 쓰지 않는다.
 */
export interface MaterialLook {
  /** 바탕 거칠기 (0 = 거울, 1 = 가루처럼 흐림) */
  roughness: number;
  /** 겉 코팅 광택 세기와 거칠기 — 젤리·찐득이의 또렷한 반사 */
  clearcoat: number;
  clearcoatRoughness: number;
  /** 스치는 각도의 보송한 빛 (벨벳·폼) */
  sheen: number;
  sheenRoughness: number;
  /** 바탕 반사 세기 */
  specular: number;
  /** 주변(방) 반사 세기 */
  envIntensity: number;
  /** 가짜 속 비침 0..1: 감싸는 빛 + 두꺼운 가운데는 진하게 + 가장자리로 빛이 새어 나옴 + 바닥에 모이는 빛 */
  translucency: number;
  /** 표면 잔결(폼 가루·실리콘 결) 세기 0..1 와 촘촘함 (텍스처 한 장당 칸 수) */
  grain: number;
  grainScale: number;
  /** 윤곽 쪽이 살짝 어두워지는 정도 (만화 외곽선 대신 몸이 둥글어 보이게) */
  edgeDark: number;
  /** 얇은 외곽선 진하기 0..1 (0 = 없음). 캐릭터 모양을 알아보게 가늘게만 */
  outline: number;
  /** 정면에서 그림 색을 지키는 정도 0..1 (얼굴·무늬를 또렷하게) */
  albedoHold: number;
  /** 젖은 듯 또렷한 작은 반사점 0..1 */
  wet: number;
}

/**
 * 표면 질감 — 실제 장난감을 만질 때 보이는 모양 (`touch/surface.ts`·`softbody.ts` 가 3D 로, 2D 겹 그림·입자 캔버스가 흉내 낸다).
 *  - 손끝 자국: 바닥이 평평하고 벽이 가파른 타원 자국 + 둘레가 살짝 솟은 테 (밀려난 살)
 *  - 주름: 폼을 깊게 누르면 자국에서 바퀴살처럼 퍼지는 골
 *  - 물결: 젤리를 놓거나 찌르면 몸을 가로질러 퍼지는 잔물결 (반사도 따라 흔들린다)
 *  - 목: 쭉쭉이를 당기면 가운데가 가늘어진다 (반사가 늘어난 방향으로 길게 선다)
 *  - 실: 찐득이를 떼어낼 때 손가락과 몸 사이에 늘어나다 끊어지는 가닥
 */
export interface MaterialSkin {
  /** 자국 둘레 솟은 테 (자국 깊이 대비 0..0.4) */
  rim: number;
  /** 자국 바닥 평평함 0..1 (0 = 둥근 그릇, 1 = 손끝처럼 평평한 바닥 + 가파른 벽) */
  flat: number;
  /** 깊게 누르면 자국에서 퍼지는 주름 골 0..1 */
  crease: number;
  /** 놓거나 찌르면 몸을 가로지르는 물결 0..1 */
  wave: number;
  /** 당길 때 가운데가 가늘어지는 정도 0..1 */
  neck: number;
  /** 떼어낼 때 늘어나는 실 가닥 수 (0 = 없음) */
  strands: number;
  /** 손가락이 닿은 자리가 가려져 어두워지는 정도 0..1 */
  contactDark: number;
}

export interface MaterialSpec {
  id: MaterialId;
  /** 표시 이름 */
  label: string;
  /** 촉감 한 줄 (방법 보기·정보 패널) */
  feelLine: string;
  feel: MaterialFeel;
  world: MaterialWorld;
  /**
   * 들어서 옮기기 시작하는 거리 (말랑이 크기 대비). 쭉쭉이는 멀리 늘어난 뒤에야 따라온다.
   */
  carryFrac: number;
  /** 3D 겉모습 */
  look: MaterialLook;
  /** 표면 질감 (자국·주름·물결·목·실) */
  skin: MaterialSkin;
}

export const MATERIALS: Readonly<Record<MaterialId, MaterialSpec>> = {
  slowRise: {
    id: 'slowRise',
    label: MATERIAL_LABELS.slowRise,
    feelLine: '누른 자국이 천천히 차올라요',
    feel: { springK: 0.9, zetaFree: 5, riseTauMs: 720, stretch: 0.9, snap: 0, sag: 0, stickMs: 0, impact: 0.7 },
    world: { bounce: 0.12, wallBounce: 0.3, friction: 0.45, grip: 1, stiffness: 0.75, mass: 1, stick: 0 },
    carryFrac: 0.5,
    // 매트한 메모리폼·모찌: 보송한 쉰, 가루 같은 잔결, 넓고 흐린 빛
    look: {
      roughness: 0.78,
      clearcoat: 0,
      clearcoatRoughness: 0.6,
      sheen: 1,
      sheenRoughness: 0.75,
      specular: 0.35,
      envIntensity: 0.5,
      translucency: 0.12,
      grain: 0.3,
      grainScale: 60,
      edgeDark: 0.28,
      outline: 0.35,
      albedoHold: 0.3,
      wet: 0,
    },
    // 폼: 손끝 모양 그대로 평평하게 들어가 오래 남고, 깊게 누르면 둘레에 주름 골이 퍼진다
    skin: { rim: 0.1, flat: 0.85, crease: 1, wave: 0, neck: 0.1, strands: 0, contactDark: 0.35 },
  },
  jelly: {
    id: 'jelly',
    label: MATERIAL_LABELS.jelly,
    feelLine: '통통 튀고 탱글탱글 흔들려요',
    feel: { springK: 1.35, zetaFree: 0.75, riseTauMs: 0, stretch: 1.1, snap: 1.25, sag: 0, stickMs: 0, impact: 1.35 },
    world: { bounce: 0.56, wallBounce: 0.78, friction: 0.24, grip: 0.8, stiffness: 1.25, mass: 1, stick: 0 },
    carryFrac: 0.5,
    // 반투명 구미 젤리: 또렷한 코팅 반사 + 속 비침
    look: {
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      sheen: 0,
      sheenRoughness: 0.3,
      specular: 0.8,
      envIntensity: 0.95,
      translucency: 1,
      grain: 0,
      grainScale: 90,
      edgeDark: 0.1,
      outline: 0.3,
      albedoHold: 0.22,
      wet: 0.55,
    },
    // 구미: 둥글게 들어가 둘레가 불룩, 놓으면 잔물결이 몸을 가로지른다
    skin: { rim: 0.22, flat: 0.35, crease: 0, wave: 1, neck: 0.15, strands: 0, contactDark: 0.2 },
  },
  stretchy: {
    id: 'stretchy',
    label: MATERIAL_LABELS.stretchy,
    feelLine: '멀리 쭈욱 늘어났다 퐁 돌아와요',
    feel: { springK: 0.85, zetaFree: 0.8, riseTauMs: 0, stretch: 2.5, snap: 1.7, sag: 0, stickMs: 0, impact: 1.1 },
    world: { bounce: 0.3, wallBounce: 0.5, friction: 0.35, grip: 0.9, stiffness: 0.85, mass: 1, stick: 0 },
    carryFrac: 1.1,
    // 새틴 실리콘 고무: 중간 광택, 스치는 각도에 은은한 쉰
    look: {
      roughness: 0.45,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      sheen: 0.55,
      sheenRoughness: 0.4,
      specular: 0.55,
      envIntensity: 0.7,
      translucency: 0.3,
      grain: 0.14,
      grainScale: 50,
      edgeDark: 0.2,
      outline: 0.35,
      albedoHold: 0.26,
      wet: 0.15,
    },
    // 실리콘 고무: 당기면 가운데가 잘록해진다
    skin: { rim: 0.16, flat: 0.55, crease: 0.12, wave: 0.35, neck: 1, strands: 0, contactDark: 0.25 },
  },
  sticky: {
    id: 'sticky',
    label: MATERIAL_LABELS.sticky,
    feelLine: '손가락에 붙었다가 쩍 떨어져요',
    feel: { springK: 0.6, zetaFree: 2.6, riseTauMs: 0, stretch: 1.4, snap: 0.5, sag: 0.07, stickMs: 380, impact: 0.8 },
    world: { bounce: 0.06, wallBounce: 0.2, friction: 0.75, grip: 1.3, stiffness: 0.6, mass: 1.1, stick: 1 },
    carryFrac: 0.7,
    // 젖은 슬라임: 아주 매끈한 코팅, 날카로운 반사점, 가장자리가 조금 어둡다
    look: {
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      sheen: 0,
      sheenRoughness: 0.3,
      specular: 1,
      envIntensity: 1.15,
      translucency: 0.55,
      grain: 0,
      grainScale: 90,
      edgeDark: 0.35,
      outline: 0.3,
      albedoHold: 0.2,
      wet: 1,
    },
    // 슬라임: 둘레가 가장 많이 밀려 솟고, 떼면 실이 늘어난다
    skin: { rim: 0.3, flat: 0.5, crease: 0, wave: 0.12, neck: 0.45, strands: 5, contactDark: 0.3 },
  },
};

export { MATERIAL_BY_ID, DEFAULT_MATERIAL } from './materialIds';

export function materialIdOf(character: Pick<Character, 'id'>): MaterialId {
  return MATERIAL_BY_ID[character.id] ?? DEFAULT_MATERIAL;
}

export function materialOf(character: Pick<Character, 'id'>): MaterialSpec {
  return MATERIALS[materialIdOf(character)];
}

// ── 특별한 속 (전설 이상) ─────────────────────────────────────

export type FillingKind = 'glitter' | 'starBeads' | 'galaxy' | 'rainbowGel';

export interface FillingSpec {
  kind: FillingKind;
  /** 표시 이름 */
  label: string;
  /** 주 색 두 개 (hex) */
  colors: readonly [string, string];
}

export const FILLING_LABELS: Readonly<Record<FillingKind, string>> = {
  glitter: '반짝이 가루 속',
  starBeads: '물방울 속 별',
  galaxy: '은하 속',
  rainbowGel: '무지개 젤 속',
};

/** 속이 있는 가장 낮은 등급 */
export const FILLING_MIN_RARITY: Rarity = 'legendary';

export const FILLING_BY_ID: Readonly<Record<string, Omit<FillingSpec, 'label'>>> = {
  'sunset-king': { kind: 'glitter', colors: ['#ffd23f', '#ff8a5c'] },
  'aurora-angel': { kind: 'rainbowGel', colors: ['#8ff0d8', '#c7a6ff'] },
  'thunder-dragon': { kind: 'glitter', colors: ['#fff27a', '#7ad7ff'] },
  'crystal-queen': { kind: 'starBeads', colors: ['#8fd8ff', '#ffd84d'] },
  'galaxy-malang': { kind: 'galaxy', colors: ['#8f6bff', '#ff8fd8'] },
  phoenix: { kind: 'glitter', colors: ['#ffb13d', '#ff5a3c'] },
  'dream-unicorn': { kind: 'rainbowGel', colors: ['#ffb3d9', '#9fd8ff'] },
  'milkyway-whale': { kind: 'galaxy', colors: ['#6fb8ff', '#d9c2ff'] },
  'prism-seraph': { kind: 'starBeads', colors: ['#ff9fd9', '#fff27a'] },
};

function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}

/** 이 말랑이 몸속의 특별한 속 (전설 미만은 null). 표에 없는 전설 이상은 등급 색 반짝이 가루 */
export function fillingOf(character: Pick<Character, 'id' | 'rarity' | 'color' | 'accentColor'>): FillingSpec | null {
  if (rarityRank(character.rarity) < rarityRank(FILLING_MIN_RARITY)) return null;
  const f = FILLING_BY_ID[character.id] ?? {
    kind: 'glitter' as const,
    colors: [character.accentColor ?? '#fff3a8', character.color] as const,
  };
  return { ...f, label: FILLING_LABELS[f.kind] };
}
