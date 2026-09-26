import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../lib/rng';
import {
  WORLD_TUNING,
  addBody,
  createWorld,
  findDropSpot,
  getBody,
  grabBody,
  moveObstacle,
  isWorldAtRest,
  moveHeld,
  nudgeBody,
  releaseBody,
  removeBody,
  resizeWorld,
  setObstacles,
  settleWorld,
  stepWorld,
  worldEnergy,
  type World,
  type WorldEvent,
} from './world';

const R = 0.32;

function run(world: World, ms: number, frame = 16): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let t = 0; t < ms; t += frame) events.push(...stepWorld(world, frame));
  return events;
}

function body(world: World, id: string) {
  const b = getBody(world, id);
  if (!b) throw new Error(`no body ${id}`);
  return b;
}

describe('world: 올리기와 상한', () => {
  it('상한까지만 올라가고 같은 id 는 두 번 올리지 않는다', () => {
    const w = createWorld({ w: 4, d: 4 }, { cap: 3 });
    expect(addBody(w, { id: 'a', x: 1, y: 1, r: R })).toBe(true);
    expect(addBody(w, { id: 'a', x: 2, y: 2, r: R })).toBe(false);
    expect(addBody(w, { id: 'b', x: 2, y: 1, r: R })).toBe(true);
    expect(addBody(w, { id: 'c', x: 3, y: 1, r: R })).toBe(true);
    expect(addBody(w, { id: 'd', x: 3, y: 3, r: R })).toBe(false);
    expect(w.bodies).toHaveLength(3);
    expect(removeBody(w, 'b')).toBe(true);
    expect(addBody(w, { id: 'd', x: 3, y: 3, r: R })).toBe(true);
  });

  it('상한은 1..5 로 제한된다', () => {
    expect(createWorld({ w: 3, d: 3 }, { cap: 99 }).cap).toBe(WORLD_TUNING.maxBodies);
    expect(createWorld({ w: 3, d: 3 }, { cap: 0 }).cap).toBe(1);
    expect(createWorld({ w: 3, d: 3 }, { cap: Number.NaN }).cap).toBe(WORLD_TUNING.maxBodies);
  });

  it('매트 밖에 올리면 안쪽으로 들어온다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'a', x: -5, y: 99, r: R });
    const a = body(w, 'a');
    expect(a.x).toBeCloseTo(R);
    expect(a.y).toBeCloseTo(3 - R);
  });

  it('떨어뜨릴 자리는 다른 말랑이와 겹치지 않는다', () => {
    const w = createWorld({ w: 3, d: 4 });
    addBody(w, { id: 'a', x: 1.5, y: 2, r: R });
    addBody(w, { id: 'b', x: 0.6, y: 1, r: R });
    const spot = findDropSpot(w, R, createSeededRng(7));
    for (const b of w.bodies) expect(Math.hypot(b.x - spot.x, b.y - spot.y)).toBeGreaterThan(2 * R);
    expect(spot.x).toBeGreaterThanOrEqual(R);
    expect(spot.x).toBeLessThanOrEqual(3 - R);
  });
});

describe('world: 떨어지기와 착지', () => {
  it('높은 데서 떨어뜨리면 착지 사건이 한 번 이상 나고 매트 위에서 멈춘다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'a', x: 1.5, y: 1.5, z: 2, r: R });
    const events = run(w, 3000);
    const lands = events.filter((e) => e.kind === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(1);
    expect(lands[0]!.kind === 'land' && lands[0]!.speed).toBeGreaterThan(5);
    expect(body(w, 'a').z).toBe(0);
    expect(isWorldAtRest(w)).toBe(true);
  });

  it('움직임 줄이기면 덜 튄다', () => {
    const peak = (reduced: boolean) => {
      const w = createWorld({ w: 3, d: 3 }, { reducedMotion: reduced });
      addBody(w, { id: 'a', x: 1.5, y: 1.5, z: 2, r: R });
      let landed = false;
      let top = 0;
      for (let t = 0; t < 2000; t += 16) {
        const ev = stepWorld(w, 16);
        if (ev.some((e) => e.kind === 'land')) landed = true;
        if (landed) top = Math.max(top, body(w, 'a').z);
      }
      return top;
    };
    expect(peak(true)).toBeLessThan(peak(false) * 0.5);
  });
});

describe('world: 충돌', () => {
  it('겹쳐 놓인 둘은 서로 밀어내 떨어진다', () => {
    const w = createWorld({ w: 4, d: 4 });
    addBody(w, { id: 'a', x: 2, y: 2, r: R });
    addBody(w, { id: 'b', x: 2.2, y: 2, r: R });
    run(w, 1500);
    const a = body(w, 'a');
    const b = body(w, 'b');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * R * 0.95);
    // 왼쪽은 왼쪽에, 오른쪽은 오른쪽에
    expect(a.x).toBeLessThan(b.x);
  });

  it('던진 말랑이는 다른 말랑이를 뚫지 않고 밀어낸다 (부딪힘 사건 + 눌림)', () => {
    const w = createWorld({ w: 6, d: 3 });
    addBody(w, { id: 'a', x: 1, y: 1.5, r: R });
    addBody(w, { id: 'b', x: 3, y: 1.5, r: R });
    body(w, 'a').vx = 8;
    const events: WorldEvent[] = [];
    let maxSqueeze = 0;
    for (let t = 0; t < 1500; t += 8) {
      events.push(...stepWorld(w, 8));
      maxSqueeze = Math.max(maxSqueeze, Math.abs(body(w, 'b').squeezeX));
      expect(body(w, 'a').x).toBeLessThan(body(w, 'b').x);
    }
    expect(events.some((e) => e.kind === 'bump')).toBe(true);
    expect(body(w, 'b').x).toBeGreaterThan(3.05);
    expect(maxSqueeze).toBeGreaterThan(0.02);
  });

  it('벽에 부딪히면 튕겨 나오고 매트 밖으로 나가지 않는다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'a', x: 1.5, y: 1.5, r: R });
    body(w, 'a').vx = 12;
    const events = run(w, 2000, 8);
    expect(events.some((e) => e.kind === 'wall')).toBe(true);
    const a = body(w, 'a');
    expect(a.x).toBeLessThanOrEqual(3 - R + 1e-9);
    expect(a.x).toBeGreaterThanOrEqual(R - 1e-9);
  });
});

describe('world: 쌓기', () => {
  it('가운데에 올려 둔 말랑이는 위에 얹힌 채로 쉰다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'bottom', x: 1.5, y: 1.5, r: R });
    addBody(w, { id: 'top', x: 1.5, y: 1.5, z: 2 * R + 0.05, r: R });
    run(w, 5000);
    const top = body(w, 'top');
    const bottom = body(w, 'bottom');
    // 살짝 파고들지만(말랑) 매트까지 내려오지 않는다
    expect(top.z).toBeGreaterThan(2 * R * 0.8);
    expect(top.z).toBeLessThan(2 * R + 0.01);
    expect(Math.hypot(top.x - bottom.x, top.y - bottom.y)).toBeLessThan(0.05);
    expect(isWorldAtRest(w)).toBe(true);
    // 아래 말랑이는 위에서 눌린다
    expect(bottom.squeezeZ).toBeLessThan(0);
  });

  it('조금 비껴 올려도 마찰로 버틴다, 많이 비끼면 기대다 미끄러져 내려온다', () => {
    const settle = (offset: number) => {
      const w = createWorld({ w: 4, d: 3 });
      addBody(w, { id: 'bottom', x: 2, y: 1.5, r: R });
      addBody(w, { id: 'top', x: 2 + offset, y: 1.5, z: 2 * R + 0.02, r: R });
      run(w, 6000);
      return body(w, 'top').z;
    };
    expect(settle(0.25 * R)).toBeGreaterThan(R);
    expect(settle(1.6 * R)).toBeLessThan(0.05);
  });

  it('들고 옮겨 다른 말랑이 위에 놓으면 그 위에 쌓인다', () => {
    const w = createWorld({ w: 4, d: 3 });
    addBody(w, { id: 'bottom', x: 2.5, y: 1.5, r: R });
    addBody(w, { id: 'mover', x: 0.8, y: 1.5, r: R });
    grabBody(w, 'mover');
    for (let x = 0.8; x <= 2.5; x += 0.03) {
      moveHeld(w, 'mover', x, 1.5);
      run(w, 32);
    }
    run(w, 600);
    releaseBody(w, 'mover', 0, 0);
    run(w, 4000);
    expect(body(w, 'mover').z).toBeGreaterThan(R);
    expect(Math.abs(body(w, 'mover').x - body(w, 'bottom').x)).toBeLessThan(0.2);
  });

  it('납작한 말랑이(높이 < 폭)는 자기 높이만큼 위에 얹힌다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'bottom', x: 1.5, y: 1.5, r: R, h: 0.4 });
    addBody(w, { id: 'top', x: 1.5, y: 1.5, z: 0.5, r: R, h: 0.4 });
    run(w, 4000);
    const z = body(w, 'top').z;
    expect(z).toBeGreaterThan(0.32);
    expect(z).toBeLessThan(0.41);
    expect(isWorldAtRest(w)).toBe(true);
  });

  it('쌓인 채로 오래 두어도 떨리거나 에너지가 늘지 않는다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'bottom', x: 1.5, y: 1.5, r: R });
    addBody(w, { id: 'top', x: 1.5, y: 1.5, z: 2 * R, r: R });
    run(w, 3000);
    const e0 = worldEnergy(w);
    run(w, 5000);
    expect(worldEnergy(w)).toBeLessThanOrEqual(e0 + 1e-3);
    expect(isWorldAtRest(w)).toBe(true);
  });
});

describe('world: 에너지 감소', () => {
  it('던진 뒤에는 에너지가 줄어들기만 하고 몇 초 안에 멈춘다', () => {
    const w = createWorld({ w: 4, d: 4 });
    addBody(w, { id: 'a', x: 1, y: 2, r: R });
    addBody(w, { id: 'b', x: 2.5, y: 2.2, r: R });
    addBody(w, { id: 'c', x: 3, y: 1, r: R });
    grabBody(w, 'a');
    releaseBody(w, 'a', 9, 1.5);
    let prev = worldEnergy(w);
    let t = 0;
    for (; t < 6000 && !isWorldAtRest(w); t += 16) {
      stepWorld(w, 16);
      const e = worldEnergy(w);
      // 밀어내기 스프링에 잠깐 담기는 몫만큼의 오차는 허용
      expect(e).toBeLessThanOrEqual(prev + 0.05);
      prev = Math.min(prev, e);
    }
    expect(isWorldAtRest(w)).toBe(true);
    expect(t).toBeLessThan(4500);
  });

  it('큰 dt·NaN 이 와도 폭주하지 않는다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'a', x: 1.5, y: 1.5, z: 1, r: R });
    stepWorld(w, 10_000);
    stepWorld(w, Number.NaN);
    const a = body(w, 'a');
    expect(Number.isFinite(a.x + a.y + a.z + a.vx + a.vy + a.vz)).toBe(true);
  });
});

describe('world: 손가락', () => {
  it('들고 옮기면 목표를 따라가고, 놓으면 그 속도로 날아간다', () => {
    const w = createWorld({ w: 4, d: 4 });
    addBody(w, { id: 'a', x: 1, y: 1, r: R });
    grabBody(w, 'a');
    moveHeld(w, 'a', 3, 2.5);
    run(w, 800);
    const a = body(w, 'a');
    expect(a.x).toBeCloseTo(3, 1);
    expect(a.y).toBeCloseTo(2.5, 1);
    expect(a.z).toBeGreaterThan(0.1);
    releaseBody(w, 'a', -6, 0);
    expect(a.vx).toBe(-6);
    expect(a.vz).toBeGreaterThan(0);
    run(w, 300);
    expect(a.x).toBeLessThan(2.6);
  });

  it('던지는 속도에는 상한이 있다', () => {
    const w = createWorld({ w: 4, d: 4 });
    addBody(w, { id: 'a', x: 1, y: 1, r: R });
    releaseBody(w, 'a', 1000, 0);
    expect(body(w, 'a').vx).toBeLessThanOrEqual(WORLD_TUNING.maxThrow);
  });

  it('들고 있는 말랑이로 밀면 다른 말랑이가 밀려난다', () => {
    const w = createWorld({ w: 5, d: 3 });
    addBody(w, { id: 'a', x: 1, y: 1.5, r: R });
    addBody(w, { id: 'b', x: 2.2, y: 1.5, r: R });
    grabBody(w, 'a');
    for (let x = 1; x <= 2.6; x += 0.12) {
      moveHeld(w, 'a', x, 1.5);
      run(w, 32);
    }
    run(w, 400);
    expect(body(w, 'b').x).toBeGreaterThan(2.6);
  });

  it('툭 밀기: 그 방향으로 움직였다 멈춘다', () => {
    const w = createWorld({ w: 4, d: 4 });
    addBody(w, { id: 'a', x: 2, y: 2, r: R });
    nudgeBody(w, 'a', 1, 0);
    run(w, 3000);
    expect(body(w, 'a').x).toBeGreaterThan(2.1);
    expect(isWorldAtRest(w)).toBe(true);
    settleWorld(w);
    expect(body(w, 'a').vx).toBe(0);
  });

  it('매트가 줄어들면 말랑이를 안쪽으로 옮긴다', () => {
    const w = createWorld({ w: 5, d: 5 });
    addBody(w, { id: 'a', x: 4.5, y: 4.5, r: R });
    resizeWorld(w, { w: 3, d: 3 });
    expect(body(w, 'a').x).toBeLessThanOrEqual(3 - R);
    expect(body(w, 'a').y).toBeLessThanOrEqual(3 - R);
  });
});

describe('world: 소품(움직이지 않는 장애물)', () => {
  it('상한에 세지 않고, 매트 안으로 들어오고, 같은 id 는 하나만', () => {
    const w = createWorld({ w: 3, d: 3 }, { cap: 1 });
    setObstacles(w, [
      { id: 'cushion', x: -2, y: 9, r: 0.3, h: 0.3 },
      { id: 'cushion', x: 1, y: 1, r: 0.3, h: 0.3 },
      { id: 'plant', x: 2, y: 1, r: 0.2, h: 0.6 },
    ]);
    expect(w.obstacles).toHaveLength(2);
    expect(w.obstacles[0]!.x).toBeCloseTo(0.3);
    expect(w.obstacles[0]!.y).toBeCloseTo(2.7);
    expect(addBody(w, { id: 'a', x: 1.5, y: 1.5, r: R })).toBe(true);
    resizeWorld(w, { w: 1.5, d: 1.5 });
    expect(w.obstacles[1]!.x).toBeLessThanOrEqual(1.5 - 0.2 + 1e-9);
  });

  it('던진 말랑이는 소품을 뚫지 못하고 튕겨 나오며 부딪힘 사건을 낸다', () => {
    const w = createWorld({ w: 4, d: 3 });
    setObstacles(w, [{ id: 'box', x: 2.6, y: 1.5, r: 0.25, h: 0.44 }]);
    addBody(w, { id: 'a', x: 1, y: 1.5, r: R });
    releaseBody(w, 'a', 6, 0);
    let minGap = Infinity;
    const events: WorldEvent[] = [];
    for (let t = 0; t < 2000; t += 16) {
      events.push(...stepWorld(w, 16));
      const a = body(w, 'a');
      if (a.z < 0.3) minGap = Math.min(minGap, Math.hypot(a.x - 2.6, a.y - 1.5));
    }
    const a = body(w, 'a');
    expect(minGap).toBeGreaterThan((R + 0.25) * 0.6);
    expect(a.x).toBeLessThan(2.6);
    expect(events.some((e) => e.kind === 'wall' && e.id === 'a' && e.nx < 0)).toBe(true);
    // 소품은 그대로
    expect(w.obstacles[0]!.x).toBe(2.6);
  });

  it('쿠션 위에 떨어뜨리면 얹혀 쉬고, 세계가 멈춘다', () => {
    const w = createWorld({ w: 3, d: 3 });
    setObstacles(w, [{ id: 'cushion', x: 1.5, y: 1.5, r: 0.34, h: 0.26 }]);
    addBody(w, { id: 'a', x: 1.5, y: 1.5, z: 1, r: R, h: 0.6 });
    run(w, 4000);
    const a = body(w, 'a');
    expect(a.z).toBeGreaterThan(0.05);
    expect(a.supported).toBe(true);
    expect(isWorldAtRest(w)).toBe(true);
  });

  it('소품을 말랑이 밑으로 끌어 놓아도 확 튀지 않고 비켜나거나 올라앉는다', () => {
    const w = createWorld({ w: 3, d: 3 });
    addBody(w, { id: 'a', x: 1.5, y: 1.5, r: R });
    setObstacles(w, [{ id: 'box', x: 0.5, y: 0.5, r: 0.25, h: 0.44 }]);
    moveObstacle(w, 'box', 1.52, 1.5);
    let maxSpeed = 0;
    for (let t = 0; t < 3000; t += 16) {
      stepWorld(w, 16);
      const a = body(w, 'a');
      maxSpeed = Math.max(maxSpeed, Math.hypot(a.vx, a.vy, a.vz));
    }
    const a = body(w, 'a');
    expect(maxSpeed).toBeLessThan(6);
    const beside = Math.hypot(a.x - 1.52, a.y - 1.5) > (R + 0.25) * 0.8;
    const onTop = a.z > 0.1 && a.supported;
    expect(beside || onTop).toBe(true);
    expect(isWorldAtRest(w)).toBe(true);
    expect(moveObstacle(w, 'nope', 1, 1)).toBeNull();
  });

  it('새 말랑이는 소품을 피해 떨어뜨린다', () => {
    const w = createWorld({ w: 3, d: 3 });
    setObstacles(w, [
      { id: 'a', x: 1.5, y: 1.65, r: 0.34, h: 0.26 },
      { id: 'b', x: 0.6, y: 0.6, r: 0.25, h: 0.4 },
    ]);
    const spot = findDropSpot(w, R, createSeededRng(3));
    for (const o of w.obstacles) expect(Math.hypot(spot.x - o.x, spot.y - o.y)).toBeGreaterThan(o.r + R);
  });

  it('들고 가져가면 소품 위에 올라탄다', () => {
    const w = createWorld({ w: 3, d: 3 });
    setObstacles(w, [{ id: 'cushion', x: 1.8, y: 1.5, r: 0.34, h: 0.26 }]);
    addBody(w, { id: 'a', x: 0.6, y: 1.5, r: R, h: 0.6 });
    grabBody(w, 'a');
    for (let i = 0; i <= 60; i++) {
      moveHeld(w, 'a', 0.6 + (1.2 * i) / 60, 1.5);
      stepWorld(w, 16);
    }
    releaseBody(w, 'a', 0, 0);
    run(w, 3000);
    const a = body(w, 'a');
    expect(a.z).toBeGreaterThan(0.05);
    expect(Math.hypot(a.x - 1.8, a.y - 1.5)).toBeLessThan(0.4);
  });
});
