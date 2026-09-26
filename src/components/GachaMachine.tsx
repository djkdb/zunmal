import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { playRarityFanfare, sfx } from '../audio/sfx';
import { rarityRank, type Rarity } from '../data/rarity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { buzz } from './pullHaptics';
import { getLoadedMachine3d, isMachine3dUnsupported, markMachine3dUnsupported, preloadMachine3d } from './machine3d/loadMachine3d';
import type { MachineScene } from './machine3d/machineScene';
import './GachaMachine.css';

/** 3D 머신 모듈을 이만큼 안에 못 받으면 이번 방문은 SVG 머신 그대로 */
const LOAD_WAIT_MS = 1500;

/** 개발 서버에서만: 소프트웨어 WebGL(swiftshader) 스크린숏용으로 성능 조절(SVG 전환)을 끈다 */
function keep3dForTests(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('machine-keep-3d') === '1';
  } catch {
    return false;
  }
}

/** 캡슐 색 (위쪽 반구). 희귀도 힌트 — 텍스트는 결과 화면에서 제공. */
const CAPSULE_TOP: Record<Rarity, string> = {
  common: '#dfe7f1',
  rare: '#7fbfff',
  epic: '#c79bff',
  legendary: '#ffc94d',
  mythic: 'rainbow',
  secret: 'cosmic',
};

/** 돔 안에 보이는 장식용 캡슐 배치 */
const DOME_CAPSULES: { x: number; y: number; r: number; color: string; rot: number }[] = [
  { x: 84, y: 86, r: 18, color: '#cdbfea', rot: 0 },
  { x: 124, y: 80, r: 18, color: '#b5e3c8', rot: 0 },
  { x: 62, y: 120, r: 18, color: '#ff9fb8', rot: -6 },
  { x: 101, y: 122, r: 19, color: '#8fc3ff', rot: 0 },
  { x: 140, y: 116, r: 18, color: '#ffd66b', rot: 6 },
  { x: 44, y: 150, r: 16, color: '#ffd66b', rot: 0 },
  { x: 80, y: 154, r: 18, color: '#8fc3ff', rot: 4 },
  { x: 120, y: 156, r: 18, color: '#ff9fb8', rot: -4 },
  { x: 158, y: 148, r: 16, color: '#cdbfea', rot: 0 },
];

/** 캡슐 주위 반짝이 위치 (%, 캡슐 상자 기준) · 크기 · 시작 지연 */
const SPARKLES: { x: number; y: number; s: number; d: number }[] = [
  { x: -8, y: 12, s: 1, d: 0 },
  { x: 104, y: 20, s: 0.8, d: 180 },
  { x: 92, y: 92, s: 1.1, d: 360 },
  { x: 2, y: 86, s: 0.7, d: 520 },
  { x: 50, y: -14, s: 0.9, d: 260 },
  { x: 118, y: 58, s: 0.6, d: 640 },
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
        <path d="M-30 0 A30 30 0 0 0 30 0 Z" fill="#fff" stroke="#1a4080" strokeOpacity="0.14" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g className="capsule-top">
        <path d="M-30 0 A30 30 0 0 1 30 0 Z" fill={fill} stroke="#1a4080" strokeOpacity="0.14" strokeWidth="2" strokeLinejoin="round" />
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
      <rect x="-30" y="-2" width="60" height="4" rx="2" fill="#fff" className="capsule-band" />
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

  // ── 3D 머신: 받아지면 SVG 머신 위에 겹쳐 그린다 (움직임 줄이기·WebGL 없음·느림이면 SVG 그대로) ──
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MachineScene | null>(null);
  const [is3d, setIs3d] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const swapWhenIdle = useRef(false);

  useEffect(() => {
    if (reduced || isMachine3dUnsupported()) return undefined;
    let cancelled = false;
    const started = performance.now();
    const teardown = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setIs3d(false);
    };
    const mount = (m: NonNullable<ReturnType<typeof getLoadedMachine3d>>) => {
      // 연출 도중에 모습이 바뀌지 않게 가만히 있을 때만 바꾼다
      if (cancelled || sceneRef.current || !stageRef.current || phaseRef.current !== 'idle') return;
      try {
        const scene = m.createMachineScene({
          container: stageRef.current,
          noGovernor: keep3dForTests(),
          onSlow: () => {
            markMachine3dUnsupported();
            teardown();
          },
          onHeroRect: ({ x, y, size }) => {
            const el = rootRef.current;
            if (!el) return;
            el.style.setProperty('--hero-x', `${x}px`);
            el.style.setProperty('--hero-y', `${y}px`);
            el.style.setProperty('--hero-size', `${size}px`);
          },
        });
        sceneRef.current = scene;
        if (import.meta.env.DEV) (window as unknown as { __machine3dStats?: unknown }).__machine3dStats = () => sceneRef.current?.stats();
        void scene.ready.then(() => {
          if (cancelled || sceneRef.current !== scene) return;
          // 준비되는 사이 뽑기가 시작됐으면 연출이 끝나고 가만해질 때 바꾼다
          if (phaseRef.current === 'idle') setIs3d(true);
          else swapWhenIdle.current = true;
        });
      } catch {
        markMachine3dUnsupported();
      }
    };
    const ready = getLoadedMachine3d();
    if (ready) mount(ready);
    else
      void preloadMachine3d().then((m) => {
        if (m && performance.now() - started <= LOAD_WAIT_MS) mount(m);
      });
    return () => {
      cancelled = true;
      teardown();
    };
  }, [reduced]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (phase === 'idle' && swapWhenIdle.current) {
      swapWhenIdle.current = false;
      setIs3d(true);
    }
    const ms = phase === 'idle' || phase === 'ready' ? 1 : TIMINGS.normal[phase];
    scene.setPhase(phase, run ? { rarity: run.rarity, shiny: run.shiny } : null, ms);
  }, [phase, run?.id, is3d]);

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
      // 착지음은 등급이 높을수록 높게. 전설 이상은 착지하는 순간 금빛으로 "승격"되며 짧게 진동
      const rank = rarityRank(run.rarity);
      sfx.tap(4 + rank * 2);
      if (rank >= rarityRank('legendary')) buzz(30, reduced);
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
  // 전설 캡슐은 떨어지는 동안 에픽(보라)으로 보이다가 착지하는 순간 금색으로 바뀐다 (승격 연출)
  const capsuleTop = !run
    ? CAPSULE_TOP.common
    : run.rarity === 'legendary' && phase === 'dropping' && !reduced
      ? CAPSULE_TOP.epic
      : CAPSULE_TOP[run.rarity];
  const rank = run ? rarityRank(run.rarity) : 0;
  const rarityClass = run && phase !== 'idle' && phase !== 'inserting' ? ` machine--r-${run.rarity}` : '';

  return (
    <div ref={rootRef} className={`machine machine--${phase}${rarityClass}${is3d ? ' machine--3d' : ''}`}>
      <div
        ref={stageRef}
        className="machine__stage3d"
        aria-hidden="true"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          sceneRef.current?.poke((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
      />
      <svg className="machine__svg" viewBox="0 0 204 300" role="img" aria-label="말랑 캡슐 머신">
        <defs>
          <radialGradient id="machine-glass" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="0.65" stopColor="#f2f8ff" stopOpacity="0.62" />
            <stop offset="1" stopColor="#d6e9ff" stopOpacity="0.6" />
          </radialGradient>
          <linearGradient id="machine-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb3c6" />
            <stop offset="1" stopColor="#ff97b2" />
          </linearGradient>
          <filter id="machine-soft" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#1a4080" floodOpacity="0.16" />
          </filter>
          <filter id="machine-cap-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1a4080" floodOpacity="0.18" />
          </filter>
          <clipPath id="machine-dome-clip">
            <circle cx="102" cy="94" r="76" />
          </clipPath>
        </defs>

        {/* 바닥 그림자 */}
        <ellipse cx="102" cy="290" rx="84" ry="6" fill="#1a4080" opacity="0.1" />

        {/* 돔: 반투명 흰 유리 + 캡슐 (몸통이 아랫부분을 덮는다) */}
        <circle cx="102" cy="94" r="76" fill="url(#machine-glass)" filter="url(#machine-soft)" />
        <g clipPath="url(#machine-dome-clip)">
          <g className="machine__capsules" filter="url(#machine-cap-shadow)">
            {DOME_CAPSULES.map((c, i) => (
              <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`} className="machine__mini">
                <circle r={c.r} fill={c.color} />
                <rect x={-c.r} y="-1.2" width={c.r * 2} height="2.4" fill="#fff" />
                <ellipse cx={-c.r * 0.35} cy={-c.r * 0.5} rx={c.r * 0.32} ry={c.r * 0.16} fill="#fff" opacity="0.55" />
              </g>
            ))}
          </g>
        </g>
        <circle cx="102" cy="94" r="76" fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.95" />
        <ellipse cx="72" cy="46" rx="20" ry="8" fill="#fff" opacity="0.85" transform="rotate(-24 72 46)" />

        {/* 몸통 */}
        <rect x="14" y="156" width="176" height="126" rx="28" fill="url(#machine-body)" filter="url(#machine-soft)" />
        <path d="M40 162 H164" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.35" />

        {/* 이름표 */}
        <rect x="56" y="170" width="92" height="22" rx="11" fill="#fff" />
        <text x="102" y="185.5" textAnchor="middle" className="machine__label">
          MALANG
        </text>

        {/* 코인 슬롯 */}
        <g className="machine__slot">
          <rect x="150" y="204" width="18" height="24" rx="6" fill="#fff" opacity="0.9" />
          <rect x="157" y="209" width="4" height="14" rx="2" fill="#5b4a60" />
        </g>
        <g className="machine__coin">
          <circle cx="159" cy="196" r="8" fill="#ffd35c" stroke="#d99a1e" strokeWidth="2" />
        </g>

        {/* 손잡이 */}
        <g className="machine__knob">
          <circle cx="60" cy="230" r="22" fill="#fff" filter="url(#machine-cap-shadow)" />
          <rect x="46" y="226" width="28" height="8" rx="4" fill="#ff9fb8" />
        </g>

        {/* 배출구 */}
        <rect x="112" y="238" width="62" height="28" rx="11" fill="#5b4a60" />
        <rect x="118" y="241" width="50" height="4" rx="2" fill="#fff" opacity="0.12" />
      </svg>

      {/* 원신식 예고: 캡슐 뒤 빛이 묶음 최고 등급을 알린다. 일반·레어는 잔잔하게, 에픽은 보라 반짝이,
          전설은 보라로 떨어지다가 착지하는 순간 금빛으로 터진다. */}
      {showCapsule && run && rank >= 1 && (
        <div className={`machine__aura machine__aura--${run.rarity}`} aria-hidden="true">
          <span className="machine__glow" />
          {rank >= rarityRank('legendary') && <span className="machine__rays" />}
          {rank >= rarityRank('legendary') && <span className="machine__ring" />}
          {rank >= rarityRank('epic') &&
            SPARKLES.map((sp, i) => (
              <span
                key={i}
                className="machine__spark"
                style={{ '--x': `${sp.x}%`, '--y': `${sp.y}%`, '--s': sp.s, '--d': `${sp.d}ms` } as CSSProperties}
              />
            ))}
        </div>
      )}
      {showCapsule && run && (
        <button
          ref={capsuleRef}
          type="button"
          className={`machine__capsule machine__capsule--${run.rarity}${run.shiny ? ' is-shiny' : ''}`}
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
            : rank >= rarityRank('legendary')
              ? '금빛 캡슐! 눌러서 열어 보세요'
              : rank === rarityRank('epic')
                ? '보랏빛 캡슐! 눌러서 열어 보세요'
                : '캡슐을 눌러서 열어 보세요!'
          : phase === 'tease'
            ? '어… 머신이 이상해요?!'
            : phase === 'idle'
              ? ''
              : '두근두근…'}
      </p>
    </div>
  );
}
