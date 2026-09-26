import buttonMalang from './button-malang';
import capsuleCatch from './capsule-catch';
import matching from './matching';
import rhythm from './rhythm';
import malangJump from './malang-jump';
import popUp from './pop-up';
import stack from './stack';
import balloonFloat from './balloon-float';
import malangTrain from './malang-train';
import jellySlice from './jelly-slice';
import malangSling from './malang-sling';
import malangMerge from './malang-merge';
import type { MiniGame } from './types';

/**
 * 로비에 표시되는 미니게임 목록.
 * 새 게임 추가: minigames/<game-id>/index.tsx 작성 후 여기에 한 줄 추가.
 */
export const MINI_GAMES: readonly MiniGame[] = [
  // 로비 순서 = 추천 순서. 한 번 잡으면 계속하게 되는 물리·손맛 게임을 위에, 단순 연타·기억 게임을 아래에 둔다.
  malangMerge, // 수박게임식 합치기 — 가장 중독성 있음
  jellySlice, // 쓱 긋는 손맛
  malangSling, // 탑 무너뜨리기
  balloonFloat,
  malangJump,
  malangTrain,
  popUp,
  capsuleCatch,
  stack,
  rhythm,
  matching,
  buttonMalang,
];

/** 처음 온 플레이어에게 하나만 추천하는 게임 (첫 사용자 시험에서 가장 재미있다고 꼽힌 합치기) */
export const RECOMMENDED_GAME_ID = 'malang-merge';

export function getMiniGame(id: string | undefined): MiniGame | undefined {
  return MINI_GAMES.find((g) => g.id === id);
}
