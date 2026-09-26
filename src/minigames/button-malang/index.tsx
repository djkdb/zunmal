import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  BUTTON_MALANG_CONFIG as CONFIG,
  applyHit,
  applyMiss,
  comboBonus,
  createButtonMalangState,
  isComboAlive,
} from './logic';
import './ButtonMalang.css';

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
}

function ButtonMalangGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const [state, setState] = useState(createButtonMalangState);
  const stateRef = useRef(state);
  const [timeLeft, setTimeLeft] = useState(CONFIG.durationMs / 1000);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(0);
  const malangRef = useRef<HTMLButtonElement>(null);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const floaterId = useRef(0);

  const playing = started && !finished;

  // 타이머
  useEffect(() => {
    if (!started) return;
    malangRef.current?.focus();
    const startAt = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      const left = Math.max(0, CONFIG.durationMs - (t - startAt));
      setTimeLeft(left / 1000);
      setNow(t);
      if (left <= 0) {
        window.clearInterval(id);
        setFinished(true);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [started]);

  // 종료 처리
  useEffect(() => {
    if (!finished) return;
    const s = stateRef.current;
    sfx.success();
    buddyRef.current?.setBase('happy');
    const id = window.setTimeout(
      () => onFinish({ score: s.score, stats: { '누른 횟수': s.hits, '최대 콤보': s.maxCombo, 실수: s.misses } }),
      reduced ? 200 : 800,
    );
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  const addFloater = (x: number, y: number, text: string) => {
    const id = ++floaterId.current;
    setFloaters((f) => [...f.slice(-7), { id, x, y, text }]);
    window.setTimeout(() => setFloaters((f) => f.filter((it) => it.id !== id)), 650);
  };

  const hit = useCallback(
    (x: number, y: number) => {
      if (!playing) return;
      const out = applyHit(stateRef.current, performance.now());
      if (!out.accepted) return;
      stateRef.current = out.state;
      setState(out.state);
      sfx.tap(Math.min(12, Math.floor(out.state.combo / 5)));
      addFloater(x, y, `+${out.points}`);
      // 몸은 아래에서 따로 눌리므로 표정만 바꾼다. 10콤보마다 반짝 눈.
      buddyRef.current?.react(out.state.combo > 0 && out.state.combo % 10 === 0 ? 'wow' : 'happy', 450, false);
      if (!reduced) {
        malangRef.current?.animate(
          [
            { transform: 'scale(1,1)' },
            { transform: 'scale(1.12,0.84)' },
            { transform: 'scale(0.96,1.05)' },
            { transform: 'scale(1,1)' },
          ],
          { duration: 220, easing: 'ease-out' },
        );
      }
    },
    [playing, reduced, sfx],
  );

  const onMalangPointer = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    hit(rect ? e.clientX - rect.left : 0, rect ? e.clientY - rect.top : 0);
  };

  const onPadPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (!playing || e.target !== e.currentTarget) return;
    const next = applyMiss(stateRef.current);
    stateRef.current = next;
    setState(next);
    sfx.hit();
    buddyRef.current?.react('oops', 600);
    const rect = e.currentTarget.getBoundingClientRect();
    addFloater(e.clientX - rect.left, e.clientY - rect.top, '앗!');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return; // 키 누르고 있기(자동 반복)는 무효
    const el = malangRef.current;
    hit(el ? el.offsetLeft + el.offsetWidth / 2 : 0, el ? el.offsetTop : 0);
  };

  const comboAlive = isComboAlive(state, now || performance.now());
  const bonus = comboBonus(state.combo);

  return (
    <div className="bm">
      <GameHud timeLeft={timeLeft} totalTime={CONFIG.durationMs / 1000} score={state.score} onExit={onExit} />
      <p className={`bm__combo${comboAlive && state.combo >= 5 ? ' is-hot' : ''}`} aria-live="off">
        {comboAlive && state.combo > 1 ? (
          <>
            <strong>{state.combo}</strong> 콤보{bonus > 0 && <span className="chip bm__bonus">+{bonus}점</span>}
          </>
        ) : (
          '연속으로 누르면 콤보!'
        )}
      </p>
      <div className="bm__pad" onPointerDown={onPadPointer}>
        <button
          ref={malangRef}
          type="button"
          className="bm__malang"
          aria-label={`${partner.name} 누르기`}
          aria-disabled={!playing}
          onPointerDown={onMalangPointer}
          onKeyDown={onKeyDown}
          // 포인터/키보드는 위 핸들러가 처리하므로 click은 무시(중복 방지)
          onClick={(e) => e.preventDefault()}
        >
          <PartnerBuddy
            ref={buddyRef}
            partner={partner}
            shiny={partnerShiny}
            size={220}
            animation={playing ? 'idle' : 'none'}
            className="bm__buddy"
          />
        </button>
        {floaters.map((f) => (
          <span key={f.id} className="bm__floater" style={{ left: f.x, top: f.y }} aria-hidden="true">
            {f.text}
          </span>
        ))}
        <Countdown count={count} />
        {finished && (
          <div className="countdown" role="status">
            <span>끝!</span>
          </div>
        )}
      </div>
      <p className="small muted bm__help">말랑이를 톡톡! 빈 곳을 누르면 콤보가 끊겨요. (키보드: Space/Enter)</p>
    </div>
  );
}

function ButtonMalangIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="24" cy="30" rx="17" ry="13" fill="#ffb8c9" stroke="#2b2233" strokeWidth="3" />
      <circle cx="18" cy="29" r="2" fill="#2b2233" />
      <circle cx="30" cy="29" r="2" fill="#2b2233" />
      <path d="M22 34 q2 2 4 0" stroke="#2b2233" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M24 4 v7 M13 8 l4 5 M35 8 l-4 5" stroke="#2b2233" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const buttonMalang: MiniGame = {
  id: 'button-malang',
  name: '말랑 누르기',
  description: '20초 동안 말랑이를 최대한 많이 눌러요. 연속으로 누르면 콤보 보너스!',
  controls: '터치, 클릭, Space 또는 Enter',
  durationMs: CONFIG.durationMs,
  blurb: '톡톡 누르기',
  tags: ['feel', 'record'],
  icon: ButtonMalangIcon,
  Component: ButtonMalangGame,
};

export default buttonMalang;
