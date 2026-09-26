import { useRef } from 'react';
import { sfx } from '../../audio/sfx';
import { flyCoins } from '../../lib/coinFx';
import { haptic } from '../../lib/haptics';
import { useGameStore } from '../../store/useGameStore';

/**
 * 세트 보상 받기 — store 의 claimSet 을 그대로 부르고, 재화 버튼 규칙대로 ref 로 바로 잠근다(연타해도 한 번).
 * 받으면 소리·진동 + 버튼에서 코인이 코인 알약으로 날아간다. 받은 코인(못 받았으면 0).
 * `onClaimed`는 받은 뒤 화면 읽기 알림용(버튼이 "보상을 받았어요"로 바뀌며 사라지므로 도감이 한 줄 읽어 준다).
 */
export function useSetClaim(onClaimed?: (setId: string, coins: number) => void): (setId: string, from: HTMLElement | null) => number {
  const claimSet = useGameStore((s) => s.claimSet);
  const lockRef = useRef(false);
  return (setId, from) => {
    if (lockRef.current) return 0;
    lockRef.current = true;
    window.setTimeout(() => {
      lockRef.current = false;
    }, 600);
    const res = claimSet(setId);
    if (!res.ok) {
      sfx.fail();
      return 0;
    }
    sfx.coin();
    sfx.success();
    haptic('success');
    if (from) flyCoins(from, res.coins);
    onClaimed?.(setId, res.coins);
    return res.coins;
  };
}
