import { CHARACTERS_BY_RARITY } from '../data/characters';
import { GACHA_RULES, RARITIES, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL, formatWeightPercent } from '../data/rarity';
import { DUPLICATE_REFUND, TICKET_BUNDLE, TICKET_PRICE } from '../economy/config';
import { effectivePityRate } from '../gacha/engine';
import { RarityBadge } from './RarityBadge';
import './RateTable.css';

/** 확률 안내문: 머신 옆 벽에 테이프로 붙여 둔 종이. 숫자는 모두 데이터/설정 모듈에서 가져온다. */
export function RateTable() {
  const effective = (effectivePityRate() * 100).toFixed(1);
  return (
    <details className="notice">
      <summary className="notice__summary">확률 안내 보기</summary>
      <table className="notice__table">
        <caption className="visually-hidden">희귀도별 뽑기 확률과 중복 환급</caption>
        <thead>
          <tr>
            <th scope="col">등급</th>
            <th scope="col">확률</th>
            <th scope="col">1종당</th>
            <th scope="col">중복 시</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((r) => {
            const pool = CHARACTERS_BY_RARITY[r].length;
            return (
              <tr key={r}>
                <th scope="row">
                  <RarityBadge rarity={r} compact />
                  <span className="notice__pool">{pool}종</span>
                </th>
                <td>{formatWeightPercent(RARITY_WEIGHTS[r])}</td>
                <td>{formatWeightPercent(RARITY_WEIGHTS[r] / pool, RARITY_WEIGHT_TOTAL)}</td>
                <td>+{DUPLICATE_REFUND[r].toLocaleString()}코인</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="notice__rules">
        <li>
          뽑기권은 1장에 {TICKET_PRICE}코인, {TICKET_BUNDLE.count}장 묶음은 {TICKET_BUNDLE.price.toLocaleString()}
          코인이에요.
        </li>
        <li>같은 등급 안에서는 어떤 말랑이든 나올 확률이 같아요.</li>
        <li>
          전설 이상이 {GACHA_RULES.pityThreshold - 1}번 연속 안 나오면 {GACHA_RULES.pityThreshold}번째에는 꼭
          전설 이상이 나와요. 이때 전설과 신화는 6:1 비율이에요.
        </li>
        <li>10연 뽑기에서 레어 이상이 하나도 없으면 마지막 캡슐을 레어 이상으로 바꿔 드려요.</li>
        <li>이 규칙까지 합치면 전설 이상이 나올 확률은 실제로 약 {effective}%예요.</li>
        <li>
          시크릿은 약 {Math.round(RARITY_WEIGHT_TOTAL / RARITY_WEIGHTS.secret).toLocaleString()}번에 한 번 나와요. 천장이
          터질 때도 원래 비율대로 나올 수 있어요.
        </li>
        <li>
          등급과 상관없이 {GACHA_RULES.shinyRate * 100}% 확률로 반짝이는 버전이 나와요. 처음 얻은 반짝 말랑이는
          코인으로 바뀌지 않고 도감에 따로 기록돼요.
        </li>
      </ul>
    </details>
  );
}
