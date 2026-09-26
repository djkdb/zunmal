/**
 * 말랑 만지기 입자 캔버스 — 3D 캔버스 위(2D 대체 모드에서도 같은 자리)에 얹는 Canvas 2D 한 장.
 * 움직임은 순수 모듈 `touch/touchFx.ts`, 그리기는 `touch/touchFxDraw.ts`.
 *
 * - 자체 requestAnimationFrame 루프: 입자가 있거나 떠다니는 입자(시크릿)가 켜져 있을 때만 돈다.
 *   떠다니는 입자만 있을 때는 30fps 로 그린다. 탭이 숨으면 브라우저가 rAF 를 멈춘다.
 * - 3D 장면을 다시 그리게 하지 않는다 (젤리가 쉬는 동안에도 입자만 가볍게).
 */
import type { TouchFxSpec } from '../../data/rarity';
import type { RNG } from '../../lib/rng';
import {
  ambientDue,
  clearFx,
  createFxSystem,
  emitStyle,
  emitTouch,
  REACTION_STYLES,
  stepFx,
  type ReactionFx,
  type FxEvent,
  type FxStyleSet,
  type Point,
} from '../../touch/touchFx';
import { drawFx } from '../../touch/touchFxDraw';

export interface BodyBox {
  /** 몸 가운데 (client px) */
  x: number;
  y: number;
  /** 몸 반지름 (px) */
  r: number;
  /** 머리 꼭대기 y (client px) */
  headY?: number;
}

export interface FxLayerOptions {
  canvas: HTMLCanvasElement;
  styles: FxStyleSet;
  spec: TouchFxSpec;
  shiny: boolean;
  /** 몸 위치 (client 좌표) */
  getBody: () => BodyBox | null;
  rng?: RNG;
}

export interface FxLayer {
  /** client 좌표에서 입자를 뿜는다. 좌표가 없으면 몸 가운데 */
  emit(event: FxEvent, clientX?: number, clientY?: number, strength?: number): void;
  /** 끄는 동안 손가락 위치: 등급 표의 간격마다 꼬리 입자 */
  trail(clientX: number, clientY: number): void;
  endTrail(): void;
  /** 반응 입자: 하트(손가락/머리), 졸음 z(머리), 빙글빙글 별(머리 둘레) */
  react(kind: ReactionFx, count: number, clientX?: number, clientY?: number): void;
  setAmbient(on: boolean): void;
  resize(): void;
  dispose(): void;
}

const MAX_DPR = 2;
const AMBIENT_FRAME_MS = 33;
const BURST_MS = 1800;

export function createFxLayer(opts: FxLayerOptions): FxLayer {
  const { canvas, styles, spec, shiny } = opts;
  const rng = opts.rng ?? Math.random;
  const ctx = canvas.getContext('2d');
  const sys = createFxSystem();
  let dpr = 1;
  let w = 1;
  let h = 1;
  let raf: number | null = null;
  let lastTs: number | null = null;
  let lastDraw = 0;
  let ambientOn = false;
  let ambientAcc = 0;
  let trailLast: Point | null = null;
  let disposed = false;
  /** 손짓 입자가 사라질 때까지는 60fps (가장 긴 수명보다 넉넉히) */
  let burstUntil = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  resize();

  const local = (clientX: number, clientY: number): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const body = () => {
    const b = opts.getBody();
    if (!b) {
      const rect = canvas.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height * 0.62 };
      const radius = rect.width * 0.25;
      return { center, radius, head: { x: center.x, y: center.y - radius } };
    }
    const center = local(b.x, b.y);
    const head = b.headY === undefined ? { x: center.x, y: center.y - b.r } : local(b.x, b.headY);
    return { center, radius: b.r, head };
  };

  const frame = (ts: number) => {
    raf = null;
    if (disposed || !ctx) return;
    const dt = lastTs === null ? 1 / 60 : (ts - lastTs) / 1000;
    lastTs = ts;
    if (ambientOn) {
      const due = ambientDue(ambientAcc, spec.ambientPerSec, dt);
      ambientAcc = due.acc;
      if (due.count > 0) {
        const b = body();
        for (let i = 0; i < due.count; i++) emitTouch(sys, styles, spec, 'ambient', b.center, rng, { ...b, shiny });
      }
    }
    const alive = stepFx(sys, dt);
    // 떠다니는 입자만 있으면 30fps 로 충분하다 (배터리)
    const onlyAmbient = ambientOn && ts > burstUntil;
    if (!onlyAmbient || ts - lastDraw >= AMBIENT_FRAME_MS || alive === 0) {
      drawFx(ctx, sys, w, h, dpr);
      lastDraw = ts;
    }
    if (alive > 0 || ambientOn) raf = requestAnimationFrame(frame);
    else lastTs = null;
  };

  const ensure = () => {
    if (raf === null && !disposed) {
      lastTs = null;
      raf = requestAnimationFrame(frame);
    }
  };

  return {
    emit(event, clientX, clientY, strength = 1) {
      if (disposed) return;
      const b = body();
      const at = clientX === undefined || clientY === undefined ? b.center : local(clientX, clientY);
      const n = emitTouch(sys, styles, spec, event, at, rng, { ...b, strength, shiny });
      if (n > 0) {
        burstUntil = performance.now() + BURST_MS;
        ensure();
      }
    },
    trail(clientX, clientY) {
      if (disposed || spec.trailPx <= 0) return;
      const p = local(clientX, clientY);
      if (!trailLast) {
        trailLast = p;
        return;
      }
      const dist = Math.hypot(p.x - trailLast.x, p.y - trailLast.y);
      if (dist < spec.trailPx) return;
      // 빠르게 끌어도 한 번에 최대 3개 (간격을 채운다)
      const steps = Math.min(3, Math.floor(dist / spec.trailPx));
      const b = body();
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const at = { x: trailLast.x + (p.x - trailLast.x) * k, y: trailLast.y + (p.y - trailLast.y) * k };
        emitTouch(sys, styles, spec, 'pull', at, rng, { ...b, shiny });
      }
      trailLast = p;
      burstUntil = performance.now() + BURST_MS;
      ensure();
    },
    endTrail() {
      trailLast = null;
    },
    react(kind, count, clientX, clientY) {
      if (disposed) return;
      const b = body();
      const head = b.head;
      const at = clientX === undefined || clientY === undefined ? head : local(clientX, clientY);
      const zAt = { x: head.x + b.radius * 0.5, y: head.y };
      const n =
        kind === 'dizzy'
          ? emitStyle(sys, REACTION_STYLES.dizzy, count, { x: head.x, y: head.y - 6 }, rng, b.radius * 0.6)
          : emitStyle(sys, REACTION_STYLES[kind], count, kind === 'zzz' ? zAt : at, rng);
      if (n > 0) {
        burstUntil = performance.now() + BURST_MS;
        ensure();
      }
    },
    setAmbient(on) {
      ambientOn = on && spec.ambientPerSec > 0;
      if (ambientOn) ensure();
    },
    resize() {
      resize();
      if (ctx) drawFx(ctx, sys, w, h, dpr);
    },
    dispose() {
      disposed = true;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      clearFx(sys);
      ctx?.clearRect(0, 0, w, h);
    },
  };
}
