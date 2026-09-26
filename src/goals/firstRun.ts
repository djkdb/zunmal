/**
 * 첫걸음 — 처음 1~3분의 흐름. 순수 모듈. 새 저장 필드 없이 이미 있는 저장 값으로 단계마다 "했는지"를 계산한다.
 *
 * | 단계 | 할 일 | 했다고 보는 조건 (저장 값) |
 * |---|---|---|
 * | starter | 첫 말랑이 고르기 | 보유 말랑이가 있다 (`ownedMalangs`) |
 * | pull | 첫 캡슐 뽑기 | `totalPulls ≥ 1` |
 * | open | 새 말랑이 캡슐 열기 | 시작 말랑이 말고 연 말랑이가 있다(`unboxed` 2개 이상), 또는 뽑았는데 봉인 캡슐이 없다(중복만 나옴) |
 * | touch | 말랑이 쓰다듬기 | `affection` 중 하나라도 0보다 크다 |
 * | play | 미니게임 한 판 | `miniGameRecords` 판 수 합 ≥ 1 |
 * | pull-again | 모은 코인으로 한 번 더 뽑기 | `totalPulls ≥ 2` |
 *
 * 순서와 상관없이 해도 센다. 지금 단계 = 순서상 아직 안 한 첫 단계. 모두 하면 홈에서 첫걸음 안내가 사라진다.
 * 시작 말랑이 고르기는 홈에 오기 전에 이미 끝나 있어 "1/6부터" 시작한다(이미 한 걸음 뗀 느낌).
 */
import type { HubState } from './hubState';

export const FIRST_RUN_STEPS = ['starter', 'pull', 'open', 'touch', 'play', 'pull-again'] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

export interface FirstRunProgress {
  steps: { id: FirstRunStep; done: boolean }[];
  done: number;
  total: number;
  /** 순서상 아직 안 한 첫 단계 (모두 했으면 null) */
  current: FirstRunStep | null;
  complete: boolean;
}

type FirstRunInput = Pick<HubState, 'petted' | 'plays' | 'sealed'> & {
  save: Pick<HubState['save'], 'ownedMalangs' | 'totalPulls' | 'unboxed'>;
};

export function isFirstRunStepDone(step: FirstRunStep, hub: FirstRunInput): boolean {
  const { save } = hub;
  switch (step) {
    case 'starter':
      return Object.keys(save.ownedMalangs).length > 0;
    case 'pull':
      return save.totalPulls >= 1;
    case 'open':
      return save.unboxed.length >= 2 || (save.totalPulls >= 1 && hub.sealed.length === 0);
    case 'touch':
      return hub.petted;
    case 'play':
      return hub.plays >= 1;
    case 'pull-again':
      return save.totalPulls >= 2;
  }
}

export function firstRunProgress(hub: FirstRunInput): FirstRunProgress {
  const steps = FIRST_RUN_STEPS.map((id) => ({ id, done: isFirstRunStepDone(id, hub) }));
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.id ?? null;
  return { steps, done, total: steps.length, current, complete: current === null };
}
