import { useId, useState } from 'react';
import { sfx } from '../audio/sfx';
import { CHARACTERS, getCharacter, type Character } from '../data/characters';
import { rarityRank } from '../data/rarity';
import { PARTNER_RARITY_BONUS } from '../economy/config';
import { josa } from '../lib/josa';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import { Modal } from './Modal';
import { RarityBadge } from './RarityBadge';
import './PartnerPicker.css';

/** 파트너를 반짝 모습으로 보여 줄지: 반짝을 가지고 있고, 사용자가 켜 둔 경우만 */
export function usePartnerShiny(): boolean {
  return useGameStore((s) => s.partnerShiny && !!s.partnerId && (s.ownedMalangs[s.partnerId]?.shinyCount ?? 0) > 0);
}

function bonusPercent(c: Pick<Character, 'rarity'>): number {
  return Math.round(PARTNER_RARITY_BONUS[c.rarity] * 100);
}

function BonusChip({ character }: { character: Character }) {
  const pct = bonusPercent(character);
  return (
    <span className={`partner-bonus${pct > 0 ? '' : ' is-none'}`}>{pct > 0 ? `코인 +${pct}%` : '코인 보너스 없음'}</span>
  );
}

interface PartnerPickerProps {
  className?: string;
}

/**
 * "함께할 말랑이" 카드: 지금 파트너를 크게 보여 주고, 바꾸기 창에서 가진 말랑이 중 고른다.
 * 홈·도감과 같은 store 파트너(setPartner, setPartnerShiny)를 바꾼다.
 */
export function PartnerPicker({ className }: PartnerPickerProps) {
  const partnerId = useGameStore((s) => s.partnerId);
  const shiny = usePartnerShiny();
  const [open, setOpen] = useState(false);
  const partner = partnerId ? getCharacter(partnerId) : undefined;
  if (!partner) return null;

  return (
    <section className={['partner-card', `partner-card--${partner.rarity}`, className].filter(Boolean).join(' ')} aria-label="함께할 말랑이">
      <div className="partner-card__stage">
        <Malang character={partner} size={76} animation="idle" shiny={shiny} aura="auto" decorative />
      </div>
      <div className="partner-card__text">
        <p className="partner-card__name">
          {shiny ? '반짝 ' : ''}
          {josa(partner.name, '과/와')} 함께
        </p>
        <p className="partner-card__meta">
          <RarityBadge rarity={partner.rarity} compact />
          <BonusChip character={partner} />
        </p>
      </div>
      <button
        type="button"
        className="btn btn--small btn--sky partner-card__change"
        aria-haspopup="dialog"
        onClick={() => {
          sfx.button();
          setOpen(true);
        }}
      >
        바꾸기
      </button>
      {open && <PartnerSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

/** 가진 말랑이 목록 (희귀도 높은 순, 같은 등급은 도감 순) */
function PartnerSheet({ onClose }: { onClose(): void }) {
  const titleId = useId();
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);
  const partnerShiny = useGameStore((s) => s.partnerShiny);
  const setPartner = useGameStore((s) => s.setPartner);
  const setPartnerShiny = useGameStore((s) => s.setPartnerShiny);
  const shiny = usePartnerShiny();

  const list = CHARACTERS.map((c, i) => ({ c, i }))
    .filter(({ c }) => owned[c.id])
    .sort((a, b) => rarityRank(b.c.rarity) - rarityRank(a.c.rarity) || a.i - b.i)
    .map(({ c }) => c);
  const current = partnerId ? getCharacter(partnerId) : undefined;
  const currentHasShiny = !!current && (owned[current.id]?.shinyCount ?? 0) > 0;

  return (
    <Modal labelledBy={titleId} onClose={onClose} className="partner-sheet">
      <h2 id={titleId} className="partner-sheet__title">
        함께할 말랑이 고르기
      </h2>
      <p className="partner-sheet__hint small muted">희귀할수록 미니게임 코인을 더 받아요.</p>

      {currentHasShiny && current && (
        <button
          type="button"
          className="btn btn--small btn--lemon partner-sheet__shiny"
          aria-pressed={partnerShiny}
          onClick={() => {
            sfx.shinyChime();
            setPartnerShiny(!partnerShiny);
          }}
        >
          {partnerShiny ? '원래 모습으로' : '반짝 모습으로'}
        </button>
      )}

      <div className="partner-sheet__grid" role="radiogroup" aria-labelledby={titleId}>
        {list.map((c) => {
          const selected = c.id === partnerId;
          const hasShiny = (owned[c.id]?.shinyCount ?? 0) > 0;
          const pct = bonusPercent(c);
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`partner-option partner-option--${c.rarity}${selected ? ' is-selected' : ''}`}
              aria-label={`${c.name}, 코인 ${pct > 0 ? `+${pct}%` : '보너스 없음'}${hasShiny ? ', 반짝 있음' : ''}`}
              onClick={() => {
                if (selected) return;
                sfx.button();
                setPartner(c.id);
              }}
            >
              <span className="partner-option__art" aria-hidden="true">
                <Malang character={c} size={54} animation="none" shiny={selected && shiny} decorative />
                {hasShiny && <ShinyMark />}
              </span>
              <span className="partner-option__name" aria-hidden="true">
                {c.name}
              </span>
              <span className="partner-option__meta" aria-hidden="true">
                <RarityBadge rarity={c.rarity} compact />
                <span className="partner-option__pct">{pct > 0 ? `+${pct}%` : '0%'}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn--primary btn--block partner-sheet__done" onClick={onClose} autoFocus>
        다 골랐어요
      </button>
    </Modal>
  );
}

/** 반짝을 가진 말랑이 표시 (네 갈래 별) */
function ShinyMark() {
  return (
    <svg className="partner-option__shiny" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 1.5 Q13.4 10.6 22.5 12 Q13.4 13.4 12 22.5 Q10.6 13.4 1.5 12 Q10.6 10.6 12 1.5 Z"
        fill="#ffd23f"
        stroke="#2b2233"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
