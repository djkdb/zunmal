import type { KeyboardEvent } from 'react';
import type { BodyRec } from './bodyRec';
import { CapsuleArt } from './CapsuleArt';

interface MatCapsuleProps {
  rec: BodyRec;
  onKeyDown: (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (rec: BodyRec, e: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * 매트 위의 봉인된 캡슐. 모양 변화(비틀림·벌어짐·금·꾹 누름 고리)는 페이지가 CSS 변수로 바로 바꾼다 (다시 그리기 없음).
 */
export function MatCapsule({ rec, onKeyDown, onKeyUp }: MatCapsuleProps) {
  return (
    <div
      ref={(el) => {
        rec.els.wrap = el;
      }}
      className="pr-capsule"
      data-rarity={rec.character.rarity}
    >
      <span
        ref={(el) => {
          rec.els.shadow = el;
        }}
        className="pr-body__shadow pr-capsule__shadow"
        aria-hidden="true"
      />
      <span
        ref={(el) => {
          rec.els.sprite = el;
        }}
        className="pr-capsule__sprite"
        aria-hidden="true"
      >
        <CapsuleArt rarity={rec.character.rarity} className="pr-capsule__art" />
        <svg className="pr-capsule__ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <circle cx="20" cy="20" r="17" pathLength={1} />
        </svg>
      </span>
      <button
        ref={(el) => {
          rec.els.button = el;
        }}
        type="button"
        className="pr-capsule__hit"
        aria-label="새 캡슐. 두 손가락으로 비틀거나 벌려서 열어요. 톡 세 번 두드리거나 꾹 눌러도 열려요."
        onKeyDown={(e) => onKeyDown(rec, e)}
        onKeyUp={(e) => onKeyUp(rec, e)}
      />
    </div>
  );
}
