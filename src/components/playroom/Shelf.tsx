import { useEffect, useRef } from 'react';
import { getCharacter } from '../../data/characters';
import { RARITY_META } from '../../data/rarity';
import type { ShelfEntry } from '../../touch/shelf';
import { CloseIcon } from '../icons';
import { Malang } from '../Malang';
import { CapsuleArt } from './CapsuleArt';

interface ShelfProps {
  open: boolean;
  entries: ShelfEntry[];
  onMat: number;
  cap: number;
  shinyIds: ReadonlySet<string>;
  onToggle: () => void;
  onPick: (entry: ShelfEntry) => void;
  sealedCount: number;
}

/**
 * 아래에서 끌어 올리는 선반. 닫혀 있을 때는 손잡이 버튼만, 열리면 나무 선반 위에 말랑이·캡슐 칸.
 * 나와 있는 칸은 빈 받침으로 보이고 누르면 선반에 다시 넣는다.
 */
export function Shelf({ open, entries, onMat, cap, shinyIds, onToggle, onPick, sealedCount }: ShelfProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector<HTMLButtonElement>('.pr-shelf__slot')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onToggle]);

  return (
    <div className={`pr-shelf${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="pr-shelf__handle"
        aria-expanded={open}
        aria-controls="pr-shelf-panel"
        onClick={onToggle}
      >
        <span className="pr-shelf__grip" aria-hidden="true" />
        <span className="pr-shelf__handle-text">
          {open ? '선반 닫기' : '선반 열기'}
          <span className="pr-shelf__count">
            매트 {onMat}/{cap}
          </span>
        </span>
        {!open && sealedCount > 0 && (
          <span className="pr-shelf__new" aria-label={`새 캡슐 ${sealedCount}개`}>
            {sealedCount}
          </span>
        )}
      </button>
      <div
        ref={panelRef}
        id="pr-shelf-panel"
        className="pr-shelf__panel"
        role="region"
        aria-label="말랑이 선반"
        hidden={!open}
      >
        <p className="pr-shelf__help">
          누르면 매트로 꺼내요. 나와 있는 말랑이를 누르면 선반에 넣어요.
        </p>
        <ul className="pr-shelf__grid">
          {entries.map((e) => {
            const c = getCharacter(e.id);
            if (!c) return null;
            const label = e.sealed
              ? `${RARITY_META[c.rarity].label} 새 캡슐 ${e.out ? '넣기' : '꺼내기'}`
              : `${c.name} ${e.out ? '선반에 넣기' : '꺼내기'}`;
            return (
              <li key={e.id} className="pr-shelf__cell">
                <button
                  type="button"
                  className={`pr-shelf__slot${e.out ? ' is-out' : ''}${e.sealed ? ' is-sealed' : ''}`}
                  data-rarity={c.rarity}
                  aria-pressed={e.out}
                  aria-label={label}
                  onClick={() => onPick(e)}
                >
                  {e.sealed ? (
                    <>
                      <CapsuleArt rarity={c.rarity} className="pr-shelf__capsule" />
                      <span className="pr-shelf__sticker" aria-hidden="true">
                        NEW
                      </span>
                    </>
                  ) : (
                    <Malang character={c} size={52} animation="none" decorative shiny={shinyIds.has(e.id)} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="pr-shelf__close" aria-label="선반 닫기" onClick={onToggle}>
          <CloseIcon size={22} />
        </button>
      </div>
    </div>
  );
}
