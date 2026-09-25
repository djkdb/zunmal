/**
 * 난수 생성기 타입. Math.random과 같은 계약: [0, 1) 범위의 수를 반환한다.
 * 가챠/미니게임 로직은 이 타입을 주입받아 테스트에서 결정적으로 동작하게 한다.
 */
export type RNG = () => number;

/** 기본 RNG (런타임용). */
export const defaultRng: RNG = () => Math.random();

/**
 * mulberry32 기반 시드 고정 RNG. 테스트와 재현 가능한 시뮬레이션에 사용한다.
 */
export function createSeededRng(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) 범위의 실수. */
export function randomRange(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** [0, length) 범위의 정수 인덱스. */
export function randomIndex(rng: RNG, length: number): number {
  if (length <= 0) throw new Error('randomIndex: length must be positive');
  // rng가 규약을 어기고 1을 반환하더라도 범위를 벗어나지 않도록 보정한다.
  return Math.min(length - 1, Math.floor(rng() * length));
}

/** 배열에서 무작위 원소 하나. */
export function pickOne<T>(rng: RNG, items: readonly T[]): T {
  const item = items[randomIndex(rng, items.length)];
  if (item === undefined) throw new Error('pickOne: empty array');
  return item;
}

/** Fisher–Yates 셔플 (원본을 변경하지 않음). */
export function shuffle<T>(rng: RNG, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(rng, i + 1);
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}
