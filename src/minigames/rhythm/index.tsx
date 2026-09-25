import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Malang } from '../../components/Malang';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { defaultRng } from '../../lib/rng';
import { Countdown } from '../shared/Countdown';
import { GameHud } from '../shared/GameHud';
import { useCountdown } from '../shared/useCountdown';
import type { MiniGame, MiniGameProps } from '../types';
import {
  RHYTHM_CONFIG as CONFIG,
  comboMultiplier,
  createRhythmState,
  generateChart,
  isFinished,
  judge,
  sweepMisses,
  type Judgement,
  type RhythmState,
} from './logic';
import './Rhythm.css';

/** 판정 링 반지름 / 노트 출발 거리 (px, 패드 중심 기준) — 표시 전용 */
const RING_R = 88;
const START_DIST = 210;
/** 노트가 들어오는 방향 (위쪽 기준 각도, 도). 인덱스로 순환 */
const LANE_ANGLES = [0, -38, 38, -70, 70, -20, 20, -54, 54];

const JUDGE_WORD: Record<Judgement, string> = { perfect: '퍼펙트', good: '좋아요', miss: '놓침' };

const GAME_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyF', 'KeyJ']);

interface Flash {
  id: number;
  judgement: Judgement;
}

/** 이벤트 시각을 performance.now() 기준으로 (event.timeStamp가 이상하면 now 사용) */
function eventTime(timeStamp: number): number {
  const now = performance.now();
  return timeStamp > 0 && Math.abs(now - timeStamp) < 1000 ? timeStamp : now;
}

function RhythmGame({ partner, onFinish, onExit, sfx }: MiniGameProps) {
  const reduced = useReducedMotion();
  const { count, done: started } = useCountdown(sfx, { reduced });
  const stateRef = useRef<RhythmState | null>(null);
  if (stateRef.current === null) stateRef.current = createRhythmState(generateChart(defaultRng));
  const startAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [finished, setFinished] = useState(false);
  const malangRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const flashId = useRef(0);
  const reportedRef = useRef(false);

  const playing = started && !finished;
  const state = stateRef.current;
  const chart = state.chart;

  const showFlash = useCallback((judgement: Judgement) => {
    setFlash({ id: ++flashId.current, judgement });
  }, []);

  // 게임 루프: 시계, 박자음, 놓친 노트 처리
  useEffect(() => {
    if (!started) return;
    malangRef.current?.focus({ preventScroll: true });
    const startAt = performance.now();
    startAtRef.current = startAt;
    let beatCursor = 0;
    let raf = 0;

    const frame = (t: number) => {
      const now = Math.max(t, performance.now()) - startAt;
      const s0 = stateRef.current;
      if (!s0) return;
      // 박자음: 시각이 된 비트를 바로 재생 (탭이 가려져 밀린 비트는 건너뜀)
      const beats = s0.chart.beats;
      while (beatCursor < beats.length) {
        const b = beats[beatCursor];
        if (!b || b.time > now) break;
        if (now - b.time < 120) {
          sfx.beat(b.accent);
          if (!reduced) {
            ringRef.current?.animate(
              [{ transform: 'translate(-50%, -50%) scale(1.06)' }, { transform: 'translate(-50%, -50%) scale(1)' }],
              { duration: 160, easing: 'ease-out' },
            );
          }
        }
        beatCursor++;
      }
      const swept = sweepMisses(s0, now);
      if (swept.missed.length > 0) {
        stateRef.current = swept.state;
        showFlash('miss');
      }
      setElapsed(now);
      if (isFinished(swept.state, now)) {
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, reduced, sfx, showFlash]);

  // 종료 처리 (onFinish는 정확히 한 번)
  useEffect(() => {
    if (!finished) return;
    const s = stateRef.current;
    if (!s) return;
    sfx.success();
    const id = window.setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onFinish({
        score: s.score,
        stats: { 퍼펙트: s.perfect, 좋아요: s.good, 놓침: s.miss, 최대콤보: s.maxCombo },
      });
    }, reduced ? 200 : 800);
    return () => window.clearTimeout(id);
  }, [finished, onFinish, reduced, sfx]);

  const press = useCallback(
    (at: number) => {
      const startAt = startAtRef.current;
      const s = stateRef.current;
      if (!playing || startAt === null || !s) return;
      const out = judge(s, at - startAt);
      if (out.judgement === null) return; // 근처에 노트가 없으면 무시 (벌점 없음)
      stateRef.current = out.state;
      showFlash(out.judgement);
      if (out.judgement === 'miss') {
        sfx.hit();
        return;
      }
      sfx.tap(Math.min(12, Math.floor(out.state.combo / 5)));
      if (!reduced) {
        malangRef.current?.animate(
          [
            { transform: 'scale(1,1)' },
            { transform: 'scale(1.12,0.86)' },
            { transform: 'scale(0.96,1.05)' },
            { transform: 'scale(1,1)' },
          ],
          { duration: 200, easing: 'ease-out' },
        );
      }
    },
    [playing, reduced, sfx, showFlash],
  );

  // 키보드: Space / Enter / F / J (자동 반복 무시). e.code라 한글 자판에서도 동작.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!GAME_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const onOtherControl =
        target !== null &&
        target !== malangRef.current &&
        (target.closest('button, a, input, textarea, select') !== null);
      // 다른 버튼(예: 나가기)에 포커스가 있으면 Space/Enter는 그 버튼 몫
      if (onOtherControl && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) return;
      e.preventDefault();
      if (e.repeat) return;
      press(eventTime(e.timeStamp));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const onPadPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    press(eventTime(e.timeStamp));
  };

  const timeLeft = Math.max(0, (chart.endMs - elapsed) / 1000);
  const mult = comboMultiplier(state.combo);

  // 화면에 보이는 노트: 판정 전이고 링까지 travelMs 이내
  const visible: { index: number; x: number; y: number; accent: boolean; offbeat: boolean }[] = [];
  if (started) {
    for (let i = state.cursor; i < chart.notes.length; i++) {
      const n = chart.notes[i];
      if (!n) break;
      const until = n.time - elapsed;
      if (until > CONFIG.travelMs) break;
      if (state.results[i] !== null) continue;
      const p = until / CONFIG.travelMs;
      const dist = Math.max(0, RING_R + p * (START_DIST - RING_R));
      const deg = LANE_ANGLES[i % LANE_ANGLES.length] ?? 0;
      const rad = (deg * Math.PI) / 180;
      visible.push({ index: i, x: Math.sin(rad) * dist, y: -Math.cos(rad) * dist, accent: n.accent, offbeat: n.offbeat });
    }
  }

  return (
    <div className="rh">
      <GameHud timeLeft={timeLeft} totalTime={chart.endMs / 1000} score={state.score} onExit={onExit} />
      <p className={`rh__combo${state.combo >= CONFIG.comboStep ? ' is-hot' : ''}`} aria-live="off">
        {state.combo > 1 ? (
          <>
            <strong>{state.combo}</strong> 콤보
            {mult > 1 && <span className="chip rh__mult">×{mult}</span>}
          </>
        ) : (
          '방울이 링에 닿을 때 눌러요'
        )}
      </p>
      <div className="rh__pad" onPointerDown={onPadPointer}>
        <div ref={ringRef} className="rh__ring" style={{ width: RING_R * 2, height: RING_R * 2 }} aria-hidden="true" />
        {visible.map((n) => (
          <span
            key={n.index}
            className={`rh__note${n.accent ? ' is-accent' : ''}${n.offbeat ? ' is-off' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px)` }}
            aria-hidden="true"
          />
        ))}
        <button
          ref={malangRef}
          type="button"
          className="rh__malang"
          aria-label={`${partner.name} 누르기`}
          aria-disabled={!playing}
          // 포인터/키보드는 위 핸들러가 처리하므로 click은 무시(중복 방지)
          onClick={(e) => e.preventDefault()}
        >
          <Malang character={partner} size={156} animation="none" decorative />
        </button>
        {flash && (
          <span
            key={flash.id}
            className={`rh__judge is-${flash.judgement}${reduced ? '' : ' is-anim'}`}
            aria-live="off"
          >
            {JUDGE_WORD[flash.judgement]}
          </span>
        )}
        <Countdown count={count} />
        {finished && (
          <div className="countdown" role="status">
            <span>끝!</span>
          </div>
        )}
      </div>
      <p className="small muted rh__help">화면 아무 곳이나 눌러도 돼요. (키보드: Space, Enter, F, J)</p>
    </div>
  );
}

function RhythmIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="26" r="17" fill="none" stroke="#2b2233" strokeWidth="3" strokeDasharray="6 5" />
      <ellipse cx="24" cy="29" rx="10" ry="8" fill="#b99cff" stroke="#2b2233" strokeWidth="3" />
      <circle cx="20.5" cy="28" r="1.6" fill="#2b2233" />
      <circle cx="27.5" cy="28" r="1.6" fill="#2b2233" />
      <path d="M31 4 v11" stroke="#2b2233" strokeWidth="3" strokeLinecap="round" />
      <path d="M31 4 q6 1 7 6" stroke="#2b2233" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="28" cy="15" rx="4" ry="3" fill="#ff6f91" stroke="#2b2233" strokeWidth="3" />
    </svg>
  );
}

const rhythm: MiniGame = {
  id: 'rhythm',
  name: '리듬 누르기',
  description: '점점 빨라지는 박자에 맞춰 말랑이를 눌러요.',
  controls: '터치, 클릭, Space, Enter, F 또는 J',
  icon: RhythmIcon,
  Component: RhythmGame,
};

export default rhythm;
