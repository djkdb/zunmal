import { useState, type CSSProperties } from 'react';
import { getCharacter } from '../../data/characters';
import { orderSetsForDisplay, type CollectionSummary, type SetProgress } from '../../data/collectionProgress';
import { SET_REWARD_COINS } from '../../economy/config';
import { RARITY_META } from '../../data/rarity';
import { Malang } from '../Malang';
import { RarityBadge } from '../RarityBadge';
import { CheckIcon, CoinIcon } from '../icons';
import { MysteryMalang } from './MysteryMalang';
import { useSetClaim } from './useSetClaim';
import './SetList.css';

/**
 * 세트 탭: 받을 수 있음 → 가까운 세트 → 시작 안 한 세트 → 받은 세트 (`orderSetsForDisplay`).
 * 순서는 탭을 열 때 한 번 정한다 — 받자마자 카드가 맨 뒤로 튀지 않게.
 */
export function SetList({ summary, onOpen }: { summary: CollectionSummary; onOpen(id: string): void }) {
  const [order] = useState(() => orderSetsForDisplay(summary.sets).map((s) => s.set.id));
  const byId = new Map(summary.sets.map((s) => [s.set.id, s]));
  return (
    <ul className="sets">
      {order.map((id) => {
        const p = byId.get(id);
        return p ? <SetCard key={id} progress={p} onOpen={onOpen} /> : null;
      })}
    </ul>
  );
}

function SetCard({ progress, onOpen }: { progress: SetProgress; onOpen(id: string): void }) {
  const { set } = progress;
  const claim = useSetClaim();
  const reward = SET_REWARD_COINS[set.tier];
  const missing = new Set(progress.missingIds);
  const state = progress.claimable ? 'claimable' : progress.claimed ? 'claimed' : 'open';

  return (
    <li
      className={`set-card set-card--${set.tier} is-${state}`}
      style={{ '--set-color': set.color } as CSSProperties}
    >
      <div className="set-card__head">
        <div className="set-card__titles">
          <h2 className="set-card__name">{set.name}</h2>
          <p className="set-card__desc">{set.description}</p>
        </div>
        <span className="set-card__reward" aria-label={`세트 보상 ${reward.toLocaleString()}코인`}>
          <CoinIcon size={20} />
          {reward.toLocaleString()}
        </span>
      </div>

      <div className="set-card__meter">
        <span
          className="set-card__bar"
          role="progressbar"
          aria-label={`${set.name} 모은 수`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.owned}
        >
          <span style={{ width: `${progress.ratio * 100}%` }} />
        </span>
        <span className="set-card__count">
          {progress.owned}/{progress.total}
        </span>
      </div>

      <ul className="set-card__members">
        {set.memberIds.map((id) => {
          const c = getCharacter(id);
          if (!c) return null;
          return (
            <li key={id}>
              {missing.has(id) ? (
                <span className="set-card__member is-locked" role="img" aria-label={`아직 못 만난 ${RARITY_META[c.rarity].label} 말랑이`}>
                  <MysteryMalang character={c} size={50} />
                </span>
              ) : (
                <button type="button" className="set-card__member" aria-label={`${c.name} 자세히 보기`} onClick={() => onOpen(id)}>
                  <Malang character={c} size={46} animation="none" decorative />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="set-card__foot">
        {state === 'claimable' && (
          <button
            type="button"
            className="btn btn--primary set-card__claim"
            onClick={(e) => claim(set.id, e.currentTarget)}
          >
            <CoinIcon size={22} />
            보상 받기
          </button>
        )}
        {state === 'claimed' && (
          <p className="set-card__done">
            <CheckIcon size={18} />
            보상을 받았어요
          </p>
        )}
        {state === 'open' && (
          <p className="set-card__left">
            <span>{progress.missing}마리 남았어요</span>
            {progress.hardestMissing && (
              <span className="set-card__hardest">
                가장 드문 말랑이
                <RarityBadge rarity={progress.hardestMissing} compact />
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
