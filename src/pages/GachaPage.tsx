import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { GachaMachine, type MachineRun } from '../components/GachaMachine';
import { PullResult } from '../components/PullResult';
import { EpicReveal, isEpicRarity } from '../components/epic/EpicReveal';
import { RateTable } from '../components/RateTable';
import { GACHA_RULES, rarityRank, type Rarity } from '../data/rarity';
import { PULL_COUNT, PULL_PRICE } from '../economy/config';
import type { ResolvedPull } from '../gacha/engine';
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

  const [run, setRun] = useState<MachineRun | null>(null);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showEpic, setShowEpic] = useState(false);
  const [message, setMessage] = useState('');

  const busy = run !== null;
  // 이번 뽑기에서 가장 높은 결과가 신화 이상이면 전체 화면 연출을 먼저 보여준다
  const epicItem = pending?.items.reduce<ResolvedPull | undefined>(
    (best, it) => (isEpicRarity(it.rarity) && (!best || rarityRank(it.rarity) > rarityRank(best.rarity)) ? it : best),
    undefined,
  );
  // 같은 프레임 안에서 버튼이 여러 번 눌려도(연타) 뽑기가 한 번만 일어나도록 즉시 잠근다.
  // state는 다음 렌더까지 반영되지 않으므로 ref로 막는다.
  const lockRef = useRef(false);
  const untilPity = GACHA_RULES.pityThreshold - pityCount;
  const discount = Math.round((1 - PULL_PRICE.multi / (PULL_PRICE.single * PULL_COUNT.multi)) * 100);

  const start = (kind: PullKind) => {
    if (busy || lockRef.current) return;
    lockRef.current = true;
    // 결과는 즉시 store에 확정/저장된다. 연출 도중 새로고침해도 결과는 유지.
    const result = pull(kind);
    if (!result.ok) {
      lockRef.current = false;
      sfx.fail();
      setMessage('코인이 모자라요.');
      return;
    }
    setMessage('');
    const best = result.items.reduce<Rarity>(
      (acc, it) => (rarityRank(it.rarity) > rarityRank(acc) ? it.rarity : acc),
      'common',
    );
    setPending({ items: result.items, totalRefund: result.totalRefund });
    setRun({ id: Date.now(), rarity: best, shiny: result.items.some((it) => it.shiny) });
    // 확률 안내 쪽으로 스크롤해 있었더라도 머신 연출이 보이도록 맨 위로.
    // (부드러운 스크롤은 연출 시작과 겹치면 브라우저가 중간에 취소하는 경우가 있어 즉시 이동)
    window.scrollTo({ top: 0 });
  };

  const close = () => {
    sfx.button();
    setShowResult(false);
    setShowEpic(false);
    setPending(null);
    setRun(null);
    lockRef.current = false;
  };

  return (
    <section className="page gacha-page" aria-labelledby="gacha-title">
      <h1 id="gacha-title" className="page-title">
        캡슐 뽑기
      </h1>

      <div className="gacha-page__machine">
        <GachaMachine
          run={run}
          quietFanfare={!!epicItem}
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
                className={`btn ${kind === 'multi' ? 'btn--primary' : 'btn--sky'}`}
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
        <p className="gacha-page__pity small">
          앞으로 <strong>{untilPity}</strong>번 안에 전설 이상이 꼭 나와요
        </p>
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

      <RateTable />

      {showEpic && epicItem && (
        <EpicReveal
          item={epicItem}
          onDone={() => {
            setShowEpic(false);
            setShowResult(true);
          }}
        />
      )}
      {showResult && pending && <PullResult items={pending.items} totalRefund={pending.totalRefund} onClose={close} />}
    </section>
  );
}
