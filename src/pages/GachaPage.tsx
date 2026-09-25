import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { GachaMachine, type MachineRun } from '../components/GachaMachine';
import { PullResult } from '../components/PullResult';
import { RateTable } from '../components/RateTable';
import { Shop } from '../components/Shop';
import { GACHA_RULES, rarityRank, type Rarity } from '../data/rarity';
import { PULL_COST } from '../economy/config';
import type { ResolvedPull } from '../gacha/engine';
import { useGameStore, type PullKind } from '../store/useGameStore';
import { TicketIcon } from '../components/icons';
import './GachaPage.css';

interface PendingResult {
  items: ResolvedPull[];
  totalRefund: number;
}

export function GachaPage() {
  const tickets = useGameStore((s) => s.gachaTickets);
  const pityCount = useGameStore((s) => s.pityCount);
  const pull = useGameStore((s) => s.pull);

  const [run, setRun] = useState<MachineRun | null>(null);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [message, setMessage] = useState('');

  const busy = run !== null;
  const untilPity = GACHA_RULES.pityThreshold - pityCount;

  const start = (kind: PullKind) => {
    if (busy) return;
    // 결과는 즉시 store에 확정/저장된다. 연출 도중 새로고침해도 결과는 유지.
    const result = pull(kind);
    if (!result.ok) {
      sfx.fail();
      setMessage('뽑기권이 모자라요. 아래에서 뽑기권을 사거나');
      return;
    }
    setMessage('');
    const best = result.items.reduce<Rarity>(
      (acc, it) => (rarityRank(it.rarity) > rarityRank(acc) ? it.rarity : acc),
      'common',
    );
    setPending({ items: result.items, totalRefund: result.totalRefund });
    setRun({ id: Date.now(), rarity: best, shiny: result.items.some((it) => it.shiny) });
    // 상점 쪽으로 스크롤해 있었더라도 머신 연출이 보이도록 맨 위로.
    // (부드러운 스크롤은 연출 시작과 겹치면 브라우저가 중간에 취소하는 경우가 있어 즉시 이동)
    window.scrollTo({ top: 0 });
  };

  const close = () => {
    sfx.button();
    setShowResult(false);
    setPending(null);
    setRun(null);
  };

  return (
    <section className="page gacha-page" aria-labelledby="gacha-title">
      <h1 id="gacha-title" className="page-title">
        캡슐 뽑기
      </h1>

      <div className="gacha-page__machine">
        <GachaMachine run={run} onOpened={() => setShowResult(true)} />
        <div className="gacha-page__actions">
          {(['single', 'multi'] as const).map((kind) => {
            const cost = PULL_COST[kind];
            const enough = tickets >= cost;
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
                aria-label={`${kind === 'multi' ? '10연' : '1회'} 뽑기, 뽑기권 ${cost}장 사용${enough ? '' : ' (뽑기권 부족)'}`}
              >
                {kind === 'multi' ? '10연 뽑기' : '1회 뽑기'}
                <span className="gacha-page__cost" aria-hidden="true">
                  <TicketIcon size={18} />
                  {cost}
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
              <Link to="/play">미니게임에서 코인을 모아 오세요.</Link>
            </>
          )}
        </p>
      </div>

      <Shop />
      <RateTable />

      {showResult && pending && <PullResult items={pending.items} totalRefund={pending.totalRefund} onClose={close} />}
    </section>
  );
}
