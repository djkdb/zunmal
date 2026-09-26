import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Sfx } from '../../audio/sfx';
import { Malang } from '../../components/Malang';
import { getCharacter } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  MATCHING_CONFIG as CONFIG,
  applyClearBonus,
  comboBonus,
  createBoard,
  createMatchingState,
  flip,
  isFaceUp,
  resolveMismatch,
  type MatchingState,
} from './logic';
import './Matching.css';

/** 카드 뒤집는 소리 */
function playFlip(sfx: Sfx) {
  sfx.flip();
}

type EndKind = 'clear' | 'timeout';

function MatchingGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const initial = useMemo(() => createMatchingState(createBoard(defaultRng)), []);
  const [state, setState] = useState<MatchingState>(initial);
  const stateRef = useRef(initial);
  const [timeLeft, setTimeLeft] = useState(CONFIG.durationMs / 1000);
  const [ended, setEnded] = useState<EndKind | null>(null);
  const [announce, setAnnounce] = useState('');
  const startAtRef = useRef(0);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const reported = useRef(false);
  const secsLeftAtClear = useRef(0);

  const playing = started && ended === null;

  const commit = useCallback((next: MatchingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // 타이머 + 틀린 카드 덮기
  useEffect(() => {
    if (!playing) return;
    if (startAtRef.current === 0) {
      startAtRef.current = performance.now();
      cardRefs.current[0]?.focus();
    }
    const id = window.setInterval(() => {
      const elapsed = performance.now() - startAtRef.current;
      const left = Math.max(0, CONFIG.durationMs - elapsed);
      setTimeLeft(left / 1000);
      const cur = stateRef.current;
      const resolved = resolveMismatch(cur, elapsed);
      if (resolved !== cur) {
        commit(resolved);
        playFlip(sfx);
      }
      if (left <= 0) {
        window.clearInterval(id);
        setEnded((e) => e ?? 'timeout');
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, commit, sfx]);

  // 종료 처리 — onFinish는 한 번만
  useEffect(() => {
    if (ended === null) return;
    if (ended === 'timeout') sfx.fail();
    buddyRef.current?.setBase(ended === 'clear' ? 'wow' : 'sad');
    const id = window.setTimeout(
      () => {
        if (reported.current) return;
        reported.current = true;
        const s = stateRef.current;
        const stats: Record<string, number> = { '찾은 짝': s.pairsFound, 시도: s.attempts, '최대 연속': s.maxCombo };
        if (s.cleared) stats['남은 초'] = secsLeftAtClear.current;
        onFinish({ score: s.score, stats });
      },
      reduced ? 300 : 1100,
    );
    return () => window.clearTimeout(id);
  }, [ended, onFinish, reduced, sfx]);

  const onCard = (index: number) => {
    if (!playing) return;
    const elapsed = performance.now() - startAtRef.current;
    const out = flip(stateRef.current, index, elapsed);
    if (out.event === 'rejected') return;
    let next = out.state;
    if (out.event === 'match') {
      sfx.pickup();
      buddyRef.current?.react(next.combo >= 3 ? 'wow' : 'happy', 900);
      setAnnounce(`${getCharacter(next.cards[index]?.characterId ?? '')?.name ?? ''} 짝을 찾았어요.`);
      if (next.cleared) {
        const remaining = Math.max(0, CONFIG.durationMs - elapsed);
        secsLeftAtClear.current = Math.ceil(remaining / 1000);
        next = applyClearBonus(next, remaining);
        sfx.success();
        setAnnounce(`모두 찾았어요. 보너스 ${next.clearBonus}점!`);
        setEnded('clear');
      }
    } else if (out.event === 'mismatch') {
      playFlip(sfx);
      buddyRef.current?.react('oops', 800);
      setAnnounce('짝이 아니에요.');
    } else {
      playFlip(sfx);
    }
    commit(next);
  };

  // 방향키로 격자 안에서 포커스 이동
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cols = CONFIG.columns;
    const total = state.cards.length;
    const current = cardRefs.current.findIndex((el) => el === document.activeElement);
    if (current < 0) return;
    let target = current;
    if (e.key === 'ArrowRight') target = Math.min(total - 1, current + 1);
    else if (e.key === 'ArrowLeft') target = Math.max(0, current - 1);
    else if (e.key === 'ArrowDown') target = current + cols < total ? current + cols : current;
    else if (e.key === 'ArrowUp') target = current - cols >= 0 ? current - cols : current;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = total - 1;
    else return;
    e.preventDefault();
    cardRefs.current[target]?.focus();
  };

  const bonus = comboBonus(state.combo);

  return (
    <div className={`mt${reduced ? ' mt--reduced' : ''}`}>
      <GameHud timeLeft={timeLeft} totalTime={CONFIG.durationMs / 1000} score={state.score} onExit={onExit} />
      <div className="mt__status">
        <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={44} className="mt__buddy" />
        <span className="chip mt__chip">
          찾은 짝 <strong>{`${state.pairsFound}/${CONFIG.pairs}`}</strong>
        </span>
        <span className="chip mt__chip">
          시도 <strong>{state.attempts}</strong>
        </span>
        {state.combo >= 2 && (
          <span className="chip mt__chip mt__chip--hot">
            {state.combo}연속 +{bonus}
          </span>
        )}
      </div>
      <div className="mt__stage">
        <div className="mt__grid" role="group" aria-label="카드 16장" onKeyDown={onGridKey}>
          {state.cards.map((card, i) => {
            const character = getCharacter(card.characterId);
            const up = isFaceUp(state, i);
            const matched = state.matched[i] === true;
            const label = up ? `${character?.name ?? '말랑이'}${matched ? ', 찾음' : ''}` : `뒤집힌 카드 ${i + 1}번`;
            return (
              <button
                key={i}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                type="button"
                className={`mt__card${up ? ' is-up' : ''}${matched ? ' is-matched' : ''}`}
                aria-label={label}
                aria-disabled={!playing || up}
                onClick={() => onCard(i)}
              >
                <span className="mt__inner" aria-hidden="true">
                  <span className="mt__face mt__back">
                    <CardBack />
                  </span>
                  <span className="mt__face mt__front">
                    {character && (
                      <Malang
                        character={character}
                        size={70}
                        animation={matched && !reduced ? 'squish' : 'none'}
                        decorative
                      />
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <Countdown count={count} />
        {ended && (
          <div className="countdown mt__end" role="status">
            <span>{ended === 'clear' ? '다 찾았어요!' : '끝!'}</span>
            {ended === 'clear' && state.clearBonus > 0 && (
              <small className="mt__end-bonus">보너스 +{state.clearBonus}</small>
            )}
          </div>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      <p className="small muted mt__help">같은 말랑이 두 장을 찾아요. 빨리, 적게 뒤집을수록 점수가 높아요.</p>
    </div>
  );
}

/** 카드 뒷면: 캡슐 무늬 */
function CardBack() {
  return (
    <svg className="mt__back-art" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="11" fill="#fffcf5" stroke="#2b2233" strokeWidth="2.5" />
      <path d="M9 20 a11 11 0 0 1 22 0 z" fill="#ff6f91" stroke="#2b2233" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="15.5" cy="14.5" rx="2.6" ry="1.5" fill="#fff" opacity="0.8" transform="rotate(-30 15.5 14.5)" />
    </svg>
  );
}

function MatchingIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="5" y="9" width="18" height="26" rx="4" fill="#6ec6ff" stroke="#2b2233" strokeWidth="3" transform="rotate(-8 14 22)" />
      <circle cx="13.5" cy="22" r="4" fill="#fffcf5" stroke="#2b2233" strokeWidth="2.5" transform="rotate(-8 14 22)" />
      <rect x="24" y="12" width="18" height="26" rx="4" fill="#fffcf5" stroke="#2b2233" strokeWidth="3" transform="rotate(8 33 25)" />
      <ellipse cx="33" cy="28" rx="6" ry="5" fill="#ffb8c9" stroke="#2b2233" strokeWidth="2.5" />
      <circle cx="31" cy="27.5" r="1.2" fill="#2b2233" />
      <circle cx="35" cy="27.5" r="1.2" fill="#2b2233" />
    </svg>
  );
}

const matching: MiniGame = {
  id: 'matching',
  name: '짝 맞추기',
  description: '카드를 두 장씩 뒤집어 같은 말랑이 짝을 모두 찾아요.',
  controls: '터치, 클릭, Tab과 방향키로 고르고 Enter 또는 Space',
  durationMs: CONFIG.durationMs,
  blurb: '카드 짝 찾기',
  tags: ['focus'],
  icon: MatchingIcon,
  Component: MatchingGame,
};

export default matching;
