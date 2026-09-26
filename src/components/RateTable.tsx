import type { Ref } from 'react';
import { CHARACTERS_BY_RARITY } from '../data/characters';
import { GACHA_RULES, RARITIES, RARITY_META, RARITY_WEIGHTS, RARITY_WEIGHT_TOTAL } from '../data/rarity';
import { DUPLICATE_REFUND, PULL_COUNT, PULL_PRICE } from '../economy/config';
import { effectivePityRate } from '../gacha/engine';
import { RarityBadge } from './RarityBadge';
import './RateTable.css';

/** 확률 표기: 등급은 소수 둘째 자리, 말랑이 한 종은 넷째 자리까지 (자릿수를 섞지 않는다) */
function pct(weight: number, digits: number): string {
  return `${((weight / RARITY_WEIGHT_TOTAL) * 100).toFixed(digits)}%`;
}

const GRADE_DIGITS = 2;
const EACH_DIGITS = 4;

interface RateTableProps {
  /** 지금까지 전설 이상 없이 뽑은 횟수 (있으면 천장 규칙 옆에 현재 상태를 함께 보여 준다) */
  pityCount?: number;
  ref?: Ref<HTMLDetailsElement>;
}

/** 확률 안내문: 머신 옆 벽에 테이프로 붙여 둔 종이. 숫자는 모두 데이터/설정 모듈에서 가져온다. */
export function RateTable({ pityCount, ref }: RateTableProps) {
  const effective = (effectivePityRate() * 100).toFixed(1);
  const totalWeight = RARITIES.reduce((s, r) => s + RARITY_WEIGHTS[r], 0);
  const threshold = GACHA_RULES.pityThreshold;
  const pityMin = RARITY_META[GACHA_RULES.pityMinRarity].label;
  const multiMin = RARITY_META[GACHA_RULES.multiGuaranteeMinRarity].label;
  return (
    <details className="notice" id="rate-table" ref={ref}>
      <summary className="notice__summary">확률 안내 보기</summary>
      <table className="notice__table">
        <caption className="visually-hidden">희귀도별 뽑기 확률, 말랑이 한 종의 확률, 중복 환급</caption>
        <thead>
          <tr>
            <th scope="col">등급</th>
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
                  <span className="notice__pool">{pool}종</span>
                </th>
                <td>{pct(RARITY_WEIGHTS[r], GRADE_DIGITS)}</td>
                <td>{pool > 0 ? pct(RARITY_WEIGHTS[r] / pool, EACH_DIGITS) : '-'}</td>
                <td>+{DUPLICATE_REFUND[r].toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">합계</th>
            <td>{pct(totalWeight, GRADE_DIGITS)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <details className="notice__each">
        <summary>말랑이별 확률 모두 보기</summary>
        {RARITIES.map((r) => {
          const pool = CHARACTERS_BY_RARITY[r];
          if (pool.length === 0) return null;
          const each = pct(RARITY_WEIGHTS[r] / pool.length, EACH_DIGITS);
          return (
            <section key={r} className="notice__group" aria-label={`${RARITY_META[r].label} 말랑이`}>
              <RarityBadge rarity={r} compact />
              <ul>
                {pool.map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <span className="notice__each-rate">{each}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </details>

      <ul className="notice__rules">
        <li>
          1회 뽑기는 {PULL_PRICE.single}코인, {PULL_COUNT.multi}연 뽑기는 {PULL_PRICE.multi.toLocaleString()}코인이에요.
        </li>
        <li>같은 등급 안에서는 어떤 말랑이든 나올 확률이 같아요.</li>
        <li>
          <strong>천장</strong> {pityMin} 이상이 {threshold - 1}번 연속 안 나오면 {threshold}번째에는 꼭 {pityMin} 이상이
          나와요. 이때도 전설, 신화, 시크릿은 원래 비율대로 나와요 (전설:신화 ={' '}
          {RARITY_WEIGHTS.legendary / RARITY_WEIGHTS.mythic}:1).
          {pityCount !== undefined && (
            <>
              {' '}
              지금은 {pityCount}번째까지 안 나와서, 앞으로 <strong>{threshold - pityCount}번</strong> 안에 꼭 나와요.
            </>
          )}
        </li>
        <li>
          {PULL_COUNT.multi}연 뽑기에서 {multiMin} 이상이 하나도 없으면 마지막 캡슐을 {multiMin} 이상으로 바꿔 드려요.
        </li>
        <li>
          천장까지 합치면 {pityMin} 이상이 나올 확률은 실제로 <strong>약 {effective}%</strong>예요.
        </li>
        <li>
          시크릿은 약 {Math.round(RARITY_WEIGHT_TOTAL / RARITY_WEIGHTS.secret).toLocaleString()}번에 한 번 나와요.
        </li>
        <li>
          등급과 상관없이 {GACHA_RULES.shinyRate * 100}% 확률로 반짝이는 버전이 나와요. 처음 얻은 반짝 말랑이는
          코인으로 바뀌지 않고 도감에 따로 기록돼요.
        </li>
        <li>이미 있는 말랑이가 나오면 위 표의 코인으로 돌려받아요.</li>
      </ul>
    </details>
  );
}
