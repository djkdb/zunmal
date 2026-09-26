import { describe, expect, it } from 'vitest';
import type { CouponDef } from './config';
import { COUPONS } from './config';
import { checkCoupon, normalizeCouponCode } from './coupons';

const now = new Date('2026-09-26T12:00:00+09:00');

describe('coupons', () => {
  it('오픈 기념 zun 쿠폰은 1000코인', () => {
    const r = checkCoupon('zun', [], now);
    expect(r.ok && r.coupon.coins).toBe(1000);
  });

  it('대소문자·공백·하이픈을 무시한다', () => {
    expect(normalizeCouponCode('  Z u-N ')).toBe('ZUN');
    expect(checkCoupon('ZUN', [], now).ok).toBe(true);
    expect(checkCoupon(' zUn\n', [], now).ok).toBe(true);
  });

  it('없는 코드, 빈 코드, 이미 받은 쿠폰', () => {
    expect(checkCoupon('nope', [], now)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkCoupon('   ', [], now)).toEqual({ ok: false, reason: 'empty' });
    expect(checkCoupon('zun', ['open-2026'], now)).toEqual({ ok: false, reason: 'used' });
  });

  it('기간 전·후', () => {
    const list: CouponDef[] = [{ id: 'x', code: 'EVT', coins: 10, title: 't', startsAt: '2026-10-01T00:00:00+09:00', endsAt: '2026-10-31T23:59:59+09:00' }];
    expect(checkCoupon('evt', [], now, list)).toEqual({ ok: false, reason: 'not-yet' });
    expect(checkCoupon('evt', [], new Date('2026-10-15T00:00:00+09:00'), list).ok).toBe(true);
    expect(checkCoupon('evt', [], new Date('2026-11-01T00:00:00+09:00'), list)).toEqual({ ok: false, reason: 'expired' });
  });

  it('쿠폰 id와 코드는 서로 겹치지 않는다', () => {
    expect(new Set(COUPONS.map((c) => c.id)).size).toBe(COUPONS.length);
    expect(new Set(COUPONS.map((c) => normalizeCouponCode(c.code))).size).toBe(COUPONS.length);
    for (const c of COUPONS) expect(c.coins).toBeGreaterThan(0);
  });
});
