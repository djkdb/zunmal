import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { Malang, type MalangAnimation } from '../../components/Malang';
import type { Character } from '../../data/characters';
import { hasPartnerFlair, moodCharacter, type PartnerMood } from './partner';
import './PartnerBuddy.css';

export interface PartnerBuddyHandle {
  /**
   * 잠깐 표정을 바꾸고(기본 700ms) 톡 찌그러진다. 그 뒤 기본 표정으로 돌아온다.
   * 게임이 이미 따로 찌그러뜨리는 경우 squish: false.
   */
  react(mood: PartnerMood, ms?: number, squish?: boolean): void;
  /** 표정은 그대로 두고 찌그러짐만 */
  poke(): void;
  /** 오래 유지하는 기본 표정 (예: 병이 넘칠 것 같을 때 'oops', 끝나고 'sad') */
  setBase(mood: PartnerMood): void;
}

interface PartnerBuddyProps {
  partner: Character;
  shiny?: boolean;
  size: number;
  animation?: MalangAnimation;
  /** 전설 이상이면 희귀도 오라를 두른다 (기본 켜짐) */
  flair?: boolean;
  /** 표정 옆에 작은 기호(하트·별·땀방울)를 띄운다 (기본 켜짐) */
  emote?: boolean;
  className?: string;
  style?: CSSProperties;
  /** 위치를 직접 옮길 때 쓰는 바깥 요소 ref */
  elRef?: Ref<HTMLDivElement>;
  ref?: Ref<PartnerBuddyHandle>;
}

/**
 * 게임 속 파트너 말랑이 (연출 전용).
 * 표정·찌그러짐 상태를 스스로 들고 있어서, 게임 컴포넌트가 HUD 때문에 자주 다시 그려져도
 * 무거운 SVG는 표정이 바뀔 때만 다시 그린다. 게임은 ref 핸들로 반응만 알려 준다.
 */
export const PartnerBuddy = memo(function PartnerBuddy({
  partner,
  shiny = false,
  size,
  animation = 'idle',
  flair = true,
  emote = true,
  className,
  style,
  elRef,
  ref,
}: PartnerBuddyProps) {
  const [base, setBaseMood] = useState<PartnerMood>('idle');
  const [flash, setFlash] = useState<{ mood: PartnerMood; n: number } | null>(null);
  const [poke, setPoke] = useState(0);
  const timer = useRef(0);
  const seq = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const react = useCallback((mood: PartnerMood, ms = 700, squish = true) => {
    seq.current += 1;
    const n = seq.current;
    setFlash({ mood, n });
    if (squish) setPoke((p) => p + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash((f) => (f?.n === n ? null : f)), ms);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      react,
      poke: () => setPoke((p) => p + 1),
      setBase: (mood) => setBaseMood(mood),
    }),
    [react],
  );

  const mood = flash?.mood ?? base;
  const character = useMemo(() => moodCharacter(partner, mood), [partner, mood]);
  const aura = flair && hasPartnerFlair(partner.rarity) ? 'auto' : 'none';

  return (
    <div
      ref={elRef}
      className={['buddy', `buddy--${mood}`, className].filter(Boolean).join(' ')}
      style={{ '--buddy-size': `${size}px`, ...style } as CSSProperties}
      aria-hidden="true"
    >
      <Malang character={character} size={size} animation={animation} poke={poke} shiny={shiny} aura={aura} decorative />
      {emote && mood !== 'idle' && <Emote key={flash?.n ?? `base-${mood}`} mood={mood} />}
    </div>
  );
});

/** 표정 기호: 모양으로 구분 (하트, 네 갈래 별, 땀방울, 시무룩 선) */
function Emote({ mood }: { mood: Exclude<PartnerMood, 'idle'> | PartnerMood }) {
  let art;
  switch (mood) {
    case 'happy':
      art = (
        <path
          d="M12 20 C4 14 2 10 4.5 6.5 C7 3.5 10.5 4.5 12 7.5 C13.5 4.5 17 3.5 19.5 6.5 C22 10 20 14 12 20 Z"
          fill="#ff7aa2"
          stroke="#2b2233"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
      break;
    case 'wow':
      art = (
        <path
          d="M12 1.5 Q13.4 10.6 22.5 12 Q13.4 13.4 12 22.5 Q10.6 13.4 1.5 12 Q10.6 10.6 12 1.5 Z"
          fill="#ffd23f"
          stroke="#2b2233"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
      break;
    case 'oops':
      art = (
        <path
          d="M12 3 C15 8 18 11.5 18 15 A6 6 0 0 1 6 15 C6 11.5 9 8 12 3 Z"
          fill="#8fd9ff"
          stroke="#2b2233"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
      break;
    case 'sad':
      art = (
        <path d="M6 6 v8 M12 4 v10 M18 6 v8" stroke="#6a5a80" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      );
      break;
    default:
      return null;
  }
  return (
    <svg className={`buddy__emote buddy__emote--${mood}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}
