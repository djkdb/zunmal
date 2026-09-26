/**
 * 놀이방 꾸미기 (순수 데이터 + 작은 계산): 매트 무늬와 매트 위 소품.
 *
 *  - 매트 무늬: id 목록만 여기 (저장 검사용, 첫 화면 번들에 들어간다). 그림은 놀이방에서만 쓰는 data/matPatterns.ts —
 *    타일 SVG 한 장을 코드로 그려 CSS 배경(data: URL)과 사진 카드(캔버스 패턴)가 같은 그림을 쓴다.
 *  - 소품: 매트 위에 놓는 장식. 세계(touch/world.ts)에서는 움직이지 않는 장애물이라 말랑이가 부딪히고 올라탄다.
 *    위치는 매트 바닥 기준 0..1 로 저장한다(화면 크기가 바뀌어도 같은 자리).
 *  - 꾸미기는 무료다. 코인·밸런스 숫자는 없다.
 */

// ── 매트 무늬 ─────────────────────────────────────────────

export const MAT_PATTERN_IDS = ['sky-dots', 'cloud', 'pastel-check', 'strawberry-milk', 'mint-stripe', 'star-night'] as const;
export type MatPatternId = (typeof MAT_PATTERN_IDS)[number];

export const DEFAULT_MAT: MatPatternId = 'sky-dots';

export function isMatPatternId(v: unknown): v is MatPatternId {
  return typeof v === 'string' && (MAT_PATTERN_IDS as readonly string[]).includes(v);
}


// ── 소품 ──────────────────────────────────────────────────

export const PROP_IDS = ['cushion', 'plant', 'star-lamp', 'gift-box'] as const;
export type PropId = (typeof PROP_IDS)[number];

/** 매트 위에 한 번에 놓을 수 있는 소품 수 */
export const MAX_PROPS = 3;

export interface PropDef {
  id: PropId;
  label: string;
  /** 세계 속 부딪힘 반지름 (말랑이 그림 상자 한 변 = 1) */
  r: number;
  /** 세계 속 높이 — 말랑이가 올라탈 수 있는 높이 */
  h: number;
  /** 화면 그림 폭 (말랑이 그림 상자 대비) */
  w: number;
  /** 그림 세로/가로 비 */
  aspect: number;
}

export const PROPS: Readonly<Record<PropId, PropDef>> = {
  cushion: { id: 'cushion', label: '쿠션', r: 0.34, h: 0.26, w: 0.8, aspect: 0.62 },
  plant: { id: 'plant', label: '작은 화분', r: 0.2, h: 0.62, w: 0.46, aspect: 1.3 },
  'star-lamp': { id: 'star-lamp', label: '별 조명', r: 0.19, h: 0.6, w: 0.44, aspect: 1.36 },
  'gift-box': { id: 'gift-box', label: '리본 상자', r: 0.25, h: 0.44, w: 0.54, aspect: 1 },
};

export function isPropId(v: unknown): v is PropId {
  return typeof v === 'string' && (PROP_IDS as readonly string[]).includes(v);
}

/** 매트 위 소품 하나. x, y 는 매트 바닥 기준 0..1 */
export interface PlacedProp {
  id: PropId;
  x: number;
  y: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 저장된 매트 무늬: 모르는 값이면 기본 무늬 */
export function sanitizeMatId(value: unknown): MatPatternId {
  return isMatPatternId(value) ? value : DEFAULT_MAT;
}

/** 저장된 소품 목록: 모르는 id·중복·숫자가 아닌 좌표는 버리고, 좌표는 0..1 로, 최대 MAX_PROPS 개 */
export function sanitizeProps(value: unknown): PlacedProp[] {
  if (!Array.isArray(value)) return [];
  const out: PlacedProp[] = [];
  for (const v of value) {
    if (out.length >= MAX_PROPS) break;
    if (typeof v !== 'object' || v === null) continue;
    const rec = v as Record<string, unknown>;
    const { id, x, y } = rec;
    if (!isPropId(id) || out.some((p) => p.id === id)) continue;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ id, x: clamp01(x), y: clamp01(y) });
  }
  return out;
}

/** 소품을 놓거나(없으면) 옮긴다(있으면). 가득 찼는데 새 소품이면 그대로 돌려준다 */
export function withProp(list: readonly PlacedProp[], id: PropId, x: number, y: number): PlacedProp[] {
  const nx = clamp01(Number.isFinite(x) ? x : 0.5);
  const ny = clamp01(Number.isFinite(y) ? y : 0.5);
  if (list.some((p) => p.id === id)) return list.map((p) => (p.id === id ? { id, x: nx, y: ny } : p));
  if (list.length >= MAX_PROPS) return [...list];
  return [...list, { id, x: nx, y: ny }];
}

export function withoutProp(list: readonly PlacedProp[], id: PropId): PlacedProp[] {
  return list.filter((p) => p.id !== id);
}

/** 새 소품 자리 후보 (0..1): 매트 가장자리 쪽 — 가운데는 말랑이 놀이 자리로 비워 둔다 */
const PROP_SPOTS: readonly { x: number; y: number }[] = [
  { x: 0.14, y: 0.12 },
  { x: 0.86, y: 0.12 },
  { x: 0.12, y: 0.9 },
  { x: 0.88, y: 0.9 },
  { x: 0.5, y: 0.06 },
  { x: 0.1, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.5, y: 0.95 },
];

/**
 * 새 소품을 놓을 자리: 후보 중 이미 있는 소품·말랑이(0..1 좌표)에서 가장 먼 곳.
 * aspect = 매트 바닥 세로/가로 비 (거리를 실제 비율로 잰다).
 */
export function propSpot(
  taken: readonly { x: number; y: number }[],
  aspect: number,
): { x: number; y: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let best = PROP_SPOTS[0] ?? { x: 0.5, y: 0.5 };
  let bestD = -Infinity;
  for (const s of PROP_SPOTS) {
    let d = Infinity;
    for (const t of taken) d = Math.min(d, Math.hypot(s.x - t.x, (s.y - t.y) * a));
    if (d > bestD + 1e-9) {
      bestD = d;
      best = s;
    }
  }
  return { ...best };
}
