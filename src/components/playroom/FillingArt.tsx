import { useMemo } from 'react';
import type { FillingSpec } from '../../data/materials';
import { createSeededRng } from '../../lib/rng';
import { fillDots, type FillDot } from '../../touch/filling';
import { VIEWBOX, VIEWBOX_ATTR } from '../malang/helpers';
import type { ShapeSpec } from '../malang/shapes';

interface FillingArtProps {
  id: string;
  shape: ShapeSpec;
  filling: FillingSpec;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sparkle(x: number, y: number, r: number): string {
  const k = r * 0.28;
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
}

function star(x: number, y: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/**
 * 2D 말랑이 몸속의 특별한 속 (전설 이상). 몸 윤곽 안에만(얼굴은 비켜서) 보인다.
 * 페이지가 `--fill-glow`(0..1)·`--fill-swirl`(rad)을 스프라이트에 적어 밝기·소용돌이를 바꾼다 — 움직임 줄이기면 돌지 않는다.
 */
export function FillingArt({ id, shape, filling }: FillingArtProps) {
  const dots = useMemo(() => fillDots(filling.kind, createSeededRng(seedOf(id))), [filling.kind, id]);
  const cx = 60;
  const cy = shape.top + (shape.bottom - shape.top) * 0.55;
  const R = Math.min(shape.right - shape.left, shape.bottom - shape.top) * 0.42;
  const clip = `pr-fill-clip-${id}`;
  const [a, b] = filling.colors;
  const at = (d: FillDot) => ({ x: cx + d.x * R, y: cy + d.y * R * 0.85, r: d.r * R });
  return (
    <svg className="pr-fill" viewBox={VIEWBOX_ATTR} data-kind={filling.kind} aria-hidden="true" focusable="false">
      <defs>
        {/* 몸 안에만, 얼굴은 비켜서 */}
        <mask id={clip} maskUnits="userSpaceOnUse" x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h}>
          <path d={shape.body} fill="#fff" />
          <ellipse cx={60} cy={shape.faceY + 4} rx={shape.eyeGap + 15} ry={14} fill="#000" />
        </mask>
        {filling.kind === 'galaxy' && (
          <radialGradient id={`${clip}-core`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.4" stopColor={b} stopOpacity="0.55" />
            <stop offset="1" stopColor={a} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      <g mask={`url(#${clip})`}>
        <g className="pr-fill__spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {filling.kind === 'galaxy' && <circle cx={cx} cy={cy} r={R * 0.55} fill={`url(#${clip}-core)`} />}
          {dots.map((d, i) => {
            const p = at(d);
            const col = d.mix < 0.5 ? a : b;
            switch (filling.kind) {
              case 'glitter':
                return <path key={i} d={sparkle(p.x, p.y, p.r * 1.6)} fill={col} />;
              case 'starBeads':
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={p.r} fill={a} fillOpacity={0.35} stroke="#fff" strokeWidth={0.9} />
                    <path d={star(p.x, p.y, p.r * 0.55)} fill={b} />
                  </g>
                );
              case 'galaxy':
                return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={i % 5 === 0 ? '#fff' : col} />;
              default:
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={`hsl(${Math.round(d.mix * 360)} 95% 72%)`}
                    fillOpacity={0.5}
                  />
                );
            }
          })}
        </g>
      </g>
    </svg>
  );
}
