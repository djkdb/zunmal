/**
 * 말랑 슬라이스 — 순수 시뮬레이션 (Canvas/DOM 무관, dt·RNG 주입).
 *
 * 좌표계: 논리 월드 WORLD.width × WORLD.height (y는 아래로 증가). 렌더러가 화면 크기에 맞게 스케일한다.
 *
 * 규칙
 *  - 45초 동안 아래에서 포물선으로 튀어 오르는 젤리 말랑이를 스와이프로 자른다. 탭해도 잘린다.
 *  - 일반 젤리 10점, 황금 젤리 30점. 한 번 긋는 동안 여러 개를 자르면 두 번째부터 콤보 보너스.
 *  - 가시 폭탄을 자르면 목숨 1개를 잃는다(3개). 모두 잃으면 바로 끝. 잠깐의 무적 시간 동안은 더 잃지 않는다.
 *  - 젤리를 놓쳐도 벌점은 없다 (놓친 수만 센다).
 *  - 시간이 지날수록 더 자주, 더 많이 튀어 오르고 폭탄이 늘어난다.
 */
import type { RNG } from '../../lib/rng';

export const WORLD = { width: 320, height: 480 } as const;

export const JELLY_SLICE_CONFIG = {
  durationMs: 45_000,
  lives: 3,
  /** 중력 (월드 단위/초²) */
  gravity: 520,
  jellyRadius: 29,
  bombRadius: 24,
  /** 폭탄 판정은 그림보다 조금 작게 (억울하지 않도록) */
  bombHitScale: 0.8,
  /** 젤리 판정은 그림보다 조금 크게 (탭으로도 잘 잘리도록) */
  jellyHitScale: 1.1,
  /** 꼭대기 높이 범위 (월드 y) */
  apexMinY: 60,
  apexMaxY: 190,
  /** 발사 x 여백 */
  launchMargin: 44,
  waveIntervalStart: 1700, // ms
  waveIntervalEnd: 950,
  waveSizeStart: 2, // 한 번에 최대 몇 개
  waveSizeEnd: 4,
  /** 같은 묶음 안에서 하나씩 튀어 오르는 간격 */
  waveStaggerMs: 140,
  bombChanceStart: 0.1,
  bombChanceEnd: 0.24,
  goldChance: 0.06,
  points: { jelly: 10, gold: 30 },
  /** 한 번 긋는 동안 n번째로 자른 젤리에 (n-1)×comboStep 보너스, 최대 maxComboBonus */
  comboStep: 5,
  maxComboBonus: 25,
  /** 폭탄에 맞은 뒤 이 시간 동안은 목숨을 더 잃지 않는다 */
  bombGraceMs: 700,
  /** 끝나기 직전에는 새로 던지지 않는다 (다 떨어지기 전에 끝나 억울하지 않도록) */
  spawnStopBeforeEndMs: 1500,
  /** 말랑이 모양 수 (렌더러가 캐릭터 목록에 대응) */
  variantCount: 64,
} as const;

export type JellySliceConfig = typeof JELLY_SLICE_CONFIG;
export type FlyerKind = 'jelly' | 'gold' | 'bomb';

export interface Flyer {
  id: number;
  kind: FlyerKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 회전 각(rad)과 회전 속도(rad/s) — 렌더링용 */
  angle: number;
  spin: number;
  /** 캐릭터 선택용 정수 */
  variant: number;
}

export interface PendingLaunch {
  atMs: number;
  kind: FlyerKind;
}

/** 스와이프 한 조각 (월드 좌표). 탭은 시작=끝인 조각. */
export interface SwipeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 손가락을 대고 뗄 때까지 같은 번호 */
  strokeId: number;
}

export interface SliceState {
  elapsedMs: number;
  flyers: Flyer[];
  pending: PendingLaunch[];
  nextWaveMs: number;
  nextId: number;
  score: number;
  lives: number;
  /** 현재 긋고 있는 스트로크와 그 안에서 자른 수 */
  strokeId: number;
  strokeCount: number;
  maxCombo: number;
  sliced: number;
  goldSliced: number;
  bombsHit: number;
  missed: number;
  graceUntilMs: number;
  finished: boolean;
  /** 목숨을 모두 잃어 끝났는가 */
  knockedOut: boolean;
}

export type SliceEvent =
  | {
      type: 'slice';
      kind: 'jelly' | 'gold';
      points: number;
      combo: number;
      flyer: Flyer;
      /** 자른 방향 (rad) */
      cutAngle: number;
    }
  | { type: 'bomb'; flyer: Flyer; livesLeft: number; lostLife: boolean }
  | { type: 'miss'; flyer: Flyer }
  | { type: 'launch'; flyer: Flyer };

export function createSliceState(config: JellySliceConfig = JELLY_SLICE_CONFIG): SliceState {
  return {
    elapsedMs: 0,
    flyers: [],
    pending: [],
    nextWaveMs: 300,
    nextId: 1,
    score: 0,
    lives: config.lives,
    strokeId: -1,
    strokeCount: 0,
    maxCombo: 0,
    sliced: 0,
    goldSliced: 0,
    bombsHit: 0,
    missed: 0,
    graceUntilMs: 0,
    finished: config.durationMs <= 0,
    knockedOut: false,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function difficulty(elapsedMs: number, config: JellySliceConfig = JELLY_SLICE_CONFIG) {
  const t = elapsedMs / config.durationMs;
  return {
    waveInterval: lerp(config.waveIntervalStart, config.waveIntervalEnd, t),
    waveSize: Math.round(lerp(config.waveSizeStart, config.waveSizeEnd, t)),
    bombChance: lerp(config.bombChanceStart, config.bombChanceEnd, t),
    /** 한 묶음 최대 폭탄 수 */
    maxBombs: t < 0.5 ? 1 : 2,
  };
}

/** 한 스트로크 안에서 n번째(1부터)로 자른 젤리의 보너스 */
export function comboBonus(n: number, config: JellySliceConfig = JELLY_SLICE_CONFIG): number {
  return Math.min(config.maxComboBonus, Math.max(0, n - 1) * config.comboStep);
}

/** 선분 AB와 원(중심 C, 반지름 r)이 만나는가. A=B면 점-원 판정. */
export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  return px * px + py * py <= r * r;
}

export function hitRadius(f: Flyer, config: JellySliceConfig = JELLY_SLICE_CONFIG): number {
  return f.r * (f.kind === 'bomb' ? config.bombHitScale : config.jellyHitScale);
}

/** 한 묶음(웨이브) 구성: 첫 개는 항상 젤리, 폭탄은 maxBombs까지. */
export function planWave(elapsedMs: number, rng: RNG, config: JellySliceConfig = JELLY_SLICE_CONFIG): FlyerKind[] {
  const d = difficulty(elapsedMs, config);
  const size = 1 + Math.floor(rng() * d.waveSize);
  const kinds: FlyerKind[] = [];
  let bombs = 0;
  for (let i = 0; i < size; i++) {
    const roll = rng();
    if (i > 0 && bombs < d.maxBombs && roll < d.bombChance) {
      kinds.push('bomb');
      bombs += 1;
    } else if (roll > 1 - config.goldChance) {
      kinds.push('gold');
    } else {
      kinds.push('jelly');
    }
  }
  // 폭탄이 맨 앞에만 몰리지 않도록 섞기 (첫 개는 젤리 유지)
  for (let i = kinds.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(rng() * i);
    const a = kinds[i]!;
    kinds[i] = kinds[j]!;
    kinds[j] = a;
  }
  return kinds;
}

/** 바닥 아래에서 포물선으로 튀어 오르는 비행체 하나 생성. 꼭대기 높이와 착지 x는 화면 안. */
export function launchFlyer(
  kind: FlyerKind,
  id: number,
  rng: RNG,
  config: JellySliceConfig = JELLY_SLICE_CONFIG,
): Flyer {
  const r = kind === 'bomb' ? config.bombRadius : config.jellyRadius;
  const m = config.launchMargin;
  const x = m + rng() * (WORLD.width - m * 2);
  const y = WORLD.height + r;
  const apexY = config.apexMinY + rng() * (config.apexMaxY - config.apexMinY);
  const vy = -Math.sqrt(2 * config.gravity * (y - apexY));
  const airtime = (2 * -vy) / config.gravity;
  const landX = m + rng() * (WORLD.width - m * 2);
  const vx = (landX - x) / airtime;
  return {
    id,
    kind,
    x,
    y,
    vx,
    vy,
    r,
    angle: 0,
    spin: (rng() - 0.5) * 4,
    variant: Math.floor(rng() * config.variantCount),
  };
}

/**
 * dt(ms)만큼 진행하고, 이번 프레임에 들어온 스와이프 조각으로 자르기 판정을 한다.
 * 입력 배열은 변경하지 않는다.
 */
export function stepSlice(
  prev: SliceState,
  dtMs: number,
  segments: readonly SwipeSegment[],
  rng: RNG,
  config: JellySliceConfig = JELLY_SLICE_CONFIG,
): { state: SliceState; events: SliceEvent[] } {
  if (prev.finished) return { state: prev, events: [] };
  const dt = Math.max(0, Math.min(dtMs, 50)); // 탭 전환 등 큰 dt는 잘라서 순간이동 방지
  const sec = dt / 1000;
  const events: SliceEvent[] = [];
  const s: SliceState = { ...prev, flyers: prev.flyers.slice(), pending: prev.pending.slice() };
  s.elapsedMs += dt;
  const spawning = s.elapsedMs < config.durationMs - config.spawnStopBeforeEndMs;

  // 새 묶음 예약
  s.nextWaveMs -= dt;
  while (s.nextWaveMs <= 0) {
    if (spawning) {
      const kinds = planWave(s.elapsedMs, rng, config);
      kinds.forEach((kind, i) => s.pending.push({ atMs: s.elapsedMs + i * config.waveStaggerMs, kind }));
    }
    s.nextWaveMs += difficulty(s.elapsedMs, config).waveInterval;
  }

  // 예약된 발사
  const waiting: PendingLaunch[] = [];
  for (const p of s.pending) {
    if (p.atMs <= s.elapsedMs && spawning) {
      const f = launchFlyer(p.kind, s.nextId, rng, config);
      s.nextId += 1;
      s.flyers.push(f);
      events.push({ type: 'launch', flyer: f });
    } else if (spawning) {
      waiting.push(p);
    }
  }
  s.pending = waiting;

  // 이동
  s.flyers = s.flyers.map((f) => ({
    ...f,
    x: f.x + f.vx * sec,
    y: f.y + f.vy * sec + 0.5 * config.gravity * sec * sec,
    vy: f.vy + config.gravity * sec,
    angle: f.angle + f.spin * sec,
  }));

  // 자르기 판정 (조각 순서대로)
  for (const seg of segments) {
    if (s.finished) break;
    if (seg.strokeId !== s.strokeId) {
      s.strokeId = seg.strokeId;
      s.strokeCount = 0;
    }
    const cutAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const survivors: Flyer[] = [];
    for (const f of s.flyers) {
      if (s.finished || !segmentHitsCircle(seg.x1, seg.y1, seg.x2, seg.y2, f.x, f.y, hitRadius(f, config))) {
        survivors.push(f);
        continue;
      }
      if (f.kind === 'bomb') {
        s.bombsHit += 1;
        const lostLife = s.elapsedMs >= s.graceUntilMs;
        if (lostLife) {
          s.lives -= 1;
          s.graceUntilMs = s.elapsedMs + config.bombGraceMs;
        }
        s.strokeCount = 0;
        events.push({ type: 'bomb', flyer: f, livesLeft: s.lives, lostLife });
        if (s.lives <= 0) {
          s.finished = true;
          s.knockedOut = true;
        }
        continue;
      }
      s.strokeCount += 1;
      s.maxCombo = Math.max(s.maxCombo, s.strokeCount);
      const points = config.points[f.kind] + comboBonus(s.strokeCount, config);
      s.score += points;
      s.sliced += 1;
      if (f.kind === 'gold') s.goldSliced += 1;
      events.push({
        type: 'slice',
        kind: f.kind,
        points,
        combo: s.strokeCount,
        flyer: f,
        // 탭(길이 0)은 비스듬히 자른 것으로
        cutAngle: seg.x1 === seg.x2 && seg.y1 === seg.y2 ? -Math.PI / 4 : cutAngle,
      });
    }
    s.flyers = survivors;
  }

  // 떨어진 것 정리 (내려오는 중에 바닥 아래로 나감)
  s.flyers = s.flyers.filter((f) => {
    const gone = f.vy > 0 && f.y - f.r > WORLD.height;
    if (gone && f.kind !== 'bomb') {
      s.missed += 1;
      events.push({ type: 'miss', flyer: f });
    }
    return !gone;
  });

  if (s.elapsedMs >= config.durationMs) s.finished = true;
  return { state: s, events };
}
