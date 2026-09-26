import type { ComponentType } from 'react';
import type { Sfx } from '../audio/sfx';
import type { Character } from '../data/characters';

export interface MiniGameResultPayload {
  /** 게임 점수. 코인 환산은 economy 모듈이 담당한다. */
  score: number;
  /** 결과 화면에 보여줄 부가 통계 (예: { 최대콤보: 32 }) */
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
}
