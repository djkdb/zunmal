import type { CollectionSummary as Summary } from '../../data/collectionProgress';
import type { MaterialCoverage } from '../../data/materialIds';
import { RARITY_META, type Rarity } from '../../data/rarity';
import { RarityBadge } from '../RarityBadge';
import { CheckIcon } from '../icons';
import './CollectionSummary.css';

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/**
 * 도감 맨 위 요약: 모은 비율 고리 + 큰 "17 / 32" + 반짝 종류 수 + 등급 칸 3×2(색 + 모양 + 글자 + 수 + 막대).
 * 360×640에서도 아래 "다음 목표" 카드가 첫 화면에 걸리도록 낮게 둔다. 등급 칸을 누르면 그 등급 진열장으로 간다.
 */
export function CollectionSummary({
  summary,
  materials,
  onJump,
}: {
  summary: Summary;
  /** 모은 말랑이로 만나 본 촉감 (data/materialIds.materialCoverage) */
  materials: MaterialCoverage;
  onJump(rarity: Rarity): void;
}) {
  const { owned, total, percent, shinySpecies, byRarity } = summary;
  const dash = (RING_C * percent) / 100;
  return (
    <section className="dex-summary" aria-labelledby="dex-summary-title">
      <div className="dex-summary__top">
        <svg className="dex-summary__ring" viewBox="0 0 76 76" width={64} height={64} aria-hidden="true" focusable="false">
          <circle cx={38} cy={38} r={RING_R} className="dex-summary__ring-track" />
          {percent > 0 && (
            <circle
              cx={38}
              cy={38}
              r={RING_R}
              className="dex-summary__ring-fill"
              strokeDasharray={`${dash} ${RING_C}`}
              transform="rotate(-90 38 38)"
            />
          )}
          <text x={38} y={38} className="dex-summary__ring-text" textAnchor="middle" dominantBaseline="central">
            {percent}%
          </text>
        </svg>
        <div className="dex-summary__count">
          <h2 id="dex-summary-title" className="dex-summary__big">
            {owned}
            <span className="dex-summary__slash"> / {total}</span>
            <span className="visually-hidden">마리, {percent}퍼센트</span>
          </h2>
          <p className="dex-summary__line">
            {owned >= total ? '모든 말랑이를 만났어요' : `${total - owned}마리를 더 만날 수 있어요`}
          </p>
          <div className="dex-summary__pills">
            <p className={`dex-summary__shiny${shinySpecies > 0 ? ' has-shiny' : ''}`}>
              <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" focusable="false">
                <path d="M6 0.5 L7.3 4.7 L11.5 6 L7.3 7.3 L6 11.5 L4.7 7.3 L0.5 6 L4.7 4.7 Z" fill="currentColor" />
              </svg>
              반짝 {shinySpecies}종
            </p>
            <p className={`dex-summary__feel${materials.count >= materials.total ? ' is-done' : ''}`}>
              <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" focusable="false">
                <path d="M1.5 7.5 C1.5 3.8 3.6 2 6 2 C8.4 2 10.5 3.8 10.5 7.5 C10.5 9.4 8.6 10 6 10 C3.4 10 1.5 9.4 1.5 7.5 Z" fill="currentColor" />
              </svg>
              촉감 {materials.total}종 중 {materials.count}종
            </p>
          </div>
        </div>
      </div>
      <ul className="dex-summary__rarities">
        {byRarity.map((r) => {
          const done = r.total > 0 && r.owned >= r.total;
          const label = RARITY_META[r.rarity].label;
          return (
            <li key={r.rarity}>
              <button
                type="button"
                className={`dex-rarity dex-rarity--${r.rarity}${done ? ' is-done' : ''}`}
                onClick={() => onJump(r.rarity)}
                aria-label={`${label} ${r.total}마리 중 ${r.owned}마리${done ? ', 다 모았어요' : ''}. 진열장으로 가기`}
              >
                <RarityBadge rarity={r.rarity} compact />
                <span className="dex-rarity__foot">
                  <span className="dex-rarity__num">
                    {done && <CheckIcon size={14} />}
                    {r.owned}/{r.total}
                  </span>
                  <span className="dex-rarity__bar" aria-hidden="true">
                    <span style={{ width: `${r.total > 0 ? (r.owned / r.total) * 100 : 0}%` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
