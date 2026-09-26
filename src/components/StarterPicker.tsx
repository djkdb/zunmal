import { useState } from 'react';
import { sfx } from '../audio/sfx';
import { STARTER_CHARACTER_IDS, getCharacter, type Character } from '../data/characters';
import { STARTING_COINS } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import './StarterPicker.css';

const starters = STARTER_CHARACTER_IDS.map(getCharacter).filter((c): c is Character => !!c);

/** 첫 실행 시 함께할 시작 말랑이를 고르는 화면. */
export function StarterPicker() {
  const chooseStarter = useGameStore((s) => s.chooseStarter);
  // 미리 골라 두지 않는다 — 셋을 둘러보고 직접 고르게
  const [selected, setSelected] = useState<string>('');

  return (
    <section className="page starter" aria-labelledby="starter-title">
      <div className="starter__intro">
        <h1 id="starter-title" className="page-title">
          첫 말랑이를 골라요
        </h1>
        <p className="starter__lead">
          함께 놀 파트너예요. 첫 캡슐을 뽑을 코인 {STARTING_COINS}개도 선물로 드려요.
        </p>
      </div>
      <div className="starter__options" role="radiogroup" aria-label="시작 말랑이">
        {starters.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected === c.id}
            className={`starter__option${selected === c.id ? ' is-selected' : ''}`}
            onClick={() => {
              sfx.button();
              setSelected(c.id);
            }}
          >
            <Malang character={c} size={92} animation={selected === c.id ? 'bounce' : 'idle'} decorative />
            <span className="starter__name">{c.name}</span>
          </button>
        ))}
      </div>
      <p className="starter__desc" aria-live="polite">
        {selected ? getCharacter(selected)?.description : '눌러서 한 마리를 골라 주세요.'}
      </p>
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          sfx.success();
          chooseStarter(selected);
        }}
      >
        {selected ? '이 말랑이랑 시작하기' : '말랑이를 골라 주세요'}
      </button>
    </section>
  );
}
