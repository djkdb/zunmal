import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Malang } from '../../components/Malang';
import { CHARACTERS_BY_RARITY, type Character } from '../../data/characters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  CELL_COUNT,
  POP_UP_CONFIG as CONFIG,
  boop,
  comboBonus,
  createPopUpState,
  step,
  type Pop,
  type PopUpState,
} from './logic';
import './PopUp.css';

const INK = '#2b2233';
const POP_SIZE = 76;

/** 컵 순서(왼쪽 위부터)별 키. 숫자는 숫자 키패드 배치(7 8 9 / 4 5 6 / 1 2 3). */
const LETTER_KEYS = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'] as const;
const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as const;

function cellFromKey(e: globalThis.KeyboardEvent): number {
  const code = e.code;
  const letter = LETTER_KEYS.findIndex((k) => code === `Key${k}`);
  if (letter >= 0) return letter;
  return DIGIT_KEYS.findIndex((d) => code === `Digit${d}` || code === `Numpad${d}`);
}

const NORMAL_POOL: readonly Character[] = CHARACTERS_BY_RARITY.common;

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'good' | 'gold' | 'bad';
}

interface Ghost {
  cell: number;
  pop: Pop;
}

// ── 가시 말랑 (실제 캐릭터가 아닌 방해꾼) ────────────────────────

function SpikyMalang({ size }: { size: number }) {
  const spikes: string[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n;
    const a2 = a0 + (2 * Math.PI) / n;
    const p = (a: number, r: number) => `${(60 + r * Math.cos(a)).toFixed(1)} ${(70 + r * Math.sin(a)).toFixed(1)}`;
    spikes.push(`M${p(a0, 38)} L${p(a1, 54)} L${p(a2, 38)} Z`);
  }
  return (
    <svg className="pu__spiky" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d={spikes.join(' ')} fill="#6b5a80" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="60" cy="70" r="40" fill="#4b3d5c" stroke={INK} strokeWidth="4" />
      <ellipse cx="46" cy="56" rx="10" ry="6" fill="#6b5a80" opacity="0.8" />
      {/* 화난 눈썹 + 눈 */}
      <path d="M36 58 L54 66 M84 58 L66 66" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <circle cx="47" cy="73" r="6" fill="#fffcf5" />
      <circle cx="73" cy="73" r="6" fill="#fffcf5" />
      <circle cx="48" cy="74" r="3" fill={INK} />
      <circle cx="72" cy="74" r="3" fill={INK} />
      {/* 뾰로통한 입 */}
      <path d="M50 94 q10 -8 20 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PopFace({ pop, partner }: { pop: Pop; partner: Character }) {
  if (pop.kind === 'spiky') return <SpikyMalang size={POP_SIZE} />;
  if (pop.kind === 'gold') {
    return (
      <span className="pu__gold">
        <Malang character={partner} size={POP_SIZE} animation="none" decorative />
      </span>
    );
  }
  const character = NORMAL_POOL[pop.variant % NORMAL_POOL.length] ?? partner;
  return <Malang character={character} size={POP_SIZE} animation="none" decorative />;
}

function cupLabel(index: number, pop: Pop | null): string {
  const what =
    pop === null ? '비어 있어요' : pop.kind === 'spiky' ? '가시 말랑, 누르지 마세요' : pop.kind === 'gold' ? '황금 말랑' : '말랑이';
  return `${index + 1}번 컵: ${what}`;
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function PopUpGame({ partner, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const stateRef = useRef<PopUpState>(createPopUpState());
  const [view, setView] = useState<PopUpState>(stateRef.current);
  const [finished, setFinished] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const cupRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const floaterId = useRef(0);
  const reported = useRef(false);

  const playing = started && !finished;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // 게임 루프
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;
    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      const out = step(stateRef.current, dt, defaultRng);
      stateRef.current = out.state;
      hudAcc += dt;
      if (out.events.length > 0 || hudAcc > 100) {
        hudAcc = 0;
        setView(out.state);
      }
      if (out.state.finished) {
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // 종료 처리 (onFinish는 정확히 한 번)
  useEffect(() => {
    if (!finished) return;
    sfx.success();
    const id = window.setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      const s = stateRef.current;
      onFinish({ score: s.score, stats: { 톡톡: s.boops, 황금: s.golds, 가시: s.spikes, 최대콤보: s.maxCombo } });
    }, reduced ? 200 : 800);
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  const addFloater = useCallback((cell: number, text: string, tone: Floater['tone']) => {
    const cup = cupRefs.current[cell];
    const x = cup ? cup.offsetLeft + cup.offsetWidth / 2 : 0;
    const y = cup ? cup.offsetTop + cup.offsetHeight * 0.3 : 0;
    const id = ++floaterId.current;
    setFloaters((f) => [...f.slice(-7), { id, x, y, text, tone }]);
    window.setTimeout(() => setFloaters((f) => f.filter((it) => it.id !== id)), 650);
  }, []);

  const press = useCallback(
    (cell: number) => {
      if (!playingRef.current) return;
      const before = stateRef.current;
      const pop = before.cells[cell] ?? null;
      const out = boop(before, cell);
      if (out.event.type === 'empty') return;
      stateRef.current = out.state;
      setView(out.state);
      const cup = cupRefs.current[cell];

      if (out.event.type === 'spiky') {
        sfx.hit();
        addFloater(cell, out.event.points < 0 ? `${out.event.points}` : '앗!', 'bad');
        if (!reduced) {
          gridRef.current?.animate(
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(-6px)' },
              { transform: 'translateX(6px)' },
              { transform: 'translateX(-3px)' },
              { transform: 'translateX(0)' },
            ],
            { duration: 260 },
          );
        }
        return;
      }

      if (out.event.kind === 'gold') sfx.coin();
      else sfx.tap(Math.min(12, out.event.combo));
      addFloater(cell, `+${out.event.points}`, out.event.kind === 'gold' ? 'gold' : 'good');
      if (!reduced && pop) {
        const ghost: Ghost = { cell, pop };
        setGhosts((g) => [...g.filter((it) => it.cell !== cell), ghost]);
        window.setTimeout(() => setGhosts((g) => g.filter((it) => it !== ghost)), 220);
        cup?.animate(
          [{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,0.92)' }, { transform: 'scale(1,1)' }],
          { duration: 180, easing: 'ease-out' },
        );
      }
    },
    [addFloater, reduced, sfx],
  );

  // 키보드: QWE/ASD/ZXC, 숫자 1~9 (키패드 배치)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cell = cellFromKey(e);
      if (cell < 0) return;
      e.preventDefault();
      if (e.repeat) return;
      press(cell);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const onCupPointer = (cell: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press(cell);
  };

  const onCupKey = (cell: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    press(cell);
  };

  const timeLeft = Math.max(0, (CONFIG.durationMs - view.elapsedMs) / 1000);
  const bonus = comboBonus(view.combo);

  return (
    <div className={`pu${reduced ? ' pu--reduced' : ''}`}>
      <GameHud timeLeft={timeLeft} totalTime={CONFIG.durationMs / 1000} score={view.score} onExit={onExit} />
      <p className={`pu__combo${view.combo >= CONFIG.comboStep ? ' is-hot' : ''}`} aria-live="off">
        {view.combo > 1 ? (
          <>
            <strong>{view.combo}</strong> 콤보{bonus > 0 && <span className="chip pu__bonus">+{bonus}점</span>}
          </>
        ) : (
          '가시 말랑은 누르지 마세요'
        )}
      </p>
      <div className="pu__tray">
        <div ref={gridRef} className="pu__grid">
          {Array.from({ length: CELL_COUNT }, (_, i) => {
            const pop = view.cells[i] ?? null;
            const ghost = ghosts.find((g) => g.cell === i);
            return (
              <button
                key={i}
                ref={(el) => {
                  cupRefs.current[i] = el;
                }}
                type="button"
                className={`pu__cup pu__cup--${i % 5}${pop?.kind === 'spiky' ? ' has-spiky' : ''}`}
                aria-label={cupLabel(i, pop)}
                aria-disabled={!playing}
                onPointerDown={onCupPointer(i)}
                onKeyDown={onCupKey(i)}
                // 포인터/키보드는 위 핸들러가 처리하므로 click은 무시(중복 방지)
                onClick={(e) => e.preventDefault()}
              >
                <span className="pu__hole" aria-hidden="true">
                  {pop && (
                    <span key={pop.id} className={`pu__pop pu__pop--${pop.kind}`}>
                      <PopFace pop={pop} partner={partner} />
                    </span>
                  )}
                  {!pop && ghost && (
                    <span key={`g${ghost.pop.id}`} className="pu__pop pu__pop--out">
                      <PopFace pop={ghost.pop} partner={partner} />
                    </span>
                  )}
                </span>
                <span className="pu__front" aria-hidden="true" />
                <span className="pu__key" aria-hidden="true">
                  {LETTER_KEYS[i]}
                </span>
              </button>
            );
          })}
          {floaters.map((f) => (
            <span
              key={f.id}
              className={`pu__floater pu__floater--${f.tone}`}
              style={{ left: f.x, top: f.y }}
              aria-hidden="true"
            >
              {f.text}
            </span>
          ))}
        </div>
        <Countdown count={count} />
        {finished && (
          <div className="countdown" role="status">
            <span>끝!</span>
          </div>
        )}
      </div>
      <p className="small muted pu__help">
        올라온 말랑이를 톡! 황금 말랑은 30점이에요.
        <span className="pu__help-keys"> 키보드: QWE ASD ZXC 또는 숫자 1~9</span>
      </p>
    </div>
  );
}

function PopUpIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="24" cy="22" rx="12" ry="11" fill="#ffb8c9" stroke="#2b2233" strokeWidth="3" />
      <circle cx="20" cy="21" r="1.8" fill="#2b2233" />
      <circle cx="28" cy="21" r="1.8" fill="#2b2233" />
      <path d="M9 26 h30 l-4 16 h-22 Z" fill="#6ec6ff" stroke="#2b2233" strokeWidth="3" strokeLinejoin="round" />
      <path d="M13 31 h6" stroke="#fffcf5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 3 v5 M12 7 l3 4 M36 7 l-3 4" stroke="#2b2233" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const popUp: MiniGame = {
  id: 'pop-up',
  name: '쏙쏙 말랑',
  description: '컵에서 쏙 올라온 말랑이를 톡 누르고 가시 말랑은 피해요.',
  controls: '터치, 클릭, QWE ASD ZXC 또는 숫자 1~9',
  icon: PopUpIcon,
  Component: PopUpGame,
};

export default popUp;
