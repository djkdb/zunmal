import { useRef, type CSSProperties } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { MAT_PATTERNS, matBackgroundCss } from '../../data/matPatterns';
import {
  MAT_PATTERN_IDS,
  MAX_PROPS,
  PROPS,
  PROP_IDS,
  type MatPatternId,
  type PlacedProp,
  type PropId,
} from '../../data/playroomDecor';
import { CloseIcon } from '../icons';
import { PropArt } from './PropArt';

interface DecorSheetProps {
  mat: MatPatternId;
  props: readonly PlacedProp[];
  onPickMat: (id: MatPatternId) => void;
  onToggleProp: (id: PropId) => void;
  onClose: () => void;
}

/** 꾸미기 시트: 매트 무늬 고르기 + 소품 놓기/치우기 (무료) */
export function DecorSheet({ mat, props, onPickMat, onToggleProp, onClose }: DecorSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // 닫기 버튼으로 초점, Tab 은 시트 안에서만, Esc 닫기, 닫으면 붓 버튼으로
  useDialogFocus(sheetRef, onClose, closeRef);

  const placed = new Set(props.map((p) => p.id));
  const full = props.length >= MAX_PROPS;

  return (
    <div className="pr-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="pr-decor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-decor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pr-decor-title" className="pr-decor__title">
          꾸미기
        </h2>
        <p className="pr-decor__sub">매트 무늬를 고르고 소품을 올려 보세요. 놓은 소품은 끌어서 옮길 수 있어요.</p>

        <h3 className="pr-decor__head" id="pr-decor-mat">
          매트 무늬
        </h3>
        <ul className="pr-decor__mats" aria-labelledby="pr-decor-mat">
          {MAT_PATTERN_IDS.map((id) => {
            const on = id === mat;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`pr-decor__mat${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onPickMat(id)}
                >
                  <span
                    className="pr-decor__swatch"
                    style={{ '--swatch': matBackgroundCss(id) } as CSSProperties}
                    aria-hidden="true"
                  >
                    {on && <CheckMark />}
                  </span>
                  <span className="pr-decor__name">{MAT_PATTERNS[id].label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="pr-decor__head" id="pr-decor-props">
          소품
          <span className="pr-decor__count">
            {props.length}/{MAX_PROPS}
          </span>
        </h3>
        <ul className="pr-decor__props" aria-labelledby="pr-decor-props">
          {PROP_IDS.map((id) => {
            const on = placed.has(id);
            const blocked = !on && full;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`pr-decor__prop${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${PROPS[id].label} ${on ? '치우기' : '놓기'}`}
                  aria-disabled={blocked || undefined}
                  onClick={() => {
                    if (!blocked) onToggleProp(id);
                  }}
                >
                  <span className="pr-decor__prop-art" aria-hidden="true">
                    <PropArt id={id} size={Math.round(Math.min(46, 48 / PROPS[id].aspect))} />
                  </span>
                  <span className="pr-decor__prop-text">
                    <span className="pr-decor__name">{PROPS[id].label}</span>
                    <span className="pr-decor__state">{on ? '누르면 치워요' : blocked ? '자리가 없어요' : '누르면 놓아요'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {full && <p className="pr-decor__hint">소품은 {MAX_PROPS}개까지 놓을 수 있어요. 하나를 치우면 새 소품을 놓을 수 있어요.</p>}

        <button ref={closeRef} type="button" className="pr-decor__close" aria-label="닫기" onClick={onClose}>
          <CloseIcon size={22} />
        </button>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg className="pr-decor__check" viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false">
      <circle cx={12} cy={12} r={11} fill="#ffffff" />
      <path d="M7 12.5 L10.5 16 L17 8.5" fill="none" stroke="#b8456f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
