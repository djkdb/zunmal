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
import './GachaPage.css';

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
  const isMulti = (pending?.items.length ?? 0) > 1;
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
      <h1 id="gacha-title" className="page-title">
        캡슐 뽑기
      </h1>

      <div className="gacha-page__machine">
        <GachaMachine
          run={run}
          // 10연은 결과 카드가 뒤집힐 때 결과음을 낸다. 신화 이상은 전체 화면 연출이 직접 낸다.
          quietFanfare={!!epicItem || isMulti}
          onOpened={() => (epicItem ? setShowEpic(true) : setShowResult(true))}
        />
        <div className="gacha-page__actions">
          {(['single', 'multi'] as const).map((kind) => {
            const price = PULL_PRICE[kind];
            const enough = coins >= price;
            return (
              <button
                key={kind}
                type="button"
                className={`btn ${kind === 'multi' ? 'btn--sky' : 'btn--primary'}`}
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
                  <CoinIcon size={20} />
                  {price.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <div className="gacha-page__info">
          <div
            className={`pity${untilPity <= 10 ? ' pity--near' : ''}`}
            role="group"
            aria-label={`${pityLabel} 이상 확정까지 ${untilPity}회 남았어요`}
          >
            <p className="pity__text" aria-hidden="true">
              {pityLabel} 이상까지 <strong>{untilPity}</strong>회
            </p>
            <span className="pity__bar" aria-hidden="true">
              <span style={{ '--fill': shownPity / (threshold - 1) } as CSSProperties} />
            </span>
          </div>
          <button type="button" className="btn btn--small gacha-page__rates" onClick={openRates} aria-controls="rate-table">
            확률 보기
          </button>
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
