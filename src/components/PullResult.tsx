import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
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
import {
  allOpen,
  canOpen,
  initialPhases,
  openAllSchedule,
  openSequence,
  openTiming,
  openedCount,
  summarizePulls,
  topRarity,
  type CardPhase,
} from './pullReveal';
import { RarityBadge } from './RarityBadge';
import './PullResult.css';

type PullKind = 'single' | 'multi';

interface PullResultProps {
  items: readonly ResolvedPull[];
  totalRefund: number;
  onClose(): void;
  /** 전체 화면 연출(신화 이상)로 이미 보여 준 결과의 위치. 이 카드는 처음부터 앞면이고 결과음도 생략한다. */
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

/** Esc로 "모두 열기"를 누른 직후 같은 키의 닫기 요청은 무시한다 */
const ESC_GRACE_MS = 400;

function OwnershipTag({ item, compact = false }: { item: ResolvedPull; compact?: boolean }) {
  if (item.isNewShiny) return <span className="pull-tag pull-tag--shiny">{compact ? 'NEW' : '반짝 NEW'}</span>;
  if (item.isNew) return <span className="pull-tag pull-tag--new">NEW</span>;
  return (
    <span className="pull-tag pull-tag--dup">
      <CoinIcon size={12} />+{item.refund.toLocaleString()}
    </span>
  );
}

/** 열린 카드의 스크린리더 이름: "해파리 말랑, 레어, 새 말랑이" */
function describe(item: ResolvedPull): string {
  const own = item.isNewShiny ? '새 반짝 말랑이' : item.isNew ? '새 말랑이' : `이미 있어서 ${item.refund}코인 돌려받음`;
  return `${item.shiny ? '반짝 ' : ''}${item.character.name}, ${RARITY_META[item.rarity].label}, ${own}`;
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

/** 캡슐 뒷면: 모두 같은 크림색. 누르면(모으기) 등급 색으로 물든다 */
function CapsuleBack() {
  return (
    <svg className="pull-capsule" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <path className="pull-capsule__top" d="M-17 0 A17 17 0 0 1 17 0 Z" />
      <path d="M-17 0 A17 17 0 0 0 17 0 Z" fill="#fffdf8" stroke="#2b2233" strokeWidth="3" strokeLinejoin="round" />
      <rect x="-18" y="-2" width="36" height="4" rx="2" fill="#2b2233" />
      <ellipse cx="-7" cy="-9" rx="4.5" ry="2.5" fill="#fff" opacity="0.75" transform="rotate(-30 -7 -9)" />
    </svg>
  );
}

function PullCard({
  item,
  index,
  phase,
  pop,
  poke,
  best,
  selected,
  animate,
  onPress,
}: {
  item: ResolvedPull;
  index: number;
  phase: CardPhase;
  pop: number;
  poke: number;
  best: boolean;
  selected: boolean;
  animate: boolean;
  onPress(): void;
}) {
  const face = phase === 'face';
  const cls = [
    'pull-card',
    `pull-card--${item.rarity}`,
    `is-${phase}`,
    item.shiny && face ? 'is-shiny' : '',
    best ? 'is-best' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = face
    ? describe(item)
    : phase === 'back'
      ? `캡슐 ${index + 1} 열기`
      : `캡슐 ${index + 1} 여는 중`;
  return (
    <li className={cls} style={{ '--pop': pop } as CSSProperties}>
      <button
        type="button"
        className="pull-card__btn"
        onClick={onPress}
        aria-pressed={face ? selected : undefined}
        aria-label={label}
      >
        <span className="pull-card__flip">
          <span className="pull-card__back">
            <CapsuleBack />
          </span>
          <span className="pull-card__face" aria-hidden="true">
            <span className="pull-card__art">
              <Malang
                character={item.character}
                size={96}
                animation="none"
                decorative
                shiny={item.shiny}
                poke={poke}
                className="pull-card__malang"
              />
            </span>
            <span className="pull-card__name">{item.character.name}</span>
            <RarityBadge rarity={item.rarity} compact />
            <OwnershipTag item={item} compact />
          </span>
        </span>
      </button>
      {face && animate && <Burst rarity={item.rarity} />}
      {best && (
        <span className="pull-card__ribbon" aria-hidden="true">
          최고
        </span>
      )}
    </li>
  );
}

/** 열린 카드를 누르면 격자 위에 뜨는 얇은 설명 띠. 누르면 닫힌다. */
function DetailBar({ item, top, onDismiss }: { item: ResolvedPull; top: boolean; onDismiss(): void }) {
  return (
    <button
      type="button"
      className={`pull-detail pull-detail--${item.rarity}${item.shiny ? ' is-shiny' : ''}${top ? ' is-top' : ''}`}
      onClick={onDismiss}
      aria-label={`${describe(item)}. ${item.character.description} 설명 닫기`}
    >
      <Malang
        key={`${item.character.id}-${item.shiny}`}
        character={item.character}
        size={48}
        animation="bounce"
        decorative
        shiny={item.shiny}
      />
      <span className="pull-detail__text" aria-hidden="true">
        <span className="pull-detail__line">
          <span className="pull-detail__name">
            {item.shiny ? '반짝 ' : ''}
            {item.character.name}
          </span>
          <RarityBadge rarity={item.rarity} compact />
          {item.byPity && <span className="pull-tag pull-tag--note">천장 확정</span>}
          {item.byGuarantee && <span className="pull-tag pull-tag--note">레어 이상 보장</span>}
        </span>
        <span className="pull-detail__desc">{item.character.description}</span>
      </span>
    </button>
  );
}

/** 한 줄 요약 + 도감(또는 코인 모으기) 링크 */
function SummaryLine({ items, short }: { items: readonly ResolvedPull[]; short: boolean }) {
  const s = summarizePulls(items);
  return (
    <div className="pull-summary">
      {items.length > 1 && (
        <dl className="pull-summary__list">
          <div>
            <dt>새 말랑이</dt>
            <dd>{s.newCount}</dd>
          </div>
          {s.shinyCount > 0 && (
            <div className="is-lit">
              <dt>반짝</dt>
              <dd>{s.shinyCount}</dd>
            </div>
          )}
          {s.refund > 0 && (
            <div>
              <dt className="visually-hidden">환급 코인</dt>
              <dd>
                <CoinIcon size={14} />+{s.refund.toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
      )}
      {short ? (
        <Link to="/play" className="pull-summary__link is-short" onClick={() => sfx.button()}>
          코인 모으러 가기
        </Link>
      ) : (
        <Link to="/collection" className="pull-summary__link" onClick={() => sfx.button()}>
          도감 보기
        </Link>
      )}
    </div>
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
  return (
    <div className="pull-actions">
      {(['single', 'multi'] as const).map((kind) => {
        const price = PULL_PRICE[kind];
        const enough = coins >= price;
        const label = kind === 'multi' ? `${PULL_COUNT.multi}연 뽑기` : '1회 뽑기';
        return (
          <button
            key={kind}
            type="button"
            className={`btn btn--small pull-actions__again ${kind === 'multi' ? 'btn--sky' : 'btn--primary'}`}
            disabled={!enough}
            onClick={() => {
              sfx.button();
              onPullAgain(kind);
            }}
            aria-label={`${label}, ${price.toLocaleString()}코인${enough ? '' : ' (코인 부족)'}`}
          >
            {label}
            <span className="pull-actions__cost" aria-hidden="true">
              <CoinIcon size={14} />
              {price.toLocaleString()}
            </span>
          </button>
        );
      })}
      <button ref={closeRef} type="button" className="btn btn--small btn--lemon pull-actions__close" onClick={onClose}>
        닫기
      </button>
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

/** 1회: 큰 캡슐 하나. 누르면 등급만큼 뜸을 들인 뒤 열린다. */
function SingleCapsule({ item, phase, onPress }: { item: ResolvedPull; phase: CardPhase; onPress(): void }) {
  return (
    <div className="pull-bigcap-wrap">
      <button
        type="button"
        className={`pull-bigcap pull-card--${item.rarity} is-${phase}`}
        onClick={onPress}
        aria-label={phase === 'back' ? '캡슐 열기' : '캡슐 여는 중'}
        autoFocus
      >
        <CapsuleBack />
      </button>
    </div>
  );
}

/**
 * 뽑기 결과.
 * 캡슐이 모두 뒷면으로 깔리고, 플레이어가 한 장씩 눌러 연다. 등급이 높을수록 떨림 → 숨 멈춤 → 크게 튀어나옴.
 * "모두 열기"는 남은 캡슐을 짧은 간격으로 열되 전설 이상은 뜸을 지킨다.
 * 다 열리면 한 줄 요약과 다시 뽑기 버튼이 나온다. 열린 카드를 누르면 설명 띠가 뜬다.
 */
export function PullResult({ items, totalRefund, onClose, seenIndex, coins, onPullAgain }: PullResultProps) {
  const reduced = useReducedMotion();
  const n = items.length;
  const single = n === 1 ? items[0] : undefined;
  const rarities = items.map((it) => it.rarity);
  const summary = summarizePulls(items);

  const [phases, setPhases] = useState<CardPhase[]>(() => initialPhases(n, seenIndex));
  const phasesRef = useRef(phases);
  const [selected, setSelected] = useState<number | null>(null);
  const [pokes, setPokes] = useState<number[]>(() => Array<number>(n).fill(0));
  const [flash, setFlash] = useState<{ key: number; rarity: Rarity } | null>(null);
  const [announce, setAnnounce] = useState('');
  const fanfareDone = useRef(seenIndex === summary.bestIndex);
  const openAllRequested = useRef(false);
  const escAt = useRef(-Infinity);
  const timers = useRef<number[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  const done = allOpen(phases);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = (ms: number, fn: () => void) => {
    if (ms <= 0) fn();
    else timers.current.push(window.setTimeout(fn, ms));
  };

  const setPhase = (i: number, phase: CardPhase) => {
    phasesRef.current = phasesRef.current.map((p, k) => (k === i ? phase : p));
    setPhases(phasesRef.current);
  };

  const playBestFanfare = () => {
    if (fanfareDone.current) return;
    fanfareDone.current = true;
    const best = items[summary.bestIndex];
    if (best) playRarityFanfare(sfx, best.rarity, best.shiny);
  };

  /** 한 장이 앞면이 되는 순간: 소리·번쩍·진동 */
  const onFlipped = (i: number, silent: boolean) => {
    const item = items[i];
    if (!item) return;
    setAnnounce(describe(item));
    if (silent) return;
    const rank = rarityRank(item.rarity);
    sfx.flip();
    if (i === summary.bestIndex) playBestFanfare();
    else if (rank >= 1) sfx.tap(rank * 3);
    if (item.shiny && i !== summary.bestIndex) sfx.shinyChime();
    if (rank >= rarityRank('legendary') && i !== seenIndex) {
      setFlash({ key: i, rarity: item.rarity });
      buzz([20, 40, 36], reduced);
    }
  };

  const openCard = (i: number, { quick = false, silent = false } = {}) => {
    const item = items[i];
    if (!item || !canOpen(phasesRef.current[i])) return;
    const rank = rarityRank(item.rarity);
    let t = 0;
    for (const [phase, ms] of openSequence(item.rarity, { seen: i === seenIndex, reduced, quick })) {
      later(t, () => {
        setPhase(i, phase);
        if (phase === 'charge' && !silent) {
          if (rank >= rarityRank('legendary')) sfx.capsuleShake();
          else sfx.tap(4);
        }
        if (phase === 'face') onFlipped(i, silent);
      });
      t += ms;
    }
  };

  const openAll = () => {
    if (openAllRequested.current || allOpen(phasesRef.current)) return;
    openAllRequested.current = true;
    const steps = openAllSchedule(rarities, phasesRef.current, { seenIndex, reduced });
    if (reduced) {
      // 한꺼번에 열 때는 뒤집는 소리를 한 번만 (결과음은 다 열린 뒤)
      sfx.flip();
      steps.forEach(({ index }) => openCard(index, { silent: true }));
      return;
    }
    steps.forEach(({ index, at }) => later(at, () => openCard(index, { quick: true })));
  };

  const pressCard = (i: number) => {
    const phase = phasesRef.current[i];
    if (canOpen(phase)) {
      setSelected(null);
      openCard(i);
      return;
    }
    if (phase !== 'face') return;
    sfx.tap(2);
    setPokes((ps) => ps.map((p, k) => (k === i ? p + 1 : p)));
    setSelected((s) => (s === i ? null : i));
  };

  // 모두 열렸을 때: 결과음(아직이면), 환급 코인 소리, 포커스가 사라졌으면 닫기로
  useEffect(() => {
    if (!done) return;
    const active = document.activeElement;
    const keepFocus = active && gridRef.current?.contains(active);
    if (!keepFocus) closeRef.current?.focus({ preventScroll: true });
    playBestFanfare();
    if (single) return;
    const id = totalRefund > 0 ? window.setTimeout(() => sfx.coin(), 260) : undefined;
    return () => window.clearTimeout(id);
  }, [done]);

  // 다 열기 전에는 바깥 탭으로 닫히지 않는다 (실수로 캡슐을 날리지 않게). Esc는 "모두 열기".
  const requestClose = () => {
    if (!allOpen(phasesRef.current)) return;
    if (performance.now() - escAt.current < ESC_GRACE_MS) return;
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || allOpen(phasesRef.current)) return;
    e.preventDefault();
    escAt.current = performance.now();
    openAll();
  };

  const faceItems = items.filter((_, i) => phases[i] === 'face');
  const shownTop = topRarity(faceItems.map((it) => it.rarity));
  const hasShinyShown = faceItems.some((it) => it.shiny);
  const opened = openedCount(phases);
  const title = single
    ? done
      ? REVEAL_TITLE[single.rarity]
      : '캡슐을 눌러 열어 보세요'
    : !done
      ? '캡슐을 눌러 열어 보세요'
      : rarityRank(shownTop) >= rarityRank('legendary')
        ? REVEAL_TITLE[shownTop]
        : `${n}연 뽑기 결과`;
  const detailItem = selected !== null && phases[selected] === 'face' ? items[selected] : undefined;
  const short = coins < PULL_PRICE.single;

  return (
    <Modal
      labelledBy="pull-result-title"
      onClose={requestClose}
      className={`pull-modal pull-modal--${shownTop}${hasShinyShown ? ' has-shiny' : ''}${single ? ' pull-modal--single' : ' pull-modal--multi'}`}
    >
      <div className={`pull-result${done ? ' is-done' : ''}`} onKeyDown={onKeyDown}>
        <div className="pull-head">
          <h2 id="pull-result-title" className="pull-title">
            {title}
          </h2>
          {!single && !done && (
            <span className="pull-count" aria-hidden="true">
              {opened}/{n}
            </span>
          )}
        </div>
        {single ? (
          phases[0] === 'face' ? (
            <SingleResult item={single} animate={!reduced && seenIndex !== 0} />
          ) : (
            <SingleCapsule item={single} phase={phases[0] ?? 'back'} onPress={() => pressCard(0)} />
          )
        ) : (
          <div className="pull-stage">
            <ol ref={gridRef} className={`pull-grid${n === 10 ? ' pull-grid--ten' : ''}`} aria-label={`캡슐 ${n}개`}>
              {items.map((item, i) => (
                <PullCard
                  key={i}
                  item={item}
                  index={i}
                  phase={phases[i] ?? 'back'}
                  pop={openTiming(item.rarity, { seen: i === seenIndex, reduced }).pop}
                  poke={pokes[i] ?? 0}
                  best={done && i === summary.bestIndex && rarityRank(item.rarity) >= 1}
                  selected={i === selected && detailItem !== undefined}
                  animate={!reduced && i !== seenIndex}
                  onPress={() => pressCard(i)}
                />
              ))}
            </ol>
            {detailItem && selected !== null && (
              <DetailBar item={detailItem} top={selected >= n - 3} onDismiss={() => setSelected(null)} />
            )}
          </div>
        )}
        <div className={`pull-footer${done ? '' : ' is-opening'}`}>
          {done ? (
            <>
              <SummaryLine items={items} short={short} />
              <Actions coins={coins} onPullAgain={onPullAgain} onClose={onClose} closeRef={closeRef} />
            </>
          ) : single ? (
            <p className="pull-hint">
              {phases[0] === 'back' ? '캡슐을 톡 누르면 열려요' : '두근두근…'}
            </p>
          ) : (
            <>
              <p className="pull-hint">열린 캡슐을 누르면 설명이 나와요</p>
              <button
                type="button"
                className="btn btn--small btn--grape btn--block pull-open-all"
                onClick={() => {
                  sfx.button();
                  openAll();
                }}
              >
                모두 열기
              </button>
            </>
          )}
        </div>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>
        {flash && <div key={flash.key} className={`pull-flash pull-flash--${flash.rarity}`} aria-hidden="true" />}
      </div>
    </Modal>
  );
}
