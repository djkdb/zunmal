/**
 * 쿠폰 코드 확인 — 순수 함수 (시간 주입). 쿠폰 목록은 `economy/config.ts`의 COUPONS.
 */
import { COUPONS, type CouponDef } from './config';

export type CouponResult =
  | { ok: true; coupon: CouponDef }
  | { ok: false; reason: 'empty' | 'unknown' | 'used' | 'not-yet' | 'expired' };

/** 대소문자, 앞뒤·가운데 공백, 하이픈을 무시한다 ("Zun ", "z-u-n" 모두 같은 코드) */
export function normalizeCouponCode(raw: string): string {
  return raw.normalize('NFKC').replace(/[\s-]+/g, '').toUpperCase();
}

export function checkCoupon(
  raw: string,
  redeemed: readonly string[],
  now: Date,
  coupons: readonly CouponDef[] = COUPONS,
): CouponResult {
  const code = normalizeCouponCode(raw);
  if (code === '') return { ok: false, reason: 'empty' };
  const coupon = coupons.find((c) => normalizeCouponCode(c.code) === code);
  if (!coupon) return { ok: false, reason: 'unknown' };
  if (redeemed.includes(coupon.id)) return { ok: false, reason: 'used' };
  const t = now.getTime();
  if (coupon.startsAt && t < Date.parse(coupon.startsAt)) return { ok: false, reason: 'not-yet' };
  if (coupon.endsAt && t > Date.parse(coupon.endsAt)) return { ok: false, reason: 'expired' };
  return { ok: true, coupon };
}

export function isCouponId(id: unknown): id is string {
  return typeof id === 'string' && COUPONS.some((c) => c.id === id);
}

export const COUPON_ERROR_TEXT: Record<Exclude<CouponResult, { ok: true }>['reason'], string> = {
  empty: '쿠폰 코드를 입력해 주세요.',
  unknown: '없는 쿠폰 코드예요. 다시 확인해 주세요.',
  used: '이미 받은 쿠폰이에요.',
  'not-yet': '아직 쓸 수 없는 쿠폰이에요.',
  expired: '기간이 끝난 쿠폰이에요.',
};
