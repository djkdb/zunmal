import type { Character } from '../../data/characters';
import { Malang } from '../Malang';
import { RarityMark } from '../RarityBadge';

/**
 * 아직 못 만난 말랑이: 등급 색 캡슐(위 반쪽 등급 색 + 흰 아래 반쪽 + 이음새) 속 실루엣과 "?" + 구석의 등급 모양.
 * 등급 글자는 쓰는 곳이 RarityBadge·진열장 제목·aria-label 로 함께 준다(색만으로 알리지 않기).
 */
export function MysteryMalang({ character, size }: { character: Character; size: number }) {
  return (
    <span className={`mystery mystery--${character.rarity}`} style={{ width: size, height: size }} aria-hidden="true">
      <Malang character={character} size={Math.round(size * 0.84)} animation="none" silhouette decorative />
      <span className="mystery__mark">
        <RarityMark rarity={character.rarity} size={Math.max(9, Math.round(size * 0.14))} />
      </span>
    </span>
  );
}
