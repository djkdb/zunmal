import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { playRarityFanfare, sfx } from '../audio/sfx';
import { RARITY_META, rarityRank, type Rarity } from '../data/rarity';
import { PULL_COUNT, PULL_PRICE } from '../economy/config';
import type { ResolvedPull } from '../gacha/engine';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CoinIcon } from './icons';
import { Malang } from './Malang';
import { Modal } from './Modal';
import { buzz } from './pullHaptics';
import { revealStep, summarizePulls, topRarity } from './pullReveal';
import { RarityBadge } from './RarityBadge';
import './PullResult.css';

type PullKind = 'single' | 'multi';

interface PullResultProps {
  items: readonly ResolvedPull[];
  totalRefund: number;
  onClose(): void;
  /** 전체 화면 연출(신화 이상)로 이미 보여 준 결과의 위치. 이 카드는 모으기 없이 바로 뒤집고 결과음도 생략한다. */
  seenIndex?: number;
  /** 다시 뽑기 버튼용 현재 코인 */
  coins: number;
  onPullAgain(kind: PullKind): void;
}

/** 등급별 등장 문구 — 높을수록 흥분한다 */
const REVEAL_TITLE: Record<Rarity, string> = {
  common: '말랑이를 만났어요!',
  rare: '레어 말랑이예요!',
  epic: '에픽 말랑이 등장!',
  legendary: '전설의 말랑이다!',
  mythic: '신화 속 말랑이가 나타났어요!!',
  secret: '시크릿 말랑이… 정말이에요?!',
};

/** 뒤집힐 때 튀는 빛 조각 수 (에픽 이상만) */
const BURST_COUNT: Record<Rarity, number> = { common: 0, rare: 0, epic: 6, legendary: 10, mythic: 12, secret: 12 };

function OwnershipTag({ item, compact = false }: { item: ResolvedPull; compact?: boolean }) {
  if (item.isNewShiny) return <span className="pull-tag pull-tag--shiny">{compact ? 'NEW' : '반짝 NEW'}</span>;
  if (item.isNew) return <span className="pull-tag pull-tag--new">NEW</span>;
  return (
    <span className="pull-tag pull-tag--dup">
      <CoinIcon size={12} />+{item.refund.toLocaleString()}
    </span>
  );
}

function describe(item: ResolvedPull): string {
  return `${item.shiny ? '반짝 ' : ''}${RARITY_META[item.rarity].label} ${item.character.name}, ${
    item.isNew || item.isNewShiny ? '새로 만났어요' : `이미 있어서 ${item.refund}코인 돌려받았어요`
  }`;
}

function Burst({ rarity }: { rarity: Rarity }) {
  const n = BURST_COUNT[rarity];
  if (n === 0) return null;
  return (
    <span className="pull-burst" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <span key={k} style={{ '--a': `${(360 / n) * k + (k % 2) * 12}deg`, '--d': `${k % 3}` } as CSSProperties} />
      ))}
    </span>
  );
}

/** 캡슐 뒷면: 모으기 전에는 모두 같은 크림색, 차례가 오면 등급 색으로 물든다 */
function CapsuleBack() {
  return (
    <svg className="pull-card__capsule" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <path className="pull-card__cap-top" d="M-17 0 A17 17 0 0 1 17 0 Z" />
      <path d="M-17 0 A17 17 0 0 0 17 0 Z" fill="#fffdf8" stroke="#2b2233" strokeWidth="3" strokeLinejoin="round" />
      <rect x="-18" y="-2" width="36" height="4" rx="2" fill="#2b2233" />
      <ellipse cx="-7" cy="-9" rx="4.5" ry="2.5" fill="#fff" opacity="0.75" transform="rotate(-30 -7 -9)" />
    </svg>
  );
}

type CardState = 'back' | 'charge' | 'hold' | 'face';

function PullCard({
  item,
  index,
  state,
  pop,
  best,
  selected,
  animate,
  onSelect,
}: {
  item: ResolvedPull;
  index: number;
  state: CardState;
  pop: number;
  best: boolean;
  selected: boolean;
  animate: boolean;
  onSelect(): void;
}) {
  const face = state === 'face';
  const cls = [
    'pull-card',
    `pull-card--${item.rarity}`,
    `is-${state}`,
    item.shiny && face ? 'is-shiny' : '',
    best && face ? 'is-best' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls} style={{ '--pop': pop } as CSSProperties}>
      <button
        type="button"
        className="pull-card__btn"
        onClick={onSelect}
        aria-pressed={face ? selected : undefined}
        aria-label={face ? `${index + 1}번째: ${describe(item)}` : `${index + 1}번째 캡슐, 아직 열지 않았어요`}
      >
        <span className="pull-card__flip">
          <span className="pull-card__back">
            <CapsuleBack />
          </span>
          <span className="pull-card__face" aria-hidden="true">
            <Malang character={item.character} size={42} animation="none" decorative shiny={item.shiny} />
            <span className="pull-card__name">{item.character.name}</span>
            <RarityBadge rarity={item.rarity} compact />
            <OwnershipTag item={item} compact />
          </span>
        </span>
      </button>
      {face && animate && <Burst rarity={item.rarity} />}
      {best && face && (
        <span className="pull-card__ribbon" aria-hidden="true">
          최고
        </span>
      )}
    </li>
  );
}

/** 선택한(기본: 가장 좋은) 결과를 크게 보여 주는 줄 */
function DetailRow({ item }: { item: ResolvedPull | undefined }) {
  if (!item) {
    return (
      <div className="pull-detail pull-detail--empty" aria-hidden="true">
        <span className="pull-detail__placeholder">캡슐을 여는 중이에요</span>
      </div>
    );
  }
  return (
    <div className={`pull-detail pull-detail--${item.rarity}${item.shiny ? ' is-shiny' : ''}`}>
      <Malang
        key={`${item.character.id}-${item.shiny}`}
        character={item.character}
        size={56}
        animation="bounce"
        decorative
        shiny={item.shiny}
      />
      <div className="pull-detail__text">
        <p className="pull-detail__name">
          {item.shiny ? '반짝 ' : ''}
          {item.character.name}
        </p>
        <div className="pull-detail__tags">
          <RarityBadge rarity={item.rarity} compact />
          <OwnershipTag item={item} />
          {item.byPity && <span className="pull-tag pull-tag--note">천장 확정</span>}
          {item.byGuarantee && <span className="pull-tag pull-tag--note">레어 이상 보장</span>}
        </div>
        <p className="pull-detail__desc">{item.character.description}</p>
      </div>
    </div>
  );
}

function Summary({ items }: { items: readonly ResolvedPull[] }) {
  const s = summarizePulls(items);
  return (
    <dl className="pull-summary">
      <div>
        <dt>새 말랑이</dt>
        <dd>{s.newCount}</dd>
      </div>
      <div className={s.shinyCount > 0 ? 'is-lit' : undefined}>
        <dt>반짝</dt>
        <dd>{s.shinyCount}</dd>
      </div>
      <div>
        <dt>환급 코인</dt>
        <dd>
          <CoinIcon size={16} />+{s.refund.toLocaleString()}
        </dd>
      </div>
    </dl>
  );
}

function Actions({
  coins,
  onPullAgain,
  onClose,
  closeRef,
}: {
  coins: number;
  onPullAgain(kind: PullKind): void;
  onClose(): void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const short = coins < PULL_PRICE.single;
  return (
    <div className="pull-actions">
      <div className="pull-actions__again">
        {(['single', 'multi'] as const).map((kind) => {
          const price = PULL_PRICE[kind];
          const enough = coins >= price;
          const label = kind === 'multi' ? `${PULL_COUNT.multi}연 뽑기` : '1회 뽑기';
          return (
            <button
              key={kind}
              type="button"
              className={`btn btn--small ${kind === 'multi' ? 'btn--primary' : 'btn--sky'}`}
              disabled={!enough}
              onClick={() => {
                sfx.button();
                onPullAgain(kind);
              }}
              aria-label={`${label}, ${price.toLocaleString()}코인${enough ? '' : ' (코인 부족)'}`}
            >
              {label}
              <span className="pull-actions__cost" aria-hidden="true">
                <CoinIcon size={16} />
                {price.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pull-actions__more">
        <Link to="/collection" className="btn btn--small" onClick={() => sfx.button()}>
          도감 보기
        </Link>
        <button ref={closeRef} type="button" className="btn btn--small btn--lemon" onClick={onClose}>
          닫기
        </button>
      </div>
      {short && (
        <p className="pull-actions__short small">
          코인이 모자라요. <Link to="/play">미니게임에서 모아 오세요.</Link>
        </p>
      )}
    </div>
  );
}

function SingleResult({ item, animate }: { item: ResolvedPull; animate: boolean }) {
  const fanfare = RARITY_META[item.rarity].fanfare;
  return (
    <div className={`pull-single pull-single--${item.rarity}${item.shiny ? ' is-shiny' : ''}`}>
      <div className="pull-single__stage">
        {fanfare >= 1 && <div className="pull-rays" aria-hidden="true" />}
        {item.rarity === 'secret' && <div className="pull-starfield" aria-hidden="true" />}
        {animate && <Burst rarity={item.rarity === 'rare' ? 'epic' : item.rarity} />}
        <div className="pull-single__malang">
          <Malang character={item.character} size={150} animation="bounce" decorative aura="auto" shiny={item.shiny} />
        </div>
        {item.shiny && <div className="pull-shine" aria-hidden="true" />}
      </div>
      <p className="pull-single__name">
        {item.shiny ? '반짝 ' : ''}
        {item.character.name}
      </p>
      <div className="pull-single__badges">
        <RarityBadge rarity={item.rarity} />
        <OwnershipTag item={item} />
        {item.byPity && <span className="pull-tag pull-tag--note">천장 확정</span>}
      </div>
      <p className="pull-single__desc">{item.character.description}</p>
    </div>
  );
}

/**
 * 뽑기 결과.
 * 1회: 큰 카드가 등급에 맞춰 튀어나온다 (전설 이상은 잠깐 숨을 멈췄다가).
 * 10연: 캡슐 10개가 뒷면으로 깔린 뒤 한 장씩 뒤집힌다. 아무 곳이나 누르거나 "모두 열기"로 건너뛴다.
 *       다 열리면 요약(새 말랑이/반짝/환급)과 다시 뽑기 버튼이 나온다.
 */
export function PullResult({ items, totalRefund, onClose, seenIndex, coins, onPullAgain }: PullResultProps) {
  const reduced = useReducedMotion();
  const n = items.length;
  const single = n === 1 ? items[0] : undefined;
  const rarities = items.map((it) => it.rarity);
  const summary = summarizePulls(items);

  // 앞에서부터 몇 장이 앞면인지 + 지금 차례 카드의 단계
  const [cursor, setCursor] = useState(() => (reduced || single ? n : 0));
  const [stage, setStage] = useState<'wait' | 'charge' | 'hold'>('wait');
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ key: number; rarity: Rarity } | null>(null);
  const fanfareDone = useRef(single !== undefined || seenIndex === summary.bestIndex);
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = cursor >= n;
  const revealingRef = useRef(!done);
  revealingRef.current = !done;

  const playBestFanfare = () => {
    if (fanfareDone.current) return;
    fanfareDone.current = true;
    const best = items[summary.bestIndex];
    if (best) playRarityFanfare(sfx, best.rarity, best.shiny);
  };

  const flip = (i: number) => {
    const item = items[i];
    setCursor(i + 1);
    setStage('wait');
    if (!item) return;
    const rank = rarityRank(item.rarity);
    sfx.flip();
    if (i === summary.bestIndex) playBestFanfare();
    else if (rank >= 1 && i !== seenIndex) sfx.tap(rank * 3);
    if (item.shiny && i !== summary.bestIndex) sfx.shinyChime();
    if (rank >= rarityRank('legendary') && i !== seenIndex) {
      setFlash({ key: i, rarity: item.rarity });
      buzz([20, 40, 36], reduced);
    }
  };

  // 한 장씩 뒤집기: 대기 → (모으기 → 숨 멈춤) → 뒤집기
  useEffect(() => {
    if (done) return;
    const step = revealStep(rarities, cursor, cursor === seenIndex);
    let ms: number;
    let next: () => void;
    if (stage === 'wait') {
      ms = step.gap;
      next = () => {
        if (step.charge > 0) {
          setStage('charge');
          if (rarityRank(rarities[cursor] ?? 'common') >= rarityRank('legendary')) sfx.capsuleShake();
        } else flip(cursor);
      };
    } else if (stage === 'charge') {
      ms = step.charge;
      next = () => (step.hold > 0 ? setStage('hold') : flip(cursor));
    } else {
      ms = step.hold;
      next = () => flip(cursor);
    }
    const id = window.setTimeout(next, ms);
    return () => window.clearTimeout(id);
    // 단계가 바뀔 때마다 다음 예약을 건다
  }, [cursor, stage, done]);

  // 모두 열렸을 때: 결과음(아직이면), 환급 코인 소리, 포커스를 닫기로
  useEffect(() => {
    if (!done) return;
    closeRef.current?.focus({ preventScroll: true });
    if (single) return;
    playBestFanfare();
    const id = totalRefund > 0 ? window.setTimeout(() => sfx.coin(), 260) : undefined;
    return () => window.clearTimeout(id);
  }, [done]);

  const revealAll = () => {
    if (!revealingRef.current) return;
    revealingRef.current = false;
    setCursor(n);
    setStage('wait');
  };

  // 공개 중 Esc/바깥 탭은 닫지 않고 나머지를 연다
  const requestClose = () => (revealingRef.current ? revealAll() : onClose());

  const stateOf = (i: number): CardState => {
    if (i < cursor) return 'face';
    if (i === cursor && stage !== 'wait') return stage;
    return 'back';
  };

  // 모달 테두리는 지금까지 열린 카드 중 최고 등급을 따라 점점 화려해진다
  const shownTop = topRarity(rarities.slice(0, cursor));
  const hasShinyShown = items.slice(0, cursor).some((it) => it.shiny);
  const detailIndex = selected ?? (done ? summary.bestIndex : cursor - 1);
  const title = single
    ? REVEAL_TITLE[single.rarity]
    : !done
      ? `캡슐 ${n}개를 열어요`
      : rarityRank(shownTop) >= rarityRank('legendary')
        ? REVEAL_TITLE[shownTop]
        : `${n}연 뽑기 결과`;

  return (
    <Modal
      labelledBy="pull-result-title"
      onClose={requestClose}
      className={`pull-modal pull-modal--${shownTop}${hasShinyShown ? ' has-shiny' : ''}${single ? ' pull-modal--single' : ' pull-modal--multi'}`}
    >
      {/* 공개 중에는 어디를 눌러도 나머지를 한 번에 연다 */}
      <div className="pull-result" onClick={revealAll}>
        <h2 id="pull-result-title" className="pull-title">
          {title}
        </h2>
        {single ? (
          <SingleResult item={single} animate={!reduced} />
        ) : (
          <>
            <ol className="pull-grid" aria-label={`${n}개 결과`}>
              {items.map((item, i) => {
                const st = stateOf(i);
                return (
                  <PullCard
                    key={i}
                    item={item}
                    index={i}
                    state={st}
                    pop={revealStep(rarities, i, i === seenIndex).pop}
                    best={done && i === summary.bestIndex && rarityRank(item.rarity) >= 1}
                    selected={done && i === detailIndex}
                    animate={!reduced && i !== seenIndex}
                    onSelect={() => {
                      if (revealingRef.current) return;
                      sfx.tap(2);
                      setSelected(i);
                    }}
                  />
                );
              })}
            </ol>
            <DetailRow item={detailIndex >= 0 ? items[detailIndex] : undefined} />
          </>
        )}
        {!single && !done ? (
          <div className="pull-footer pull-footer--revealing">
            <p className="pull-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${cursor / n})` }} />
            </p>
            <p className="pull-skip-hint">아무 곳이나 누르면 다 열려요</p>
            <button type="button" className="btn btn--block btn--grape pull-skip" autoFocus onClick={revealAll}>
              모두 열기
            </button>
          </div>
        ) : (
          <div className="pull-footer">
            {!single && <Summary items={items} />}
            <Actions coins={coins} onPullAgain={onPullAgain} onClose={onClose} closeRef={closeRef} />
          </div>
        )}
        {flash && <div key={flash.key} className={`pull-flash pull-flash--${flash.rarity}`} aria-hidden="true" />}
      </div>
    </Modal>
  );
}
