import { forwardRef, type CSSProperties } from 'react';
import type { Character } from '../../data/characters';
import { Malang } from '../Malang';
import './GiftBringer.css';

export type GiftPhase = 'waiting' | 'opening' | 'opened';

/**
 * 선물 상자 그림 (코드로 그린 SVG). 뚜껑(`.giftbox__lid`)이 따로 있어 열 때 날아간다.
 * 색은 CSS 토큰 — 레몬 상자 + 딸기우유 리본.
 */
function GiftBoxArt() {
  return (
    <svg className="giftbox__art" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      <ellipse className="giftbox__shadow" cx="24" cy="44.5" rx="17" ry="3" />
      {/* 열면 보이는 속: 코인 한 닢이 쏙 올라온다 */}
      <g className="giftbox__inside">
        <circle className="giftbox__coin" cx="24" cy="18" r="7" />
        <path className="giftbox__coin-mark" d="M21.5 17 q2.5 3 5 0" />
      </g>
      <g className="giftbox__body">
        <rect className="giftbox__base" x="8" y="21" width="32" height="22" rx="4" />
        <rect className="giftbox__mouth" x="8" y="21" width="32" height="4" />
        <rect className="giftbox__ribbon" x="21" y="21" width="6" height="22" />
        <rect className="giftbox__shine" x="11" y="24" width="4" height="12" rx="2" />
      </g>
      <g className="giftbox__lid">
        <rect className="giftbox__lid-top" x="5" y="14" width="38" height="9" rx="3" />
        <rect className="giftbox__ribbon" x="21" y="14" width="6" height="9" />
        <path
          className="giftbox__bow"
          d="M24 14 c-3 -7 -11 -8 -10.5 -2.5 c0.4 3 6.5 2.5 10.5 2.5 c4 0 10.1 0.5 10.5 -2.5 c0.5 -5.5 -7.5 -4.5 -10.5 2.5 Z"
        />
        <circle className="giftbox__knot" cx="24" cy="14" r="2.6" />
      </g>
    </svg>
  );
}

/** 상자가 열릴 때 튀어나오는 반짝이 (장식) */
function Burst() {
  return (
    <span className="giftbox__burst" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

interface GiftBringerProps {
  giver: Character;
  shiny: boolean;
  /** 파트너가 직접 가져왔으면 말랑이는 다시 그리지 않고 상자만 파트너 발치에 둔다 */
  isPartner: boolean;
  phase: GiftPhase;
  onOpen(): void;
}

/**
 * 홈 무대의 말랑 선물: 선물을 가져온 말랑이가 파트너 옆에 상자를 들고 서 있다(절대 위치 — 무대 높이는 그대로, 360×640 규칙).
 * 상자를 톡 누르면(또는 말풍선의 "열기") 뚜껑이 날아가고 반짝이가 터지며 코인이 위 코인 알약으로 날아간다.
 * 상자 버튼은 포인터용 지름길이다 — 키보드·화면 읽기는 말풍선의 "열기" 하나로 충분해 탭 순서에서 뺀다.
 * 움직임 줄이기면 흔들림·날아감 없이 열린 모습으로 바로 바뀐다(global prefers-reduced-motion CSS).
 */
export const GiftBringer = forwardRef<HTMLButtonElement, GiftBringerProps>(function GiftBringer(
  { giver, shiny, isPartner, phase, onOpen },
  boxRef,
) {
  return (
    <div className={`giftbringer is-${phase}${isPartner ? ' is-partner' : ''}`}>
      {!isPartner && (
        <span className="giftbringer__malang" aria-hidden="true">
          <Malang character={giver} size={110} animation={phase === 'opened' ? 'bounce' : 'idle'} decorative shiny={shiny} />
        </span>
      )}
      <button
        ref={boxRef}
        type="button"
        className="giftbox"
        tabIndex={-1}
        aria-label="선물 상자 열기"
        disabled={phase !== 'waiting'}
        onClick={onOpen}
      >
        <GiftBoxArt />
        {phase !== 'waiting' && <Burst />}
      </button>
    </div>
  );
});
