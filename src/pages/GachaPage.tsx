import { useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { nudgeInsufficient } from '../lib/coinFx';
import { GachaMachine, type MachineRun } from '../components/GachaMachine';
import { PullResult } from '../components/PullResult';
import { EpicReveal, isEpicRarity, preloadScene3d } from '../components/epic/EpicReveal';
import { RateTable } from '../components/RateTable';
import { topRarity } from '../components/pullReveal';
import { GACHA_RULES, RARITY_META, rarityRank } from '../data/rarity';
import { PULL_COUNT, PULL_PRICE } from '../economy/config';
import type { ResolvedPull } from '../gacha/engine';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGameStore, type PullKind } from '../store/useGameStore';
import { CoinIcon } from '../components/icons';
import { Malang } from '../components/Malang';
import { getCharacter } from '../data/characters';
import './GachaPage.css';

/** 가장 최근에 만난 말랑이 한 칸. 아직 캡슐을 안 열었으면 NEW → 놀이방에서 연다 */
function RecentMalang() {
  const owned = useGameStore((s) => s.ownedMalangs);
  const unboxed = useGameStore((s) => s.unboxed);
  let latestId: string | undefined;
  let latestAt = -1;
  for (const [id, o] of Object.entries(owned)) {
    if (o.firstObtainedAt > latestAt) {
      latestAt = o.firstObtainedAt;
      latestId = id;
    }
  }
  const character = latestId ? getCharacter(latestId) : undefined;
  if (!character) return null;
  const isNew = !unboxed.includes(character.id);
  return (
    <Link
      to={isNew ? '/touch' : '/collection'}
      className="gacha-recent"
      onClick={() => sfx.button()}
      aria-label={`최근 만난 말랑이 ${character.name}${isNew ? ', 새 캡슐, 놀이방에서 열기' : ', 도감 보기'}`}
    >
      <Malang character={character} size={44} animation="none" decorative />
      <span className="gacha-recent__text" aria-hidden="true">
        <span className="gacha-recent__label">최근 만난 말랑이</span>
        <span className="gacha-recent__name">{character.name}</span>
      </span>
      {isNew && (
        <span className="chip chip--lemon gacha-recent__new" aria-hidden="true">
          NEW
        </span>
      )}
    </Link>
  );
}

interface PendingResult {
  items: ResolvedPull[];
  totalRefund: number;
}

export function GachaPage() {
  const coins = useGameStore((s) => s.coins);
  const pityCount = useGameStore((s) => s.pityCount);
  const pull = useGameStore((s) => s.pull);
  const reduced = useReducedMotion();

  const [run, setRun] = useState<MachineRun | null>(null);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showEpic, setShowEpic] = useState(false);
  const [message, setMessage] = useState('');
  const rateRef = useRef<HTMLDetailsElement>(null);

  const busy = run !== null;
  // 이번 뽑기에서 가장 높은 결과가 신화 이상이면 전체 화면 연출을 먼저 보여준다
  const epicItem = pending?.items.reduce<ResolvedPull | undefined>(
    (best, it) => (isEpicRarity(it.rarity) && (!best || rarityRank(it.rarity) > rarityRank(best.rarity)) ? it : best),
    undefined,
  );
  // 같은 프레임 안에서 버튼이 여러 번 눌려도(연타) 뽑기가 한 번만 일어나도록 즉시 잠근다.
  // state는 다음 렌더까지 반영되지 않으므로 ref로 막는다. 결과 창을 닫을 때만 풀린다.
  const lockRef = useRef(false);
  // 결과는 뽑는 순간 저장되지만, 천장 카운터가 연출 도중 바뀌면 결과를 미리 알려 버린다.
  // 연출이 끝날 때까지는 뽑기 전 값을 보여 준다.
  const pityBefore = useRef(pityCount);
  if (!busy) pityBefore.current = pityCount;
  const shownPity = busy ? pityBefore.current : pityCount;
  const threshold = GACHA_RULES.pityThreshold;
  const untilPity = threshold - shownPity;
  const pityLabel = RARITY_META[GACHA_RULES.pityMinRarity].label;
  const discount = Math.round((1 - PULL_PRICE.multi / (PULL_PRICE.single * PULL_COUNT.multi)) * 100);

  const start = (kind: PullKind) => {
    if (lockRef.current) return;
    lockRef.current = true;
    pityBefore.current = useGameStore.getState().pityCount;
    // 결과는 즉시 store에 확정/저장된다. 연출 도중 새로고침해도 결과는 유지.
    const result = pull(kind);
    if (!result.ok) {
      lockRef.current = false;
      sfx.fail();
      nudgeInsufficient();
      setMessage('코인이 모자라요.');
      return;
    }
    setMessage('');
    const best = topRarity(result.items.map((it) => it.rarity));
    // 신화 이상이면 머신이 흔들리는 동안 3D 연출 모듈을 받아 둔다 (평소에는 받지 않음)
    if (isEpicRarity(best)) void preloadScene3d();
    setPending({ items: result.items, totalRefund: result.totalRefund });
    setRun({ id: Date.now(), rarity: best, shiny: result.items.some((it) => it.shiny) });
    // 확률 안내 쪽으로 스크롤해 있었더라도 머신 연출이 보이도록 맨 위로.
    // (부드러운 스크롤은 연출 시작과 겹치면 브라우저가 중간에 취소하는 경우가 있어 즉시 이동)
    window.scrollTo({ top: 0 });
  };

  const reset = () => {
    setShowResult(false);
    setShowEpic(false);
    setPending(null);
    setRun(null);
    lockRef.current = false;
  };

  const close = () => {
    sfx.button();
    reset();
  };

  // 결과 창에서 바로 다시 뽑기: 창을 닫고(잠금 해제) 같은 이벤트 안에서 새로 뽑는다
  const pullAgain = (kind: PullKind) => {
    reset();
    start(kind);
  };

  const openRates = () => {
    sfx.button();
    const el = rateRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.querySelector('summary')?.focus({ preventScroll: true });
  };

  return (
    <section className="page gacha-page" aria-labelledby="gacha-title">
      <header className="gacha-page__head">
        <h1 id="gacha-title" className="page-title">
          캡슐 뽑기
        </h1>
        <p className="page-subtitle">동전을 넣고 손잡이를 돌려요</p>
      </header>

      <div className="gacha-page__machine">
        <GachaMachine
          run={run}
          // 결과음은 플레이어가 결과 창에서 가장 좋은 캡슐을 직접 열 때 낸다. 신화 이상은 전체 화면 연출이 직접 낸다.
          quietFanfare
          onOpened={() => (epicItem ? setShowEpic(true) : setShowResult(true))}
        />
        <div
          className={`pity${untilPity <= 10 ? ' pity--near' : ''}`}
          role="group"
          aria-label={`${pityLabel} 이상 확정까지 ${untilPity}회 남았어요`}
        >
          <div className="pity__row">
            <p className="pity__text" aria-hidden="true">
              {pityLabel} 이상까지 <strong>{untilPity}</strong>회
            </p>
            <button type="button" className="gacha-page__rates" onClick={openRates} aria-controls="rate-table">
              확률 보기
            </button>
          </div>
          <span className="pity__bar" aria-hidden="true">
            <span style={{ '--fill': shownPity / (threshold - 1) } as CSSProperties} />
          </span>
        </div>
        <div className="gacha-page__actions">
          {(['single', 'multi'] as const).map((kind) => {
            const price = PULL_PRICE[kind];
            const enough = coins >= price;
            return (
              <button
                key={kind}
                type="button"
                className={`btn ${kind === 'multi' ? 'btn--secondary' : 'btn--primary'}`}
                disabled={busy || !enough}
                onClick={() => {
                  sfx.button();
                  start(kind);
                }}
                aria-label={`${kind === 'multi' ? `${PULL_COUNT.multi}연` : '1회'} 뽑기, ${price.toLocaleString()}코인${enough ? '' : ' (코인 부족)'}`}
              >
                {kind === 'multi' && discount > 0 && (
                  <span className="gacha-page__sale" aria-hidden="true">
                    {discount}% 할인
                  </span>
                )}
                {kind === 'multi' ? `${PULL_COUNT.multi}연 뽑기` : '1회 뽑기'}
                <span className="gacha-page__cost" aria-hidden="true">
                  <CoinIcon size={14} />
                  {price.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <p className="gacha-page__message small" role="status" aria-live="polite">
          {message}
          {message && (
            <>
              {' '}
              <Link to="/play">미니게임에서 모아 오세요.</Link>
            </>
          )}
        </p>
      </div>

      {!busy && <RecentMalang />}

      <RateTable ref={rateRef} pityCount={shownPity} />

      {showEpic && epicItem && (
        <EpicReveal
          item={epicItem}
          onDone={() => {
            setShowEpic(false);
            setShowResult(true);
          }}
        />
      )}
      {showResult && pending && (
        <PullResult
          items={pending.items}
          totalRefund={pending.totalRefund}
          seenIndex={epicItem ? pending.items.indexOf(epicItem) : undefined}
          coins={coins}
          onPullAgain={pullAgain}
          onClose={close}
        />
      )}
    </section>
  );
}
