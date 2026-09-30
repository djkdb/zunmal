/**
 * 신화·시크릿 등장 연출의 감독 — 순수 데이터 + 계산 (three.js/DOM/시간 무관, 테스트 있음).
 *
 * 연출은 한 덩어리 효과가 아니라 여러 "컷"이다. 컷마다 시작·길이, 카메라(구도와 움직임), 무엇이 보이는지,
 * 들어오는 전환(딱 끊기·흰 번쩍·조리개·휙 돌리기·영화 띠·줌 관통), 소리 신호가 있다.
 * 3D 장면(scene3d.ts)·2D 대체(fallback2d.ts)·DOM 층(EpicReveal.tsx)이 모두 이 표 하나를 같은 시계로 읽는다.
 *
 * 깜빡임 안전: 화면 전체 흰 번쩍·색 반전은 `flashes`에만 두고 어느 1초 안에도 3번 이하(WCAG 2.3.1),
 * 색 반전은 시크릿에 한 번, `INVERT_MS`(50ms, 60fps에서 3프레임) 이하. 움직임 줄이기면 아예 없다(정지 카드).
 */

export type EpicTier = 'mythic' | 'secret';

/** 컷 이름 */
export type ShotId =
  // 신화
  | 'chute'
  | 'rise'
  | 'burst'
  // 시크릿
  | 'omen'
  | 'comet'
  | 'rings'
  | 'implode'
  | 'supernova'
  | 'silhouette'
  // 공통
  | 'world'
  | 'hero'
  | 'title';

/** 구도 */
export type CameraKind = 'close' | 'wide' | 'orbit' | 'low' | 'high' | 'push' | 'travel' | 'static';

/** 컷으로 들어오는 방법 */
export type Transition =
  | 'none' // 같은 컷이 이어짐 (카메라만 계속)
  | 'cut' // 딱 끊기
  | 'fade' // 검은 화면에서 밝아짐
  | 'flash' // 흰 번쩍
  | 'iris' // 가운데서 둥글게 열림
  | 'whip' // 옆으로 휙 돌림 (흐린 줄무늬)
  | 'zoom' // 빛 속으로 줌 관통 (방사 흐림)
  | 'letterbox'; // 영화 띠가 밀려 들어옴

/** 카메라 자세: 목표점 둘레의 구면 좌표 (세계 단위·라디안·도) */
export interface CamPose {
  /** 목표점까지 거리 (기본 10) */
  dist: number;
  /** 옆으로 돈 각도 (+ = 오른쪽에서 봄) */
  yaw: number;
  /** 위아래 각도 (+ = 위에서 내려다봄, − = 아래에서 올려다봄) */
  pitch: number;
  /** 목표점 높이 */
  lift: number;
  /** 화면 기울기 */
  roll: number;
  /** 세로 시야각 (도) */
  fov: number;
}

export type Ease = 'linear' | 'in' | 'out' | 'inOut';

export interface CameraMove {
  kind: CameraKind;
  from: CamPose;
  to: CamPose;
  ease: Ease;
  /** 흔들림 세기 (0이면 없음) — 컷 첫머리에서 가장 크고 잦아든다 */
  shake?: number;
}

/** 소리 신호 (EpicReveal이 sfx로 옮긴다) */
export type CueKind =
  | 'tease' // 낮은 웅웅거림
  | 'riser' // 차오르는 소리 (seconds)
  | 'whoosh' // 컷 넘김 바람 소리
  | 'land' // 혜성 착지
  | 'ringLock' // 빛 고리가 제자리에 딸깍 (index = 몇 번째)
  | 'implode' // 한 점으로 빨려 듦 (seconds)
  | 'hush' // 완전 무음 (seconds)
  | 'impact' // 캡슐이 터지는 쿵
  | 'boom' // 초신성
  | 'fanfare' // 등급 팡파레
  | 'chime' // 제목 도장 반짝
  | 'vibrate'; // 진동 (pattern)

export interface Cue {
  kind: CueKind;
  /** 컷 시작부터 (ms) */
  at: number;
  seconds?: number;
  index?: number;
  pattern?: readonly number[];
}

export type FlashKind = 'white' | 'invert';

export interface Flash {
  kind: FlashKind;
  /** 컷 시작부터 (ms) */
  at: number;
  /** 보이는 길이 (ms) — 흰 번쩍은 서서히 사라지는 길이 */
  ms: number;
  /** 최대 불투명도 (0~1) */
  peak: number;
}

/** 말랑이(DOM) 모습 */
export type MalangShow = 'hidden' | 'drop' | 'silhouette' | 'full';

export interface Shot {
  id: ShotId;
  /** 타임라인 시작 (ms) */
  start: number;
  duration: number;
  camera: CameraMove;
  transitionIn: Transition;
  /** 영화 띠를 보이는지 */
  letterbox: boolean;
  /** 캡슐이 화면에 있는지 */
  capsule: boolean;
  /** 모티프 세계가 뒤에 있는지 */
  world: boolean;
  malang: MalangShow;
  /** 제목 도장 */
  title: boolean;
  cues: readonly Cue[];
  flashes: readonly Flash[];
}

export interface Timeline {
  tier: EpicTier;
  /** 모티프 세계 컷 이름 (themes.ts의 world.id) */
  worldId: string;
  shots: readonly Shot[];
  total: number;
  /** 건너뛰면 오는 곳 = 마지막 카드(제목) 시작 */
  finalStart: number;
}

/** 모티프 세계 컷 설정 (themes.ts의 테마마다 하나) */
export interface WorldShot {
  id: string;
  camera: CameraMove;
  /** 세계 컷 안의 추가 소리 (예: 고래 물줄기) */
  cues?: readonly Cue[];
}

export const INVERT_MS = 50;
/** 어느 1초 안에도 전체 화면 번쩍임은 이 수 이하 */
export const MAX_FLASHES_PER_SECOND = 3;

export const BASE_POSE: CamPose = { dist: 10, yaw: 0, pitch: 0, lift: 0, roll: 0, fov: 50 };

export function pose(p: Partial<CamPose>): CamPose {
  return { ...BASE_POSE, ...p };
}

function move(kind: CameraKind, from: Partial<CamPose>, to: Partial<CamPose>, ease: Ease = 'inOut', shake = 0): CameraMove {
  return { kind, from: pose(from), to: pose(to), ease, ...(shake ? { shake } : {}) };
}

type ShotDraft = Omit<Shot, 'start'>;

const HIDE = { capsule: false, world: false, malang: 'hidden' as MalangShow, title: false };

function mythicShots(world: WorldShot): ShotDraft[] {
  return [
    {
      // 1) 어두운 기계 배출구 속 캡슐 클로즈업 — 가장자리 빛이 기어가고 금이 테마 색으로 달아오른다
      id: 'chute',
      duration: 1100,
      camera: move('close', { dist: 8.6, yaw: 0.3, pitch: 0.1, fov: 40 }, { dist: 7.4, yaw: 0.1, pitch: 0.04, fov: 40 }, 'out'),
      transitionIn: 'fade',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [
        { kind: 'tease', at: 0 },
        { kind: 'riser', at: 150, seconds: 2.25 },
      ],
      flashes: [],
    },
    {
      // 2) 딱 끊고 넓게: 캡슐이 떠올라 돌고, 카메라가 둘레를 돌며 빛가루가 소용돌이쳐 빨려 든다
      id: 'rise',
      duration: 1200,
      camera: move('orbit', { dist: 12.5, yaw: -0.85, pitch: 0.18, lift: -0.6 }, { dist: 9.2, yaw: 0.55, pitch: -0.05, lift: 0 }, 'inOut'),
      transitionIn: 'cut',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [{ kind: 'whoosh', at: 0 }],
      flashes: [],
    },
    {
      // 3) 금이 터지며 흰 번쩍
      id: 'burst',
      duration: 500,
      camera: move('push', { dist: 8.2 }, { dist: 6.8 }, 'out', 0.55),
      transitionIn: 'cut',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [
        { kind: 'impact', at: 0 },
        { kind: 'vibrate', at: 0, pattern: [40, 30, 90] },
      ],
      flashes: [{ kind: 'white', at: 0, ms: 420, peak: 0.95 }],
    },
    {
      // 4) 빛 속으로 줌 관통 → 말랑이마다 다른 세계
      id: 'world',
      duration: 1600,
      camera: world.camera,
      transitionIn: 'zoom',
      letterbox: true,
      ...HIDE,
      world: true,
      cues: [{ kind: 'whoosh', at: 0 }, ...(world.cues ?? [])],
      flashes: [],
    },
    {
      // 5) 휙 돌려 정면: 말랑이가 떨어져 내려와 자세를 잡고 카메라가 다가간다
      id: 'hero',
      duration: 650,
      camera: move('push', { dist: 11, yaw: -0.08 }, { dist: 9.6, yaw: 0 }, 'out'),
      transitionIn: 'whip',
      letterbox: false,
      ...HIDE,
      world: true,
      malang: 'drop',
      cues: [
        { kind: 'fanfare', at: 0 },
        { kind: 'vibrate', at: 380, pattern: [30] },
      ],
      flashes: [],
    },
    {
      // 이름 + "신화!" 도장 (마지막 카드)
      id: 'title',
      duration: 1950,
      camera: move('push', { dist: 9.6 }, { dist: 9.1 }, 'linear'),
      transitionIn: 'none',
      letterbox: false,
      ...HIDE,
      world: true,
      malang: 'full',
      title: true,
      cues: [{ kind: 'chime', at: 0 }],
      flashes: [],
    },
  ];
}

function secretShots(world: WorldShot): ShotDraft[] {
  return [
    {
      // 1) 완전 암전, 별 하나가 반짝 — 영화 띠가 밀려 든다
      id: 'omen',
      duration: 1300,
      camera: move('static', { dist: 10 }, { dist: 9.7 }, 'linear'),
      transitionIn: 'letterbox',
      letterbox: true,
      ...HIDE,
      cues: [{ kind: 'tease', at: 0 }],
      flashes: [],
    },
    {
      // 2) 별이 혜성처럼 떨어져 캡슐에 쾅
      id: 'comet',
      duration: 1000,
      camera: move('high', { dist: 11.5, pitch: 0.32, lift: 1.2 }, { dist: 10, pitch: 0.22, lift: 0 }, 'in'),
      transitionIn: 'cut',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [
        { kind: 'whoosh', at: 0 },
        { kind: 'land', at: 760 },
        { kind: 'vibrate', at: 760, pattern: [50] },
      ],
      flashes: [],
    },
    {
      // 3) 올려다보는 구도: 혼천의 빛 고리가 하나씩 딸깍 잠긴다
      id: 'rings',
      duration: 2000,
      camera: move('low', { dist: 8.8, yaw: 0.35, pitch: -0.42, lift: 0.4 }, { dist: 8, yaw: -0.3, pitch: -0.3, lift: 0.2 }, 'inOut'),
      transitionIn: 'cut',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [
        { kind: 'riser', at: 0, seconds: 2 },
        { kind: 'ringLock', at: RING_LOCKS[0], index: 0 },
        { kind: 'ringLock', at: RING_LOCKS[1], index: 1 },
        { kind: 'ringLock', at: RING_LOCKS[2], index: 2 },
      ],
      flashes: [],
    },
    {
      // 4) 모든 빛이 한 점으로 → 완전 무음
      id: 'implode',
      duration: IMPLODE_SUCK_MS + SILENCE_MS,
      camera: move('push', { dist: 8 }, { dist: 5.6 }, 'in'),
      transitionIn: 'none',
      letterbox: true,
      ...HIDE,
      capsule: true,
      cues: [
        { kind: 'implode', at: 0, seconds: IMPLODE_SUCK_MS / 1000 },
        { kind: 'hush', at: IMPLODE_SUCK_MS, seconds: SILENCE_MS / 1000 + 0.3 },
      ],
      flashes: [],
    },
    {
      // 5) 폭발 + 0.32초 뒤 초신성, 첫 순간 색 반전 한 프레임
      id: 'supernova',
      duration: 900,
      camera: move('wide', { dist: 12.5 }, { dist: 11.2 }, 'out', 0.75),
      transitionIn: 'cut',
      letterbox: true,
      ...HIDE,
      cues: [
        { kind: 'impact', at: 0 },
        { kind: 'vibrate', at: 0, pattern: [40, 30, 90] },
        { kind: 'boom', at: SUPERNOVA_DELAY },
        { kind: 'vibrate', at: SUPERNOVA_DELAY, pattern: [120, 40, 200] },
      ],
      flashes: [
        { kind: 'invert', at: 0, ms: INVERT_MS, peak: 1 },
        { kind: 'white', at: SUPERNOVA_DELAY, ms: 420, peak: 0.6 },
      ],
    },
    {
      // 6) 빛 조리개가 열리며 말랑이마다 다른 세계
      id: 'world',
      duration: 1600,
      camera: world.camera,
      transitionIn: 'iris',
      letterbox: true,
      ...HIDE,
      world: true,
      cues: [{ kind: 'whoosh', at: 0 }, ...(world.cues ?? [])],
      flashes: [],
    },
    {
      // 7) 휙 돌려 클로즈업: 역광 속 실루엣 → 색이 번진다
      id: 'silhouette',
      duration: 700,
      camera: move('close', { dist: 7.4, yaw: 0.12 }, { dist: 6.6, yaw: 0 }, 'out'),
      transitionIn: 'whip',
      letterbox: true,
      ...HIDE,
      world: true,
      malang: 'silhouette',
      cues: [{ kind: 'fanfare', at: 0 }],
      flashes: [],
    },
    {
      // 8) 한 걸음 물러나 고리가 말랑이를 두르고, 제목이 한 글자씩 찍힌다 (마지막 카드)
      id: 'title',
      duration: 1780,
      camera: move('push', { dist: 10.4 }, { dist: 9.6 }, 'out'),
      transitionIn: 'cut',
      letterbox: false,
      ...HIDE,
      world: true,
      malang: 'full',
      title: true,
      cues: [{ kind: 'chime', at: 350 }],
      flashes: [],
    },
  ];
}

/** 시크릿 고리가 잠기는 때 (rings 컷 안, ms) */
export const RING_LOCKS = [300, 850, 1400] as const;
/** 고리 하나가 날아와 잠기기까지 */
export const RING_LOCK_MS = 380;
/** 수축과 무음 */
export const IMPLODE_SUCK_MS = 320;
export const SILENCE_MS = 400;
/** 첫 폭발 → 초신성 */
export const SUPERNOVA_DELAY = 320;

export function buildTimeline(tier: EpicTier, world: WorldShot): Timeline {
  const drafts = tier === 'secret' ? secretShots(world) : mythicShots(world);
  let at = 0;
  const shots: Shot[] = drafts.map((d) => {
    const s: Shot = { ...d, start: at };
    at += d.duration;
    return s;
  });
  const last = shots[shots.length - 1];
  return { tier, worldId: world.id, shots, total: at, finalStart: last ? last.start : 0 };
}

export interface ShotAt {
  shot: Shot;
  index: number;
  /** 컷 시작부터 (ms) */
  local: number;
  /** 0~1 */
  progress: number;
}

/** t(ms)에 보이는 컷. 범위를 넘으면 첫/마지막 컷에 붙인다 */
export function shotAt(tl: Timeline, t: number): ShotAt {
  const shots = tl.shots;
  let index = shots.length - 1;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]!;
    if (t < s.start + s.duration) {
      index = i;
      break;
    }
  }
  const shot = shots[Math.max(0, index)]!;
  const local = Math.min(shot.duration, Math.max(0, t - shot.start));
  return { shot, index: Math.max(0, index), local, progress: shot.duration > 0 ? local / shot.duration : 1 };
}

/** 건너뛰기: 마지막 카드 전이면 마지막 카드 시작으로, 이미 마지막 카드면 null(= 끝내기) */
export function skipTarget(tl: Timeline, t: number): number | null {
  return t < tl.finalStart ? tl.finalStart : null;
}

export interface TimedCue extends Cue {
  /** 타임라인 기준 (ms) */
  time: number;
  shot: ShotId;
}

/** 모든 소리 신호를 시간 순서로 */
export function timelineCues(tl: Timeline): TimedCue[] {
  return tl.shots
    .flatMap((s) => s.cues.map((c) => ({ ...c, time: s.start + c.at, shot: s.id })))
    .sort((a, b) => a.time - b.time);
}

export interface TimedFlash extends Flash {
  time: number;
}

export function timelineFlashes(tl: Timeline): TimedFlash[] {
  return tl.shots.flatMap((s) => s.flashes.map((f) => ({ ...f, time: s.start + f.at }))).sort((a, b) => a.time - b.time);
}

/** 어느 1초 창 안에 들어가는 번쩍임의 최대 수 */
export function maxFlashesPerSecond(tl: Timeline): number {
  const fs = timelineFlashes(tl);
  let best = 0;
  for (let i = 0; i < fs.length; i++) {
    let n = 0;
    for (let j = i; j < fs.length && fs[j]!.time - fs[i]!.time < 1000; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

export function ease(kind: Ease, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'inOut':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    default:
      return x;
  }
}

/** 컷 진행(0~1)에서의 카메라 자세 */
export function cameraAt(m: CameraMove, progress: number): CamPose {
  const k = ease(m.ease, progress);
  const lerp = (a: number, b: number) => a * (1 - k) + b * k;
  return {
    dist: lerp(m.from.dist, m.to.dist),
    yaw: lerp(m.from.yaw, m.to.yaw),
    pitch: lerp(m.from.pitch, m.to.pitch),
    lift: lerp(m.from.lift, m.to.lift),
    roll: lerp(m.from.roll, m.to.roll),
    fov: lerp(m.from.fov, m.to.fov),
  };
}

/** 흔들림 세기: 컷 첫머리가 가장 세고 지수로 잦아든다 */
export function shakeAt(m: CameraMove, localMs: number): number {
  return (m.shake ?? 0) * Math.exp(-localMs / 220);
}

/** 이 컷에서 소리 신호를 이미 지났는지 (건너뛰기 뒤 빠진 팡파레 판단용) */
export function cuePassed(tl: Timeline, kind: CueKind, t: number): boolean {
  return timelineCues(tl).some((c) => c.kind === kind && c.time <= t);
}
