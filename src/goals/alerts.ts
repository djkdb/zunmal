/**
 * 홈 탭 빨간 점 — 순수 모듈. `readHub` 값에서 계산한다(하단 탭이 첫 화면 번들이라 오늘 줄과 따로 둔다).
 */
import type { HubState } from './hubState';

export interface HomeAlerts {
  gift: boolean;
  missions: boolean;
  sets: boolean;
  /** 가게가 가득 찼다 (조금 쌓인 것으로는 점을 켜지 않는다) */
  shopFull: boolean;
  /** 봉인된 캡슐 수 */
  sealed: number;
  any: boolean;
  /** 탭 이름 뒤에 붙여 읽을 설명 (없으면 빈 문자열) */
  label: string;
}

/** 홈 탭 빨간 점: 받을 것(선물·미션·세트 보상)이 있거나, 가게가 가득 찼거나, 열지 않은 캡슐이 있을 때 */
export function homeAlerts(hub: HubState): HomeAlerts {
  const gift = hub.gift.available;
  const missions = hub.missions.claimable.length > 0 || hub.missions.bonusReady;
  const sets = hub.collection.claimableSets.length > 0;
  const shopFull = hub.shop.reading.full && hub.shop.reading.coins >= 1;
  const sealed = hub.sealed.length;
  const parts = [
    gift && '말랑 선물 도착',
    missions && '받을 미션 보상 있음',
    sets && '받을 세트 보상 있음',
    shopFull && '가게가 가득 참',
    sealed > 0 && `열지 않은 캡슐 ${sealed}개`,
  ].filter((p): p is string => typeof p === 'string');
  return { gift, missions, sets, shopFull, sealed, any: parts.length > 0, label: parts.join(', ') };
}
