import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import { getCharacter } from '../../data/characters';
import {
  expectedPullsToCollect,
  roughPullCount,
  type CollectionSummary,
  type SetProgress,
} from '../../data/collectionProgress';
import { PULL_PRICE, SET_REWARD_COINS } from '../../economy/config';
import { useGameStore } from '../../store/useGameStore';
import { RarityBadge } from '../RarityBadge';
import { CapsuleIcon, CoinIcon, JoystickIcon } from '../icons';
import { MysteryMalang } from './MysteryMalang';
import { useSetClaim } from './useSetClaim';
import './CollectionGoal.css';

/** 없는 말랑이를 이만큼까지 캡슐로 보여 주고 나머지는 "+N" */
const SHOW_MISSING = 4;

/**
 * 도감의 "다음 목표": 받을 세트 보상이 있으면 그걸 먼저(그 자리에서 받기),
 * 아니면 가장 가까운 미완성 세트(summarizeCollection().nearestSet) — 남은 말랑이 캡슐 + 등급 + 대략 뽑기 수 + 캡슐 뽑기.
 * 모든 세트를 다 받았으면 그리지 않는다.
 */
export function CollectionGoal({ summary }: { summary: CollectionSummary }) {
  const claimable = summary.claimableSets[0];
  if (claimable) return <ClaimGoal progress={claimable} />;
  const nearest = summary.nearestSet;
  if (!nearest) return null;
  return <NearGoal progress={nearest} />;
}

function goalStyle(p: SetProgress): CSSProperties {
  return { '--set-color': p.set.color } as CSSProperties;
}

function ClaimGoal({ progress }: { progress: SetProgress }) {
  const claim = useSetClaim();
  const reward = SET_REWARD_COINS[progress.set.tier];
  return (
    <section className="dex-goal dex-goal--claim" style={goalStyle(progress)} aria-labelledby="dex-goal-title">
      <h2 id="dex-goal-title" className="dex-goal__title">
        {progress.set.name} 세트를 다 모았어요
      </h2>
      <p className="dex-goal__detail">
        <CoinIcon size={20} />
        세트 보상 {reward.toLocaleString()}코인을 받을 수 있어요
      </p>
      <button
        type="button"
        className="btn btn--primary dex-goal__cta"
        onClick={(e) => claim(progress.set.id, e.currentTarget)}
      >
        <CoinIcon size={22} />
        보상 받기
      </button>
    </section>
  );
}

function NearGoal({ progress }: { progress: SetProgress }) {
  const coins = useGameStore((s) => s.coins);
  const canPull = coins >= PULL_PRICE.single;
  const reward = SET_REWARD_COINS[progress.set.tier];
  const pulls = roughPullCount(expectedPullsToCollect(progress.missingIds));
  const shown = progress.missingIds.slice(0, SHOW_MISSING);
  const more = progress.missingIds.length - shown.length;

  return (
    <section className="dex-goal" style={goalStyle(progress)} aria-labelledby="dex-goal-title">
      <h2 id="dex-goal-title" className="dex-goal__title">
        {progress.set.name} 세트까지 {progress.missing}마리 남았어요
      </h2>
      <div className="dex-goal__meter">
        <span
          className="dex-goal__bar"
          role="progressbar"
          aria-label={`${progress.set.name} 세트`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.owned}
        >
          <span style={{ width: `${progress.ratio * 100}%` }} />
        </span>
        <span className="dex-goal__count">
          {progress.owned}/{progress.total}
        </span>
      </div>
      <ul className="dex-goal__missing" aria-label="아직 못 만난 말랑이">
        {shown.map((id) => {
          const c = getCharacter(id);
          if (!c) return null;
          return (
            <li key={id} className="dex-goal__member">
              <MysteryMalang character={c} size={58} />
              <RarityBadge rarity={c.rarity} compact />
            </li>
          );
        })}
        {more > 0 && (
          <li className="dex-goal__member dex-goal__more">
            <span className="dex-goal__more-dot">+{more}</span>
            <span className="visually-hidden">마리 더</span>
          </li>
        )}
      </ul>
      <p className="dex-goal__detail">
        <CoinIcon size={20} />
        <span>
          완성하면 {reward.toLocaleString()}코인
          {pulls > 0 && (
            <span className="dex-goal__hint">
              평균 {pulls.toLocaleString()}번쯤 뽑으면 모여요
            </span>
          )}
        </span>
      </p>
      {canPull ? (
        <Link to="/gacha" className="btn btn--primary dex-goal__cta" onClick={() => sfx.button()}>
          <CapsuleIcon size={22} />
          캡슐 뽑기
        </Link>
      ) : (
        <Link to="/play" className="btn btn--primary dex-goal__cta" onClick={() => sfx.button()}>
          <JoystickIcon size={22} />
          미니게임으로 코인 벌기
        </Link>
      )}
    </section>
  );
}
