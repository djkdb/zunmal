import { describe, expect, it } from 'vitest';
import { MISSION_REWARD_COINS } from '../economy/config';
import {
  canClaimBonus,
  claimMission,
  createMissionState,
  generateDailyMissions,
  hasClaimable,
  missionLabel,
  recordMission,
  rollMissions,
  seedFromDate,
} from './missions';

describe('일일 미션 생성', () => {
  it('같은 날은 항상 같은 미션', () => {
    expect(generateDailyMissions('2026-09-25')).toEqual(generateDailyMissions('2026-09-25'));
  });

  it('날짜가 다르면 (대체로) 다른 미션', () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const variants = new Set(days.map((d) => JSON.stringify(generateDailyMissions(d))));
    expect(variants.size).toBeGreaterThan(5);
    expect(seedFromDate('2026-10-01')).not.toBe(seedFromDate('2026-10-02'));
  });

  it('3개, 서로 다른 종류, 난이도 하나씩, 보상은 설정값', () => {
    for (let d = 1; d <= 28; d++) {
      const ms = generateDailyMissions(`2026-02-${String(d).padStart(2, '0')}`);
      expect(ms).toHaveLength(3);
      expect(new Set(ms.map((m) => m.kind)).size).toBe(3);
      expect(ms.map((m) => m.difficulty).sort()).toEqual(['easy', 'hard', 'normal']);
      ms.forEach((m) => {
        expect(m.reward).toBe(MISSION_REWARD_COINS[m.difficulty]);
        expect(m.target).toBeGreaterThan(0);
        expect(missionLabel(m).length).toBeGreaterThan(0);
      });
    }
  });
});

describe('진행과 보상', () => {
  const date = '2026-09-25';
  const missions = generateDailyMissions(date);

  const complete = (state = createMissionState(date)) =>
    missions.reduce((s, m) => recordMission(s, m.kind, m.target), state);

  it('목표를 채우기 전에는 받을 수 없다', () => {
    const m = missions[0]!;
    const s = recordMission(createMissionState(date), m.kind, m.target - 1);
    expect(claimMission(s, missions, m.id)).toEqual({ ok: false, reason: 'not-done' });
    expect(hasClaimable(s, missions)).toBe(false);
  });

  it('채우면 한 번만 받는다', () => {
    const m = missions[0]!;
    const s = recordMission(createMissionState(date), m.kind, m.target);
    expect(hasClaimable(s, missions)).toBe(true);
    const r = claimMission(s, missions, m.id);
    if (!r.ok) throw new Error('claim failed');
    expect(r.coins).toBe(m.reward);
    expect(claimMission(r.state, missions, m.id)).toEqual({ ok: false, reason: 'already-claimed' });
  });

  it('3개를 모두 받아야 보너스를 받을 수 있다', () => {
    let s = complete();
    expect(canClaimBonus(s, missions)).toBe(false);
    for (const m of missions) {
      const r = claimMission(s, missions, m.id);
      if (!r.ok) throw new Error('claim failed');
      s = r.state;
    }
    expect(canClaimBonus(s, missions)).toBe(true);
    expect(canClaimBonus({ ...s, bonusClaimed: true }, missions)).toBe(false);
  });

  it('음수/0 기록은 무시', () => {
    const s = createMissionState(date);
    expect(recordMission(s, 'pet', 0)).toBe(s);
    expect(recordMission(s, 'pet', -5)).toBe(s);
  });

  it('서울 날짜가 바뀌면 진행이 초기화된다', () => {
    const s = complete();
    expect(rollMissions(s, date)).toBe(s);
    expect(rollMissions(s, '2026-09-26')).toEqual(createMissionState('2026-09-26'));
  });
});
