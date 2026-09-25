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
      setMessage('뽑기권이 부족해요. 상점에서 뽑기권을 사거나 미니게임으로 코인을 모아요.');
      return;
    }
    setMessage('');
    const best = result.items.reduce<Rarity>(
      (acc, it) => (rarityRank(it.rarity) > rarityRank(acc) ? it.rarity : acc),
      'common',
    );
    setPending({ items: result.items, totalRefund: result.totalRefund });
    setRun({ id: Date.now(), rarity: best });
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
        🎰 캡슐 뽑기
      </h1>

      <div className="card gacha-page__machine">
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
                  🎫{cost}
                </span>
              </button>
            );
          })}
        </div>
        <p className="gacha-page__pity small">
          전설 이상 확정까지 <strong>{untilPity}</strong>회
        </p>
        <p className="gacha-page__message small" role="status" aria-live="polite">
          {message}
          {message && (
            <>
              {' '}
              <Link to="/play">미니게임 하러 가기</Link>
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
