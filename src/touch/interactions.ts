/**
 * 말랑이끼리 놀기 — 매트 세계(world.ts)의 맞닿음·사건에서 "말랑이끼리 반응"을 골라낸다.
 * 순수 모듈 (React/DOM/three 의존 없음. 시간·RNG 주입). 상태는 성능을 위해 제자리에서 고친다.
 *
 *  - 볼 비비기(cheekRub): 한 말랑이를 다른 말랑이 옆구리에 대고 1초쯤 누르고 있으면 둘이 볼을 비빈다.
 *    둘 다 애정이 조금 오른다 — 말랑이마다 1분에 `rubPetsPerMin` 번까지만 (반복 농사 방지).
 *  - 쌓기(stack): 위에 얹혀 자리를 잡으면 아래는 "끙", 위는 신난다.
 *  - 덮치기(dropOn): 높이서 다른 말랑이 위로 떨어지면 둘 다 통 튄다.
 *  - 쿵(bumpHard): 빠르게 부딪히면 둘 다 깜짝 + 별. 같은 촉감끼리는 특별 반응(`same`):
 *    젤리 둘은 더 멀리 튕겨 나가고, 찐득이 둘은 잠깐 붙는다(stickTogether → 떨어질 때 unstick).
 *  - 흘끔(glance): 가만히 있는 이웃끼리 가끔 서로 쳐다본다.
 *  - 같이 졸기(dozeTogether): 옆 말랑이가 졸고 있으면 조금 일찍 따라 존다 (숨도 맞춘다).
 */
import type { MaterialId } from '../data/materials';
import type { RNG } from '../lib/rng';
import type { WorldContact, WorldEvent } from './world';

export const INTERACT_TUNING = {
  /** 볼 비비기: 이만큼 맞대어 누르고 있어야 한다 (ms) */
  rubHoldMs: 1000,
  /** 이만큼(반지름 합 대비)은 파고들어야 "맞대어 누름" */
  rubMinOverlap: 0.004,
  /** 옆으로 맞닿음만 (위아래로 얹힌 것은 쌓기) */
  rubMaxNz: 0.55,
  /** 잠깐 떨어져도 이 시간 안에 다시 붙으면 이어서 센다 (ms) */
  rubGraceMs: 220,
  /** 같은 쌍이 다시 볼을 비비기까지 (ms) */
  rubCooldownMs: 3500,
  /** 볼 비비기 한 번에 오르는 애정 (둘 다) */
  rubAffection: 2,
  /** 말랑이마다 1분에 볼 비비기로 애정이 오르는 횟수 상한 */
  rubPetsPerMin: 3,
  rubWindowMs: 60_000,
  /** 쌓기: 위아래 맞닿음 (n 의 높이 성분) */
  stackMinNz: 0.45,
  /** 얹힌 채로 이만큼 있어야 자리 잡은 것 (ms) */
  stackSettleMs: 280,
  stackCooldownMs: 4000,
  /** 덮치기: 위에서 이 속도(세계 단위/s) 넘게 떨어지면 둘 다 튄다 */
  dropMinSpeed: 2.6,
  /** 쿵: 옆으로 이 속도 넘게 부딪히면 깜짝 */
  bumpHardSpeed: 2.2,
  bumpCooldownMs: 700,
  /** 흘끔: 이웃 거리 (반지름 합 대비), 1초에 한 번 볼 확률, 한 말랑이가 다시 흘끔거리기까지 */
  glanceRange: 2.6,
  glancePerSec: 0.14,
  glanceCooldownMs: 6000,
  /** 흘끔: 이만큼 가만히 있어야 (ms) */
  glanceIdleMs: 2500,
  /** 같이 졸기: 이웃이 졸고 있으면 이만큼만 가만히 있어도 따라 존다 (보통 20초) */
  dozeSyncIdleMs: 9000,
  dozeRange: 2.8,
} as const;

/** 판정에 필요한 몸 하나 (세계 몸 + 말랑이 상태) */
export interface InteractBody {
  id: string;
  material: MaterialId;
  x: number;
  y: number;
  z: number;
  r: number;
  /** 손가락이 이 말랑이를 잡고 있다 (누르기·끌기·옮기기) */
  touched: boolean;
  /** 마지막으로 만지거나 부딪힌 뒤 흐른 시간 (ms) */
  idleMs: number;
  dozing: boolean;
}

export type InteractEvent =
  | { kind: 'cheekRub'; a: string; b: string; petA: boolean; petB: boolean; nx: number }
  | { kind: 'stack'; top: string; bottom: string }
  | { kind: 'dropOn'; top: string; bottom: string; speed: number }
  | { kind: 'bumpHard'; a: string; b: string; speed: number; nx: number; same: MaterialId | null }
  | { kind: 'stickTogether'; a: string; b: string }
  | { kind: 'unstick'; a: string; b: string }
  | { kind: 'glance'; from: string; to: string }
  | { kind: 'dozeTogether'; id: string; with: string };

interface PairTrack {
  /** 볼 비비기로 센 누적 시작 시각 (없으면 null) */
  rubSince: number | null;
  /** 마지막으로 맞대어 누른 시각 */
  rubSeen: number;
  lastRub: number;
  lastStack: number;
  /** 이번 얹힘은 이미 알렸다 */
  stackTold: boolean;
  lastBump: number;
  stuck: boolean;
  /** 이번 스텝에 맞닿아 있다 */
  live: boolean;
}

export interface InteractState {
  pairs: Map<string, PairTrack>;
  lastGlance: Map<string, number>;
  /** 볼 비비기로 애정이 오른 시각들 (말랑이마다) */
  rubPets: Map<string, number[]>;
}

export function createInteractState(): InteractState {
  return { pairs: new Map(), lastGlance: new Map(), rubPets: new Map() };
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function track(state: InteractState, k: string): PairTrack {
  let t = state.pairs.get(k);
  if (!t) {
    t = {
      rubSince: null,
      rubSeen: -Infinity,
      lastRub: -Infinity,
      lastStack: -Infinity,
      stackTold: false,
      lastBump: -Infinity,
      stuck: false,
      live: false,
    };
    state.pairs.set(k, t);
  }
  return t;
}

/** 이 말랑이가 볼 비비기로 애정을 받을 수 있는가 (1분 상한). 받으면 기록한다 */
export function takeRubPet(state: InteractState, id: string, now: number): boolean {
  const T = INTERACT_TUNING;
  const list = (state.rubPets.get(id) ?? []).filter((t) => now - t < T.rubWindowMs);
  const ok = list.length < T.rubPetsPerMin;
  if (ok) list.push(now);
  state.rubPets.set(id, list);
  return ok;
}

/** 말랑이가 매트에서 사라지면 기록을 지운다 */
export function forgetBody(state: InteractState, id: string): void {
  for (const k of [...state.pairs.keys()]) if (k.split('|').includes(id)) state.pairs.delete(k);
  state.lastGlance.delete(id);
}

export interface InteractInput {
  now: number;
  dtMs: number;
  bodies: readonly InteractBody[];
  contacts: readonly WorldContact[];
  events: readonly WorldEvent[];
}

/**
 * 한 프레임의 말랑이끼리 반응. 같은 입력·RNG 면 결과가 같다.
 */
export function stepInteractions(state: InteractState, input: InteractInput, rng: RNG): InteractEvent[] {
  const T = INTERACT_TUNING;
  const { now } = input;
  const out: InteractEvent[] = [];
  const byId = new Map(input.bodies.map((b) => [b.id, b]));
  for (const t of state.pairs.values()) t.live = false;

  // 1) 부딪힘 사건: 덮치기·쿵
  for (const ev of input.events) {
    if (ev.kind !== 'bump') continue;
    const a = byId.get(ev.a);
    const b = byId.get(ev.b);
    if (!a || !b) continue;
    const k = key(a.id, b.id);
    const t = track(state, k);
    if (Math.abs(ev.nz) > T.stackMinNz && ev.speed > T.dropMinSpeed) {
      const top = ev.nz > 0 ? a.id : b.id;
      const bottom = top === a.id ? b.id : a.id;
      out.push({ kind: 'dropOn', top, bottom, speed: ev.speed });
      t.lastBump = now;
      continue;
    }
    if (ev.speed > T.bumpHardSpeed && now - t.lastBump > T.bumpCooldownMs) {
      t.lastBump = now;
      out.push({
        kind: 'bumpHard',
        a: a.id,
        b: b.id,
        speed: ev.speed,
        nx: ev.nx,
        same: a.material === b.material ? a.material : null,
      });
    }
  }

  // 2) 맞닿음: 볼 비비기·쌓기·붙기
  for (const c of input.contacts) {
    const a = byId.get(c.a);
    const b = byId.get(c.b);
    if (!a || !b) continue;
    const k = key(a.id, b.id);
    const t = track(state, k);
    t.live = true;

    // 찐득이 둘: 닿으면 잠깐 붙는다
    if (!t.stuck && a.material === 'sticky' && b.material === 'sticky' && c.overlap > 0) {
      t.stuck = true;
      out.push({ kind: 'stickTogether', a: a.id, b: b.id });
    }

    // 쌓기: 위아래로 얹혀 자리 잡음 (위 말랑이를 손으로 들고 있지 않을 때)
    if (Math.abs(c.nz) > T.stackMinNz && c.overlap > 0) {
      const top = c.nz > 0 ? a : b;
      const bottom = top === a ? b : a;
      if (!t.stackTold && !top.touched && c.ageMs >= T.stackSettleMs && now - t.lastStack > T.stackCooldownMs) {
        t.stackTold = true;
        t.lastStack = now;
        out.push({ kind: 'stack', top: top.id, bottom: bottom.id });
      }
      t.rubSince = null;
      continue;
    }

    // 볼 비비기: 옆으로 맞대어 누르고 있다 (손가락이 둘 중 하나라도 잡고 있을 때)
    const pressing = (a.touched || b.touched) && Math.abs(c.nz) < T.rubMaxNz && c.overlap >= T.rubMinOverlap;
    if (pressing) {
      if (t.rubSince === null || now - t.rubSeen > T.rubGraceMs) t.rubSince = now;
      t.rubSeen = now;
      if (now - t.rubSince >= T.rubHoldMs && now - t.lastRub > T.rubCooldownMs) {
        t.lastRub = now;
        t.rubSince = null;
        const petA = takeRubPet(state, a.id, now);
        const petB = takeRubPet(state, b.id, now);
        // nx: b → a 방향 (a 는 +nx 쪽에 있다)
        out.push({ kind: 'cheekRub', a: a.id, b: b.id, petA, petB, nx: c.nx });
      }
    }
  }

  // 떨어진 쌍: 얹힘 알림 초기화, 붙어 있던 찐득이는 쩍 떨어진다
  for (const [k, t] of state.pairs) {
    if (t.live) continue;
    t.stackTold = false;
    if (t.rubSince !== null && now - t.rubSeen > T.rubGraceMs) t.rubSince = null;
    if (t.stuck) {
      t.stuck = false;
      const [a, b] = k.split('|') as [string, string];
      out.push({ kind: 'unstick', a, b });
    }
  }

  // 3) 가만히 있는 이웃: 흘끔·같이 졸기
  const bodies = input.bodies;
  const p = 1 - Math.exp(-T.glancePerSec * Math.max(0, input.dtMs) / 1000);
  for (const me of bodies) {
    if (me.touched) continue;
    let nearest: InteractBody | null = null;
    let nd = Infinity;
    let dozer: InteractBody | null = null;
    for (const o of bodies) {
      if (o === me) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y) / Math.max(1e-6, me.r + o.r);
      if (d < nd) {
        nd = d;
        nearest = o;
      }
      if (o.dozing && d < T.dozeRange && !dozer) dozer = o;
    }
    if (dozer && !me.dozing && me.idleMs >= T.dozeSyncIdleMs) {
      out.push({ kind: 'dozeTogether', id: me.id, with: dozer.id });
      continue;
    }
    if (!nearest || me.dozing || nd > T.glanceRange || me.idleMs < T.glanceIdleMs) continue;
    if (now - (state.lastGlance.get(me.id) ?? -Infinity) < T.glanceCooldownMs) continue;
    if (rng() < p) {
      state.lastGlance.set(me.id, now);
      out.push({ kind: 'glance', from: me.id, to: nearest.id });
    }
  }
  return out;
}
