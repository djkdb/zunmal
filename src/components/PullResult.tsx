import type { CSSProperties } from 'react';
import { RARITY_META, rarityRank } from '../data/rarity';
import type { ResolvedPull } from '../gacha/engine';
import { Malang } from './Malang';
import { Modal } from './Modal';
import { RarityBadge } from './RarityBadge';
import './PullResult.css';

interface PullResultProps {
  items: readonly ResolvedPull[];
  totalRefund: number;
  onClose(): void;
}

function OwnershipTag({ item }: { item: ResolvedPull }) {
  if (item.isNew) return <span className="pull-tag pull-tag--new">NEW!</span>;
  return (
    <span className="pull-tag pull-tag--dup">
      중복 +{item.refund}코인
    </span>
  );
}

function SingleResult({ item }: { item: ResolvedPull }) {
  const fanfare = RARITY_META[item.rarity].fanfare;
  return (
    <div className={`pull-single pull-single--${item.rarity}`}>
      <div className="pull-single__stage">
        {fanfare >= 1 && <div className="pull-rays" aria-hidden="true" />}
        <Malang character={item.character} size={170} animation="bounce" decorative />
      </div>
      <RarityBadge rarity={item.rarity} />
      <p className="pull-single__name">{item.character.name}</p>
      <OwnershipTag item={item} />
      <p className="pull-single__desc">{item.character.description}</p>
      {item.byPity && <p className="chip pull-note">천장 확정!</p>}
      {item.byGuarantee && <p className="chip pull-note">10연 레어 이상 보장!</p>}
    </div>
  );
}

function MultiResult({ items }: { items: readonly ResolvedPull[] }) {
  return (
    <ol className="pull-grid">
      {items.map((item, i) => (
        <li
          key={i}
          className={`pull-card pull-card--${item.rarity}`}
          style={{ '--i': i } as CSSProperties}
          aria-label={`${i + 1}번째: ${RARITY_META[item.rarity].label} ${item.character.name}, ${item.isNew ? '새로 획득' : `이미 있어서 ${item.refund}코인 돌려받음`}`}
        >
          <Malang character={item.character} size={64} animation="none" decorative />
          <span className="pull-card__name">{item.character.name}</span>
          <RarityBadge rarity={item.rarity} compact />
          <OwnershipTag item={item} />
        </li>
      ))}
    </ol>
  );
}

/** 뽑기 결과 등장 연출 (1회: 큰 카드 / 10연: 순차 등장 그리드). */
export function PullResult({ items, totalRefund, onClose }: PullResultProps) {
  const best = items.reduce<ResolvedPull | undefined>(
    (acc, cur) => (!acc || rarityRank(cur.rarity) > rarityRank(acc.rarity) ? cur : acc),
    undefined,
  );
  const single = items.length === 1 ? items[0] : undefined;
  const newCount = items.filter((i) => i.isNew).length;

  return (
    <Modal labelledBy="pull-result-title" onClose={onClose} className={`pull-modal pull-modal--${best?.rarity ?? 'common'}`}>
      <h2 id="pull-result-title" className="pull-title">
        {single ? '말랑이를 만났어요!' : `${items.length}연 뽑기 결과`}
      </h2>
      {single ? <SingleResult item={single} /> : <MultiResult items={items} />}
      {!single && (
        <p className="pull-summary small">
          새로 만난 말랑이 {newCount}마리
          {totalRefund > 0 && <>, 중복된 말랑이는 {totalRefund.toLocaleString()}코인으로 돌려받았어요</>}
        </p>
      )}
      <button type="button" className="btn btn--primary btn--block pull-close" onClick={onClose} autoFocus>
        확인
      </button>
    </Modal>
  );
}
