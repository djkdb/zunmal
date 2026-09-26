import { describe, expect, it } from 'vitest';
import { firstRunProgress } from './firstRun';
import { readHub } from './hubState';
import { NOW, ownedMap, starterSave } from './testSave';

const progressOf = (patch: Parameters<typeof starterSave>[0]) => firstRunProgress(readHub(starterSave(patch), NOW));

describe('firstRunProgress', () => {
  it('시작 말랑이만 고른 직후: 1/6, 다음은 첫 뽑기', () => {
    const p = progressOf({});
    expect(p.done).toBe(1);
    expect(p.total).toBe(6);
    expect(p.current).toBe('pull');
    expect(p.complete).toBe(false);
  });

  it('첫 뽑기 뒤 새 말랑이가 캡슐째 있으면 열기', () => {
    const p = progressOf({
      totalPulls: 1,
      ownedMalangs: { ...ownedMap(['peach-mochi']), ...ownedMap(['grape-jelly'], NOW) },
    });
    expect(p.current).toBe('open');
    expect(p.done).toBe(2);
  });

  it('중복만 나왔으면(봉인 캡슐 없음) 열기는 한 것으로 본다', () => {
    const p = progressOf({ totalPulls: 1 });
    expect(p.steps.find((s) => s.id === 'open')?.done).toBe(true);
    expect(p.current).toBe('touch');
  });

  it('열기 → 쓰다듬기 → 미니게임 → 한 번 더 뽑기 → 끝', () => {
    const opened = { totalPulls: 1, ownedMalangs: ownedMap(['peach-mochi', 'grape-jelly']), unboxed: ['peach-mochi', 'grape-jelly'] };
    expect(progressOf(opened).current).toBe('touch');
    const petted = { ...opened, affection: { 'grape-jelly': 3 } };
    expect(progressOf(petted).current).toBe('play');
    const played = { ...petted, miniGameRecords: { stack: { bestScore: 10, lastScore: 10, plays: 1 } } };
    expect(progressOf(played).current).toBe('pull-again');
    expect(progressOf(played).done).toBe(5);
    const done = progressOf({ ...played, totalPulls: 2 });
    expect(done.complete).toBe(true);
    expect(done.current).toBeNull();
    expect(done.done).toBe(6);
  });

  it('순서와 상관없이 한 단계도 센다', () => {
    const p = progressOf({ affection: { 'peach-mochi': 5 }, miniGameRecords: { stack: { bestScore: 1, lastScore: 1, plays: 2 } } });
    expect(p.done).toBe(3);
    expect(p.current).toBe('pull');
  });

  it('10연 한 번이면 두 뽑기 단계를 함께 끝낸다', () => {
    const p = progressOf({ totalPulls: 10 });
    expect(p.steps.filter((s) => s.id === 'pull' || s.id === 'pull-again').every((s) => s.done)).toBe(true);
  });
});
