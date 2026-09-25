import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { CHARACTERS, CHARACTERS_BY_RARITY, getCharacter } from '../data/characters';
import { COLLECTIONS, collectionProgress, type Collection as CollectionSet } from '../data/collections';
import { RARITIES, RARITY_META, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL } from '../data/rarity';
import { PARTNER_RARITY_BONUS, SET_REWARD_TICKETS } from '../economy/config';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import { Modal } from './Modal';
import { RarityBadge } from './RarityBadge';
import { TicketIcon } from './icons';
import './Collection.css';

type Tab = 'book' | 'sets';

function formatBonus(rate: number): string {
  return `+${Math.round(rate * 100)}%`;
}

/** 도감: 등급별 진열장 + 테마 컬렉션 세트 */
export function Collection() {
  const [tab, setTab] = useState<Tab>('book');
  const owned = useGameStore((s) => s.ownedMalangs);
  const [detailId, setDetailId] = useState<string | null>(null);
  const ownedCount = CHARACTERS.filter((c) => owned[c.id]).length;
  const shinyCount = CHARACTERS.filter((c) => (owned[c.id]?.shinyCount ?? 0) > 0).length;

  return (
    <div className="collection">
      <div className="collection__tabs" role="tablist" aria-label="도감 보기 방식">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'book'}
          className={`collection__tab${tab === 'book' ? ' is-active' : ''}`}
          onClick={() => {
            sfx.button();
            setTab('book');
          }}
        >
          말랑 도감
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sets'}
          className={`collection__tab${tab === 'sets' ? ' is-active' : ''}`}
          onClick={() => {
            sfx.button();
            setTab('sets');
          }}
        >
          컬렉션
        </button>
      </div>

      {tab === 'book' ? (
        <>
          <div className="collection__progress">
            <p className="collection__progress-value">
              <strong>{ownedCount}</strong>마리 만났어요 <span className="muted">/ {CHARACTERS.length}</span>
              <span className="collection__shiny-count">반짝 {shinyCount}</span>
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-label="도감 수집률"
              aria-valuemin={0}
              aria-valuemax={CHARACTERS.length}
              aria-valuenow={ownedCount}
            >
              <div className="progress__fill" style={{ width: `${(ownedCount / CHARACTERS.length) * 100}%` }} />
            </div>
          </div>
          {RARITIES.map((rarity) => (
            <RarityShelf key={rarity} rarity={rarity} onOpen={setDetailId} />
          ))}
        </>
      ) : (
        <ul className="sets">
          {COLLECTIONS.map((set) => (
            <SetCard key={set.id} set={set} onOpen={setDetailId} />
          ))}
        </ul>
      )}

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function RarityShelf({ rarity, onOpen }: { rarity: (typeof RARITIES)[number]; onOpen(id: string): void }) {
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);
  const pool = CHARACTERS_BY_RARITY[rarity];
  const found = pool.filter((c) => owned[c.id]).length;
  return (
    <section className={`collection__section collection__section--${rarity}`} aria-label={`${RARITY_META[rarity].label} 말랑이`}>
      <h2 className="collection__heading">
        <RarityBadge rarity={rarity} />
        <span className="collection__found">
          {found}/{pool.length}
        </span>
      </h2>
      {rarity === 'secret' && found === 0 && (
        <p className="collection__secret-hint">
          약 {Math.round(RARITY_WEIGHT_TOTAL / RARITY_WEIGHTS.secret).toLocaleString()}번에 한 번 만날 수 있는 전설 너머의
          말랑이들
        </p>
      )}
      <ul className="collection__grid">
        {pool.map((c) => {
          const entry = owned[c.id];
          const isPartner = partnerId === c.id;
          const shiny = (entry?.shinyCount ?? 0) > 0;
          return (
            <li key={c.id}>
              {entry ? (
                <button
                  type="button"
                  className={`collection__card collection__card--${rarity}${isPartner ? ' is-partner' : ''}${shiny ? ' is-shiny' : ''}`}
                  onClick={() => {
                    sfx.button();
                    onOpen(c.id);
                  }}
                  aria-label={`${c.name}, ${entry.count}마리${shiny ? `, 반짝 ${entry.shinyCount}마리` : ''}${isPartner ? ', 현재 파트너' : ''}. 자세히 보기`}
                >
                  {isPartner && <span className="collection__partner-tag">파트너</span>}
                  <span className="collection__window">
                    <Malang character={c} size={66} animation="none" decorative />
                  </span>
                  {shiny && <span className="collection__shiny-mark" aria-hidden="true" />}
                  <span className="collection__name">{c.name}</span>
                  {entry.count > 1 && <span className="collection__count">{entry.count}마리</span>}
                </button>
              ) : (
                <div className={`collection__card collection__card--${rarity} is-locked`} aria-label="아직 만나지 못한 말랑이">
                  <span className="collection__window">
                    <Malang character={c} size={66} animation="none" silhouette decorative />
                  </span>
                  <span className="collection__name" aria-hidden="true" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SetCard({ set, onOpen }: { set: CollectionSet; onOpen(id: string): void }) {
  const owned = useGameStore((s) => s.ownedMalangs);
  const claimed = useGameStore((s) => s.claimedSets.includes(set.id));
  const claimSet = useGameStore((s) => s.claimSet);
  const progress = collectionProgress(set, new Set(Object.keys(owned)));
  const reward = SET_REWARD_TICKETS[set.tier];

  return (
    <li
      className={`set-card set-card--${set.tier}${progress.complete ? ' is-complete' : ''}`}
      style={{ '--set-color': set.color } as CSSProperties}
    >
      <div className="set-card__head">
        <div>
          <h2 className="set-card__name">{set.name}</h2>
          <p className="set-card__desc">{set.description}</p>
        </div>
        <span className="set-card__count">
          {progress.owned}/{progress.total}
        </span>
      </div>
      <ul className="set-card__members">
        {set.memberIds.map((id) => {
          const c = getCharacter(id);
          if (!c) return null;
          const has = !!owned[id];
          return (
            <li key={id}>
              {has ? (
                <button type="button" className="set-card__member" aria-label={c.name} onClick={() => onOpen(id)}>
                  <Malang character={c} size={44} animation="none" decorative />
                </button>
              ) : (
                <span className="set-card__member is-locked" aria-label="아직 못 만남">
                  <Malang character={c} size={44} animation="none" silhouette decorative />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="set-card__reward">
        <span className="set-card__reward-label">
          <TicketIcon size={22} /> 뽑기권 {reward}장
        </span>
        {claimed ? (
          <span className="set-card__claimed">받았어요</span>
        ) : (
          <button
            type="button"
            className={`btn btn--small ${progress.complete ? 'btn--primary' : ''}`}
            disabled={!progress.complete}
            onClick={() => {
              const res = claimSet(set.id);
              if (res.ok) {
                sfx.coin();
                sfx.success();
              }
            }}
          >
            {progress.complete ? '보상 받기' : `${progress.total - progress.owned}마리 더`}
          </button>
        )}
      </div>
    </li>
  );
}

function DetailModal({ id, onClose }: { id: string; onClose(): void }) {
  const detail = getCharacter(id);
  const entry = useGameStore((s) => s.ownedMalangs[id]);
  const partnerId = useGameStore((s) => s.partnerId);
  const partnerShiny = useGameStore((s) => s.partnerShiny);
  const setPartner = useGameStore((s) => s.setPartner);
  const setPartnerShiny = useGameStore((s) => s.setPartnerShiny);
  const affection = useGameStore((s) => s.affection[id] ?? 0);
  const hasShiny = (entry?.shinyCount ?? 0) > 0;
  const [showShiny, setShowShiny] = useState(hasShiny && partnerId === id && partnerShiny);
  if (!detail || !entry) return null;
  const isPartner = partnerId === id;

  return (
    <Modal labelledBy="malang-detail-title" onClose={onClose} className={`detail-modal detail-modal--${detail.rarity}`}>
      <div className="collection-detail">
        <div className={`collection-detail__stage${showShiny ? ' is-shiny' : ''}`}>
          <Malang character={detail} size={150} animation="idle" decorative />
        </div>
        <div className="row">
          <RarityBadge rarity={detail.rarity} />
          {showShiny && <span className="pull-tag pull-tag--shiny">반짝</span>}
        </div>
        <h2 id="malang-detail-title" className="collection-detail__name">
          {showShiny ? '반짝 ' : ''}
          {detail.name}
        </h2>
        <p className="collection-detail__desc">{detail.description}</p>
        <dl className="collection-detail__facts">
          <div>
            <dt>가진 수</dt>
            <dd>{entry.count}마리</dd>
          </div>
          <div>
            <dt>반짝</dt>
            <dd>{entry.shinyCount}마리</dd>
          </div>
          <div>
            <dt>친밀도</dt>
            <dd>{affection.toLocaleString()}</dd>
          </div>
          <div>
            <dt>코인 보너스</dt>
            <dd>{formatBonus(PARTNER_RARITY_BONUS[detail.rarity])}</dd>
          </div>
        </dl>
        {hasShiny && (
          <button
            type="button"
            className="btn btn--small btn--lemon"
            aria-pressed={showShiny}
            onClick={() => {
              sfx.shinyChime();
              const next = !showShiny;
              setShowShiny(next);
              if (isPartner) setPartnerShiny(next);
            }}
          >
            {showShiny ? '원래 모습 보기' : '반짝 모습 보기'}
          </button>
        )}
        <div className="collection-detail__actions">
          <button
            type="button"
            className="btn btn--mint"
            disabled={isPartner}
            onClick={() => {
              sfx.success();
              setPartner(id);
              setPartnerShiny(showShiny);
            }}
          >
            {isPartner ? '지금 파트너예요' : '파트너로 정하기'}
          </button>
          <Link to={`/touch/${id}`} className="btn btn--primary" onClick={() => sfx.button()}>
            만지기
          </Link>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
