/**
 * 물리 상태 → 손맛 읽기 (순수 모듈, dt 주입). 만지기 목소리(`audio/touchVoice.ts`)와 진동이 매 프레임 읽는다.
 *
 * 2D·3D 가 같은 `physics.ts` 값(눌림·늘어남·출렁임)을 쓰므로 소리·진동이 두 화면에서 똑같다.
 * 속도는 프레임마다 흔들리지 않게 짧게 고른다(시정수 SENSE_TAU_MS).
 *
 * 진동(`touchHaptic`): 촉감별 짧은 패턴. 폼 부스럭·찐득이 칙칙은 알갱이 밀도만큼 가볍게 톡톡(간격 제한),
 * 젤리를 놓으면 부드러운 퉁, 떼어내면 쩍. 안드로이드만 (iOS 는 진동 API 가 없다), 움직임 줄이기면 없음.
 */
import type { TouchSense } from '../audio/touchVoice';
import { haptic } from '../lib/haptics';
import { TUNING, squashAmount, stretchAmount, stretchLength, wobbleHz, type TouchState } from './physics';

/** 속도 고르기 시정수 (ms) */
export const SENSE_TAU_MS = 35;
/** 손가락 속도 (px/ms) → 문지름 1 */
export const RUB_FULL_PX_PER_MS = 1.2;
/** 손가락이 멈추면 문지름이 사라지는 시정수 (ms) */
export const RUB_DECAY_MS = 90;

export interface SenseMemory {
  press: number;
  stretch: number;
  pressVel: number;
  stretchVel: number;
  rub: number;
  /** 첫 프레임 (속도 없음) */
  fresh: boolean;
}

export function createSenseMemory(): SenseMemory {
  return { press: 0, stretch: 0, pressVel: 0, stretchVel: 0, rub: 0, fresh: true };
}

export interface SenseInput {
  /** 손가락이 닿아 있거나 실이 아직 붙어 있다 */
  held: boolean;
  /** 이번 프레임 손가락 속도 (px/ms, 움직이지 않았으면 0) */
  fingerSpeed: number;
  /** 떼어내는 빠르기 0..1 */
  peel: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/**
 * 한 프레임 읽기. dtMs 는 지난 읽기부터 흐른 시간.
 * jiggle = 세로 출렁임 변위(눌림 한계 대비), jiggleVel = 그 속도(진폭 1 의 최고 속도가 1).
 */
export function readSense(touch: TouchState, mem: SenseMemory, dtMs: number, input: SenseInput): { sense: TouchSense; mem: SenseMemory } {
  const dt = clamp(num(dtMs), 0, 100);
  const press = squashAmount(touch);
  const stretch = stretchAmount(touch);
  let pressVel = mem.pressVel;
  let stretchVel = mem.stretchVel;
  if (!mem.fresh && dt > 0) {
    const k = 1 - Math.exp(-dt / SENSE_TAU_MS);
    pressVel += (((press - mem.press) * 1000) / dt - pressVel) * k;
    stretchVel += (((stretch - mem.stretch) * 1000) / dt - stretchVel) * k;
  }
  // 문지름: 움직인 프레임에는 그 속도로 오르고, 멈추면 빠르게 잦아든다
  const target = clamp(num(input.fingerSpeed) / RUB_FULL_PX_PER_MS, 0, 1);
  const rub = target > mem.rub ? target : mem.rub * Math.exp(-dt / RUB_DECAY_MS);
  const unit = TUNING.pressMax;
  const disp = touch.squash.x - touch.squash.target;
  const omega = 2 * Math.PI * wobbleHz(touch.feel);
  const sense: TouchSense = {
    held: !!input.held,
    press,
    pressVel: clamp(pressVel, -20, 20),
    stretch,
    stretchVel: clamp(stretchVel, -20, 20),
    rub: input.held ? rub : 0,
    jiggle: clamp(disp / unit, -1.5, 1.5),
    jiggleVel: clamp(touch.squash.v / (omega * unit), -1.5, 1.5),
    peel: clamp(num(input.peel), 0, 1),
  };
  return { sense, mem: { press, stretch, pressVel: sense.pressVel, stretchVel: sense.stretchVel, rub, fresh: false } };
}

/** 쭉쭉이의 "퉁" 크기: 놓는 순간 늘어난 정도 (길이 포함) */
export function snapStrength(touch: TouchState): number {
  return clamp(Math.max(stretchAmount(touch), stretchLength(touch) / 2.5), 0, 1);
}

// ── 진동 ───────────────────────────────────────────────

export type TouchHapticKind = 'tick' | 'thud' | 'peel';

/** [진동, 쉼, …] ms. 10ms 아래는 많은 기기에서 느껴지지 않는다 */
export const TOUCH_HAPTIC_PATTERNS: Readonly<Record<TouchHapticKind, readonly number[]>> = {
  /** 폼 부스럭·찐득이 칙칙 한 알 */
  tick: [10],
  /** 젤리·고무를 놓을 때 부드러운 퉁 */
  thud: [24],
  /** 찐득이가 쩍 떨어질 때: 짧게 붙었다 톡 */
  peel: [12, 34, 20],
};

/** 같은 진동의 최소 간격 (ms) */
export const TOUCH_HAPTIC_GAP_MS: Readonly<Record<TouchHapticKind, number>> = { tick: 70, thud: 220, peel: 260 };
/** 알갱이 몇 개마다 톡 한 번 */
export const GRAINS_PER_TICK = 6;

export interface HapticMemory {
  /** 쌓인 알갱이 */
  acc: number;
  last: Record<TouchHapticKind, number>;
}

export function createHapticMemory(): HapticMemory {
  return { acc: 0, last: { tick: -Infinity, thud: -Infinity, peel: -Infinity } };
}

/** 간격 제한 (순수) */
export function hapticDue(mem: HapticMemory, kind: TouchHapticKind, now: number): boolean {
  return now - mem.last[kind] >= TOUCH_HAPTIC_GAP_MS[kind];
}

/**
 * 알갱이 밀도(초당)만큼 쌓다가 GRAINS_PER_TICK 개마다 톡 (간격 제한). 톡 할 차례면 tick = true.
 */
export function grainTick(mem: HapticMemory, grainsPerSec: number, dtMs: number, now: number): { tick: boolean; mem: HapticMemory } {
  const add = Math.max(0, num(grainsPerSec)) * (clamp(num(dtMs), 0, 100) / 1000);
  const acc = Math.min(GRAINS_PER_TICK * 2, mem.acc + add);
  if (acc >= GRAINS_PER_TICK && hapticDue(mem, 'tick', now)) {
    return { tick: true, mem: { acc: acc - GRAINS_PER_TICK, last: { ...mem.last, tick: now } } };
  }
  return { tick: false, mem: { ...mem, acc } };
}

/** 진동을 보냈다고 적는다 */
export function markHaptic(mem: HapticMemory, kind: TouchHapticKind, now: number): HapticMemory {
  return { ...mem, last: { ...mem.last, [kind]: now } };
}

/**
 * 촉감 진동을 보낸다 (안드로이드 Chrome). `lib/haptics` 의 `haptic()` 검사(진동 끄기·움직임 줄이기·첫 입력 전·지원 안 함)를
 * 그대로 거치고, 보내는 패턴만 촉감 것으로 바꾼다. 못 보내면 조용히 false.
 */
export function touchHaptic(kind: TouchHapticKind, reduced: boolean): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  const vibrate = typeof nav.vibrate === 'function' ? () => nav.vibrate([...TOUCH_HAPTIC_PATTERNS[kind]]) : undefined;
  return haptic('tap', { vibrate, reducedMotion: reduced, hasBeenActive: nav.userActivation ? nav.userActivation.hasBeenActive : true });
}
