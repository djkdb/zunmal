/**
 * 만지기 전용 얼굴 — 순수 데이터 (SVG path 문자열).
 * 기본 <Malang> 얼굴 위에 덧그린다: 2D 는 같은 viewBox 의 <svg> 로, 3D 는 구운 텍스처에 Path2D 로.
 *  - dizzy : 빙글빙글 소용돌이 눈
 *  - yawn  : 감은 눈 + 크게 벌린 입 (하품)
 *  - blush : 웃는 눈 + 진하게 빨개진 볼과 빗금
 */
import type { MalangEyes } from '../data/characters';
import type { ShapeSpec } from '../components/malang/shapes';

export type ExtraFace = 'dizzy' | 'yawn' | 'blush';
export type TouchFace = 'default' | 'happy' | 'sleepy' | 'wide' | ExtraFace;

export const EXTRA_FACES: readonly ExtraFace[] = ['dizzy', 'yawn', 'blush'];

export interface FacePath {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
}

const INK = '#2b2233';

/** 이 얼굴을 그릴 때 밑에 깔 <Malang> 의 눈 */
export function baseEyes(face: TouchFace, own: MalangEyes): MalangEyes {
  switch (face) {
    case 'default':
    case 'dizzy':
      return own;
    case 'yawn':
      return 'sleepy';
    case 'blush':
      return 'happy';
    default:
      return face;
  }
}

export function isExtraFace(face: TouchFace): face is ExtraFace {
  return (EXTRA_FACES as readonly string[]).includes(face);
}

const f = (n: number) => Number(n.toFixed(2));

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
}

/** 가운데에서 바깥으로 turns 바퀴 도는 소용돌이 (선) */
export function spiralPath(cx: number, cy: number, r: number, turns = 2.2, steps = 36): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const rr = r * (0.12 + 0.88 * t);
    parts.push(`${i === 0 ? 'M' : 'L'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return parts.join(' ');
}

export function faceExtras(face: TouchFace, shape: Pick<ShapeSpec, 'faceY' | 'eyeGap'>): FacePath[] {
  const y = shape.faceY;
  const left = 60 - shape.eyeGap;
  const right = 60 + shape.eyeGap;
  switch (face) {
    case 'dizzy':
      return [left, right].flatMap((x, i) => [
        // 원래 눈을 덮는 흰 바탕 (어떤 눈 모양보다 크게)
        { d: ellipse(x, y, 8.4, 8.4), fill: '#ffffff', stroke: INK, width: 2 },
        { d: spiralPath(x, y, 6.2, i === 0 ? 2.2 : -2.2), stroke: INK, width: 1.8 },
      ]);
    case 'yawn':
      return [
        { d: ellipse(60, y + 10, 4.8, 5.8), fill: INK },
        { d: ellipse(60, y + 13, 2.8, 1.8), fill: '#ff7a9c' },
      ];
    case 'blush':
      return [left - 8.5, right + 8.5].flatMap((cx) => [
        { d: ellipse(cx, y + 9, 8, 5), fill: '#ff5c8a', opacity: 0.72 },
        {
          d: [-3.5, 0, 3.5].map((o) => `M${f(cx + o - 1.4)} ${f(y + 11)} L${f(cx + o + 1.4)} ${f(y + 7)}`).join(' '),
          stroke: '#e0356a',
          width: 1.3,
        },
      ]);
    default:
      return [];
  }
}
