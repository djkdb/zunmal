/**
 * 놀이방 매트 위 물건 하나(말랑이 또는 봉인된 캡슐)의 화면 쪽 기록.
 * 물리 위치는 world.ts 의 같은 key 몸, 반응은 MalangActor, 그림은 DOM(2D·캡슐) 또는 3D 무대의 몸.
 * 3단계(꾸미기 소품)도 같은 기록에 kind 를 더해 매트 위에 올리면 된다.
 */
import type { Character } from '../../data/characters';
import type { FxSource } from '../touch3d/fxLayer';
import type { JellyBodyView } from '../touch3d/jellyScene';
import type { MalangActor } from './malangActor';

export type MatKind = 'malang' | 'capsule';

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
