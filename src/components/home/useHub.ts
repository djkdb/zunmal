import { useMemo } from 'react';
import { readHub, type HubState } from '../../goals/hubState';
import { useNow } from '../../hooks/useNow';
import { useGameStore } from '../../store/useGameStore';

/**
 * 홈 허브 상태 (goals/hubState.ts readHub) — 저장이 바뀌거나 intervalMs 마다(가게 코인이 쌓이는 것·자정) 다시 계산한다.
 * 허브는 저장의 거의 모든 조각을 읽으므로 상태 전체를 구독한다(홈과 하단 탭만 쓴다).
 */
export function useHub(intervalMs = 15_000): HubState {
  const state = useGameStore();
  const now = useNow(intervalMs);
  return useMemo(() => readHub(state, now), [state, now]);
}
