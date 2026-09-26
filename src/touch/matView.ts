/**
 * 놀이방 매트 화면 배치 (순수 모듈). 세계 좌표(world.ts) ↔ 화면 px, 그리고 맞닿아 눌린 모양.
 *
 * 3/4 시점: 매트 깊이 y 는 화면 아래로, 높이 z 는 화면 위로. 말랑이 그림은 화면을 보고 서 있고
 * 몸통 바닥 가운데(anchor)가 세계 위치에 온다. 앞(깊이가 큰) 말랑이가 뒤 말랑이를 가린다.
 */
import type { Pose } from './softbody';

export interface MatLayout {
  /** 말랑이 발이 닿을 수 있는 바닥 영역 (px, 매트 요소 기준) */
  floorLeft: number;
  floorTop: number;
  floorW: number;
  floorH: number;
  /** 말랑이 그림 상자 한 변 (px) = 세계 단위 1 */
  sprite: number;
  /** 여럿이 놀 때의 말랑이 크기 (px) — 소품은 혼자일 때도 이 크기를 기준으로 그려 화면 크기가 그대로다 */
  groupSprite: number;
}

export interface MatInsets {
  /** 위 HUD 아래 끝 (px) */
  top: number;
  /** 아래 선반 손잡이 위 끝 (px, 화면 위에서부터) */
  bottom: number;
}

/** 혼자 놀 때 말랑이 크기 (px) 한도 — 예전 한 마리 만지기 화면처럼 크게 */
export const SOLO_SPRITE_MAX = 240;

/**
 * 화면 크기 → 매트 배치. 말랑이 크기는 화면에 맞추고(여럿이면 100~180px, 혼자면 더 크게 ~240px),
 * 머리가 HUD 에 가리지 않게 바닥을 내린다.
 */
export function computeMatLayout(viewW: number, viewH: number, insets: MatInsets, options: { solo?: boolean } = {}): MatLayout {
  const w = Number.isFinite(viewW) && viewW > 0 ? viewW : 360;
  const h = Number.isFinite(viewH) && viewH > 0 ? viewH : 640;
  const group = Math.max(100, Math.min(180, w * 0.34, h * 0.22));
  const sprite = Math.round(options.solo ? Math.max(group, Math.min(SOLO_SPRITE_MAX, w * 0.62, h * 0.34)) : group);
  // 날개·귀 같은 장식이 매트 밖으로 나가지 않게 (몸 반폭보다 그림이 약 0.2 더 넓다)
  const side = 10 + sprite * 0.2;
  const floorTop = insets.top + sprite * 0.62;
  const floorBottom = Math.max(floorTop + sprite, insets.bottom - 6);
  return {
    floorLeft: side,
    floorTop,
    floorW: Math.max(sprite, w - side * 2),
    floorH: floorBottom - floorTop,
    sprite,
    groupSprite: Math.round(group),
  };
}

/** 배치가 바뀔 때(화면 회전·혼자 ↔ 여럿) 세계 좌표를 옮겨 화면 위 같은 자리에 머물게 한다 */
export function remapPoint(from: MatLayout, to: MatLayout, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const s = toScreen(from, x, y, 0);
  const w = toWorld(to, s.x, s.y);
  return { x: w.x, y: w.y, z: (Math.max(0, z) * from.sprite) / to.sprite };
}

/** 혼자 놀 때 말랑이 자리: 매트 가운데 */
export function soloSpot(bounds: { w: number; d: number }): { x: number; y: number } {
  return { x: bounds.w / 2, y: bounds.d * 0.5 };
}

export function matBounds(l: MatLayout): { w: number; d: number } {
  return { w: l.floorW / l.sprite, d: l.floorH / l.sprite };
}

export interface ScreenSpot {
  /** 몸통 바닥 가운데 (들어 올린 높이 포함, px) */
  x: number;
  y: number;
  /** 매트 위 그림자 자리 y */
  groundY: number;
  /** 앞뒤 순서 (클수록 앞, px) */
  depth: number;
  /** 들어 올린 높이 (px) */
  lift: number;
}

export function toScreen(l: MatLayout, x: number, y: number, z: number): ScreenSpot {
  const groundY = l.floorTop + y * l.sprite;
  const lift = Math.max(0, z) * l.sprite;
  return { x: l.floorLeft + x * l.sprite, y: groundY - lift, groundY, depth: groundY + lift * 0.6, lift };
}

export function toWorld(l: MatLayout, px: number, py: number): { x: number; y: number } {
  return { x: (px - l.floorLeft) / l.sprite, y: (py - l.floorTop) / l.sprite };
}

/**
 * 맞닿아 눌린 만큼 몸 모양을 바꾼다 (부피를 대략 지킨다): 옆에서 밀리면 가로로 납작·세로로 길게,
 * 위에서 눌리면 세로로 납작·가로로 퍼진다. squeeze 는 world.ts 의 (r 대비) 값.
 */
export function squeezePose(pose: Pose, sx: number, sy: number, sz: number): Pose {
  const side = Math.min(0.5, Math.hypot(finite(sx), finite(sy) * 0.6));
  const top = Math.min(0.5, Math.max(0, -finite(sz)));
  if (side === 0 && top === 0) return pose;
  const kx = 1 - 0.55 * side + 0.45 * top;
  const ky = 1 - 0.6 * top + 0.3 * side;
  const scaleX = pose.scaleX * kx;
  const scaleY = pose.scaleY * ky;
  return { ...pose, scaleX, scaleY, scaleZ: 1 / (scaleX * scaleY), lean: pose.lean + finite(sx) * 0.25 };
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
