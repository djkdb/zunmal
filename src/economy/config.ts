import type { CollectionTier } from '../data/collections';
import type { Rarity } from '../data/rarity';

/**
 * 경제 밸런스 설정 — 게임 내 모든 코인 관련 숫자는 여기에만 둔다.
 * 컴포넌트/미니게임에 숫자를 하드코딩하지 말 것.
 *
 * 설계 목표 (초기값):
 *  - 평균적인 한 판(20~30초) ≈ 100~150 코인 ≈ 1회 뽑기 1번 남짓.
 *  - 하루 상한 3000 코인 ≈ 10연 뽑기 3번 남짓 — 과도한 파밍 방지.
 *
 * 재화는 코인 하나뿐이다. 코인으로 바로 캡슐을 뽑는다.
 * 코인 출처: 미니게임(일일 상한 적용), 중복 환급, 컬렉션 세트 보상.
 */

/**
 * 신규 플레이어 시작 코인 = 1회 뽑기 가격.
 * 첫 경험(FTUE): 시작 말랑이를 고른 뒤 바로 캡슐을 하나 뽑아 보게 해서 60초 안에 "뽑는 재미"를 만나게 한다.
 * 그다음 코인이 떨어지면 미니게임으로 자연스럽게 넘어간다.
 * 새 저장(createInitialSave)에만 적용된다. 기존 저장은 코인 값이 손상돼도 0으로 보정한다(sanitizeSave).
 */
export const STARTING_COINS = 100;

/**
 * 뽑기 가격 (코인).
 * 10연은 할인 없이 1회 × 10과 같은 값이다. 할인이 있으면 "모아서 10연"을 하려고 여러 판을 보상 없이 참게 되어
 * 흥미가 떨어진다 → 코인이 생기는 대로 1회씩 뽑는 짧은 루프(한 판 → 한 번 뽑기)를 기본으로 둔다.
 * 10연의 이점은 레어 이상 1개 확정과 한꺼번에 뒤집는 연출뿐이다. 천장은 1회 뽑기에도 똑같이 쌓인다.
 */
export const PULL_PRICE = { single: 100, multi: 1000 } as const;

/** 1회 / 10연 뽑기에서 나오는 캡슐 수. */
export const PULL_COUNT = { single: 1, multi: 10 } as const;

/**
 * 저장 데이터 v2 이하에 남아 있던 뽑기권을 코인으로 바꿀 때의 환산값.
 * 예전 1장 가격(100코인) 그대로 돌려준다.
 */
export const LEGACY_TICKET_TO_COINS = 100;

/**
 * 중복 환급 코인. 이미 보유한 말랑이를 다시 뽑으면 지급.
 * 희귀할수록 뽑기권 가치(100)에 근접하거나 초과하도록 설정해 "꽝" 느낌을 줄인다.
 */
export const DUPLICATE_REFUND: Readonly<Record<Rarity, number>> = {
  common: 10,
  rare: 30,
  epic: 80,
  legendary: 300,
  mythic: 1000,
  secret: 5000,
};

/** 등록되지 않은 미니게임에 쓰는 기본 점수→코인 배율. */
export const DEFAULT_GAME_MULTIPLIER = 0.5;

/**
 * 미니게임별 점수→코인 배율. baseCoins = floor(score × multiplier).
 * 게임마다 점수 스케일이 다르므로 "평균 플레이 ≈ 100~150 코인"이 되도록 맞춘다.
 */
export const GAME_MULTIPLIERS: Readonly<Record<string, number>> = {
  // 20초, 탭 1회 1점 + 콤보 보너스. 평균 200~260점 → 100~130 코인.
  'button-malang': 0.5,
  // 30초, 캡슐 10~30점, 폭탄 감점. 평균 300~400점 → 120~160 코인.
  'capsule-catch': 0.4,
  // 60초 4×4 짝 맞추기. 짝 20점 + 연속 보너스 + 클리어 시 남은 초×4 + 적은 시도 보너스.
  // 평균(40초·20회 클리어) 250~300점 → 125~150 코인, 잘하면 400점+ → 상한 200.
  matching: 0.5,
  // 약 33초, 노트 55~70개 × (퍼펙트 10 / 좋아요 5) × 콤보 배율(최대 ×3). 평균 400~600점 → 100~150 코인,
  // 잘 치면 800점 이상 → 상한 200. 전부 퍼펙트는 약 1150~1550점.
  rhythm: 0.25,
  // 최대 60초, 높이 10당 1점 + 사탕 5점. 떨어지면 끝이라 보통 10~20초에 250~350점 → 100~140 코인,
  // 끝까지 버티는 잘하는 플레이는 500점 이상 → 판당 상한 200 도달.
  'malang-jump': 0.4,
  // 30초, 톡 10점(황금 30) + 콤보 보너스, 가시 -15. 보통 300~450점 → 105~160 코인, 잘하면 600점+ → 상한 200.
  'pop-up': 0.35,
  // 45초, 1층 10점 + 딱 맞음 보너스 10~30점. 평균 200~300점 → 100~150 코인, 400점 이상이면 판당 상한.
  stack: 0.5,
  // 최대 90초, 기둥 통과 10점 + 별 5점 + 완주 시 남은 풍선당 30점. 풍선 2개(한 번은 봐줌).
  // 보통 25~40초 버티며 200~300점 → 100~150 코인, 50초 이상 버티면 400점+ → 판당 상한 200.
  'balloon-float': 0.5,
  // 90초 스네이크, 사탕 10점(황금 30) + 끝까지 버티면 50. 보통 사탕 15~25개(200~300점) → 100~150 코인,
  // 잘하면 400점 이상 → 판당 상한 200.
  'malang-train': 0.5,
  // 45초, 젤리 10점(황금 30) + 한 번에 여러 개 자르면 콤보 보너스(최대 +25), 폭탄은 목숨 차감(3개).
  // 보통 350~500점 → 105~150 코인, 잘하면 670점 이상 → 판당 상한 200.
  'jelly-slice': 0.3,
  // 최대 120초, 스테이지 4개 × 발사 3번. 심술 사탕 50점(한 발에 여러 개면 +20씩), 블록 10~15점,
  // 클리어 40점 + 남은 발사당 40점. 평균 500~800점 → 100~160 코인, 거의 다 깨면 1000점 이상 → 상한 200.
  'malang-sling': 0.2,
  // 최대 120초 수박게임식 합치기. 합치면 k(k+1)/2점(1~28), 가장 큰 말랑이끼리 합치면 50점.
  // 보통 400~600점 → 100~150 코인, 잘 쌓으면 800점 이상 → 상한 200. 넘치면 일찍 끝나서 막 떨어뜨리면 손해.
  'malang-merge': 0.25,
};

/**
 * 미니게임 로비의 "약 N코인"을 계산할 보통 점수 (한 번도 안 해 본 게임에만 쓴다. 해 본 게임은 내 기록으로 계산).
 * 위 GAME_MULTIPLIERS 주석의 "보통" 점수 범위 가운데 값 — 모두 100~150코인 근처가 되어야 한다(economy/playReward.test.ts).
 * 배율을 바꾸면 여기도 함께 본다.
 */
export const GAME_TYPICAL_SCORES: Readonly<Record<string, number>> = {
  'button-malang': 230,
  'capsule-catch': 350,
  matching: 275,
  rhythm: 500,
  'malang-jump': 300,
  'pop-up': 375,
  stack: 250,
  'balloon-float': 250,
  'malang-train': 250,
  'jelly-slice': 425,
  'malang-sling': 650,
  'malang-merge': 500,
};

/** 보통 점수가 없는 게임: 기본 배율로 약 125코인이 되는 점수 */
export const DEFAULT_TYPICAL_SCORE = 250;

/** 로비의 예상 코인은 이 단위로 반올림해 "약 120코인"처럼 보인다 (정확한 값인 척하지 않게) */
export const EXPECTED_COINS_ROUNDING = 10;

/**
 * 파트너 말랑이 희귀도 보너스 (baseCoins에 곱해지는 추가 비율).
 * 수집 동기를 주되 게임 실력보다 크게 작용하지 않도록 신화 30%, 시크릿 50%.
 */
export const PARTNER_RARITY_BONUS: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 0.05,
  epic: 0.1,
  legendary: 0.2,
  mythic: 0.3,
  secret: 0.5,
};

/** 한 판에서 얻을 수 있는 최대 코인 (파트너 보너스 포함). */
export const PER_GAME_CAP = 200;

/** 하루(Asia/Seoul 달력 기준)에 얻을 수 있는 최대 코인. */
export const DAILY_CAP = 3000;

/**
 * 컬렉션 세트 완성 보상 (코인, 세트당 한 번). 일일 상한과 무관하게 지급한다.
 * 시크릿이 들어간 세트일수록 크게 준다. (예전 뽑기권 보상 × 100)
 */
export const SET_REWARD_COINS: Readonly<Record<CollectionTier, number>> = {
  small: 300,
  medium: 500,
  large: 1000,
  legend: 2000,
  ultimate: 5000,
};

/**
 * 일일 미션 보상 (코인). 미션은 매일(서울 날짜) 3개가 새로 나온다.
 * 난이도별 보상 + 3개 모두 끝내면 추가 보너스. 미니게임 일일 상한과는 별개로 지급한다.
 * 하루 최대 약 350~450 코인 ≈ 1회 뽑기 4번 — 매일 들어올 이유를 주되 미니게임보다 크지 않게.
 */
export const MISSION_REWARD_COINS = { easy: 50, normal: 80, hard: 120 } as const;

/** 오늘의 미션 3개를 모두 받으면 주는 추가 코인. */
export const MISSION_ALL_CLEAR_BONUS = 150;

/**
 * 쿠폰. 코드는 대소문자·공백을 무시하고 비교한다(`economy/coupons.ts`). 한 기기(저장)당 한 번만 받는다.
 * 서버가 없어 코드는 앱 코드 안에 들어 있다 — 이벤트용 선물이지 보안 수단이 아니다.
 * 기간이 필요하면 startsAt/endsAt(ISO 날짜-시간, 서울 기준 +09:00)을 넣는다.
 * 코인은 일일 상한과 무관하게 지급한다.
 */
export interface CouponDef {
  /** 저장에 남는 고유 id (코드가 바뀌어도 중복 수령을 막는다) */
  id: string;
  code: string;
  coins: number;
  /** "오픈 기념" 같은 이름 — 받았을 때 문구에 쓴다 */
  title: string;
  startsAt?: string;
  endsAt?: string;
}

export const COUPONS: readonly CouponDef[] = [
  // 오픈 기념 선물: 10연 뽑기 한 번 값
  { id: 'open-2026', code: 'zun', coins: 1000, title: '오픈 기념' },
];

// ── 말랑 디저트 가게 (방치형 수입, economy/shop.ts) ───────────────────
/**
 * 가게 직원 한 마리의 시간당 코인 (희귀도별). 앱을 닫아 둬도 실제 시간만큼 쌓인다(서버가 없어 기기 시계 기준).
 *
 * 목표 (economy/shop.test.ts 가 대표 직원 구성으로 확인한다):
 *  - 하루에 2~3번 들어와 받는 플레이어는 가게가 하루에 약 16시간 일한 것으로 본다(`SHOP_EXPECTED_HOURS_PER_DAY`:
 *    밤에 자는 동안은 8시간에서 가득 차 멈춘다).
 *  - 새 플레이어(일반 시작 말랑이 하나) ≈ 10/시간 × 16 = 하루 150~250 → 미니게임 한두 판 값. 조금이라도 매일 들어올 이유.
 *  - 중반(8마리 이상 모아 3칸, 에픽·레어·일반 + 친밀도 조금) ≈ 35~45/시간 → 하루 500~800 → 10연 한 번에 1.5~2일.
 *  - 초반(4마리, 2칸) ≈ 하루 350~400, 후반(24마리 이상, 5칸 전설·에픽 위주 + 보너스) ≈ 하루 1,300~1,600.
 *  - 등급 차이는 일부러 완만하다(시크릿도 일반의 2.4배): 좋은 말랑이가 있으면 기쁘지만 칸 수(모은 말랑이 수)가 더 크다.
 * 가게 수입은 미니게임 일일 상한(DAILY_CAP)과 무관하다.
 */
export const SHOP_RATE_PER_HOUR: Readonly<Record<Rarity, number>> = {
  common: 10,
  rare: 12,
  epic: 14,
  legendary: 17,
  mythic: 20,
  secret: 24,
};

/**
 * 직원 칸이 열리는 "모은 말랑이 종류 수". 1마리면 1칸, 4마리 2칸, 8마리 3칸, 15마리 4칸, 24마리 5칸(최대).
 * 수집할수록 가게가 커진다 — 가챠를 돌릴 이유와 가게가 이어진다.
 */
export const SHOP_SLOT_UNLOCKS: readonly number[] = [1, 4, 8, 15, 24];

/** 가게가 가득 차는 시간. 이 시간어치를 넘으면 더 쌓이지 않는다("가게가 가득 찼어요"). */
export const SHOP_CAP_HOURS = 8;

/** 하루에 2~3번 받는 플레이어가 실제로 쌓는 시간(균형 계산·테스트용 가정). */
export const SHOP_EXPECTED_HOURS_PER_DAY = 16;

/** 친밀도 보너스: 애정 단계(data/affection.ts levelOf)가 1 오를 때마다 +5%, 최대 +25% (6단계 = 애정 250). */
export const SHOP_AFFECTION_BONUS = { perLevel: 0.05, max: 0.25 } as const;

/** 반짝 말랑이(반짝을 하나라도 가졌으면)는 +25%. */
export const SHOP_SHINY_BONUS = 0.25;

/** 세트 호흡: 같은 컬렉션 세트(data/collections.ts)에 속한 직원이 둘 이상이면 한 마리 늘 때마다 그 직원들 +10%. */
export const SHOP_SET_BONUS_PER_MEMBER = 0.1;

/**
 * 촉감별 특기 (말랑이마다 한 줄, data/materialIds.ts). 작게, 읽기 쉽게.
 *  - 슬로우 라이징: 느긋하게 오래 버텨서 가게가 가득 차는 시간 +1시간 (가게 전체, 최대 +2시간)
 *  - 탱탱 젤리: 통통 튀며 빨리 일해서 자기 수입 +10%
 *  - 쭉쭉이: 팔을 쭉 뻗어 다른 직원 수입 +5%씩
 *  - 찐득이: 딱 붙어 정이 들어서 친밀도 보너스가 두 배 (단계당 +10%, 최대 +50%)
 */
export const SHOP_MATERIAL_PERKS = {
  slowRiseExtraHours: 1,
  slowRiseMaxExtraHours: 2,
  jellyBonus: 0.1,
  stretchyHelpBonus: 0.05,
  stickyAffectionMultiplier: 2,
} as const;

/**
 * 저장된 "쌓아 둔 코인"(shop.banked)의 안전 상한 — 손상된 저장 정화용.
 * 5칸 모두 시크릿 + 모든 보너스 최대여도 가득 찬 가게는 약 2,000코인이라 넉넉하게 잡는다.
 */
export const SHOP_BANK_MAX = 10_000;

// ── 말랑 선물 (하루 한 번, economy/gift.ts) ───────────────────────────
/**
 * 서울 날짜로 하루 한 번, 친밀도가 가장 높은 말랑이가 선물 상자를 가져온다.
 * 코인 = 기본 30 + 애정 단계 × 10, 최대 120 (애정 단계 9 = 애정 400부터 최대).
 * 새 플레이어(1단계)는 40 — 쓰다듬을수록 선물이 커져 "말랑이를 아끼는" 보람이 코인으로도 보인다.
 * 첫 선물은 시작한 다음 날부터(첫날은 처음 안내에 집중).
 */
export const GIFT_COINS = { base: 30, perLevel: 10, max: 120 } as const;

// ── 홈 "다음 목표" (goals/nextGoal.ts) ───────────────────────────────
/**
 * 홈 허브가 "지금 할 한 가지"를 고를 때 쓰는 문턱값. 코인 값이 아니라 안내 기준이지만 밸런스와 함께 조정하므로 여기에 둔다.
 *  - shopReadyCoins: 가게에 이만큼 쌓이면(또는 가득 차면) "가게 코인 받기"를 권한다. 1회 뽑기 값.
 *    지금 코인 + 가게 코인으로 뽑을 수 있게 되면 이보다 적어도 권한다.
 *  - pityCloseWithin: 천장까지 이 횟수 이하로 남았고 뽑을 코인이 있으면 "전설 이상까지 N회"를 앞세운다.
 *  - missionNearRatio: 오늘의 미션이 이 비율 이상 진행됐으면 "조금만 더 하면 +N코인"을 권한다.
 *  - setNearMissing: 세트가 이 수 이하로 남았으면 "이 세트까지 N마리"를 뽑기 권유 앞에 둔다.
 */
export const GOAL_THRESHOLDS = {
  shopReadyCoins: PULL_PRICE.single,
  pityCloseWithin: 10,
  missionNearRatio: 0.6,
  setNearMissing: 2,
} as const;
