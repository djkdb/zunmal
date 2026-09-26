import { useEffect, useRef, useState } from 'react';
import { playRarityFanfare, sfx } from '../audio/sfx';
import { RARITY_META, type Rarity } from '../data/rarity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './GachaMachine.css';

/** 캡슐 색 (위쪽 반구). 희귀도 힌트 — 텍스트는 결과 화면에서 제공. */
const CAPSULE_TOP: Record<Rarity, string> = {
  common: '#f3ebdd',
  rare: '#7fbfff',
  epic: '#c79bff',
  legendary: '#ffc94d',
  mythic: 'rainbow',
  secret: 'cosmic',
};

/** 돔 안에 보이는 장식용 캡슐 배치 */
const DOME_CAPSULES: { x: number; y: number; r: number; color: string; rot: number }[] = [
  { x: 70, y: 112, r: 15, color: '#ff8fab', rot: -20 },
  { x: 102, y: 118, r: 15, color: '#7fd8be', rot: 15 },
  { x: 134, y: 114, r: 15, color: '#ffd966', rot: 40 },
  { x: 86, y: 90, r: 14, color: '#8ecdf7', rot: 70 },
  { x: 120, y: 88, r: 14, color: '#c3a6ff', rot: -35 },
  { x: 58, y: 84, r: 13, color: '#ffd966', rot: 10 },
  { x: 146, y: 86, r: 13, color: '#ff8fab', rot: -60 },
  { x: 102, y: 64, r: 13, color: '#f3ebdd', rot: 25 },
];

export type MachinePhase = 'idle' | 'inserting' | 'shaking' | 'tease' | 'dropping' | 'ready' | 'opening';

export interface MachineRun {
  /** 실행마다 고유한 값 (같은 결과 재실행 구분) */
  id: number;
  /** 결과 중 가장 높은 희귀도 → 캡슐 색 */
  rarity: Rarity;
  /** 결과에 반짝이 있는가 → 캡슐에 반짝임, 결과음에 종소리 */
  shiny?: boolean;
}

interface GachaMachineProps {
  run: MachineRun | null;
  /** 캡슐 오픈 연출이 끝났을 때 */
  onOpened(): void;
  /** true면 캡슐을 열 때 결과음을 내지 않는다 (뒤이어 나오는 신화 연출이 직접 낸다) */
  quietFanfare?: boolean;
}

const TIMINGS = {
  normal: { inserting: 550, shaking: 1200, tease: 1500, dropping: 650, opening: 650 },
  reduced: { inserting: 120, shaking: 200, tease: 300, dropping: 120, opening: 150 },
} as const;

function CapsuleShape({ top, id }: { top: string; id: string }) {
  const fill = top === 'rainbow' ? `url(#${id}-rainbow)` : top === 'cosmic' ? `url(#${id}-cosmic)` : top;
  return (
    <svg viewBox="-34 -34 68 68" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-cosmic`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#8f6bff" />
          <stop offset="0.55" stopColor="#2d1b5e" />
          <stop offset="1" stopColor="#120a2e" />
        </radialGradient>
        <linearGradient id={`${id}-rainbow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8fab" />
          <stop offset="0.3" stopColor="#ffd966" />
          <stop offset="0.6" stopColor="#7fd8be" />
          <stop offset="1" stopColor="#c3a6ff" />
        </linearGradient>
      </defs>
      <g className="capsule-bottom">
        <path d="M-30 0 A30 30 0 0 0 30 0 Z" fill="#fffdf8" stroke="#2b2233" strokeWidth="4" strokeLinejoin="round" />
      </g>
      <g className="capsule-top">
        <path d="M-30 0 A30 30 0 0 1 30 0 Z" fill={fill} stroke="#2b2233" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="-12" cy="-16" rx="8" ry="4.5" fill="#fff" opacity="0.7" transform="rotate(-30 -12 -16)" />
        {top === 'cosmic' && (
          <g fill="#ffe07a">
            <circle cx="8" cy="-18" r="1.8" />
            <circle cx="16" cy="-8" r="1.2" />
            <circle cx="-4" cy="-6" r="1.4" />
            <path d="M20 -20 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 Z" />
          </g>
        )}
      </g>
      <rect x="-31" y="-3" width="62" height="6" rx="3" fill="#2b2233" className="capsule-band" />
    </svg>
  );
}

/**
 * 캡슐 머신 연출.
 * run이 바뀌면: 투입 → 흔들림 → 캡슐 낙하 → (탭 대기) → 오픈 → onOpened()
 * 뽑기 결과 자체는 이미 store에 반영된 상태이며, 이 컴포넌트는 연출만 담당한다.
 */
export function GachaMachine({ run, onOpened, quietFanfare = false }: GachaMachineProps) {
  const quietRef = useRef(quietFanfare);
  quietRef.current = quietFanfare;
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<MachinePhase>('idle');
  const timers = useRef<number[]>([]);
  const capsuleRef = useRef<HTMLButtonElement>(null);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const t = reduced ? TIMINGS.reduced : TIMINGS.normal;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    if (!run) {
      setPhase('idle');
      return;
    }
    clearTimers();
    setPhase('inserting');
    sfx.capsuleInsert();
    after(t.inserting, () => {
      setPhase('shaking');
      sfx.capsuleShake();
      if (!reduced) after(t.shaking / 2, () => sfx.capsuleShake());
    });
    // 시크릿: 불이 꺼지고 머신이 웅웅거리는 예고 단계가 한 번 더 들어간다
    const tease = run.rarity === 'secret' ? t.tease : 0;
    if (tease > 0) {
      after(t.inserting + t.shaking, () => {
        setPhase('tease');
        sfx.secretTease();
      });
    }
    after(t.inserting + t.shaking + tease, () => setPhase('dropping'));
    after(t.inserting + t.shaking + tease + t.dropping, () => {
      sfx.tap(4);
      setPhase('ready');
    });
    return clearTimers;
    // run.id가 바뀔 때만 새 연출을 시작한다.
  }, [run?.id]);

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (phase === 'ready') capsuleRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const open = () => {
    if (phase !== 'ready' || !run) return;
    setPhase('opening');
    sfx.capsuleOpen();
    after(t.opening, () => {
      if (!quietRef.current) playRarityFanfare(sfx, run.rarity, run.shiny);
      onOpenedRef.current();
    });
  };

  const showCapsule = run && (phase === 'dropping' || phase === 'ready' || phase === 'opening');
  const capsuleTop = run ? CAPSULE_TOP[run.rarity] : CAPSULE_TOP.common;
  const glow = run && RARITY_META[run.rarity].fanfare >= 2;
  const rarityClass = run && phase !== 'idle' && phase !== 'inserting' ? ` machine--r-${run.rarity}` : '';

  return (
    <div className={`machine machine--${phase}${rarityClass}`}>
      <svg className="machine__svg" viewBox="0 0 204 300" role="img" aria-label="말랑 캡슐 머신">
        <defs>
          <radialGradient id="machine-glass" cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.6" stopColor="#e9f6ff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#bfe3ff" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id="machine-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff9fba" />
            <stop offset="1" stopColor="#ff7a9e" />
          </linearGradient>
          <clipPath id="machine-dome-clip">
            <circle cx="102" cy="92" r="70" />
          </clipPath>
        </defs>

        {/* 받침 */}
        <rect x="26" y="276" width="152" height="16" rx="8" fill="#2b2233" opacity="0.15" />

        {/* 몸통 */}
        <path
          d="M28 150 H176 L184 262 Q184 280 166 280 H38 Q20 280 20 262 Z"
          fill="url(#machine-body)"
          stroke="#2b2233"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* 이름표 */}
        <rect x="52" y="164" width="100" height="26" rx="13" fill="#fffdf8" stroke="#2b2233" strokeWidth="4" />
        <text x="102" y="183" textAnchor="middle" className="machine__label">
          말랑 뽑기
        </text>

        {/* 코인 슬롯 */}
        <g className="machine__slot">
          <rect x="140" y="206" width="26" height="36" rx="8" fill="#fffdf8" stroke="#2b2233" strokeWidth="4" />
          <rect x="150" y="213" width="6" height="20" rx="3" fill="#2b2233" />
        </g>
        <g className="machine__coin">
          <circle cx="153" cy="198" r="9" fill="#ffd966" stroke="#2b2233" strokeWidth="3" />
        </g>

        {/* 손잡이 */}
        <g className="machine__knob">
          <circle cx="72" cy="224" r="24" fill="#fffdf8" stroke="#2b2233" strokeWidth="5" />
          <rect x="52" y="218" width="40" height="12" rx="6" fill="#ffd966" stroke="#2b2233" strokeWidth="4" />
          <circle cx="72" cy="224" r="5" fill="#2b2233" />
        </g>

        {/* 배출구 */}
        <path d="M106 252 H150 Q156 252 156 258 V272 H100 V258 Q100 252 106 252 Z" fill="#2b2233" />

        {/* 돔 */}
        <rect x="42" y="142" width="120" height="16" rx="8" fill="#ffd966" stroke="#2b2233" strokeWidth="5" />
        <circle cx="102" cy="92" r="70" fill="url(#machine-glass)" />
        <g clipPath="url(#machine-dome-clip)">
          <g className="machine__capsules">
            {DOME_CAPSULES.map((c, i) => (
              <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`} className="machine__mini">
                <path d={`M${-c.r} 0 A${c.r} ${c.r} 0 0 1 ${c.r} 0 Z`} fill={c.color} stroke="#2b2233" strokeWidth="3" />
                <path d={`M${-c.r} 0 A${c.r} ${c.r} 0 0 0 ${c.r} 0 Z`} fill="#fffdf8" stroke="#2b2233" strokeWidth="3" />
              </g>
            ))}
          </g>
        </g>
        <circle cx="102" cy="92" r="70" fill="none" stroke="#2b2233" strokeWidth="5" />
        <path d="M60 60 Q72 40 96 34" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
        <rect x="90" y="14" width="24" height="12" rx="6" fill="#ff8fab" stroke="#2b2233" strokeWidth="4" />
      </svg>

      {showCapsule && run && (
        <button
          ref={capsuleRef}
          type="button"
          className={`machine__capsule machine__capsule--${run.rarity}${glow ? ' has-glow' : ''}${run.shiny ? ' is-shiny' : ''}`}
          onClick={open}
          disabled={phase !== 'ready'}
          aria-label="캡슐 열기"
        >
          <CapsuleShape top={capsuleTop} id={`cap-${run.id}`} />
        </button>
      )}
      {phase === 'opening' && <div className={`machine__flash machine__flash--${run?.rarity ?? 'common'}`} aria-hidden="true" />}

      <p className="machine__hint" aria-live="polite">
        {phase === 'ready'
          ? run?.rarity === 'secret'
            ? '이 캡슐… 뭔가 특별해요!'
            : '캡슐을 눌러서 열어보세요!'
          : phase === 'tease'
            ? '어… 머신이 이상해요?!'
            : phase === 'idle'
              ? ''
              : '두근두근…'}
      </p>
    </div>
  );
}
