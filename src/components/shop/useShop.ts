import { useRef } from 'react';
import { sfx } from '../../audio/sfx';
import { msUntilFull, readShop, type ShopRates, type ShopReading } from '../../economy/shop';
import { useNow } from '../../hooks/useNow';
import { flyCoins } from '../../lib/coinFx';
import { haptic } from '../../lib/haptics';
import { shopRatesOf, useGameStore } from '../../store/useGameStore';

/** 가게 수입표 + 지금 쌓인 양 + 가득 차기까지 남은 시간(ms, 직원이 없으면 null) — 몇 초마다 갱신 */
export function useShopLive(intervalMs = 4000): {
  rates: ShopRates;
  reading: ShopReading;
  staff: string[];
  untilFull: number | null;
} {
  const shop = useGameStore((s) => s.shop);
  const owned = useGameStore((s) => s.ownedMalangs);
  const affection = useGameStore((s) => s.affection);
  const now = useNow(intervalMs);
  const rates = shopRatesOf({ shop, ownedMalangs: owned, affection });
  return { rates, reading: readShop(shop, rates, now), staff: shop.staff, untilFull: msUntilFull(shop, rates, now) };
}

/**
 * 가게 "받기": ref 로 바로 잠가 연타해도 한 번만. 받은 코인은 버튼 자리에서 위 코인 알약으로 날아간다.
 * 받은 코인(없으면 0)을 돌려준다.
 */
export function useShopClaim(): (from: HTMLElement | null) => number {
  const claimShop = useGameStore((s) => s.claimShop);
  const lockRef = useRef(false);
  return (from) => {
    if (lockRef.current) return 0;
    lockRef.current = true;
    window.setTimeout(() => {
      lockRef.current = false;
    }, 700);
    const coins = claimShop();
    if (coins <= 0) {
      sfx.fail();
      return 0;
    }
    sfx.coin();
    sfx.success();
    haptic('success');
    if (from) flyCoins(from, coins);
    return coins;
  };
}
