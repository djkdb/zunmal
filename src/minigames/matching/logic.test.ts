import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '../../data/characters';
import { createSeededRng } from '../../lib/rng';
import {
  MATCHING_CONFIG as C,
  applyClearBonus,
  comboBonus,
  computeClearBonus,
  createBoard,
  createMatchingState,
  flip,
  isFaceUp,
  matchScore,
  resolveMismatch,
  type MatchCard,
  type MatchingState,
} from './logic';

function board(seed = 1): MatchCard[] {
  return createBoard(createSeededRng(seed));
}

/** 각 pairId의 두 카드 위치 */
function pairPositions(cards: readonly MatchCard[]): [number, number][] {
  const map = new Map<number, number[]>();
  for (const c of cards) map.set(c.pairId, [...(map.get(c.pairId) ?? []), c.index]);
  return [...map.values()].map((v) => [v[0] as number, v[1] as number]);
}

/** 서로 다른 짝의 두 카드 */
function wrongPair(cards: readonly MatchCard[]): [number, number] {
  const a = cards[0] as MatchCard;
  const b = cards.find((c) => c.pairId !== a.pairId) as MatchCard;
  return [a.index, b.index];
}

function flipTwo(s: MatchingState, a: number, b: number, now: number) {
  const first = flip(s, a, now);
  return flip(first.state, b, now + 10);
}

describe('짝 맞추기 보드', () => {
  it('16장, 정확히 8쌍, 서로 다른 캐릭터', () => {
    const cards = board();
    expect(cards).toHaveLength(C.pairs * 2);
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.characterId, (counts.get(c.characterId) ?? 0) + 1);
    expect(counts.size).toBe(C.pairs);
    for (const n of counts.values()) expect(n).toBe(2);
    const ids = new Set(CHARACTERS.map((c) => c.id));
    for (const c of cards) expect(ids.has(c.characterId)).toBe(true);
    expect(cards.map((c) => c.index)).toEqual([...Array(16).keys()]);
    // 같은 pairId는 같은 캐릭터
    for (const [a, b] of pairPositions(cards)) expect(cards[a]?.characterId).toBe(cards[b]?.characterId);
  });

  it('같은 시드면 같은 배치, 다른 시드면 대체로 다른 배치', () => {
    expect(board(42)).toEqual(board(42));
    const layouts = new Set([1, 2, 3, 4, 5].map((s) => board(s).map((c) => c.characterId).join(',')));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('캐릭터가 부족하면 에러', () => {
    expect(() => createBoard(createSeededRng(1), ['a', 'b', 'c'])).toThrow();
  });
});

describe('뒤집기', () => {
  it('한 장 뒤집으면 열림', () => {
    const out = flip(createMatchingState(board()), 3, 0);
    expect(out.event).toBe('opened');
    expect(out.state.open).toEqual([3]);
    expect(isFaceUp(out.state, 3)).toBe(true);
    expect(out.state.attempts).toBe(0);
  });

  it('같은 카드를 다시 뒤집을 수 없음', () => {
    const s = flip(createMatchingState(board()), 3, 0).state;
    const out = flip(s, 3, 50);
    expect(out.event).toBe('rejected');
    expect(out.state).toBe(s);
  });

  it('범위 밖 인덱스는 거부', () => {
    const s = createMatchingState(board());
    expect(flip(s, -1, 0).event).toBe('rejected');
    expect(flip(s, 16, 0).event).toBe('rejected');
  });

  it('짝이 맞으면 열린 채로 고정, 점수·시도·콤보 증가', () => {
    const cards = board();
    const [a, b] = pairPositions(cards)[0] as [number, number];
    const out = flipTwo(createMatchingState(cards), a, b, 0);
    expect(out.event).toBe('match');
    expect(out.points).toBe(C.matchPoints);
    expect(out.state.matched[a]).toBe(true);
    expect(out.state.matched[b]).toBe(true);
    expect(out.state.open).toEqual([]);
    expect(out.state.attempts).toBe(1);
    expect(out.state.combo).toBe(1);
    expect(out.state.pairsFound).toBe(1);
    // 찾은 카드는 다시 뒤집을 수 없음
    expect(flip(out.state, a, 100).event).toBe('rejected');
  });

  it('짝이 틀리면 콤보 0, 대기 후 덮임. 두 장이 열린 동안 세 번째 카드 거부', () => {
    const cards = board();
    const [x, y] = wrongPair(cards);
    const out = flipTwo(createMatchingState(cards), x, y, 1000);
    expect(out.event).toBe('mismatch');
    expect(out.points).toBe(0);
    expect(out.state.open).toEqual([x, y]);
    expect(out.state.attempts).toBe(1);
    expect(out.state.hideAt).toBe(1010 + C.mismatchDelayMs);

    const third = cards.findIndex((c) => c.index !== x && c.index !== y);
    const blocked = flip(out.state, third, 1100);
    expect(blocked.event).toBe('rejected');
    expect(blocked.state.open).toEqual([x, y]);

    // 대기 전 resolve는 아무 일 없음, 대기 후에는 덮임
    expect(resolveMismatch(out.state, 1100)).toBe(out.state);
    const hidden = resolveMismatch(out.state, 1010 + C.mismatchDelayMs);
    expect(hidden.open).toEqual([]);
    expect(hidden.hideAt).toBeNull();
    expect(isFaceUp(hidden, x)).toBe(false);

    // 대기 시간이 지난 뒤 뒤집으면 자동으로 덮고 새 카드를 연다
    const late = flip(out.state, third, 5000);
    expect(late.event).toBe('opened');
    expect(late.state.open).toEqual([third]);
  });

  it('틀리면 콤보가 끊기고 최대 콤보는 유지', () => {
    const cards = board(7);
    const pairs = pairPositions(cards);
    let s = createMatchingState(cards);
    let t = 0;
    for (const [a, b] of pairs.slice(0, 3)) s = flipTwo(s, a, b, (t += 100)).state;
    expect(s.combo).toBe(3);
    // 아직 남은 짝 두 개로 오답 만들기
    const rest = pairs.slice(3);
    const miss = flipTwo(s, rest[0]![0], rest[1]![0], (t += 100)).state;
    expect(miss.combo).toBe(0);
    expect(miss.maxCombo).toBe(3);
    expect(miss.attempts).toBe(4);
    expect(miss.score).toBe(s.score); // 감점 없음
  });
});

describe('점수', () => {
  it('콤보 보너스: 2연속부터 +comboStep, 최대 maxComboBonus', () => {
    expect(comboBonus(1)).toBe(0);
    expect(comboBonus(2)).toBe(C.comboStep);
    expect(comboBonus(3)).toBe(C.comboStep * 2);
    expect(comboBonus(100)).toBe(C.maxComboBonus);
    expect(matchScore(1)).toBe(C.matchPoints);
    expect(matchScore(3)).toBe(C.matchPoints + C.comboStep * 2);
  });

  it('완벽하게 풀면 8쌍 점수 + 콤보 합', () => {
    const cards = board(3);
    let s = createMatchingState(cards);
    let t = 0;
    for (const [a, b] of pairPositions(cards)) s = flipTwo(s, a, b, (t += 100)).state;
    let expected = 0;
    for (let k = 1; k <= C.pairs; k++) expected += matchScore(k);
    expect(s.cleared).toBe(true);
    expect(s.score).toBe(expected);
    expect(s.attempts).toBe(C.pairs);
    expect(s.maxCombo).toBe(C.pairs);
    // 클리어 뒤에는 더 뒤집을 수 없음
    expect(flip(s, 0, t + 100).event).toBe('rejected');
  });

  it('클리어 보너스는 남은 시간이 많을수록, 시도가 적을수록 크다', () => {
    expect(computeClearBonus(30_000, 20)).toBe(30 * C.timeBonusPerSec);
    expect(computeClearBonus(10_000, 20)).toBe(10 * C.timeBonusPerSec);
    expect(computeClearBonus(30_000, 20)).toBeGreaterThan(computeClearBonus(10_000, 20));
    expect(computeClearBonus(9_001, 20)).toBe(10 * C.timeBonusPerSec); // 올림
    expect(computeClearBonus(-5, 99)).toBe(0);
    expect(computeClearBonus(0, 8)).toBe((C.attemptPar - 8) * C.attemptBonus);
    expect(computeClearBonus(20_000, 10)).toBeGreaterThan(computeClearBonus(20_000, 14));
  });

  it('applyClearBonus는 클리어한 경우에만, 한 번만 더한다', () => {
    const cards = board(5);
    const fresh = createMatchingState(cards);
    expect(applyClearBonus(fresh, 30_000)).toBe(fresh);

    let s = fresh;
    let t = 0;
    for (const [a, b] of pairPositions(cards)) s = flipTwo(s, a, b, (t += 100)).state;
    const withBonus = applyClearBonus(s, 30_000);
    expect(withBonus.clearBonus).toBe(computeClearBonus(30_000, s.attempts));
    expect(withBonus.score).toBe(s.score + withBonus.clearBonus);
    expect(applyClearBonus(withBonus, 30_000)).toBe(withBonus);
  });

  it('시도가 많으면 같은 시간에 클리어해도 점수가 낮다', () => {
    const cards = board(9);
    const pairs = pairPositions(cards);
    const solve = (withMisses: boolean) => {
      let s = createMatchingState(cards);
      let t = 0;
      for (let i = 0; i < pairs.length; i++) {
        const [a, b] = pairs[i] as [number, number];
        const other = pairs[(i + 1) % pairs.length] as [number, number];
        if (withMisses && i < pairs.length - 1) {
          s = flipTwo(s, a, other[0], (t += 100)).state;
          t += C.mismatchDelayMs + 10;
        }
        s = flipTwo(s, a, b, (t += 100)).state;
      }
      return applyClearBonus(s, 20_000);
    };
    const clean = solve(false);
    const messy = solve(true);
    expect(clean.cleared && messy.cleared).toBe(true);
    expect(messy.attempts).toBe(clean.attempts + C.pairs - 1);
    expect(clean.score).toBeGreaterThan(messy.score);
  });
});

describe('카드 풀', () => {
  it('시크릿 말랑이는 카드에 나오지 않는다 (도감 스포일러 방지)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = createBoard(createSeededRng(seed));
      board.forEach((card) => expect(getCharacter(card.characterId)?.rarity).not.toBe('secret'));
    }
  });
});
