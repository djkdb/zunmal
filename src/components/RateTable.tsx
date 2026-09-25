import { CHARACTERS_BY_RARITY } from '../data/characters';
import { GACHA_RULES, RARITIES, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL, formatWeightPercent } from '../data/rarity';
import { DUPLICATE_REFUND, TICKET_BUNDLE, TICKET_PRICE } from '../economy/config';
import { effectivePityRate } from '../gacha/engine';
import { RarityBadge } from './RarityBadge';
import './RateTable.css';

/** 확률 및 가격 공개 표. 모든 숫자는 데이터/설정 모듈에서 가져온다. */
export function RateTable() {
  const effective = (effectivePityRate() * 100).toFixed(1);
  return (
    <details className="card rate-table">
      <summary className="rate-table__summary">📋 확률표 · 가격 공개</summary>
      <table className="rate-table__table">
        <caption className="visually-hidden">희귀도별 뽑기 확률과 중복 환급</caption>
        <thead>
          <tr>
            <th scope="col">희귀도</th>
            <th scope="col">확률</th>
            <th scope="col">1종당</th>
            <th scope="col">중복 환급</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((r) => {
            const pool = CHARACTERS_BY_RARITY[r].length;
            return (
              <tr key={r}>
                <th scope="row">
                  <RarityBadge rarity={r} compact />
                  <span className="small muted"> {pool}종</span>
                </th>
                <td>{formatWeightPercent(RARITY_WEIGHTS[r])}</td>
                <td>{formatWeightPercent(RARITY_WEIGHTS[r] / pool, RARITY_WEIGHT_TOTAL)}</td>
                <td>{DUPLICATE_REFUND[r].toLocaleString()} C</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="rate-table__notes small">
        <li>
          뽑기권 1장 = {TICKET_PRICE} 코인, {TICKET_BUNDLE.count}장 묶음 = {TICKET_BUNDLE.price.toLocaleString()} 코인
        </li>
        <li>같은 희귀도 안에서는 모든 말랑이가 같은 확률로 나와요.</li>
        <li>
          <strong>천장</strong>: 전설 이상이 {GACHA_RULES.pityThreshold - 1}회 연속 나오지 않으면{' '}
          {GACHA_RULES.pityThreshold}번째 뽑기에서 전설 이상 확정 (전설:신화 = 6:1).
        </li>
        <li>
          <strong>10연 보장</strong>: 10연 뽑기에 레어 이상이 없으면 마지막 1개를 레어 이상으로 다시 뽑아요.
        </li>
        <li>천장을 포함한 실질 전설 이상 확률은 약 {effective}%예요.</li>
      </ul>
    </details>
  );
}
