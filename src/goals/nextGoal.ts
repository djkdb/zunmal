/**
 * 홈 "다음 목표" — 지금 할 만한 일을 모두 모아 우선순위로 줄 세우고, 가장 좋은 하나를 고른다. 순수 모듈.
 * 입력은 `readHub(save, now)`(저장 + 지금 시각). 문턱값은 `economy/config.ts` 의 `GOAL_THRESHOLDS`.
 *
 * 우선순위 (숫자가 작을수록 먼저, `GOAL_PRIORITY`):
 *
 * | # | kind | 언제 | 버튼 |
 * |---|---|---|---|
 * | 1 | gift | 오늘 말랑 선물이 왔다 | 열기 (바로 받기) |
 * | 2 | first-run | 첫걸음을 아직 다 안 했다 (`firstRun.ts`) | 단계마다 |
 * | 3 | mission-claim | 받을 미션 보상(또는 올클리어 보너스)이 있다 | 받기 |
 * | 4 | set-claim | 다 모으고 아직 안 받은 세트 보상이 있다 | 받기 |
 * | 5 | shop-ready | 가게 코인이 가득 찼거나 충분히 쌓였다 | 받기 |
 * | 6 | sealed | 놀이방 선반에 봉인된 캡슐이 있다 | 열기 → /touch/:id |
 * | 7 | pity-close | 천장까지 조금 남았고 뽑을 코인이 있다 | 뽑기 |
 * | 8 | mission-near | 오늘의 미션이 조금만 남았다 | 그 미션을 하러 |
 * | 9 | set-near | 세트가 몇 마리만 남았다 | 뽑기 / 게임하기 |
 * | 10 | pull | 뽑을 코인이 있다 | 뽑기 |
 * | 11 | earn | 코인이 모자라고 오늘 미니게임 코인이 남았다 | 게임하기 |
 * | 12 | affection | 파트너의 다음 애정 단계 (파트너가 있으면 늘 있는 마지막 목표) | 만지기 |
 *
 * 공짜로 바로 받는 것(선물·보상)을 먼저, 그다음 새 말랑이를 만나는 일, 그다음 뽑기·코인 모으기 순이다.
 * 첫걸음은 선물 다음 — 처음 온 사람은 흐름대로 따라가는 게 가장 좋다.
 */
import { getCharacter } from '../data/characters';
import { GACHA_RULES, RARITY_META } from '../data/rarity';
import { materialIdFor } from '../data/materialIds';
import { affectionProgress, perkLines } from '../economy/affection';
import { GOAL_THRESHOLDS, MISSION_ALL_CLEAR_BONUS, PULL_COUNT, PULL_PRICE, SET_REWARD_COINS } from '../economy/config';
import { josa } from '../lib/josa';
import { missionLabel, type Mission, type MissionKind } from '../missions/missions';
import { firstRunProgress, type FirstRunProgress, type FirstRunStep } from './firstRun';
import type { HubState } from './hubState';

/** 우선순위 순서 (앞일수록 먼저) */
export const GOAL_ORDER = [
  'gift',
  'first-run',
  'mission-claim',
  'set-claim',
  'shop-ready',
  'sealed',
  'pity-close',
  'mission-near',
  'set-near',
  'pull',
  'earn',
  'affection',
] as const;
export type GoalKind = (typeof GOAL_ORDER)[number];

/** 종류 → 순위 (1부터) */
export const GOAL_PRIORITY = Object.fromEntries(GOAL_ORDER.map((k, i) => [k, i + 1])) as Readonly<Record<GoalKind, number>>;

/** 목표 카드 그림 (components/icons.tsx 와 짝) */
export type GoalIcon = 'gift' | 'mission' | 'book' | 'shop' | 'capsule' | 'star' | 'game' | 'pet';

export type GoalAction =
  | { type: 'route'; to: string; tab?: 'sets' }
  | { type: 'claim-gift' }
  | { type: 'claim-mission'; id: MissionKind }
  | { type: 'claim-mission-bonus' }
  | { type: 'claim-set'; id: string }
  | { type: 'claim-shop' };

export interface Goal {
  kind: GoalKind;
  priority: number;
  /** 목표가 바뀌었는지 알아보는 키 (종류 + 제목 — 남은 수가 바뀌어도 달라진다) */
  key: string;
  icon: GoalIcon;
  title: string;
  detail: string;
  /** 0..1 (없으면 막대를 그리지 않는다) */
  progress?: number;
  /** 막대 옆 글자 ("40/100") */
  progressText?: string;
  /** 버튼 글자 — 누르면 일어나는 일 그대로, 짧게 */
  cta: string;
  action: GoalAction;
  /** 첫걸음 목표일 때 단계와 진행 */
  firstRun?: { step: FirstRunStep; progress: FirstRunProgress };
}

type GoalDraft = Omit<Goal, 'priority' | 'key'>;

const ROUTE = {
  gacha: { type: 'route', to: '/gacha' },
  play: { type: 'route', to: '/play' },
  touch: { type: 'route', to: '/touch' },
  sets: { type: 'route', to: '/collection', tab: 'sets' },
} as const satisfies Record<string, GoalAction>;

/** 코인이 모자랄 때의 공통 문구: "N코인 더 모으면 …" */
function needText(hub: HubState): string {
  return `${hub.coinsToPull.toLocaleString()}코인 더 모으면 돼요`;
}

function coinProgress(hub: HubState): Pick<Goal, 'progress' | 'progressText'> {
  return {
    progress: Math.min(1, hub.coins / PULL_PRICE.single),
    progressText: `${hub.coins.toLocaleString()}/${PULL_PRICE.single}`,
  };
}

function firstRunGoal(hub: HubState, fr: FirstRunProgress): GoalDraft | null {
  const step = fr.current;
  // 'starter'(첫 말랑이 고르기)는 홈에 오기 전에 끝난다
  if (!step || step === 'starter') return null;
  const base = { kind: 'first-run' as const, firstRun: { step, progress: fr } };
  switch (step) {
    case 'pull':
      return hub.canPull
        ? { ...base, icon: 'capsule', title: '첫 캡슐을 뽑아 봐요', detail: '선물 받은 코인으로 뽑아요', cta: '뽑기', action: ROUTE.gacha }
        : { ...base, icon: 'game', title: '미니게임으로 코인을 모아요', detail: needText(hub), cta: '게임하기', action: ROUTE.play };
    case 'open': {
      const id = hub.sealed[0];
      const c = id ? getCharacter(id) : undefined;
      return {
        ...base,
        icon: 'capsule',
        title: '새 캡슐을 열어 봐요',
        // 이름은 캡슐을 열 때까지 비밀 (놀이방 선반도 등급만 보여 준다)
        detail: c ? `${RARITY_META[c.rarity].label} 캡슐이 놀이방에 있어요` : '놀이방에서 기다려요',
        cta: '열기',
        action: id ? { type: 'route', to: `/touch/${id}` } : ROUTE.touch,
      };
    }
    case 'touch':
      return { ...base, icon: 'pet', title: '말랑이를 쓰다듬어 봐요', detail: '꾹 누르거나 살살 문질러요', cta: '만지기', action: ROUTE.touch };
    case 'play':
      return { ...base, icon: 'game', title: '미니게임 한 판 해 봐요', detail: '점수만큼 코인이 모여요', cta: '게임하기', action: ROUTE.play };
    case 'pull-again':
      return hub.canPull
        ? { ...base, icon: 'capsule', title: '한 번 더 뽑아 봐요', detail: '모은 코인으로 새 말랑이를 만나요', cta: '뽑기', action: ROUTE.gacha }
        : {
            ...base,
            icon: 'game',
            title: '코인을 모아 한 번 더 뽑아요',
            detail: needText(hub),
            ...coinProgress(hub),
            cta: '게임하기',
            action: ROUTE.play,
          };
  }
}

/** 미션마다 "N판" 같은 남은 양 */
const MISSION_AMOUNT: Record<MissionKind, (left: number) => string> = {
  'play-games': (n) => `${n}판`,
  pull: (n) => `${n}개`,
  pet: (n) => `${n}번`,
  'earn-coins': (n) => `코인 ${n.toLocaleString()}개`,
  'new-best': (n) => (n === 1 ? '기록 한 번' : `기록 ${n}번`),
};
const DO_PLAY: [string, GoalIcon, GoalAction] = ['게임하기', 'game', ROUTE.play];
const DO_PULL: [string, GoalIcon, GoalAction] = ['뽑기', 'capsule', ROUTE.gacha];
const DO_TOUCH: [string, GoalIcon, GoalAction] = ['만지기', 'pet', ROUTE.touch];

/** 조금 남은 미션: 하러 갈 곳과 남은 양 */
function missionNear(hub: HubState, m: Mission): GoalDraft | null {
  const have = hub.missions.state.progress[m.kind] ?? 0;
  const left = m.target - have;
  if (left <= 0 || have / m.target < GOAL_THRESHOLDS.missionNearRatio) return null;
  // 뽑을 코인이 없으면 뽑기 미션은, 오늘 게임 코인을 다 모았으면 코인 미션은 지금 권하지 않는다
  if ((m.kind === 'pull' && !hub.canPull) || (m.kind === 'earn-coins' && hub.dailyLeft <= 0)) return null;
  const amount = MISSION_AMOUNT[m.kind](left);
  const [cta, icon, action] = m.kind === 'pull' ? DO_PULL : m.kind === 'pet' ? DO_TOUCH : DO_PLAY;
  return {
    kind: 'mission-near',
    icon,
    title: `${amount}만 더 하면 +${m.reward}코인`,
    detail: `오늘의 미션: ${missionLabel(m)}`,
    progress: have / m.target,
    progressText: `${have.toLocaleString()}/${m.target.toLocaleString()}`,
    cta,
    action,
  };
}

/** 가능한 목표를 모두 (우선순위 순). 파트너가 있으면 늘 하나 이상 나온다. */
export function goalCandidates(hub: HubState): Goal[] {
  const out: GoalDraft[] = [];
  const fr = firstRunProgress(hub);

  // 1. 말랑 선물
  const giver = hub.gift.giver ? getCharacter(hub.gift.giver) : undefined;
  if (hub.gift.available && giver) {
    out.push({
      kind: 'gift',
      icon: 'gift',
      title: `${josa(giver.name, '이/가')} 선물을 가져왔어요`,
      detail: `열면 ${hub.gift.coins}코인이 들어 있어요`,
      cta: '열기',
      action: { type: 'claim-gift' },
    });
  }

  // 2. 첫걸음
  const first = firstRunGoal(hub, fr);
  if (first) out.push(first);

  // 3. 미션 보상
  const claimable = hub.missions.claimable[0];
  if (claimable) {
    out.push({
      kind: 'mission-claim',
      icon: 'mission',
      title: '미션 보상을 받을 수 있어요',
      detail: `${missionLabel(claimable)} +${claimable.reward}코인`,
      cta: '받기',
      action: { type: 'claim-mission', id: claimable.id },
    });
  } else if (hub.missions.bonusReady) {
    out.push({
      kind: 'mission-claim',
      icon: 'mission',
      title: '오늘 미션을 모두 끝냈어요',
      detail: `보너스 ${MISSION_ALL_CLEAR_BONUS}코인을 받을 수 있어요`,
      cta: '받기',
      action: { type: 'claim-mission-bonus' },
    });
  }

  // 4. 세트 보상
  const setReward = hub.collection.claimableSets[0];
  if (setReward) {
    out.push({
      kind: 'set-claim',
      icon: 'book',
      title: `${setReward.set.name} 세트를 완성했어요`,
      detail: `보상 ${SET_REWARD_COINS[setReward.set.tier].toLocaleString()}코인을 받을 수 있어요`,
      cta: '받기',
      action: { type: 'claim-set', id: setReward.set.id },
    });
  }

  // 5. 가게 코인
  if (hub.shop.ready) {
    const { reading } = hub.shop;
    const unlocksPull = !hub.canPull && hub.coins + reading.coins >= PULL_PRICE.single;
    out.push({
      kind: 'shop-ready',
      icon: 'shop',
      title: reading.full ? '가게가 가득 찼어요' : '가게에 코인이 쌓였어요',
      detail: unlocksPull
        ? `${reading.coins.toLocaleString()}코인을 받으면 바로 뽑을 수 있어요`
        : `${reading.coins.toLocaleString()}코인을 받을 수 있어요`,
      progress: reading.fill,
      cta: '받기',
      action: { type: 'claim-shop' },
    });
  }

  // 6. 봉인된 캡슐
  const sealedId = hub.sealed[0];
  if (sealedId) {
    const n = hub.sealed.length;
    out.push({
      kind: 'sealed',
      icon: 'capsule',
      title: '새 말랑이 열어 보기',
      detail: n > 1 ? `캡슐 ${n}개가 놀이방에서 기다려요` : '캡슐이 놀이방에서 기다려요',
      cta: '열기',
      action: { type: 'route', to: `/touch/${sealedId}` },
    });
  }

  // 7. 천장이 가까움
  if (hub.canPull && hub.pityLeft <= GOAL_THRESHOLDS.pityCloseWithin) {
    out.push({
      kind: 'pity-close',
      icon: 'star',
      title: `전설 이상까지 ${hub.pityLeft}회`,
      detail: `${hub.pityLeft}번 안에 전설 이상이 꼭 나와요`,
      progress: 1 - hub.pityLeft / GACHA_RULES.pityThreshold,
      progressText: `${GACHA_RULES.pityThreshold - hub.pityLeft}/${GACHA_RULES.pityThreshold}`,
      cta: '뽑기',
      action: ROUTE.gacha,
    });
  }

  // 8. 조금 남은 미션 (가장 많이 한 것부터)
  const near = hub.missions.list
    .filter((m) => !hub.missions.state.claimed.includes(m.id))
    .map((m) => missionNear(hub, m))
    .filter((g): g is GoalDraft => g !== null)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
  if (near) out.push(near);

  // 9. 거의 다 모은 세트
  const nearest = hub.collection.nearestSet;
  if (nearest && !nearest.complete) {
    const reward = SET_REWARD_COINS[nearest.set.tier].toLocaleString();
    const setBase = {
      progress: nearest.ratio,
      progressText: `${nearest.owned}/${nearest.total}`,
      ...(hub.canPull
        ? { cta: '뽑기', action: ROUTE.gacha as GoalAction }
        : hub.dailyLeft > 0
          ? { cta: '게임하기', action: ROUTE.play as GoalAction }
          : { cta: '보기', action: ROUTE.sets as GoalAction }),
    };
    if (nearest.missing <= GOAL_THRESHOLDS.setNearMissing) {
      out.push({
        kind: 'set-near',
        icon: 'book',
        title: `${nearest.set.name} 세트까지 ${nearest.missing}마리`,
        detail: `완성하면 ${reward}코인을 받아요`,
        ...setBase,
      });
    }
  }

  // 10. 뽑기
  if (hub.canPull) {
    out.push({
      kind: 'pull',
      icon: 'capsule',
      title: '캡슐을 뽑을 수 있어요',
      detail:
        hub.coins >= PULL_PRICE.multi
          ? `${PULL_COUNT.multi}연 뽑기도 할 수 있어요`
          : `지금 코인으로 ${hub.pullsAffordable}번 뽑을 수 있어요`,
      cta: '뽑기',
      action: ROUTE.gacha,
    });
  }

  // 11. 코인 모으기
  if (!hub.canPull && hub.dailyLeft > 0) {
    out.push({
      kind: 'earn',
      icon: 'game',
      title: '미니게임에서 코인 모으기',
      detail: `${hub.coinsToPull.toLocaleString()}코인 더 모으면 캡슐을 뽑아요`,
      ...coinProgress(hub),
      cta: '게임하기',
      action: ROUTE.play,
    });
  }

  // 12. 파트너 애정
  const partner = hub.partner;
  if (partner) {
    // 도감 상세·놀이방과 같은 친밀도 진행 하나(economy/affection.ts)에서 — 단계는 어디서나 "Lv.N"
    const p = affectionProgress(hub.save.affection[partner.id] ?? 0, { material: materialIdFor(partner.id) });
    const nextLv = `Lv.${p.level + 1}`;
    const perk = p.next ? perkLines(p.next)[0] : undefined;
    out.push({
      kind: 'affection',
      icon: 'pet',
      title: `${josa(partner.name, '과/와')} 더 놀아요`,
      detail: perk ? `${josa(nextLv, '이/가')} 되면 ${perk.text}` : `친밀도 ${p.toNext}만 더 쌓으면 ${josa(nextLv, '이/가')} 돼요`,
      progress: p.ratio,
      progressText: `Lv.${p.level}`,
      cta: '만지기',
      action: ROUTE.touch,
    });
  }

  return out
    .map((g) => ({ ...g, key: `${g.kind}:${g.title}`, priority: GOAL_PRIORITY[g.kind] }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 가장 좋은 목표 하나. skip 에 든 종류는 건너뛴다 — 홈 파트너 말풍선이 이미 말랑 선물을 보여 주면 카드는 다음 목표를 고른다.
 */
export function nextGoal(hub: HubState, skip: readonly GoalKind[] = []): Goal | null {
  return goalCandidates(hub).find((g) => !skip.includes(g.kind)) ?? null;
}
