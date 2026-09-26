import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../lib/rng';
import {
  GROUND_Y,
  SIZES,
  SLING,
  SLING_CONFIG as C,
  TEMPLATES,
  WORLD,
  buildStage,
  clampPull,
  createBody,
  createSlingState,
  enemiesLeft,
  fire,
  launchVelocity,
  pickStageTemplates,
  previewTrajectory,
  pullFromAngle,
  step,
  timeLeft,
  type Body,
  type SlingEvent,
  type SlingState,
  type TemplateId,
} from './logic';

const R = C.projectileRadius;

/** 원하는 몸체만 있는 스테이지 (다음 스테이지로 같은 배치 하나를 더 둔다) */
function stateWith(bodies: Body[], extra: Partial<SlingState> = {}): SlingState {
  const base = createSlingState(createSeededRng(1));
  return { ...base, bodies, stages: [bodies, bodies], ...extra };
}

function enemy(id: number, cx: number, bottom = GROUND_Y) {
  return createBody(id, 'enemy', cx, bottom, SIZES.enemy.w, SIZES.enemy.h);
}

/** 말랑이를 원하는 위치·속도로 날리는 중인 상태 */
function flying(bodies: Body[], x: number, y: number, vx: number, vy: number): SlingState {
  return stateWith(bodies, {
    phase: 'flying',
    shotsLeft: C.shotsPerStage - 1,
    shotsFired: 1,
    projectile: { x, y, vx, vy, active: true, flightMs: 0, restMs: 0 },
  });
}

function run(state: SlingState, ms: number, dt = 16) {
  let s = state;
  const events: SlingEvent[] = [];
  for (let t = 0; t < ms; t += dt) {
    const r = step(s, dt);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** 비행·정리 단계가 끝날 때까지 */
function runShot(state: SlingState) {
  let s = state;
  const events: SlingEvent[] = [];
  for (let t = 0; t < 12_000 && (s.phase === 'flying' || s.phase === 'settling'); t += 16) {
    const r = step(s, 16);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

function overlaps(a: Body, b: Body) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

describe('조준', () => {
  it('당긴 길이는 maxPull로 잘린다', () => {
    const p = clampPull(-300, 400);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(C.maxPull);
    expect(p.x / p.y).toBeCloseTo(-300 / 400);
    expect(clampPull(-10, 5)).toEqual({ x: -10, y: 5 });
  });

  it('발사 방향은 당긴 방향의 반대, 속도는 당긴 길이에 비례', () => {
    const v = launchVelocity(-C.maxPull / 2, 0);
    expect(v).not.toBeNull();
    expect(v!.x).toBeCloseTo(C.maxLaunchSpeed / 2);
    expect(v!.y).toBeCloseTo(0);
    const up = launchVelocity(-30, 30);
    expect(up!.x).toBeGreaterThan(0);
    expect(up!.y).toBeLessThan(0);
  });

  it('최대로 당겨도 속도는 maxLaunchSpeed를 넘지 않는다', () => {
    const v = launchVelocity(-1000, 1000)!;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(C.maxLaunchSpeed);
  });

  it('조금만 당기면 발사 취소', () => {
    expect(launchVelocity(-C.minPull + 1, 0)).toBeNull();
    expect(launchVelocity(0, 0)).toBeNull();
  });

  it('키보드 각도·힘 → 당긴 벡터 → 같은 각도로 발사', () => {
    const pull = pullFromAngle(30, 1);
    expect(Math.hypot(pull.x, pull.y)).toBeCloseTo(C.maxPull);
    const v = launchVelocity(pull.x, pull.y)!;
    expect((Math.atan2(-v.y, v.x) * 180) / Math.PI).toBeCloseTo(30);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(C.maxLaunchSpeed);
    // 힘은 0~1로 잘린다
    const over = pullFromAngle(0, 3);
    expect(Math.hypot(over.x, over.y)).toBeCloseTo(C.maxPull);
  });

  it('조준선은 앞부분만, 실제 비행과 같은 경로를 보여준다', () => {
    const pull = pullFromAngle(40, 0.8);
    const v = launchVelocity(pull.x, pull.y)!;
    const start = { x: SLING.x + pull.x, y: SLING.y + pull.y };
    const dots = previewTrajectory(v, start);
    expect(dots).toHaveLength(C.previewDots);

    // 빈 무대에서 실제로 쏘아 같은 시각의 위치와 비교
    let s = stateWith([]);
    s = fire(s, pull.x, pull.y).state;
    const last = dots[dots.length - 1]!;
    for (let i = 0; i < C.previewDots * C.previewDotEvery; i++) s = step(s, C.substepMs + 1e-9).state;
    expect(s.projectile!.x).toBeCloseTo(last.x, 3);
    expect(s.projectile!.y).toBeCloseTo(last.y, 3);
    // 점 사이 간격은 일정한 시간 간격
    expect(dots[0]!.x - start.x).toBeCloseTo((v.x * C.previewDotEvery * C.substepMs) / 1000, 3);
  });
});

describe('스테이지 생성', () => {
  it('순서: 기둥 문 → 중간 둘 → 성, 같은 틀은 겹치지 않는다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ids = pickStageTemplates(createSeededRng(seed));
      expect(ids).toHaveLength(C.stageCount);
      expect(ids[0]).toBe('gate');
      expect(ids[ids.length - 1]).toBe('castle');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('같은 시드면 같은 스테이지', () => {
    expect(createSlingState(createSeededRng(7)).stages).toEqual(createSlingState(createSeededRng(7)).stages);
  });

  it.each(Object.keys(TEMPLATES) as TemplateId[])('%s: 화면 안, 서로 겹치지 않고, 심술 사탕이 있다', (id) => {
    for (let seed = 1; seed <= 20; seed++) {
      const bodies = buildStage(id, createSeededRng(seed));
      expect(bodies.filter((b) => b.kind === 'enemy').length).toBeGreaterThanOrEqual(2);
      for (const b of bodies) {
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(SLING.x + 60);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(WORLD.width);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(GROUND_Y);
        expect(b.y - b.h / 2).toBeGreaterThan(0);
      }
      for (let i = 0; i < bodies.length; i++)
        for (let j = i + 1; j < bodies.length; j++) expect(overlaps(bodies[i]!, bodies[j]!)).toBe(false);
      expect(new Set(bodies.map((b) => b.id)).size).toBe(bodies.length);
    }
  });

  it.each(Object.keys(TEMPLATES) as TemplateId[])('%s: 건드리지 않으면 그대로 서 있다', (id) => {
    const bodies = buildStage(id, createSeededRng(3));
    const { state } = run(stateWith(bodies), 3000);
    expect(state.bodies).toEqual(bodies);
    expect(state.score).toBe(0);
  });
});

describe('발사', () => {
  it('발사하면 남은 발사가 줄고 비행 단계로', () => {
    const s = createSlingState(createSeededRng(2));
    const r = fire(s, -60, 40);
    expect(r.launched).toBe(true);
    expect(r.state.shotsLeft).toBe(C.shotsPerStage - 1);
    expect(r.state.phase).toBe('flying');
    expect(r.state.projectile?.active).toBe(true);
    expect(r.events[0]).toMatchObject({ type: 'launch' });
    // 날아가는 중에는 다시 쏠 수 없다
    expect(fire(r.state, -60, 40).launched).toBe(false);
  });

  it('너무 짧게 당기면 발사하지 않는다', () => {
    const s = createSlingState(createSeededRng(2));
    const r = fire(s, -3, 2);
    expect(r.launched).toBe(false);
    expect(r.state).toBe(s);
  });

  it('step은 입력 상태를 바꾸지 않는다', () => {
    const s = fire(createSlingState(createSeededRng(2)), -70, 30).state;
    const snapshot = JSON.parse(JSON.stringify(s)) as unknown;
    step(s, 16);
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });
});

describe('충돌', () => {
  it('바닥에 떨어지면 튕기며 속도가 줄어든다', () => {
    const s = flying([], 100, GROUND_Y - R - 2, 50, 400);
    const { state, events } = run(s, 50);
    const p = state.projectile!;
    expect(p.y).toBeLessThanOrEqual(GROUND_Y - R + 1e-6);
    expect(p.vy).toBeLessThan(0);
    expect(Math.abs(p.vy)).toBeLessThan(400);
    expect(events.some((e) => e.type === 'impact' && e.target === 'ground')).toBe(true);
  });

  it('세게 맞은 심술 사탕은 터지고 50점', () => {
    const s = flying([enemy(1, 200)], 150, GROUND_Y - 12, 500, 0);
    const { state, events } = run(s, 200);
    expect(enemiesLeft(state)).toBe(0);
    expect(state.pops).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'pop', points: C.points.enemy, combo: 1 }));
  });

  it('살짝 닿으면 터지지 않고 말랑이가 튕겨 나온다', () => {
    const s = flying([enemy(1, 200)], 170, GROUND_Y - 12, 150, 0);
    const { state, events } = run(s, 150);
    expect(enemiesLeft(state)).toBe(1);
    expect(state.projectile!.vx).toBeLessThanOrEqual(0);
    expect(events.some((e) => e.type === 'impact' && e.target === 'enemy')).toBe(true);
  });

  it('부딪힌 블록은 옆으로 밀려난다', () => {
    const cube = createBody(1, 'choco', 200, GROUND_Y, 26, 26);
    const s = flying([cube], 160, GROUND_Y - 13, 420, 0);
    const { state } = run(s, 600);
    const moved = state.bodies.find((b) => b.id === 1)!;
    expect(moved.x).toBeGreaterThan(200);
  });

  it('여러 번 맞으면 블록이 깨지고 점수를 준다', () => {
    const plank = createBody(1, 'jelly', 200, GROUND_Y, 64, 14);
    const s = flying([plank], 200, GROUND_Y - 120, 0, 600);
    const { state, events } = run(s, 400);
    expect(state.bodies).toHaveLength(0);
    expect(state.blocksBroken).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'break', kind: 'jelly', points: C.points.jelly }));
  });

  it('받침이 없는 심술 사탕은 떨어져 터진다', () => {
    const s = stateWith([enemy(1, 200, GROUND_Y - 120)]);
    const { state } = run(s, 1000);
    expect(state.pops).toBe(1);
  });

  it('살짝 떨어지면(블록 한 칸 미만) 버틴다', () => {
    const s = stateWith([enemy(1, 200, GROUND_Y - 20)]);
    const { state } = run(s, 1000);
    expect(state.pops).toBe(0);
    const e = state.bodies[0]!;
    expect(e.y + e.h / 2).toBeCloseTo(GROUND_Y);
    expect(e.awake).toBe(false);
  });

  it('무게 중심이 받침 밖이면 미끄러져 떨어진다', () => {
    const base = createBody(1, 'choco', 200, GROUND_Y, 26, 60);
    // 가운데가 받침 오른쪽 끝(213)보다 바깥
    const top = createBody(2, 'jelly', 222, GROUND_Y - 60, 26, 26);
    const { state } = run(stateWith([base, top]), 1500);
    const fallen = state.bodies.find((b) => b.id === 2);
    if (fallen) {
      expect(fallen.x).toBeGreaterThan(222);
      expect(fallen.y + fallen.h / 2).toBeCloseTo(GROUND_Y);
    }
    // 받침은 그대로
    expect(state.bodies.find((b) => b.id === 1)).toMatchObject({ x: 200 });
  });

  it('받침을 치우면 위에 있던 사탕이 떨어져 터진다', () => {
    const pillar = createBody(1, 'jelly', 200, GROUND_Y, 20, 80);
    const top = enemy(2, 200, GROUND_Y - 80);
    const s = flying([pillar, top], 160, GROUND_Y - 30, 640, 0);
    const { state } = run(s, 2000);
    expect(state.pops).toBe(1);
  });

  it('화면 밖으로 떨어진 사탕도 터진 것으로 친다', () => {
    const e = enemy(1, WORLD.width - 5);
    const s = flying([e], WORLD.width - 50, GROUND_Y - 12, 200, 0);
    const moving = { ...s, bodies: [{ ...e, awake: true, vx: 400 }] };
    const { state } = run(moving, 600);
    expect(state.pops).toBe(1);
  });

  it('한 발에 여러 개 터뜨리면 두 번째부터 보너스', () => {
    const s = flying([enemy(1, 180), enemy(2, 240)], 130, GROUND_Y - 12, 640, 0);
    const { state, events } = run(s, 600);
    const pops = events.filter((e): e is Extract<SlingEvent, { type: 'pop' }> => e.type === 'pop');
    expect(pops).toHaveLength(2);
    expect(pops[1]).toMatchObject({ combo: 2, points: C.points.enemy + C.points.multiPop });
    expect(state.score).toBeGreaterThanOrEqual(C.points.enemy * 2 + C.points.multiPop);
  });
});

describe('진행', () => {
  it('비행은 멈추거나 화면 밖으로 나가면 끝나고 조준으로 돌아간다', () => {
    const s = flying([enemy(1, 280)], 100, 100, -300, 0);
    const { state, events } = runShot(s);
    expect(events.some((e) => e.type === 'shotEnd')).toBe(true);
    expect(state.phase).toBe('aim');
    expect(state.projectile?.active).toBe(false);
  });

  it('비행은 시간 제한이 있다', () => {
    // 바닥에서 계속 굴러가지 않게 멈춘 몸체 사이에 끼인 경우 대비: 시간 초과로도 끝난다
    const s = flying([], 160, 100, 0, 0);
    const p = { ...s.projectile!, flightMs: C.flightTimeoutMs - 10 };
    const { state } = run({ ...s, projectile: p }, 50);
    expect(state.projectile?.active).toBe(false);
  });

  it('사탕을 다 터뜨리면 클리어 보너스 + 남은 발사 보너스, 다음 스테이지로', () => {
    const s = flying([enemy(1, 200)], 150, GROUND_Y - 12, 500, 0);
    const { state, events } = runShot(s);
    const leftover = C.shotsPerStage - 1;
    const bonus = C.points.stageClear + leftover * C.points.leftoverShot;
    expect(events).toContainEqual({ type: 'stageClear', bonus, leftover });
    expect(state.phase).toBe('clear');
    expect(state.score).toBe(C.points.enemy + bonus);
    expect(state.stagesCleared).toBe(1);

    const next = run(state, C.interludeMs + 50);
    expect(next.events).toContainEqual({ type: 'nextStage', stageIndex: 1 });
    expect(next.state.phase).toBe('aim');
    expect(next.state.shotsLeft).toBe(C.shotsPerStage);
    expect(enemiesLeft(next.state)).toBe(1);
  });

  it('발사를 다 쓰면 실패 후 다음 스테이지, 마지막이면 끝', () => {
    const lone = [enemy(1, 280)];
    let s = stateWith(lone, { stageIndex: 1, stages: [lone, lone] });
    for (let shot = 0; shot < C.shotsPerStage; shot++) {
      expect(s.phase).toBe('aim');
      s = fire(s, 60, 0).state; // 뒤로 쏘기
      s = runShot(s).state;
    }
    expect(s.phase).toBe('fail');
    const { state, events } = run(s, C.interludeMs + 50);
    expect(events).toContainEqual({ type: 'finish', reason: 'complete' });
    expect(state.finished).toBe(true);
    expect(state.endReason).toBe('complete');
  });

  it('120초가 지나면 끝', () => {
    const s = createSlingState(createSeededRng(4));
    const { state, events } = run(s, C.durationMs + 100, 50);
    expect(state.finished).toBe(true);
    expect(state.endReason).toBe('time');
    expect(timeLeft(state)).toBe(0);
    expect(events.filter((e) => e.type === 'finish')).toHaveLength(1);
    expect(step(state, 16).state).toBe(state);
  });

  it('한 프레임 dt는 상한이 있다', () => {
    const s = createSlingState(createSeededRng(4));
    expect(step(s, 5000).state.elapsedMs).toBe(C.maxDtMs);
  });
});
