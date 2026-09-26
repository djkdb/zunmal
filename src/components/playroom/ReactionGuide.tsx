import { useEffect, useRef, type CSSProperties } from 'react';
import { MATERIALS, MATERIAL_IDS, type FillingSpec, type MaterialId } from '../../data/materials';
import { PAIR_PLAYS, type PairPlayId } from '../../touch/interactions';
import {
  BASIC_GESTURES,
  REACTION_UNLOCKS,
  isUnlocked,
  type ReactionArea,
  type ReactionGesture,
} from '../../touch/reactions';
import { CloseIcon } from '../icons';
import { GestureArt } from './GestureArt';
import { FillingIcon, MaterialIcon } from './MaterialIcon';

export interface DemoSpec {
  /** 본 적 있는지 기억하는 이름 (반응 id 또는 기본 손짓 id) */
  key: string;
  label: string;
  howTo: string;
  gesture: ReactionGesture;
  area: ReactionArea;
}

export const ALL_DEMOS: readonly DemoSpec[] = [
  ...BASIC_GESTURES.map((g) => ({ key: g.id, label: g.label, howTo: g.howTo, gesture: g.gesture, area: g.area })),
  ...REACTION_UNLOCKS.map((r) => ({ key: r.id, label: r.label, howTo: r.howTo, gesture: r.gesture, area: r.area })),
];

export function demoFor(key: string): DemoSpec | undefined {
  return ALL_DEMOS.find((d) => d.key === key);
}

// ── 본 시범 기억 (저장 데이터가 아닌 작은 localStorage 키) ──

const SEEN_KEY = 'malang-playroom-demos';

export function readSeenDemos(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markDemoSeen(key: string): void {
  try {
    const seen = readSeenDemos();
    seen.add(key);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // 저장이 막힌 환경: 다음에 한 번 더 보여 줄 뿐
  }
}

// ── 반응 방법 시트 ──

interface ReactionGuideProps {
  level: number;
  name: string;
  /** 집중한 말랑이의 촉감 (강조) */
  material: MaterialId | null;
  /** 집중한 말랑이 몸속의 특별한 속 (전설 이상) */
  filling?: FillingSpec | null;
  onClose: () => void;
  onShow: (demo: DemoSpec) => void;
}

/** 반응 방법 보기: 모든 손짓과 반응을 그림 + 한 줄 설명 + 열림/잠김으로 */
export function ReactionGuide({ level, name, material, filling = null, onClose, onShow }: ReactionGuideProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (d: DemoSpec, lockLevel: number | null) => {
    const locked = lockLevel !== null && !isUnlocked(d.key as never, level);
    return (
      <li key={d.key} className={`pr-guide__row${locked ? ' is-locked' : ''}`}>
        <GestureArt gesture={d.gesture} area={d.area} locked={locked} size={60} />
        <div className="pr-guide__text">
          <p className="pr-guide__label">
            {d.label}
            {lockLevel !== null && (
              <span className={`pr-guide__state${locked ? '' : ' is-open'}`}>{locked ? `Lv.${lockLevel}에 열려요` : '열림'}</span>
            )}
          </p>
          <p className="pr-guide__how">{d.howTo}</p>
        </div>
        <button
          type="button"
          className="pr-guide__show"
          aria-label={`${d.label} 해 보이기`}
          onClick={() => onShow(d)}
        >
          보기
        </button>
      </li>
    );
  };

  return (
    <div className="pr-sheet-backdrop" onClick={onClose}>
      <div
        className="pr-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pr-guide-title" className="pr-guide__title">
          만지는 방법
        </h2>
        <p className="pr-guide__sub">애정이 오를수록 {name}의 새 반응이 열려요.</p>
        <ul className="pr-guide__list">
          {BASIC_GESTURES.map((g) => row({ key: g.id, label: g.label, howTo: g.howTo, gesture: g.gesture, area: g.area }, null))}
          {REACTION_UNLOCKS.map((r) =>
            row({ key: r.id, label: r.label, howTo: r.howTo, gesture: r.gesture, area: r.area }, r.level),
          )}
        </ul>

        <h3 className="pr-guide__head">함께 놀기</h3>
        <p className="pr-guide__sub">말랑이를 두 마리 이상 꺼내면 서로 반응해요.</p>
        <ul className="pr-guide__list">
          {PAIR_PLAYS.map((p) => (
            <li key={p.id} className="pr-guide__row pr-guide__row--pair">
              <PairArt play={p.id} />
              <div className="pr-guide__text">
                <p className="pr-guide__label">{p.label}</p>
                <p className="pr-guide__how">{p.howTo}</p>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="pr-guide__head">촉감</h3>
        <p className="pr-guide__sub">말랑이마다 촉감이 달라요: 천천히 차오르고, 통통 튀고, 쭉 늘어나고, 찐득하게 붙어요.</p>
        <ul className="pr-guide__feels">
          {MATERIAL_IDS.map((id) => (
            <li key={id} className={`pr-guide__feel${id === material ? ' is-current' : ''}`} data-material={id}>
              <MaterialIcon material={id} size={30} />
              <span className="pr-guide__feel-text">
                <b>{MATERIALS[id].label}</b>
                {id === material && <span className="pr-guide__state is-open">{name}</span>}
                <span className="pr-guide__how">{MATERIALS[id].feelLine}</span>
              </span>
            </li>
          ))}
        </ul>
        {filling && (
          <p className="pr-guide__filling">
            <FillingIcon kind={filling.kind} colors={filling.colors} size={30} />
            <span>
              <b>{name}의 {filling.label}</b>: 꾹 누르면 몸속이 반짝이며 소용돌이쳐요.
            </span>
          </p>
        )}
        <button ref={closeRef} type="button" className="pr-guide__close" aria-label="닫기" onClick={onClose}>
          <CloseIcon size={22} />
        </button>
      </div>
    </div>
  );
}

/** 함께 놀기 그림: 말랑이 두 마리 실루엣 + 손짓 표시 (60×60) */
function PairArt({ play }: { play: PairPlayId }) {
  const blob = (x: number, y: number, fill: string, squash = 1) => (
    <path
      d={`M${x - 13} ${y} C${x - 13} ${y - 21 * squash} ${x + 13} ${y - 21 * squash} ${x + 13} ${y} Q${x} ${y + 3} ${x - 13} ${y} Z`}
      fill={fill}
      stroke="#2b2233"
      strokeWidth={2.2}
      strokeLinejoin="round"
    />
  );
  const eyes = (x: number, y: number) => (
    <g fill="#2b2233">
      <circle cx={x - 3.5} cy={y} r={1.3} />
      <circle cx={x + 3.5} cy={y} r={1.3} />
    </g>
  );
  return (
    <svg className="gesture-art" viewBox="0 0 64 64" width={60} height={60} aria-hidden="true" focusable="false">
      <rect x={2} y={2} width={60} height={60} rx={14} fill="#fff6e8" stroke="#2b2233" strokeWidth={2} />
      {play === 'cheekRub' && (
        <>
          {blob(21, 46, '#ffd0e0')}
          {blob(43, 46, '#bff3ff')}
          {eyes(22, 38)}
          {eyes(42, 38)}
          <path d="M32 18 c-3 -4 -8 -1 -5 3 l5 5 l5 -5 c3 -4 -2 -7 -5 -3 Z" fill="#ff7aa2" stroke="#2b2233" strokeWidth={1.6} />
          <path d="M8 40 h5 M56 40 h-5" stroke="#2b2233" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {play === 'stack' && (
        <>
          {blob(32, 54, '#bff3ff', 0.8)}
          {blob(32, 36, '#ffd0e0')}
          {eyes(32, 29)}
          <path d="M46 14 v12 m-4 -4 l4 4 l4 -4" fill="none" stroke="#2b2233" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {play === 'bump' && (
        <>
          {blob(18, 48, '#ffd0e0')}
          {blob(46, 48, '#c8f08a')}
          {eyes(18, 40)}
          {eyes(46, 40)}
          <path d="M32 22 l2 5 l5 1 l-4 3 l1 5 l-4 -3 l-4 3 l1 -5 l-4 -3 l5 -1 Z" fill="#ffd84d" stroke="#2b2233" strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M5 30 h7 M52 30 h7" stroke="#2b2233" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {play === 'rest' && (
        <>
          {blob(20, 48, '#ffe2b8')}
          {blob(44, 48, '#d9c9ff')}
          <path d="M15 40 q2 2 4 0 M21 40 q2 2 4 0 M39 40 q2 2 4 0 M45 40 q2 2 4 0" fill="none" stroke="#2b2233" strokeWidth={1.6} strokeLinecap="round" />
          <text x={48} y={22} fontSize={11} fontWeight={700} fill="#6f63c9">z</text>
          <text x={54} y={15} fontSize={8} fontWeight={700} fill="#6f63c9">z</text>
        </>
      )}
    </svg>
  );
}

// ── 손가락 시범 ──


/** 스프라이트 상자 안에서 손짓 자리 (비율) */
const AREA_AT: Record<ReactionArea, { x: number; y: number }> = {
  head: { x: 0.5, y: 0.3 },
  cheek: { x: 0.26, y: 0.56 },
  belly: { x: 0.5, y: 0.66 },
  body: { x: 0.5, y: 0.55 },
};

interface GhostFingerProps {
  demo: DemoSpec;
  /** 말랑이 스프라이트 상자 (client px) */
  box: { left: number; top: number; size: number };
  reduced: boolean;
  onDone: () => void;
}

/**
 * 반투명 손가락이 말랑이 위에서 손짓을 2~3초 해 보인다. 화면을 만지면 곧바로 사라진다.
 * 움직임 줄이기면 움직이지 않는 그림 + 화살표만.
 */
export function GhostFinger({ demo, box, reduced, onDone }: GhostFingerProps) {
  useEffect(() => {
    const t = window.setTimeout(onDone, reduced ? 4200 : 3000);
    return () => window.clearTimeout(t);
  }, [onDone, reduced]);
  const at = AREA_AT[demo.area];
  const style = {
    left: box.left,
    top: box.top,
    width: box.size,
    height: box.size,
    '--gx': `${at.x * 100}%`,
    '--gy': `${at.y * 100}%`,
  } as CSSProperties;
  return (
    <div className={`pr-ghost pr-ghost--${demo.gesture}${reduced ? ' is-static' : ''}`} style={style} aria-hidden="true">
      {reduced ? (
        <span className="pr-ghost__art">
          <GestureArt gesture={demo.gesture} area={demo.area} size={72} />
        </span>
      ) : (
        <>
          <span className="pr-ghost__ring" />
          <svg className="pr-ghost__finger" viewBox="0 0 40 56" width="40" height="56">
            <path
              d="M16 52 C9 46 5 38 6 31 C7 27 11 27 13 30 L14 32 L14 8 C14 4 20 4 20 8 L20 24 C20 21 26 21 26 24 L26 27 C26 24 32 24 32 27 L32 30 C32 27 37 27 37 31 L37 40 C37 47 33 52 28 52 Z"
              fill="#fffdf8"
              stroke="#2b2233"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <ellipse cx="17" cy="9" rx="2.2" ry="3" fill="#ffd5e2" />
          </svg>
        </>
      )}
    </div>
  );
}
