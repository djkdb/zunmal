import { useId, type ComponentType } from 'react';
import { materialIdFor } from '../data/materialIds';
import { affectionProgress, perkLines, type AffectionProgress, type PerkKind } from '../economy/affection';
import { josa } from '../lib/josa';
import { GiftIcon, PetIcon, ShopIcon } from './icons';
import './AffectionMeter.css';

/** 친밀도 게이지·축하 딱지가 함께 쓰는 값 (말랑이 촉감에 맞춰 가게 보너스를 센다) */
export function affectionOf(characterId: string, value: number): AffectionProgress {
  return affectionProgress(value, { material: materialIdFor(characterId) });
}

const HEART_PATH =
  'M16 27.5 C10 22.5 3.5 18 3.5 11.5 C3.5 7.4 6.6 4.6 10.3 4.6 C12.9 4.6 14.8 6 16 8.1 C17.2 6 19.1 4.6 21.7 4.6 C25.4 4.6 28.5 7.4 28.5 11.5 C28.5 18 22 22.5 16 27.5 Z';

/** 하트 하나: 옅은 바탕 + 채운 만큼(왼쪽부터) 딸기우유 + 테두리 */
function Heart({ fill, size }: { fill: number; size: number }) {
  const clip = useId();
  const w = Math.round(Math.min(1, Math.max(0, fill)) * 32 * 100) / 100;
  return (
    <svg className="heart-row__heart" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={w} height={32} />
        </clipPath>
      </defs>
      <path d={HEART_PATH} className="heart-row__empty" />
      {w > 0 && <path d={HEART_PATH} className="heart-row__full" clipPath={`url(#${clip})`} />}
      <path d={HEART_PATH} className="heart-row__line" />
    </svg>
  );
}

/** 하트 다섯 개 (그림 — 글자는 옆에서 따로 읽어 준다) */
export function HeartRow({ fills, size = 18, className }: { fills: readonly number[]; size?: number; className?: string }) {
  return (
    <span className={['heart-row', className].filter(Boolean).join(' ')} aria-hidden="true">
      {fills.map((f, i) => (
        <Heart key={i} fill={f} size={size} />
      ))}
    </span>
  );
}

const PERK_ICONS: Record<PerkKind, ComponentType<{ size?: number }>> = {
  reaction: PetIcon,
  shop: ShopIcon,
  gift: GiftIcon,
};

/** 단계가 오르면 생기는 것들: 아이콘 + 짧은 글자 알약 */
export function PerkChips({ lines, className }: { lines: ReturnType<typeof perkLines>; className?: string }) {
  return (
    <ul className={['perk-chips', className].filter(Boolean).join(' ')}>
      {lines.map((l) => {
        const Icon = PERK_ICONS[l.kind];
        return (
          <li key={l.kind + l.text} className={`perk-chip perk-chip--${l.kind}`}>
            <Icon size={18} />
            {l.text}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 도감 상세의 친밀도 칸: "친밀도 Lv.4" + 하트 5개 + "다음 레벨까지 32" + "Lv.5가 되면" 받는 것.
 * 값은 모두 affectionProgress (단계·반응 표·가게·선물 공식을 그대로 읽는다).
 */
export function AffectionMeter({ characterId, value }: { characterId: string; value: number }) {
  const p = affectionOf(characterId, value);
  const lines = p.next ? perkLines(p.next) : [];
  return (
    <section className="affection-meter" aria-label="친밀도">
      <div className="affection-meter__head">
        <p className="affection-meter__level">
          친밀도 <strong>Lv.{p.level}</strong>
        </p>
        <p className="affection-meter__left">
          {p.maxed && !p.next ? `애정 ${p.value.toLocaleString()}` : `다음 레벨까지 ${p.toNext}`}
        </p>
      </div>
      <div
        className="affection-meter__gauge"
        role="progressbar"
        aria-label={`Lv.${p.level + 1}까지`}
        aria-valuemin={0}
        aria-valuemax={p.needed}
        aria-valuenow={p.xp}
        aria-valuetext={`${p.needed} 중 ${p.xp}`}
      >
        <HeartRow fills={p.hearts} size={26} />
      </div>
      {p.next && lines.length > 0 ? (
        <div className="affection-meter__next">
          <p className="affection-meter__when">{josa(`Lv.${p.next.level}`, '이/가')} 되면</p>
          <PerkChips lines={lines} />
        </div>
      ) : (
        <p className="affection-meter__when">가장 친한 사이예요. 반응과 선물이 모두 열렸어요.</p>
      )}
    </section>
  );
}
