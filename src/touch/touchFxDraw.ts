/**
 * 말랑 만지기 입자 그리기 (Canvas 2D). 움직임은 순수 모듈 `touchFx.ts`.
 * 그림자 흐림(shadowBlur)·필터 없이 채우기/선만 써서 저사양 폰에서도 가볍다.
 */
import type { FxParticle, FxSystem } from './touchFx';

const INK = '#2b2233';
const TAU = Math.PI * 2;
const RAINBOW = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'] as const;

function rgb(p: FxParticle, t: number): string {
  const r = Math.round(p.r + (p.r2 - p.r) * t);
  const g = Math.round(p.g + (p.g2 - p.g) * t);
  const b = Math.round(p.b + (p.b2 - p.b) * t);
  return `rgb(${r},${g},${b})`;
}

/** 네 갈래 오목한 반짝이 */
function sparkle(ctx: CanvasRenderingContext2D, r: number) {
  const q = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(q, -q, r, 0);
  ctx.quadraticCurveTo(q, q, 0, r);
  ctx.quadraticCurveTo(-q, q, -r, 0);
  ctx.quadraticCurveTo(-q, -q, 0, -r);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, r: number) {
  const s = r / 12;
  ctx.beginPath();
  ctx.moveTo(0, 11 * s);
  ctx.bezierCurveTo(-6 * s, 6 * s, -12 * s, 2 * s, -12 * s, -4.5 * s);
  ctx.bezierCurveTo(-12 * s, -8.5 * s, -9 * s, -11 * s, -5.5 * s, -11 * s);
  ctx.bezierCurveTo(-3 * s, -11 * s, -1.2 * s, -9.6 * s, 0, -7.6 * s);
  ctx.bezierCurveTo(1.2 * s, -9.6 * s, 3 * s, -11 * s, 5.5 * s, -11 * s);
  ctx.bezierCurveTo(9 * s, -11 * s, 12 * s, -8.5 * s, 12 * s, -4.5 * s);
  ctx.bezierCurveTo(12 * s, 2 * s, 6 * s, 6 * s, 0, 11 * s);
  ctx.closePath();
}

function drawOne(ctx: CanvasRenderingContext2D, p: FxParticle, scale: number) {
  const t = p.age / p.life;
  // 빠르게 나타나 뒤쪽 40% 동안 사라진다
  let a = p.alpha * Math.min(1, t / 0.08) * Math.min(1, (1 - t) / 0.4);
  if (p.flicker) a *= 0.72 + 0.28 * Math.sin(p.phase + p.age * 31);
  if (a <= 0.01) return;
  let size = p.size;
  if (p.twinkle) size *= 0.65 + 0.35 * Math.abs(Math.sin(p.phase + p.age * 9));
  const color = rgb(p, t);

  ctx.globalAlpha = a;
  ctx.setTransform(scale, 0, 0, scale, p.x * scale, p.y * scale);

  switch (p.shape) {
    case 'bubble': {
      // 몽글 거품: 몸 색 속 + 얇은 잉크 테두리 + 하이라이트 (밝은 몸 위에서도 보이게)
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-size * 0.38, -size * 0.38, size * 0.3, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'sparkle': {
      ctx.rotate(p.rot * 0.2);
      sparkle(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      sparkle(ctx, size * 0.45);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.rotate(p.rot);
      star(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      break;
    }
    case 'dot': {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case 'ember': {
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.6, 0, TAU);
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.7, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.32, 0, TAU);
      ctx.fillStyle = '#fff6c9';
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.rotate(Math.sin(p.rot) * 0.35);
      heart(ctx, size * 1.1);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.3);
      ctx.lineTo(size * 0.45, 0);
      ctx.lineTo(0, size * 1.3);
      ctx.lineTo(-size * 0.45, 0);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.3);
      ctx.lineTo(size * 0.45, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      break;
    }
    case 'feather': {
      ctx.rotate(p.rot * 0.4 + Math.sin(p.phase + p.age * 4) * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.42, size * 1.25, 0, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.1);
      ctx.lineTo(0, size * 1.5);
      ctx.stroke();
      break;
    }
    case 'drop': {
      // 떨어지는 방향으로 꼬리를 늘인 별 물방울
      ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.6, 0, Math.PI);
      ctx.lineTo(0, -size * 1.7);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, size * 0.1, size * 0.22, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'arc': {
      ctx.rotate(Math.sin(p.rot) * 0.4);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.4, size * 0.26);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, size * 0.4, size * (1.15 - i * 0.28), Math.PI * 1.08, Math.PI * 1.92);
        ctx.strokeStyle = RAINBOW[(i * 2) % RAINBOW.length] ?? color;
        ctx.stroke();
      }
      break;
    }
    case 'ring': {
      // 퍼지는 고리 (잔물결 / 후광 반짝): 납작한 타원
      const grow = 1 + t * 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * grow, size * grow * 0.32, 0, 0, TAU);
      ctx.lineWidth = Math.max(1, 3.2 * (1 - t));
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.lineWidth = Math.max(0.6, 1.4 * (1 - t));
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      break;
    }
    case 'z': {
      // 졸음 z: 굵은 선 글자 (글꼴 없이 선으로)
      const r = size;
      ctx.rotate(-0.15);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, -r * 0.6);
      ctx.lineTo(-r * 0.6, r * 0.6);
      ctx.lineTo(r * 0.6, r * 0.6);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.6, r * 0.28);
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    case 'glow': {
      const r = size * (0.85 + 0.3 * t);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      break;
    }
  }
}

/** 캔버스를 지우고 살아 있는 입자를 모두 그린다. scale = 기기 픽셀 비 */
export function drawFx(ctx: CanvasRenderingContext2D, sys: FxSystem, width: number, height: number, scale: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (sys.alive === 0) return;
  ctx.save();
  // 번짐·불빛은 먼저(아래), 나머지는 위에
  for (let pass = 0; pass < 2; pass++) {
    for (const p of sys.pool) {
      if (!p.alive) continue;
      if ((p.shape === 'glow') !== (pass === 0)) continue;
      drawOne(ctx, p, scale);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
