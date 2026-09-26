import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { CHARACTERS, CHARACTERS_BY_RARITY, getCharacter } from '../data/characters';
import { isNewInCollection, summarizeCollection } from '../data/collectionProgress';
import { levelOf } from '../data/affection';
import { RARITIES, RARITY_META, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL, type Rarity } from '../data/rarity';
import { PARTNER_RARITY_BONUS } from '../economy/config';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { malangShareContent } from '../lib/share';
import { useGameStore } from '../store/useGameStore';
import { AffectionMeter } from './AffectionMeter';
import { CollectionGoal } from './collection/CollectionGoal';
import { CollectionSummary } from './collection/CollectionSummary';
import { MysteryMalang } from './collection/MysteryMalang';
import { SetList } from './collection/SetList';
import { Malang } from './Malang';
import { ShareButton } from './ShareButton';
import { Modal } from './Modal';
import { RarityBadge } from './RarityBadge';
import './Collection.css';

type Tab = 'book' | 'sets';

/** 홈 "다음 목표"에서 세트 탭으로 바로 오도록 라우터 state로 탭을 받는다 */
function initialTab(state: unknown): Tab {
  return typeof state === 'object' && state !== null && (state as { tab?: unknown }).tab === 'sets' ? 'sets' : 'book';
}

function formatBonus(rate: number): string {
  return `+${Math.round(rate * 100)}%`;
}

const shelfId = (rarity: Rarity) => `dex-shelf-${rarity}`;

/** 도감: 요약 → 탭(등급별 진열장 + 다음 목표 / 테마 컬렉션 세트) */
export function Collection() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>(() => initialTab(location.state));
  const owned = useGameStore((s) => s.ownedMalangs);
  const claimedSets = useGameStore((s) => s.claimedSets);
  const [detailId, setDetailId] = useState<string | null>(null);
  const summary = useMemo(() => summarizeCollection({ owned, claimedSets }), [owned, claimedSets]);
  // 세트 보상을 그 자리에서 받으면 버튼이 사라지므로 화면 읽기에 한 줄 알린다
  const [claimNote, setClaimNote] = useState('');
  const announceClaim = (setId: string, coins: number) => {
    const name = summary.sets.find((s) => s.set.id === setId)?.set.name ?? '세트';
    setClaimNote(`${name} 세트 보상 ${coins.toLocaleString()}코인을 받았어요`);
    // 누른 버튼이 사라져 초점이 문서 처음으로 떨어지면: 그 세트의 "보상을 받았어요" 줄(세트 탭) 또는 지금 탭으로
    window.requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const target =
        document.querySelector<HTMLElement>(`[data-set-done="${setId}"]`) ??
        document.querySelector<HTMLElement>('.collection__tab.is-active');
      target?.focus({ preventScroll: true });
    });
  };

  const pickTab = (next: Tab) => {
    sfx.button();
    setTab(next);
  };

  // 등급 줄을 누르면 그 진열장으로 (세트 탭이면 도감 탭으로 바꾼 뒤)
  const jump = (rarity: Rarity) => {
    sfx.button();
    setTab('book');
    window.requestAnimationFrame(() => {
      const el = document.getElementById(shelfId(rarity));
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
    });
  };

  return (
    <div className="collection">
      <CollectionSummary summary={summary} onJump={jump} />

      <div className="collection__tabs" role="tablist" aria-label="도감 보기 방식">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'book'}
          className={`collection__tab${tab === 'book' ? ' is-active' : ''}`}
          onClick={() => pickTab('book')}
        >
          말랑 도감
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sets'}
          className={`collection__tab${tab === 'sets' ? ' is-active' : ''}`}
          onClick={() => pickTab('sets')}
        >
          컬렉션
          {summary.claimableSets.length > 0 && (
            <span className="collection__tab-dot">
              <span className="visually-hidden">, 받을 보상 있음</span>
            </span>
          )}
        </button>
      </div>

      {tab === 'book' ? (
        <>
          <CollectionGoal summary={summary} onClaimed={announceClaim} />
          {RARITIES.map((rarity) => (
            <RarityShelf key={rarity} rarity={rarity} onOpen={setDetailId} />
          ))}
        </>
      ) : (
        <SetList summary={summary} onOpen={setDetailId} onClaimed={announceClaim} />
      )}

      <p className="visually-hidden" role="status">
        {claimNote}
      </p>

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function RarityShelf({ rarity, onOpen }: { rarity: Rarity; onOpen(id: string): void }) {
  const owned = useGameStore((s) => s.ownedMalangs);
  const partnerId = useGameStore((s) => s.partnerId);
  const unboxed = useGameStore((s) => s.unboxed);
  const affection = useGameStore((s) => s.affection);
  const [now] = useState(() => Date.now());
  const pool = CHARACTERS_BY_RARITY[rarity];
  const found = pool.filter((c) => owned[c.id]).length;
  const label = RARITY_META[rarity].label;
  return (
    <section
      id={shelfId(rarity)}
      tabIndex={-1}
      className={`collection__section collection__section--${rarity}`}
      aria-label={`${label} 말랑이`}
    >
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
          if (!entry) {
            return (
              <li key={c.id}>
                <div className={`collection__card collection__card--${rarity} is-locked`} role="img" aria-label={`아직 못 만난 ${label} 말랑이`}>
                  <span className="collection__window">
                    <MysteryMalang character={c} size={86} />
                  </span>
                  <span className="collection__name" aria-hidden="true">
                    ???
                  </span>
                </div>
              </li>
            );
          }
          const isPartner = partnerId === c.id;
          const shiny = entry.shinyCount > 0;
          const sealed = !unboxed.includes(c.id);
          const isNew = isNewInCollection(entry, sealed, now);
          const level = levelOf(affection[c.id] ?? 0);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`collection__card collection__card--${rarity}${isPartner ? ' is-partner' : ''}${shiny ? ' is-shiny' : ''}`}
                onClick={() => {
                  sfx.button();
                  onOpen(c.id);
                }}
                aria-label={[
                  isNew ? '새 말랑이' : '',
                  c.name,
                  `${entry.count}마리`,
                  shiny ? `반짝 ${entry.shinyCount}마리` : '',
                  sealed ? '아직 캡슐 속' : '',
                  level > 1 ? `친밀도 Lv.${level}` : '',
                  isPartner ? '현재 파트너' : '',
                ]
                  .filter(Boolean)
                  .join(', ')
                  .concat('. 자세히 보기')}
              >
                {isPartner ? (
                  <span className="collection__tag collection__tag--partner">파트너</span>
                ) : (
                  isNew && <span className="collection__tag collection__tag--new">NEW</span>
                )}
                <span className="collection__window">
                  <Malang character={c} size={74} animation="none" decorative />
                </span>
                {shiny && <span className="collection__shiny-mark" aria-hidden="true" />}
                {level > 1 && (
                  <span className="collection__love" aria-hidden="true">
                    <svg viewBox="0 0 32 32" width={12} height={12} focusable="false">
                      <path d="M16 27.5 C10 22.5 3.5 18 3.5 11.5 C3.5 7.4 6.6 4.6 10.3 4.6 C12.9 4.6 14.8 6 16 8.1 C17.2 6 19.1 4.6 21.7 4.6 C25.4 4.6 28.5 7.4 28.5 11.5 C28.5 18 22 22.5 16 27.5 Z" />
                    </svg>
                    {level}
                  </span>
                )}
                <span className="collection__name">{c.name}</span>
                {entry.count > 1 && <span className="collection__count">{entry.count}마리</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
  // 반짝을 가졌으면 반짝 모습부터 (파트너로 원래 모습을 골라 둔 경우만 원래 모습)
  const [showShiny, setShowShiny] = useState(hasShiny && (partnerId !== id || partnerShiny));
  if (!detail || !entry) return null;
  const isPartner = partnerId === id;

  return (
    <Modal labelledBy="malang-detail-title" onClose={onClose} className={`detail-modal detail-modal--${detail.rarity}`}>
      <div className="collection-detail">
        <div className={`collection-detail__stage${showShiny ? ' is-shiny' : ''}`}>
          <Malang character={detail} size={170} animation="idle" decorative aura="auto" shiny={showShiny} />
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
            <dt>코인 보너스</dt>
            <dd>{formatBonus(PARTNER_RARITY_BONUS[detail.rarity])}</dd>
          </div>
        </dl>
        <AffectionMeter characterId={id} value={affection} />
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
          <ShareButton
            className="btn"
            align="start"
            content={() =>
              malangShareContent({
                name: detail.name,
                rarityLabel: detail.rarity === 'common' ? undefined : RARITY_META[detail.rarity].label,
                shiny: showShiny,
                level: levelOf(affection),
                partner: isPartner,
                owned: Object.keys(useGameStore.getState().ownedMalangs).length,
                total: CHARACTERS.length,
              })
            }
          />
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
