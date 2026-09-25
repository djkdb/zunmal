import { useState } from 'react';
import { sfx } from '../audio/sfx';
import { CHARACTERS, CHARACTERS_BY_RARITY, getCharacter } from '../data/characters';
import { PARTNER_RARITY_BONUS } from '../economy/config';
import { RARITIES, RARITY_META } from '../data/rarity';
import { useGameStore } from '../store/useGameStore';
import { Malang } from './Malang';
import { Modal } from './Modal';
import { RarityBadge } from './RarityBadge';
import './Collection.css';

function formatBonus(rate: number): string {
  return `+${Math.round(rate * 100)}%`;
}

/** 도감: 보유 말랑이는 컬러, 미보유는 실루엣. 보유 말랑이를 눌러 상세/파트너 지정. */
export function Collection() {
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);
  const setPartner = useGameStore((s) => s.setPartner);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? getCharacter(detailId) : undefined;
  const ownedCount = CHARACTERS.filter((c) => owned[c.id]).length;

  return (
    <div className="collection">
      <div className="card card--tight collection__progress">
        <div className="row row--between">
          <span className="collection__progress-label">수집 현황</span>
          <span className="collection__progress-value">
            {ownedCount} / {CHARACTERS.length}
          </span>
        </div>
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
        <section key={rarity} className="collection__section" aria-label={`${RARITY_META[rarity].label} 말랑이`}>
          <h2 className="collection__heading">
            <RarityBadge rarity={rarity} />
          </h2>
          <ul className="collection__grid">
            {CHARACTERS_BY_RARITY[rarity].map((c) => {
              const entry = owned[c.id];
              const isPartner = partnerId === c.id;
              return (
                <li key={c.id}>
                  {entry ? (
                    <button
                      type="button"
                      className={`collection__card collection__card--${rarity}${isPartner ? ' is-partner' : ''}`}
                      onClick={() => {
                        sfx.button();
                        setDetailId(c.id);
                      }}
                      aria-label={`${c.name}, ${entry.count}마리 보유${isPartner ? ', 현재 파트너' : ''}. 자세히 보기`}
                    >
                      {isPartner && <span className="collection__partner-tag">파트너</span>}
                      <Malang character={c} size={72} animation="none" decorative />
                      <span className="collection__name">{c.name}</span>
                      <span className="collection__count">×{entry.count}</span>
                    </button>
                  ) : (
                    <div className="collection__card is-locked" aria-label="아직 만나지 못한 말랑이">
                      <Malang character={c} size={72} animation="none" silhouette decorative />
                      <span className="collection__name">???</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {detail && owned[detail.id] && (
        <Modal labelledBy="malang-detail-title" onClose={() => setDetailId(null)}>
          <div className="collection-detail">
            <Malang character={detail} size={150} animation="idle" decorative />
            <RarityBadge rarity={detail.rarity} />
            <h2 id="malang-detail-title" className="collection-detail__name">
              {detail.name}
            </h2>
            <p className="muted">{detail.description}</p>
            <p className="small">
              보유 {owned[detail.id]?.count}마리 · 파트너 코인 보너스 {formatBonus(PARTNER_RARITY_BONUS[detail.rarity])}
            </p>
            <div className="collection-detail__actions">
              <button
                type="button"
                className="btn btn--mint"
                disabled={partnerId === detail.id}
                onClick={() => {
                  sfx.success();
                  setPartner(detail.id);
                }}
              >
                {partnerId === detail.id ? '현재 파트너' : '파트너로 정하기'}
              </button>
              <button type="button" className="btn" onClick={() => setDetailId(null)}>
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
