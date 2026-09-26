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
import type { MiniGame } from './types';

/**
 * 로비에 표시되는 미니게임 목록.
 * 새 게임 추가: minigames/<game-id>/index.tsx 작성 후 여기에 한 줄 추가.
 */
export const MINI_GAMES: readonly MiniGame[] = [
  buttonMalang,
  capsuleCatch,
  matching,
  rhythm,
  malangJump,
  popUp,
  stack,
  balloonFloat,
  malangTrain,
  jellySlice,
];

export function getMiniGame(id: string | undefined): MiniGame | undefined {
  return MINI_GAMES.find((g) => g.id === id);
}
