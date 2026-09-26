/**
 * 놀이방 성능 조절 (순수 모듈, 프레임 간격을 주입받는다).
 *
 * - 폰은 매트에 3마리까지로 시작, 계속 움직이는 동안 55fps 이상을 지키면 5마리까지 연다.
 * - 3D 가 35fps 아래로 계속 떨어지면 2D 로 내린다 (3D 해상도는 jellyScene 이 먼저 낮춘다).
 * - 2D 에서도 30fps 아래면 올릴 수 있는 수를 줄인다 (이미 나와 있는 말랑이를 치우지는 않는다).
 * 연속으로 그리는 중의 간격만 잰다 (멈췄다 다시 그리는 긴 간격은 버린다).
 */

export type RenderQuality = '3d' | '2d';

export interface PerfState {
  cap: number;
  quality: RenderQuality;
  emaMs: number;
  /** 마지막 결정 뒤 모은 표본 수 */
  samples: number;
  /** 한 번 올리면 다시 올리지 않는다 (왔다 갔다 방지) */
  upgraded: boolean;
}

export const PERF_TUNING = {
  phoneCap: 3,
  desktopCap: 5,
  maxCap: 5,
  minCap: 2,
  /** 결정 전에 모을 연속 프레임 수 (약 2초) */
  minSamples: 120,
  /** 이 간격보다 긴 프레임은 멈췄다 다시 그린 것 → 버린다 */
  maxGapMs: 100,
  alpha: 0.05,
  /** ≥ 55fps */
  goodMs: 1000 / 55,
  /** < 35fps 면 3D → 2D */
  slow3dMs: 1000 / 35,
  /** < 30fps 면 상한을 줄인다 */
  slow2dMs: 1000 / 30,
} as const;

export function createPerf(options: { phone: boolean; quality: RenderQuality }): PerfState {
  return {
    cap: options.phone ? PERF_TUNING.phoneCap : PERF_TUNING.desktopCap,
    quality: options.quality,
    emaMs: 0,
    samples: 0,
    upgraded: false,
  };
}

/** 한 프레임 간격을 넣고 새 상태를 돌려준다 (바뀌지 않으면 같은 객체) */
export function samplePerf(state: PerfState, gapMs: number): PerfState {
  if (!Number.isFinite(gapMs) || gapMs <= 0 || gapMs > PERF_TUNING.maxGapMs) return state;
  const emaMs = state.samples === 0 ? gapMs : state.emaMs + (gapMs - state.emaMs) * PERF_TUNING.alpha;
  const samples = state.samples + 1;
  const next = { ...state, emaMs, samples };
  if (samples < PERF_TUNING.minSamples) return next;
  if (state.quality === '3d' && emaMs > PERF_TUNING.slow3dMs) {
    return { ...next, quality: '2d', samples: 0 };
  }
  if (state.quality === '2d' && emaMs > PERF_TUNING.slow2dMs && state.cap > PERF_TUNING.minCap) {
    return { ...next, cap: state.cap - 1, samples: 0 };
  }
  if (!state.upgraded && emaMs <= PERF_TUNING.goodMs && state.cap < PERF_TUNING.maxCap) {
    return { ...next, cap: PERF_TUNING.maxCap, upgraded: true, samples: 0 };
  }
  return next;
}

/** 이 화면을 폰으로 볼까 (굵은 손가락 입력이거나 짧은 변이 600px 미만) */
export function looksLikePhone(coarsePointer: boolean, width: number, height: number): boolean {
  return coarsePointer || Math.min(width, height) < 600;
}
