import { useId } from 'react';
import { sfx } from '../../audio/sfx';
import { CHARACTERS, getCharacter } from '../../data/characters';
import { computeShopRates, shownPerHour, type ShopContext } from '../../economy/shop';
import { previewStaffChange } from '../../economy/shopPreview';
import { useGameStore } from '../../store/useGameStore';
import { Malang } from '../Malang';
import { Modal } from '../Modal';
import { RarityBadge } from '../RarityBadge';
import { BonusChips } from './BonusChips';
import { setChangeText, trendText } from './perks';
import { ToIcon, TrendIcon } from './shopIcons';

interface StaffPickerProps {
  slot: number;
  slots: number;
  onClose(): void;
}

/**
 * 직원 고르기 창. 말랑이마다 "이 자리에 두면" 가게 전체 시간당이 어떻게 바뀌는지 보여 준다:
 * "지금 50 [화살표] 54코인/시간" + 딱지(오름 = 민트 + 위 화살표 + "+8%", 내림 = 빨강 + 아래 화살표, 그대로 = 회색 두 줄).
 * 숫자는 가게 화면과 같은 계산(economy/shopPreview.ts → computeShopRates)이라 고른 뒤 화면 합계와 똑같다.
 * 세트 짝이 생기거나 깨지면 다른 직원에게 가는 변화도 한 줄로 알려 준다. 가게 전체가 가장 많이 오르는 순서.
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
  const nowPerHour = shownPerHour(now.perHour);
  const currentChar = current ? getCharacter(current) : undefined;
  const currentRate = now.staff.find((s) => s.id === current);

  const options = CHARACTERS.filter((c) => owned[c.id] && unboxed.includes(c.id))
    .map((c) => ({ c, p: previewStaffChange(staff, slot, c.id, slots, ctx), working: staff.includes(c.id) }))
    .sort((a, b) => b.p.after.perHour - a.p.after.perHour || (b.p.own?.perHour ?? 0) - (a.p.own?.perHour ?? 0));
  const leave = current ? previewStaffChange(staff, slot, null, slots, ctx) : null;

  const pick = (id: string | null) => {
    if (id === current) {
      onClose();
      return;
    }
    if (setShopStaff(slot, id)) sfx.success();
    onClose();
  };

  return (
    <Modal labelledBy={titleId} onClose={onClose} className="staff-sheet">
      <h2 id={titleId} className="staff-sheet__title">
        일할 말랑이 고르기
      </h2>
      <p className="staff-sheet__now">
        {currentChar && currentRate ? (
          <>
            지금 이 자리: <b>{currentChar.name}</b> 시간당 {shownPerHour(currentRate.perHour)}코인
          </>
        ) : (
          '빈 자리에 둘 말랑이를 골라요'
        )}
      </p>
      <p className="staff-sheet__hint">가게 전체 시간당 코인이 어떻게 바뀌는지 보여 줘요. 바꿔도 모인 코인은 그대로예요.</p>

      {options.length === 0 ? (
        <p className="staff-sheet__empty">놀이방에서 캡슐을 열면 가게에서 일할 수 있어요.</p>
      ) : (
        <ul className="staff-sheet__list">
          {options.map(({ c, p, working }) => {
            const selected = c.id === current;
            const own = shownPerHour(p.own?.perHour ?? 0);
            const badge = selected ? '일하는 중' : trendText(p);
            const trend = selected ? 'same' : p.trend;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`staff-option${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  aria-label={`${c.name}, 이 자리에서 시간당 ${own}코인. 가게 전체 시간당 ${p.beforePerHour}에서 ${p.afterPerHour}코인, ${badge}${
                    selected ? '' : working ? ', 다른 자리와 바꿔요' : ''
                  }${p.sets.length > 0 ? `. ${p.sets.map(setChangeText).join('. ')}` : ''}`}
                  onClick={() => pick(c.id)}
                >
                  <span className="staff-option__art" aria-hidden="true">
                    <Malang character={c} size={48} animation="none" decorative shiny={(owned[c.id]?.shinyCount ?? 0) > 0} />
                  </span>
                  <span className="staff-option__text" aria-hidden="true">
                    <span className="staff-option__top">
                      <span className="staff-option__name">
                        {c.name} <RarityBadge rarity={c.rarity} compact />
                      </span>
                      <span className={`staff-trend staff-trend--${trend}${selected ? ' is-current' : ''}`}>
                        {!selected && <TrendIcon dir={trend} size={16} />}
                        {badge}
                      </span>
                    </span>
                    {p.own && <BonusChips bonuses={p.own.bonuses} base={p.own.base} />}
                    {!selected && (
                      <span className="staff-option__compare">
                        지금 {p.beforePerHour}
                        <ToIcon size={14} className="staff-option__to" />
                        <b>{p.afterPerHour}코인/시간</b>
                      </span>
                    )}
                    {!selected &&
                      p.sets.map((sc) => (
                        <span key={sc.id} className={`staff-option__set${sc.after > sc.before ? ' is-up' : ' is-down'}`}>
                          {setChangeText(sc)}
                        </span>
                      ))}
                    {working && !selected && <span className="staff-option__note">다른 자리와 바꿔요</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="staff-sheet__foot">
        <p className="staff-sheet__total">
          가게 전체 시간당 <strong>{nowPerHour}코인</strong>
        </p>
        <p className="staff-sheet__cap">{now.capHours}시간이면 가득 차요</p>
      </div>
      <div className="staff-sheet__actions">
        {current && leave && (
          <button
            type="button"
            className="btn btn--small btn--secondary"
            onClick={() => pick(null)}
            aria-label={`자리 비우기, 가게 전체 시간당 ${leave.afterPerHour}코인이 돼요`}
          >
            자리 비우기
          </button>
        )}
        <button type="button" className="btn btn--small btn--secondary staff-sheet__done" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </Modal>
  );
}
