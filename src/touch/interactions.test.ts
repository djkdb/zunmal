import { describe, expect, it } from 'vitest';
import type { MaterialId } from '../data/materials';
import {
  INTERACT_TUNING as T,
  createInteractState,
  forgetBody,
  stepInteractions,
  takeRubPet,
  type InteractBody,
  type InteractEvent,
  type InteractState,
} from './interactions';
import type { WorldContact, WorldEvent } from './world';

function body(id: string, x: number, over: Partial<InteractBody> = {}): InteractBody {
  return { id, material: 'jelly', x, y: 1, z: 0, r: 0.3, touched: false, idleMs: 0, dozing: false, ...over };
}

function side(overlap = 0.02, ageMs = 0): WorldContact {
  return { a: 'a', b: 'b', nx: -1, ny: 0, nz: 0.1, overlap, ageMs };
}

const never = () => 0.99;

/** dt 간격으로 같은 입력을 ms 동안 넣고 모든 사건을 모은다 */
function hold(
  state: InteractState,
  from: number,
  ms: number,
  input: { bodies: InteractBody[]; contacts: WorldContact[]; events?: WorldEvent[] },
  dt = 16,
): InteractEvent[] {
  const out: InteractEvent[] = [];
  for (let t = 0; t <= ms; t += dt) {
    out.push(...stepInteractions(state, { now: from + t, dtMs: dt, events: [], ...input }, never));
  }
  return out;
}

describe('볼 비비기', () => {
  const bodies = () => [body('a', 1, { touched: true }), body('b', 1.58)];

  it('맞대어 1초 누르고 있으면 한 번 볼을 비빈다 (그 전에는 아니다)', () => {
    const s = createInteractState();
    expect(hold(s, 0, 900, { bodies: bodies(), contacts: [side()] }).filter((e) => e.kind === 'cheekRub')).toHaveLength(0);
    const ev = hold(s, 916, 200, { bodies: bodies(), contacts: [side()] }).filter((e) => e.kind === 'cheekRub');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ a: 'a', b: 'b', petA: true, petB: true });
  });

  it('손가락이 없거나 살짝 닿기만 하거나 위아래로 얹힌 것은 아니다', () => {
    const s = createInteractState();
    const free = [body('a', 1), body('b', 1.58)];
    expect(hold(s, 0, 1500, { bodies: free, contacts: [side()] }).some((e) => e.kind === 'cheekRub')).toBe(false);
    const s2 = createInteractState();
    expect(hold(s2, 0, 1500, { bodies: bodies(), contacts: [side(0.001)] }).some((e) => e.kind === 'cheekRub')).toBe(false);
    const s3 = createInteractState();
    const top = { ...side(), nz: 0.9 };
    expect(hold(s3, 0, 1500, { bodies: bodies(), contacts: [top] }).some((e) => e.kind === 'cheekRub')).toBe(false);
  });

  it('잠깐 떨어져도 이어서 세지만, 오래 떨어지면 처음부터', () => {
    const s = createInteractState();
    hold(s, 0, 600, { bodies: bodies(), contacts: [side()] });
    // 0.1초 떨어짐 → 이어서
    hold(s, 616, 100, { bodies: bodies(), contacts: [] });
    expect(hold(s, 732, 400, { bodies: bodies(), contacts: [side()] }).some((e) => e.kind === 'cheekRub')).toBe(true);
    const s2 = createInteractState();
    hold(s2, 0, 600, { bodies: bodies(), contacts: [side()] });
    hold(s2, 616, 500, { bodies: bodies(), contacts: [] });
    expect(hold(s2, 1132, 600, { bodies: bodies(), contacts: [side()] }).some((e) => e.kind === 'cheekRub')).toBe(false);
  });

  it('같은 쌍은 쉬었다가 다시, 애정은 1분에 3번까지만', () => {
    const s = createInteractState();
    const all = hold(s, 0, 20_000, { bodies: bodies(), contacts: [side()] }).filter(
      (e): e is Extract<InteractEvent, { kind: 'cheekRub' }> => e.kind === 'cheekRub',
    );
    // 처음 1초, 그 뒤 3.5초마다 → 20초에 6번
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.length).toBeLessThanOrEqual(6);
    expect(all.filter((e) => e.petA)).toHaveLength(T.rubPetsPerMin);
    // 1분이 지나면 다시 오른다
    expect(takeRubPet(s, 'a', 70_000)).toBe(true);
  });
});

describe('쌓기·덮치기·쿵', () => {
  it('위에 얹혀 자리를 잡으면 한 번 알린다 (위를 들고 있으면 아니다)', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { z: 0.5 }), body('b', 1)];
    const onTop: WorldContact = { a: 'a', b: 'b', nx: 0, ny: 0, nz: 0.95, overlap: 0.05, ageMs: 0 };
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies, contacts: [onTop], events: [] }, never)).toEqual([]);
    const ev = stepInteractions(s, { now: 300, dtMs: 16, bodies, contacts: [{ ...onTop, ageMs: 300 }], events: [] }, never);
    expect(ev).toEqual([{ kind: 'stack', top: 'a', bottom: 'b' }]);
    expect(stepInteractions(s, { now: 400, dtMs: 16, bodies, contacts: [{ ...onTop, ageMs: 400 }], events: [] }, never)).toEqual([]);
    const held = createInteractState();
    const carried = [body('a', 1, { z: 0.5, touched: true }), body('b', 1)];
    expect(stepInteractions(held, { now: 300, dtMs: 16, bodies: carried, contacts: [{ ...onTop, ageMs: 300 }], events: [] }, never)).toEqual([]);
  });

  it('높이서 떨어지면 덮치기, 옆으로 세게 부딪히면 쿵 (같은 촉감 표시)', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { material: 'sticky' }), body('b', 1.5, { material: 'sticky' })];
    const drop: WorldEvent = { kind: 'bump', a: 'a', b: 'b', speed: 4, nx: 0, ny: 0, nz: -0.9 };
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies, contacts: [], events: [drop] }, never)).toContainEqual({
      kind: 'dropOn',
      top: 'b',
      bottom: 'a',
      speed: 4,
    });
    const hit: WorldEvent = { kind: 'bump', a: 'a', b: 'b', speed: 3, nx: 1, ny: 0, nz: 0 };
    const ev = stepInteractions(s, { now: 2000, dtMs: 16, bodies, contacts: [], events: [hit] }, never);
    expect(ev).toContainEqual({ kind: 'bumpHard', a: 'a', b: 'b', speed: 3, nx: 1, same: 'sticky' as MaterialId });
    // 곧바로 또 부딪혀도 쉬는 동안은 조용
    expect(stepInteractions(s, { now: 2100, dtMs: 16, bodies, contacts: [], events: [hit] }, never)).toEqual([]);
    // 살살 부딪힌 것은 아무 일 없다
    const soft: WorldEvent = { ...hit, speed: 1 };
    expect(stepInteractions(s, { now: 5000, dtMs: 16, bodies, contacts: [], events: [soft] }, never)).toEqual([]);
  });

  it('다른 촉감끼리는 same 이 없다', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { material: 'jelly' }), body('b', 1.5, { material: 'slowRise' })];
    const hit: WorldEvent = { kind: 'bump', a: 'a', b: 'b', speed: 3, nx: 1, ny: 0, nz: 0 };
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies, contacts: [], events: [hit] }, never)[0]).toMatchObject({ same: null });
  });

  it('찐득이 둘은 닿으면 붙고 떨어질 때 한 번 쩍', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { material: 'sticky' }), body('b', 1.58, { material: 'sticky' })];
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies, contacts: [side()], events: [] }, never)).toContainEqual({
      kind: 'stickTogether',
      a: 'a',
      b: 'b',
    });
    expect(stepInteractions(s, { now: 16, dtMs: 16, bodies, contacts: [side()], events: [] }, never)).toEqual([]);
    expect(stepInteractions(s, { now: 32, dtMs: 16, bodies, contacts: [], events: [] }, never)).toEqual([
      { kind: 'unstick', a: 'a', b: 'b' },
    ]);
  });
});

describe('가만히 있는 이웃', () => {
  it('가끔 서로 쳐다본다 (RNG·쉬는 시간·거리)', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { idleMs: 5000 }), body('b', 1.9, { idleMs: 5000 }), body('far', 4, { idleMs: 5000 })];
    const always = () => 0;
    const ev = stepInteractions(s, { now: 0, dtMs: 1000, bodies, contacts: [], events: [] }, always);
    expect(ev).toContainEqual({ kind: 'glance', from: 'a', to: 'b' });
    expect(ev).toContainEqual({ kind: 'glance', from: 'b', to: 'a' });
    // 멀리 있는 말랑이는 이웃이 없다 (가장 가까운 b 도 반지름 합 2.6 배 밖)
    expect(ev.some((e) => e.kind === 'glance' && e.from === 'far')).toBe(false);
    // 한 번 보면 한동안 쉰다
    expect(stepInteractions(s, { now: 1000, dtMs: 1000, bodies, contacts: [], events: [] }, always)).toEqual([]);
    // 막 만진 말랑이는 두리번거리지 않는다
    const s2 = createInteractState();
    const busy = [body('a', 1, { idleMs: 100 }), body('b', 1.9, { idleMs: 100 })];
    expect(stepInteractions(s2, { now: 0, dtMs: 1000, bodies: busy, contacts: [], events: [] }, always)).toEqual([]);
  });

  it('옆에서 졸면 따라 존다', () => {
    const s = createInteractState();
    const bodies = [body('a', 1, { dozing: true, idleMs: 30_000 }), body('b', 1.9, { idleMs: T.dozeSyncIdleMs })];
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies, contacts: [], events: [] }, never)).toContainEqual({
      kind: 'dozeTogether',
      id: 'b',
      with: 'a',
    });
    const early = [body('a', 1, { dozing: true, idleMs: 30_000 }), body('b', 1.9, { idleMs: 3000 })];
    expect(stepInteractions(s, { now: 0, dtMs: 16, bodies: early, contacts: [], events: [] }, never)).toEqual([]);
  });

  it('사라진 말랑이 기록은 지운다', () => {
    const s = createInteractState();
    hold(s, 0, 100, { bodies: [body('a', 1, { touched: true }), body('b', 1.58)], contacts: [side()] });
    expect(s.pairs.size).toBe(1);
    forgetBody(s, 'b');
    expect(s.pairs.size).toBe(0);
  });
});
