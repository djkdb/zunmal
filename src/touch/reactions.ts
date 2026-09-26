/**
 * 말랑 만지기 반응 규칙 — 순수 모듈 (DOM/React 무관, 시간은 ms 로 주입).
 *
 * - 만진 곳(머리·볼·배)에 따라 반응이 다르다 (`touchZone`, `classifyPoke`).
 * - 애정 단계가 오를수록 반응이 하나씩 열린다 (`REACTION_UNLOCKS`). 1단계는 기본 말랑 반응만.
 * - 가만히 두면 하품하고(8초) 졸다가(20초) 만지면 깜짝 놀라 깬다 (`idlePhase`).
 * - 눈길은 손가락을 따라가고(`gazeToward`), 볼은 찌를수록 빨개졌다 식는다(`bumpBlush`/`coolBlush`).
 * 애정 자체는 저장된 값(affection)에서 계산한다 — 저장 구조를 바꾸지 않는다.
 */
import type { ShapeSpec } from '../components/malang/shapes';

/** 애정 이만큼마다 한 단계. 애정은 코인을 주지 않는 순수한 교감 수치다. */
export const AFFECTION_PER_LEVEL = 50;

export function levelOf(affection: number): number {
  const a = Number.isFinite(affection) ? Math.max(0, affection) : 0;
  return Math.floor(a / AFFECTION_PER_LEVEL) + 1;
}

// ── 단계별로 열리는 반응 ─────────────────────────────────────

export type ReactionId = 'pat' | 'blush' | 'tickle' | 'melt' | 'dizzy' | 'jump';

export interface ReactionUnlock {
  id: ReactionId;
  level: number;
  /** 게이지·축하 문구에 쓰는 이름 */
  label: string;
  /** 어떻게 하면 되는지 (짧게) */
  how: string;
}

export const REACTION_UNLOCKS: readonly ReactionUnlock[] = [
  { id: 'pat', level: 2, label: '머리 쓰다듬기', how: '머리를 톡톡 쓰다듬어 보세요' },
  { id: 'blush', level: 3, label: '볼 콕', how: '볼을 콕 찌르면 빨개져요' },
  { id: 'tickle', level: 4, label: '간지럼', how: '배를 콕콕콕 여러 번 찔러 보세요' },
  { id: 'melt', level: 5, label: '녹아내리기', how: '오래 꾹 누르고 있어 보세요' },
  { id: 'dizzy', level: 6, label: '빙글빙글', how: '세게 튕기듯 놓아 보세요' },
  { id: 'jump', level: 7, label: '애교 점프', how: '머리를 세 번 쓰다듬어 보세요' },
];

export function isUnlocked(id: ReactionId, level: number): boolean {
  const u = REACTION_UNLOCKS.find((r) => r.id === id);
  return !!u && level >= u.level;
}

/** 다음에 열릴 반응 (다 열었으면 null) */
export function nextUnlock(level: number): ReactionUnlock | null {
  return REACTION_UNLOCKS.find((r) => r.level > level) ?? null;
}

/** 정확히 이 단계에서 열리는 반응들 (축하 문구용) */
export function unlocksAt(level: number): ReactionUnlock[] {
  return REACTION_UNLOCKS.filter((r) => r.level === level);
}

// ── 만진 곳 ──────────────────────────────────────────────

export type TouchZone = 'head' | 'cheek' | 'belly';

/**
 * 말랑이 그림 좌표(SVG, 몸 가운데 x=60) 의 한 점이 어디인가.
 * 머리 = 눈보다 위, 볼 = 눈 높이~입 아래의 양옆, 배 = 나머지(가운데·아래).
 */
export function touchZone(p: { x: number; y: number }, shape: Pick<ShapeSpec, 'faceY' | 'eyeGap'>): TouchZone {
  const dx = Math.abs(p.x - 60);
  if (p.y < shape.faceY - 8) return 'head';
  if (dx > shape.eyeGap + 1 && p.y <= shape.faceY + 18) return 'cheek';
  return 'belly';
}

export type PokeReaction = 'poke' | 'pat' | 'blush' | 'giggle' | 'laugh';

/**
 * 콕 찌르기 한 번이 어떤 반응이 되는가. recentPokes = 최근 1초 안의 찌르기 수(이번 포함).
 * 열리지 않은 반응은 기본 "poke".
 */
export function classifyPoke(zone: TouchZone, recentPokes: number, level: number): PokeReaction {
  if (recentPokes >= TICKLE_POKES && isUnlocked('tickle', level)) return 'laugh';
  if (zone === 'head' && isUnlocked('pat', level)) return 'pat';
  if (zone === 'cheek' && isUnlocked('blush', level)) return 'blush';
  if (zone === 'belly' && isUnlocked('tickle', level)) return 'giggle';
  return 'poke';
}

/** 1초 안에 이만큼 찌르면 깔깔 웃는다 */
export const TICKLE_POKES = 4;

/** 이 시간 안에 머리를 세 번 쓰다듬으면 애교 점프 */
export const JUMP_PATS = 3;
export const JUMP_WINDOW_MS = 2500;

/** 최근 쓰다듬기 시각 목록에 now 를 더하고, 점프할 때가 되었는지 알려 준다 (점프하면 목록을 비운다) */
export function registerPat(pats: readonly number[], now: number, level: number): { pats: number[]; jump: boolean } {
  const recent = pats.filter((t) => now - t < JUMP_WINDOW_MS);
  recent.push(now);
  if (recent.length >= JUMP_PATS && isUnlocked('jump', level)) return { pats: [], jump: true };
  return { pats: recent, jump: false };
}

// ── 오래 누르기 → 녹아내리기 ─────────────────────────────────

export const MELT_START_MS = 1500;
export const MELT_FULL_MS = 2700;

/** 누르고 있던 시간 → 녹은 정도 0..1 (열리지 않았으면 0) */
export function meltAmount(heldMs: number, level: number): number {
  if (!isUnlocked('melt', level) || !(heldMs > MELT_START_MS)) return 0;
  const t = Math.min(1, (heldMs - MELT_START_MS) / (MELT_FULL_MS - MELT_START_MS));
  return t * t * (3 - 2 * t);
}

// ── 세게 튕기기 → 빙글빙글 ──────────────────────────────────

/** 놓는 순간 손가락 속도가 이 이상(몸 반지름/초)이면 빙글빙글 */
export const DIZZY_SPEED = 9;

/** 손가락 속도(px/ms) 와 몸 반지름(px) → 어지러울 만큼 세게 튕겼나 */
export function isDizzyFlick(vxPxMs: number, vyPxMs: number, radiusPx: number, level: number): boolean {
  if (!isUnlocked('dizzy', level) || !(radiusPx > 0)) return false;
  const speed = (Math.hypot(vxPxMs, vyPxMs) * 1000) / radiusPx;
  return Number.isFinite(speed) && speed >= DIZZY_SPEED;
}

// ── 가만히 두면 ────────────────────────────────────────────

export const YAWN_AFTER_MS = 8000;
export const DOZE_AFTER_MS = 20000;

export type IdlePhase = 'awake' | 'yawn' | 'doze';

export function idlePhase(idleMs: number): IdlePhase {
  if (!(idleMs >= YAWN_AFTER_MS)) return 'awake';
  return idleMs >= DOZE_AFTER_MS ? 'doze' : 'yawn';
}

// ── 볼 빨개짐 ──────────────────────────────────────────────

export const BLUSH_STEP = 0.35;
/** 초당 식는 양 */
export const BLUSH_COOL_PER_S = 0.22;
/** 이보다 빨가면 3D 얼굴을 "빨개진 얼굴" 텍스처로 */
export const BLUSH_FACE_AT = 0.3;

export function bumpBlush(blush: number): number {
  return Math.min(1, Math.max(0, blush) + BLUSH_STEP);
}

export function coolBlush(blush: number, dtMs: number): number {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  return Math.max(0, blush - (BLUSH_COOL_PER_S * dt) / 1000);
}

// ── 눈길 ──────────────────────────────────────────────────

/** 얼굴이 손가락 쪽으로 옮겨 가는 최대 거리 (말랑이 그림 좌표) */
export const GAZE_MAX = 6;

/**
 * 얼굴 중심에서 손가락까지 (그림 좌표) → 얼굴을 옮길 양. 멀어도 GAZE_MAX 까지만,
 * 아주 가까우면 조금만 (얼굴 위를 누르면 거의 그대로).
 */
export function gazeToward(dx: number, dy: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (!(d > 1e-6) || !Number.isFinite(d)) return { x: 0, y: 0 };
  const k = (GAZE_MAX * Math.min(1, d / 40)) / d;
  return { x: dx * k, y: dy * k * 0.7 };
}

/** 눈길을 부드럽게 따라가게 (지수 접근). rate 는 초당 */
export function approach(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  dtMs: number,
  rate = 12,
): { x: number; y: number } {
  const dt = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), 100) : 0;
  const k = 1 - Math.exp((-rate * dt) / 1000);
  return { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k };
}
