/**
 * 홈 "오늘" 줄과 홈 탭 알림 점 — 순수 모듈. 모두 `readHub` 값에서 계산한다(새 저장 필드 없음).
 *
 * 오늘 줄은 하루 흐름을 순서대로 보여 준다: 선물 → 미션 → 가게 → 미니게임 → 뽑기.
 * 출석부가 아니라 "오늘 할 만한 것" 표시다 — 안 했다고 벌이 없고, 한 것은 체크만 된다.
 *
 * | 칸 | 했음(done) | 할 수 있음(ready) | 나중(later) |
 * |---|---|---|---|
 * | 선물 | 오늘 받았다(`giftDay` = 오늘, 시작한 날 제외) | 선물이 왔다 | 시작한 날 (첫 선물은 다음 날부터) |
 * | 미션 | 올클리어 보너스까지 받았다 | 받을 보상이 있다 | — |
 * | 가게 | 오늘 한 번 이상 받았다(하루 기록 `shop-claim`) | 받기를 권할 만큼 쌓였다 | — |
 * | 미니게임 | 오늘 한 판 이상 (하루 기록 `play-games`) | — | — |
 * | 뽑기 | 오늘 한 번 이상 (하루 기록 `pull`) | 뽑을 코인이 있다 | — |
 * "ready" 가 "done" 보다 먼저다 (가게를 받았어도 다시 가득 차면 받을 수 있음으로).
 */
import type { HubState } from './hubState';

export const TODAY_ITEMS = ['gift', 'missions', 'shop', 'play', 'pull'] as const;
export type TodayItemId = (typeof TODAY_ITEMS)[number];
export type TodayItemState = 'done' | 'ready' | 'todo' | 'later';

export interface TodayItem {
  id: TodayItemId;
  state: TodayItemState;
  /** 칸 아래 짧은 이름 */
  label: string;
  /** 화면 읽기용 한 줄 (상태 포함) */
  description: string;
}

export interface TodayLoop {
  items: TodayItem[];
  /** 한 칸 수 */
  done: number;
  /** 오늘 셀 수 있는 칸 수 ("나중" 제외) */
  total: number;
}

/** 화면 읽기용 상태 말 */
const STATE_TEXT: Record<TodayItemState, string> = {
  done: '했어요',
  ready: '지금 할 수 있어요',
  todo: '아직 안 했어요',
  later: '내일부터 받아요',
};

function item(id: TodayItemId, state: TodayItemState, label: string): TodayItem {
  return { id, state, label, description: `${label}, ${STATE_TEXT[state]}` };
}

export function todayLoop(hub: HubState): TodayLoop {
  const progress = hub.missions.state.progress;
  const { gift, missions, shop } = hub;

  const giftState: TodayItemState = gift.available
    ? 'ready'
    : hub.save.giftDay === hub.today && hub.firstDay
      ? 'later'
      : hub.save.giftDay === hub.today
        ? 'done'
        : 'todo';
  const missionState: TodayItemState = missions.state.bonusClaimed
    ? 'done'
    : missions.claimable.length > 0 || missions.bonusReady
      ? 'ready'
      : 'todo';
  const shopState: TodayItemState = shop.ready ? 'ready' : shop.claimedToday ? 'done' : 'todo';
  const playState: TodayItemState = (progress['play-games'] ?? 0) > 0 ? 'done' : 'todo';
  const pullState: TodayItemState = (progress.pull ?? 0) > 0 ? 'done' : hub.canPull ? 'ready' : 'todo';

  const items: TodayItem[] = [
    item('gift', giftState, '선물'),
    item('missions', missionState, `미션 ${missions.claimedCount}/${missions.list.length}`),
    item('shop', shopState, '가게'),
    item('play', playState, '미니게임'),
    item('pull', pullState, '뽑기'),
  ];
  const counted = items.filter((i) => i.state !== 'later');
  return { items, done: counted.filter((i) => i.state === 'done').length, total: counted.length };
}
