import { useRef, useState, type FormEvent } from 'react';
import { sfx } from '../audio/sfx';
import { COUPON_ERROR_TEXT } from '../economy/coupons';
import { haptic } from '../lib/haptics';
import { flyCoins } from '../lib/coinFx';
import { useGameStore } from '../store/useGameStore';
import './CouponBox.css';

/**
 * 쿠폰 입력 — 톱니 자국이 있는 교환권 모양. 받으면 코인이 상단 코인 알약으로 날아간다.
 */
export function CouponBox() {
  const redeemCoupon = useGameStore((s) => s.redeemCoupon);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = redeemCoupon(code);
    if (res.ok) {
      sfx.success();
      haptic('success');
      if (buttonRef.current) flyCoins(buttonRef.current, res.coupon.coins);
      setMessage({ ok: true, text: `${res.coupon.title} ${res.coupon.coins.toLocaleString()}코인을 받았어요!` });
      setCode('');
    } else {
      sfx.fail();
      setMessage({ ok: false, text: COUPON_ERROR_TEXT[res.reason] });
    }
  };

  return (
    <form className="coupon" onSubmit={submit} aria-labelledby="coupon-title">
      <p id="coupon-title" className="coupon__title">
        쿠폰
      </p>
      <div className="coupon__row">
        <label className="visually-hidden" htmlFor="coupon-code">
          쿠폰 코드
        </label>
        <input
          id="coupon-code"
          className="coupon__input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setMessage(null);
          }}
          placeholder="쿠폰 코드를 입력해요"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          enterKeyHint="done"
        />
        <button ref={buttonRef} type="submit" className="btn btn--lemon btn--small coupon__submit" aria-label="쿠폰 받기">
          받기
        </button>
      </div>
      {message && (
        <p className={`coupon__msg${message.ok ? ' is-ok' : ''}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
