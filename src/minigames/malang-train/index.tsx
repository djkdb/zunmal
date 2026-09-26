import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { PartnerBuddy, type PartnerBuddyHandle } from '../shared/PartnerBuddy';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  GRID,
  TRAIN_CONFIG as CONFIG,
  createTrainState,
  progress,
  speedLevel,
  step,
  swipeDir,
  turn,
  type Cell,
  type Dir,
  type TrainEvent,
  type TrainState,
} from './logic';
import './MalangTrain.css';

const INK = '#2b2233';
/** 아기 말랑이 색 (딸기, 소다, 레몬, 메론, 포도, 복숭아 순환) */
const BABY_COLORS = ['#ff7aa2', '#5cc8ff', '#ffd23f', '#7ed957', '#b98cff', '#ffa36b'] as const;
/** 스와이프 문턱: 칸 크기의 이 비율만큼 밀면 방향 전환 */
const SWIPE_CELLS = 0.7;
/** 황금 사탕이 사라지기 전 깜빡이기 시작하는 시간 */
const GOLDEN_BLINK_MS = 1500;

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const DIR_LABEL: Record<Dir, string> = { up: '위로', down: '아래로', left: '왼쪽으로', right: '오른쪽으로' };

interface Floater {
  id: number;
  cell: Cell;
  text: string;
  tone: 'good' | 'gold' | 'bad';
}

/** 칸 → 판 안의 % 위치 (칸 가운데) */
const pct = (v: number) => `${((v + 0.5) / GRID) * 100}%`;

// ── 그림 ───────────────────────────────────────────────────

/** 기차에 붙는 아기 말랑이: 작은 젤리 한 알 */
const BabyMalang = memo(function BabyMalang({ color }: { color: string }) {
  return (
    <svg className="trn__baby-svg" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path
        d="M6 27 C6 15 12 8 20 8 C28 8 34 15 34 27 C34 33 28 35 20 35 C12 35 6 33 6 27 Z"
        fill={color}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="14" cy="16" rx="4.5" ry="2.8" fill="#fff" opacity="0.6" />
      <circle cx="15" cy="24" r="2.1" fill={INK} />
      <circle cx="25" cy="24" r="2.1" fill={INK} />
      <path d="M18 28.5 q2 1.6 4 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
});

/** 포장 사탕. 황금 사탕은 금색 + 반짝임 */
const Candy = memo(function Candy({ golden }: { golden: boolean }) {
  const body = golden ? '#ffc02e' : '#ff7aa2';
  const wrap = golden ? '#fff1a8' : '#5cc8ff';
  return (
    <svg className="trn__candy-svg" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {golden && (
        <path
          d="M20 1 v6 M20 33 v6 M1 20 h5 M34 20 h5 M6 6 l4 4 M34 6 l-4 4"
          stroke="#c77f00"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )}
      <path d="M11 20 L3 12 L4 28 Z" fill={wrap} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M29 20 L37 12 L36 28 Z" fill={wrap} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="10" fill={body} stroke={INK} strokeWidth="2.8" />
      <path d="M14 15 q6 5 3 12 M21 11 q5 6 2 14" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
});

function ArrowGlyph({ dir }: { dir: Dir }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false">
      <path
        d="M16 5 L27 19 H20 V27 H12 V19 H5 Z"
        fill="#fffcf5"
        stroke={INK}
        strokeWidth="2.8"
        strokeLinejoin="round"
        transform={`rotate(${rot} 16 16)`}
      />
    </svg>
  );
}

// ── 게임 컴포넌트 ───────────────────────────────────────────

function MalangTrainGame({ partner, partnerShiny, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const stateRef = useRef<TrainState | null>(null);
  if (stateRef.current === null) stateRef.current = createTrainState(defaultRng);
  const [view, setView] = useState<TrainState>(stateRef.current);
  const [finished, setFinished] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [speedToast, setSpeedToast] = useState(0);
  const [moved, setMoved] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buddyRef = useRef<PartnerBuddyHandle>(null);
  const floaterId = useRef(0);
  const reported = useRef(false);
  const swipeRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const playing = started && !finished;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  /** 보간 위치로 기차를 그린다 (React 렌더 없이 transform만 바꿈) */
  const paint = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const a = progress(s);
    for (let i = 0; i < s.snake.length; i++) {
      const el = segRefs.current[i];
      const to = s.snake[i];
      if (!el || !to) continue;
      const from = s.from[i] ?? to;
      const x = from.x + (to.x - from.x) * a;
      const y = from.y + (to.y - from.y) * a;
      el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    }
  }, []);

  // 새 칸이 생기거나 다시 그려질 때 브라우저가 그리기 전에 제자리로
  useLayoutEffect(paint);

  const addFloater = useCallback((cell: Cell, text: string, tone: Floater['tone']) => {
    const id = ++floaterId.current;
    setFloaters((f) => [...f.slice(-5), { id, cell, text, tone }]);
    window.setTimeout(() => setFloaters((f) => f.filter((it) => it.id !== id)), 700);
  }, []);

  const handleEvents = useCallback(
    (events: TrainEvent[]) => {
      for (const e of events) {
        if (e.type === 'eat') {
          if (e.kind === 'golden') sfx.coin();
          else sfx.pickup();
          addFloater(e.cell, `+${e.points}`, e.kind === 'golden' ? 'gold' : 'good');
          // 맨 앞 파트너가 냠: 찌그러지며 웃고, 황금 사탕이면 반짝 눈
          buddyRef.current?.react(e.kind === 'golden' ? 'wow' : 'happy', e.kind === 'golden' ? 900 : 500);
        } else if (e.type === 'speedUp') {
          sfx.beat(true);
          setSpeedToast(e.level);
        } else if (e.type === 'crash') {
          sfx.hit();
          buddyRef.current?.setBase('sad');
          buddyRef.current?.react('oops', 700);
          const head = stateRef.current?.snake[0];
          if (head) addFloater(head, '쿵!', 'bad');
          if (!reduced) {
            fieldRef.current?.animate(
              [
                { transform: 'translate(0,0)' },
                { transform: 'translate(-6px,2px)' },
                { transform: 'translate(6px,-2px)' },
                { transform: 'translate(-3px,0)' },
                { transform: 'translate(0,0)' },
              ],
              { duration: 300 },
            );
          }
        }
      }
    },
    [addFloater, reduced, sfx],
  );

  // 게임 루프
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;
    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      const cur = stateRef.current;
      if (!cur) return;
      const out = step(cur, dt, defaultRng);
      stateRef.current = out.state;
      hudAcc += dt;
      if (out.events.length > 0 || hudAcc > 100) {
        hudAcc = 0;
        setView(out.state);
      }
      if (out.events.length > 0) handleEvents(out.events);
      paint();
      if (out.state.finished) {
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, handleEvents, paint]);

  // 속도 안내는 잠깐만
  useEffect(() => {
    if (speedToast === 0) return;
    const id = window.setTimeout(() => setSpeedToast(0), 1200);
    return () => window.clearTimeout(id);
  }, [speedToast]);

  // 종료 처리 (onFinish는 정확히 한 번)
  useEffect(() => {
    if (!finished) return;
    const s = stateRef.current;
    if (s?.endReason === 'time' || s?.endReason === 'full') {
      sfx.success();
      buddyRef.current?.setBase('happy');
    } else sfx.fail();
    const id = window.setTimeout(() => {
      if (reported.current || !s) return;
      reported.current = true;
      onFinish({
        score: s.score,
        stats: {
          사탕: s.eaten,
          황금사탕: s.goldens,
          기차길이: s.snake.length,
          버틴초: Math.floor(s.elapsedMs / 1000),
        },
      });
    }, reduced ? 300 : 1000);
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  const steer = useCallback((dir: Dir) => {
    if (!playingRef.current) return;
    const cur = stateRef.current;
    if (!cur) return;
    const next = turn(cur, dir);
    if (next !== cur) {
      stateRef.current = next;
      setMoved(true);
    }
  }, []);

  // 키보드: 방향키, WASD
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEY_DIR[e.code];
      if (!dir) return;
      e.preventDefault();
      if (e.repeat) return;
      steer(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  // 스와이프: 한 번 누른 채로 여러 번 꺾을 수 있도록 방향이 바뀔 때마다 기준점을 옮긴다
  const onFieldDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onFieldMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const sw = swipeRef.current;
    if (!sw || sw.id !== e.pointerId) return;
    const cellPx = e.currentTarget.clientWidth / GRID;
    const dir = swipeDir(e.clientX - sw.x, e.clientY - sw.y, Math.max(14, cellPx * SWIPE_CELLS));
    if (!dir) return;
    steer(dir);
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onFieldUp = () => {
    swipeRef.current = null;
  };

  const onPadDown = (dir: Dir) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    steer(dir);
  };
  // 포인터는 위에서 처리. click은 키보드(Enter/Space, detail 0)일 때만
  const onPadClick = (dir: Dir) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) steer(dir);
  };

  const timeLeft = Math.max(0, (CONFIG.durationMs - view.elapsedMs) / 1000);
  const level = speedLevel(view.eaten);
  const golden = view.golden;
  const goldenBlink = golden !== null && golden.expiresAt - view.elapsedMs < GOLDEN_BLINK_MS;
  const endText = view.endReason === 'wall' ? '벽에 쿵!' : view.endReason === 'self' ? '기차에 쿵!' : '끝!';

  let message: string;
  if (speedToast > 0) message = '빨라져요!';
  else if (!moved) message = '밀거나 화살표로 방향을 바꿔요';
  else if (golden) message = '황금 사탕은 30점이에요';
  else message = '';

  return (
    <div className={`trn${reduced ? ' trn--reduced' : ''}`}>
      <GameHud timeLeft={timeLeft} totalTime={CONFIG.durationMs / 1000} score={view.score} onExit={onExit} />

      <div className="trn__status">
        <span className="chip trn__count" aria-label={`먹은 사탕 ${view.eaten}개`}>
          <span className="trn__count-icon" aria-hidden="true">
            <Candy golden={false} />
          </span>
          {view.eaten}
        </span>
        <p className={`trn__msg${speedToast > 0 ? ' is-speed' : ''}`} aria-live="polite">
          {message}
        </p>
        <span className="chip trn__speed" aria-label={`속도 ${level + 1}단계`}>
          <span aria-hidden="true">속도 {level + 1}</span>
        </span>
      </div>

      <div className="trn__board">
        <div
          ref={fieldRef}
          className="trn__field"
          role="img"
          aria-label={`말랑 기차 판. 기차 길이 ${view.snake.length}칸`}
          onPointerDown={onFieldDown}
          onPointerMove={onFieldMove}
          onPointerUp={onFieldUp}
          onPointerCancel={onFieldUp}
        >
          {view.candy && (
            <div className="trn__item" style={{ left: pct(view.candy.x), top: pct(view.candy.y) }}>
              <Candy golden={false} />
            </div>
          )}
          {golden && (
            <div
              key={`g${golden.expiresAt}`}
              className={`trn__item trn__item--golden${goldenBlink ? ' is-blink' : ''}`}
              style={{ left: pct(golden.cell.x), top: pct(golden.cell.y) }}
            >
              <Candy golden />
            </div>
          )}

          {/* 꼬리부터 그려서 머리가 맨 위에 오게 한다 */}
          {view.snake
            .map((_, i) => i)
            .reverse()
            .map((i) => (
              <div
                key={i}
                ref={(el) => {
                  segRefs.current[i] = el;
                }}
                className={i === 0 ? `trn__seg trn__seg--head is-${view.dir}` : 'trn__seg'}
              >
                {i === 0 ? (
                  <div className="trn__head">
                    <PartnerBuddy ref={buddyRef} partner={partner} shiny={partnerShiny} size={48} animation="none" />
                  </div>
                ) : (
                  <div className="trn__baby" style={{ animationDelay: `${-i * 0.11}s` }}>
                    <BabyMalang color={BABY_COLORS[(i - 1) % BABY_COLORS.length] ?? BABY_COLORS[0]} />
                  </div>
                )}
              </div>
            ))}

          {floaters.map((f) => (
            <span
              key={f.id}
              className={`trn__floater trn__floater--${f.tone}`}
              style={{ left: pct(f.cell.x), top: pct(f.cell.y) }}
              aria-hidden="true"
            >
              {f.text}
            </span>
          ))}
        </div>
        <Countdown count={count} />
        {finished && (
          <div className="countdown trn__end" role="status">
            <span>{endText}</span>
          </div>
        )}
      </div>

      <div className="trn__pad" role="group" aria-label="방향 버튼">
        {(['up', 'left', 'down', 'right'] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            className={`trn__key trn__key--${dir}`}
            aria-label={DIR_LABEL[dir]}
            aria-disabled={!playing}
            onPointerDown={onPadDown(dir)}
            onClick={onPadClick(dir)}
          >
            <ArrowGlyph dir={dir} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MalangTrainIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* 꼬리 아기 말랑이 둘 */}
      <ellipse cx="9" cy="33" rx="6" ry="5.5" fill="#5cc8ff" stroke={INK} strokeWidth="3" />
      <ellipse cx="19" cy="31" rx="7" ry="6.5" fill="#ffd23f" stroke={INK} strokeWidth="3" />
      {/* 머리 말랑이 */}
      <path
        d="M24 34 C24 22 29 15 35 15 C41 15 46 22 46 34 C46 39 41 41 35 41 C29 41 24 39 24 34 Z"
        fill="#ff7aa2"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="31" cy="21" rx="3.5" ry="2" fill="#fff" opacity="0.7" />
      <circle cx="32" cy="29" r="1.8" fill={INK} />
      <circle cx="39" cy="29" r="1.8" fill={INK} />
      {/* 앞에 놓인 사탕 */}
      <path d="M33 8 l-4 -3 v6 Z M43 8 l4 -3 v6 Z" fill="#5cc8ff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="38" cy="8" r="4.5" fill="#ffc02e" stroke={INK} strokeWidth="2.5" />
    </svg>
  );
}

const malangTrain: MiniGame = {
  id: 'malang-train',
  name: '말랑 기차',
  description: '사탕을 먹을 때마다 아기 말랑이가 기차에 붙어요. 벽이나 기차에 부딪히지 마세요.',
  controls: '밀기, 화살표 버튼, 방향키 또는 WASD',
  icon: MalangTrainIcon,
  Component: MalangTrainGame,
};

export default malangTrain;
