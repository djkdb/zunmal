import { useId } from 'react';
import { sfx } from '../../audio/sfx';
import { CHARACTERS } from '../../data/characters';
import { assignStaff, computeShopRates, type ShopContext } from '../../economy/shop';
import { useGameStore } from '../../store/useGameStore';
import { Malang } from '../Malang';
import { SheetDialog } from './SheetDialog';
import { RarityBadge } from '../RarityBadge';
import { BonusChips } from './BonusChips';

interface StaffPickerProps {
  slot: number;
  slots: number;
  onClose(): void;
}

/**
 * 직원 고르기 창: 캡슐을 연 말랑이를 "이 자리에 두면" 시간당 코인이 많은 순으로. 다른 자리에서 일하는 말랑이를 고르면 자리를 바꾼다.
 * 아래에 가게 전체 시간당 코인과 가득 차는 시간을 보여 준다.
 */
export function StaffPicker({ slot, slots, onClose }: StaffPickerProps) {
  const titleId = useId();
  const staff = useGameStore((s) => s.shop.staff);
  const unboxed = useGameStore((s) => s.unboxed);
  const owned = useGameStore((s) => s.ownedMalangs);
  const affection = useGameStore((s) => s.affection);
  const setShopStaff = useGameStore((s) => s.setShopStaff);
  const ctx: ShopContext = { owned, affection };
  const current = staff[slot] ?? null;
  const now = computeShopRates(staff, ctx);

  const options = CHARACTERS.filter((c) => owned[c.id] && unboxed.includes(c.id))
    .map((c) => {
      const next = assignStaff(staff, slot, c.id, slots);
      const rates = computeShopRates(next, ctx);
      const rate = rates.staff.find((s) => s.id === c.id);
      return { c, rate, total: rates.perHour, working: staff.includes(c.id) };
    })
    .sort((a, b) => (b.rate?.perHour ?? 0) - (a.rate?.perHour ?? 0));

  const pick = (id: string | null) => {
    if (id === current) {
      onClose();
      return;
    }
    if (setShopStaff(slot, id)) sfx.success();
    onClose();
  };

  return (
    <SheetDialog labelledBy={titleId} onClose={onClose} className="staff-sheet">
      <h2 id={titleId} className="staff-sheet__title">
        일할 말랑이 고르기
      </h2>
      <p className="staff-sheet__hint">시간당 코인이 많은 순서예요. 바꿔도 모인 코인은 그대로예요.</p>

      {options.length === 0 ? (
        <p className="staff-sheet__empty">놀이방에서 캡슐을 열면 가게에서 일할 수 있어요.</p>
      ) : (
        <ul className="staff-sheet__list">
          {options.map(({ c, rate, working }) => {
            const selected = c.id === current;
            const perHour = Math.round(rate?.perHour ?? 0);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`staff-option${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  aria-label={`${c.name}, 시간당 ${perHour}코인${selected ? ', 이 자리에서 일하는 중' : working ? ', 다른 자리에서 일하는 중' : ''}`}
                  onClick={() => pick(c.id)}
                >
                  <span className="staff-option__art" aria-hidden="true">
                    <Malang character={c} size={48} animation="none" decorative shiny={(owned[c.id]?.shinyCount ?? 0) > 0} />
                  </span>
                  <span className="staff-option__text" aria-hidden="true">
                    <span className="staff-option__name">
                      {c.name} <RarityBadge rarity={c.rarity} compact />
                    </span>
                    {rate && <BonusChips bonuses={rate.bonuses} />}
                    {working && !selected && <span className="staff-option__note">다른 자리에서 일하는 중</span>}
                  </span>
                  <span className="staff-option__rate" aria-hidden="true">
                    <strong>{perHour}</strong>
                    <span>시간당</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="staff-sheet__foot">
        <p className="staff-sheet__total">
          가게 전체 시간당 <strong>{Math.round(now.perHour)}코인</strong>
        </p>
        <p className="staff-sheet__cap">{now.capHours}시간이면 가득 차요</p>
      </div>
      <div className="staff-sheet__actions">
        {current && (
          <button type="button" className="btn btn--small btn--secondary" onClick={() => pick(null)}>
            자리 비우기
          </button>
        )}
        <button type="button" className="btn btn--small btn--primary staff-sheet__done" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </SheetDialog>
  );
}
