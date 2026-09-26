import type { ComponentType } from 'react';
import type { Sfx } from '../audio/sfx';
import type { Character } from '../data/characters';

export interface MiniGameResultPayload {
  /** 게임 점수. 코인 환산은 economy 모듈이 담당한다. */
  score: number;
  /** 결과 화면에 보여줄 부가 통계 (예: { '최대 콤보': 32 }) */
  stats?: Record<string, number>;
}

export interface MiniGameProps {
  /** 함께 플레이하는 파트너 말랑이 (연출용). 코인 보너스는 게임 밖에서 계산된다. */
  partner: Character;
  /**
   * 파트너를 반짝 모습으로 보여 줄지 (보유한 반짝 + 사용자가 켠 경우에만 true).
   * 연출 전용이라 쓰지 않는 게임은 무시해도 된다.
   */
  partnerShiny?: boolean;
  /** 게임 종료 시 한 번 호출. 게임은 코인을 직접 지급하지 않는다. */
  onFinish(result: MiniGameResultPayload): void;
  /** 중도 포기 (점수 없음) */
  onExit(): void;
  sfx: Sfx;
}

/**
 * 로비 분류 딱지 (게임 meta에 직접 적는다). "짧게"는 적지 않는다 — 한 판 길이(durationMs)에서 계산한다(`minigames/lobby.ts`).
 *  - pick: 추천 (처음 해 봐도 재미있고 오래 붙잡게 되는 게임)
 *  - feel: 손맛 (누르고 긋고 날리는 촉감이 주인공)
 *  - record: 기록 도전 (오래 버티거나 높이 쌓아 최고 기록을 깨는 맛)
 *  - focus: 집중 (박자·기억·계획을 차분히 맞추는 게임)
 */
export type MiniGameTag = 'pick' | 'feel' | 'record' | 'focus';

export interface MiniGame {
  /** kebab-case 고유 id. 폴더명, 저장 키, 경제 배율 키로 사용 */
  id: string;
  name: string;
  description: string;
  /** 로비 카드 아이콘 */
  icon: ComponentType;
  Component: ComponentType<MiniGameProps>;
  /** 조작 방법 한 줄 안내 (선택) */
  controls?: string;
  /** 한 판 길이(대략, ms). 로비 카드에 "20초"처럼 보인다 — 게임 config 값을 그대로 넘긴다 */
  durationMs: number;
  /** 로비 카드 한 줄: 무엇을 하는 게임인지 짧은 동작 (예: "톡톡 누르기"). 앞에 길이가 붙는다 */
  blurb: string;
  /** 로비 분류 딱지 (하나 이상). 로비 위 칩 줄로 걸러 본다 */
  tags: readonly MiniGameTag[];
}

/** 로비 카드용 길이 글자: 60초 이하·1분 단위가 아니면 초, 나머지는 분 ("20초", "90초", "2분") */
export function formatPlayLength(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec > 60 && sec % 60 === 0) return `${sec / 60}분`;
  return `${sec}초`;
}
