/**
 * 놀이방 매트 위 물건의 화면 쪽 기록.
 *  - 말랑이·봉인된 캡슐(BodyRec): 물리 위치는 world.ts 의 같은 key 몸, 반응은 MalangActor, 그림은 DOM(2D·캡슐) 또는 3D 무대의 몸.
 *  - 꾸미기 소품(PropRec): 물리는 world.ts 의 움직이지 않는 장애물(같은 key), 그림은 DOM(PropArt). 반응·입자는 없다.
 *    3D 에서는 3D 캔버스 아래 층에, 2D 에서는 말랑이와 같은 층에 깊이 순서로 그린다.
 */
import type { Character } from '../../data/characters';
import type { PropId } from '../../data/playroomDecor';
import type { FxSource } from '../touch3d/fxLayer';
import type { JellyBodyView } from '../touch3d/jellyScene';
import type { MalangActor } from './malangActor';

export type MatKind = 'malang' | 'capsule';

/** 손가락이 잡은 것의 종류 (소품은 세계의 몸이 아니라 장애물) */
export type GrabKind = MatKind | 'prop';

export interface PropRec {
  /** world 장애물 id = propKey(id) */
  key: string;
  id: PropId;
  el: HTMLDivElement | null;
}

export function propKey(id: PropId): string {
  return `prop:${id}`;
}

export interface BodyEls {
  wrap: HTMLDivElement | null;
  sprite: HTMLSpanElement | null;
  shadow: HTMLSpanElement | null;
  button: HTMLButtonElement | null;
}

export interface BodyRec {
  /** world 몸 id = `${kind}:${id}` */
  key: string;
  id: string;
  kind: MatKind;
  character: Character;
  shiny: boolean;
  actor: MalangActor | null;
  fx: FxSource | null;
  /** 준비된 3D 몸 (없으면 2D 스프라이트가 보인다) */
  view: JellyBodyView | null;
  els: BodyEls;
  /** React 다시 그리기 (얼굴·졸음) */
  listeners: Set<() => void>;
  /** 마지막으로 3D 정점을 계산한 뒤 모양이 그대로인가 */
  still: boolean;
  lastSqueeze: number;
}

export function bodyKey(kind: MatKind, id: string): string {
  return `${kind}:${id}`;
}
