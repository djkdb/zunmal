import { useEffect, useRef, type CSSProperties } from 'react';
import {
  BASIC_GESTURES,
  REACTION_UNLOCKS,
  isUnlocked,
  type ReactionArea,
  type ReactionGesture,
} from '../../touch/reactions';
import { CloseIcon } from '../icons';
import { GestureArt } from './GestureArt';

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
  onClose: () => void;
  onShow: (demo: DemoSpec) => void;
}

/** 반응 방법 보기: 모든 손짓과 반응을 그림 + 한 줄 설명 + 열림/잠김으로 */
export function ReactionGuide({ level, name, onClose, onShow }: ReactionGuideProps) {
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
        <button ref={closeRef} type="button" className="pr-guide__close" aria-label="닫기" onClick={onClose}>
          <CloseIcon size={22} />
        </button>
      </div>
    </div>
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
