/**
 * 놀이방 캡슐 열기 손짓 (순수 모듈, 좌표·시간 주입).
 *
 * 세 가지 방법 중 무엇이든:
 *  1. 두 손가락으로 비틀기 — 두 손가락을 잇는 선이 70° 넘게 돌면
 *  2. 두 손가락으로 반쪽을 벌리기 — 두 손가락 사이가 45% 넘게 벌어지면
 *  3. 한 손가락 (접근성·한 손): 톡 세 번 또는 꾹 0.9초.
 *     톡은 금이 가는 단계로 쌓인다 — 앞 톡에서 2.2초 안에 다시 톡 하면 이어진다(천천히 눌러도 열린다).
 * 진행도(0..1)는 캡슐이 조금씩 비틀리고 벌어지는 모습과 딸깍 소리에 쓴다.
 */

/** 매트 위 캡슐 머리 위에 보이는 여는 방법 (한 손가락 방법만 — 가장 쉬운 것) */
export const CAPSULE_HINT = '톡톡톡 세 번 두드리거나 꾹 눌러요';

export interface Pt {
  x: number;
  y: number;
}

export const CAPSULE_TUNING = {
  /** 이만큼(rad) 비틀면 열린다 (약 70°) */
  twistOpen: 1.22,
  /** 두 손가락 사이가 이 비율만큼 벌어지면 열린다 */
  spreadOpen: 0.45,
  tapsToOpen: 3,
  /** 앞 톡에서 이 시간 안에 다시 톡 하면 금 간 단계가 이어진다. 넘기면 처음부터 */
  tapWindowMs: 2200,
  holdOpenMs: 900,
  /** 딸깍 소리 간격 (rad) — 비트는 동안 톱니처럼 */
  ratchetStep: 0.35,
} as const;

function angle(a: Pt, b: Pt): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** −π..π 로 */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export interface TwoFingerReading {
  /** 비튼 각도 (rad, 부호 있음) */
  twist: number;
  /** 벌어진 비율 (0 = 그대로) */
  spread: number;
  /** 0..1 */
  progress: number;
}

/** 두 손가락 시작 위치(a0, b0) → 지금 위치(a1, b1) */
export function readTwoFinger(a0: Pt, b0: Pt, a1: Pt, b1: Pt): TwoFingerReading {
  const twist = wrapAngle(angle(a1, b1) - angle(a0, b0));
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const spread = d0 > 4 ? Math.max(0, d1 / d0 - 1) : 0;
  const progress = Math.min(
    1,
    Math.max(Math.abs(twist) / CAPSULE_TUNING.twistOpen, spread / CAPSULE_TUNING.spreadOpen),
  );
  return { twist, spread, progress };
}

/** 비틀기 톱니: 지난 칸 → 지금 칸이 바뀌면 딸깍 */
export function ratchetIndex(twist: number): number {
  return Math.floor(Math.abs(twist) / CAPSULE_TUNING.ratchetStep);
}

/**
 * 한 손가락 톡: 톡 목록에 now 를 더하고 진행도(금 간 단계 / tapsToOpen)를 돌려준다.
 * 바로 앞 톡과의 간격이 tapWindowMs 안이면 이어서 세고, 넘으면 이번 톡부터 다시 센다.
 */
export function registerCapsuleTap(taps: readonly number[], now: number): { taps: number[]; progress: number } {
  const last = taps[taps.length - 1];
  const chain = last !== undefined && now - last >= 0 && now - last < CAPSULE_TUNING.tapWindowMs ? [...taps] : [];
  chain.push(now);
  return { taps: chain, progress: Math.min(1, chain.length / CAPSULE_TUNING.tapsToOpen) };
}

/** 꾹 누른 시간 → 진행도 */
export function holdProgress(heldMs: number): number {
  if (!(heldMs > 0)) return 0;
  return Math.min(1, heldMs / CAPSULE_TUNING.holdOpenMs);
}
