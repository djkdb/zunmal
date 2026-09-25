import { useState } from 'react';
import { sfx } from '../audio/sfx';
import { STARTER_CHARACTER_IDS, getCharacter, type Character } from '../data/characters';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import './StarterPicker.css';

const starters = STARTER_CHARACTER_IDS.map(getCharacter).filter((c): c is Character => !!c);

/** 첫 실행 시 함께할 시작 말랑이를 고르는 화면. */
export function StarterPicker() {
  const chooseStarter = useGameStore((s) => s.chooseStarter);
  const [selected, setSelected] = useState<string>(starters[0]?.id ?? '');

  return (
    <section className="page starter" aria-labelledby="starter-title">
      <div className="starter__intro">
        <h1 id="starter-title" className="page-title">
          어서 오세요, 말랑 뽑기방이에요
        </h1>
        <p className="muted">
          처음 함께할 말랑이를 골라 주세요. 미니게임으로 코인을 모아 캡슐을 뽑으면 새 말랑이를 만날 수 있어요.
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
        {getCharacter(selected)?.description}
      </p>
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() => {
          sfx.success();
          chooseStarter(selected);
        }}
      >
        이 말랑이랑 시작하기
      </button>
    </section>
  );
}
