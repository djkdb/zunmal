import { beforeEach, describe, expect, it } from 'vitest';
import { COLLECTIONS, findUnknownMembers } from '../data/collections';
import { DAILY_CAP, SET_REWARD_TICKETS, TICKET_PRICE } from '../economy/config';
import { createSeededRng } from '../lib/rng';
import { SAVE_KEY, SAVE_VERSION } from './persistence';
import { MAX_AFFECTION, createGameStore, createSafeStorage } from './useGameStore';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

let backend: MemoryStorage;
const makeStore = () => createGameStore(createSafeStorage(() => backend));

beforeEach(() => {
  backend = new MemoryStorage();
});

describe('game store', () => {
  it('시작 말랑이는 한 번만 고를 수 있다', () => {
    const store = makeStore();
    expect(store.getState().chooseStarter('not-a-starter')).toBe(false);
    expect(store.getState().chooseStarter('soda-drop')).toBe(true);
    expect(store.getState().partnerId).toBe('soda-drop');
    expect(store.getState().chooseStarter('peach-mochi')).toBe(false);
  });

  it('뽑기권 구매는 코인을 차감', () => {
    const store = makeStore();
    store.setState({ coins: 1150 });
    expect(store.getState().buyTickets('bundle').ok).toBe(true);
    expect(store.getState().buyTickets('single').ok).toBe(true);
    expect(store.getState().coins).toBe(1150 - 1000 - TICKET_PRICE);
    expect(store.getState().gachaTickets).toBe(12);
    expect(store.getState().buyTickets('single').ok).toBe(false);
  });

  it('뽑기권이 부족하면 뽑을 수 없다', () => {
    const store = makeStore();
    store.setState({ gachaTickets: 9 });
    expect(store.getState().pull('multi')).toEqual({ ok: false, reason: 'insufficient-tickets' });
    expect(store.getState().gachaTickets).toBe(9);
  });

  it('10연 뽑기: 티켓 차감, 보유 반영, 환급 지급', () => {
    const store = makeStore();
    store.setState({ gachaTickets: 10, coins: 0 });
    const res = store.getState().pull('multi', createSeededRng(9));
    if (!res.ok) throw new Error('pull failed');
    const s = store.getState();
    expect(res.items).toHaveLength(10);
    expect(s.gachaTickets).toBe(0);
    expect(s.totalPulls).toBe(10);
    expect(s.coins).toBe(res.totalRefund);
    const totalCount = Object.values(s.ownedMalangs).reduce((a, b) => a + b.count, 0);
    expect(totalCount).toBe(10);
    expect(s.partnerId).not.toBeNull();
  });

  it('미니게임 결과: 코인 지급, 최고 기록, 일일 상한', () => {
    const store = makeStore();
    const now = new Date('2026-05-05T03:00:00Z');
    store.setState({ lastDailyResetDate: '2026-05-05', dailyEarnedCoins: DAILY_CAP - 20 });
    const first = store.getState().finishMiniGame('button-malang', 300, now);
    expect(first.reward.grantedCoins).toBe(20);
    expect(first.isNewBest).toBe(true);
    expect(store.getState().coins).toBe(20);
    const second = store.getState().finishMiniGame('button-malang', 100, now);
    expect(second.reward.grantedCoins).toBe(0);
    expect(second.isNewBest).toBe(false);
    expect(second.previousBest).toBe(300);
    expect(store.getState().miniGameRecords['button-malang']).toEqual({ bestScore: 300, lastScore: 100, plays: 2 });
  });

  it('서울 날짜가 바뀌면 일일 한도 초기화', () => {
    const store = makeStore();
    store.setState({ lastDailyResetDate: '2026-05-05', dailyEarnedCoins: DAILY_CAP });
    const res = store.getState().finishMiniGame('button-malang', 200, new Date('2026-05-05T15:00:01Z'));
    expect(res.reward.grantedCoins).toBeGreaterThan(0);
    expect(store.getState().lastDailyResetDate).toBe('2026-05-06');
    expect(store.getState().dailyEarnedCoins).toBe(res.reward.grantedCoins);
  });

  it('보유하지 않은 말랑이는 파트너로 지정 불가', () => {
    const store = makeStore();
    store.getState().chooseStarter('peach-mochi');
    store.getState().setPartner('galaxy-malang');
    expect(store.getState().partnerId).toBe('peach-mochi');
  });
});

describe('persist', () => {
  it('상태를 버전과 함께 저장하고 새 스토어에서 복구', async () => {
    const a = makeStore();
    a.getState().chooseStarter('matcha-bean');
    a.setState({ coins: 321 });
    a.getState().setMuted(true);
    const saved = JSON.parse(backend.getItem(SAVE_KEY) ?? '{}');
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.state.coins).toBe(321);
    expect(saved.state.chooseStarter).toBeUndefined();

    const b = makeStore();
    await b.persist.rehydrate();
    expect(b.getState().coins).toBe(321);
    expect(b.getState().partnerId).toBe('matcha-bean');
    expect(b.getState().settings.muted).toBe(true);
  });

  it('손상된 JSON이면 초기 상태로 시작', async () => {
    backend.setItem(SAVE_KEY, '{not json');
    const store = makeStore();
    await store.persist.rehydrate();
    expect(store.getState().coins).toBe(0);
    expect(typeof store.getState().pull).toBe('function');
  });

  it('구버전(v0) 데이터를 마이그레이션', async () => {
    backend.setItem(SAVE_KEY, JSON.stringify({ version: 0, state: { coins: 900, tickets: 2, owned: ['ember-imp'] } }));
    const store = makeStore();
    await store.persist.rehydrate();
    expect(store.getState().coins).toBe(900);
    expect(store.getState().gachaTickets).toBe(2);
    expect(store.getState().ownedMalangs['ember-imp']?.count).toBe(1);
  });

  it('같은 버전이라도 손상 필드는 정화', async () => {
    backend.setItem(
      SAVE_KEY,
      JSON.stringify({ version: SAVE_VERSION, state: { coins: 'lots', ownedMalangs: { hacked: { count: 5 } } } }),
    );
    const store = makeStore();
    await store.persist.rehydrate();
    expect(store.getState().coins).toBe(0);
    expect(store.getState().ownedMalangs).toEqual({});
  });

  it('storage 접근 예외에도 크래시하지 않음', async () => {
    const throwing = createSafeStorage(() => {
      throw new Error('SecurityError');
    });
    const store = createGameStore(throwing);
    await store.persist.rehydrate();
    expect(() => store.getState().setMuted(true)).not.toThrow();
  });
});

describe('컬렉션 / 친밀도 / 반짝', () => {
  const ownAll = (ids: readonly string[]) =>
    Object.fromEntries(ids.map((id) => [id, { count: 1, shinyCount: 0, firstObtainedAt: 0 }]));

  it('완성한 세트만 한 번 보상을 받는다', () => {
    const store = makeStore();
    const set = COLLECTIONS.find((c) => c.id === 'dessert-shop')!;
    store.setState({ ownedMalangs: ownAll(set.memberIds.slice(1)), gachaTickets: 0 });
    expect(store.getState().claimSet(set.id)).toEqual({ ok: false, reason: 'incomplete' });
    store.setState({ ownedMalangs: ownAll(set.memberIds) });
    expect(store.getState().claimSet(set.id)).toEqual({ ok: true, tickets: SET_REWARD_TICKETS[set.tier] });
    expect(store.getState().gachaTickets).toBe(SET_REWARD_TICKETS[set.tier]);
    expect(store.getState().claimSet(set.id)).toEqual({ ok: false, reason: 'already-claimed' });
    expect(store.getState().claimSet('nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('보유한 말랑이만 친밀도가 오르고 최대치를 넘지 않는다', () => {
    const store = makeStore();
    store.getState().chooseStarter('soda-drop');
    store.getState().petMalang('soda-drop', 3);
    store.getState().petMalang('galaxy-malang', 3);
    expect(store.getState().affection).toEqual({ 'soda-drop': 3 });
    store.getState().petMalang('soda-drop', 1e9);
    expect(store.getState().affection['soda-drop']).toBe(MAX_AFFECTION);
  });

  it('반짝 뽑기는 shinyCount를 올린다', () => {
    const store = makeStore();
    store.setState({ gachaTickets: 1 });
    // 희귀도 0 → 일반, 캐릭터 0 → 첫 일반, 반짝 0 < 1% → 반짝
    const res = store.getState().pull('single', () => 0);
    if (!res.ok) throw new Error('pull failed');
    const id = res.items[0]!.character.id;
    expect(res.items[0]!.shiny).toBe(true);
    expect(store.getState().ownedMalangs[id]).toMatchObject({ count: 1, shinyCount: 1 });
  });
});

describe('컬렉션 데이터', () => {
  it('모든 세트 멤버는 실제 캐릭터이고 세트 id는 고유', () => {
    expect(findUnknownMembers()).toEqual([]);
    expect(new Set(COLLECTIONS.map((c) => c.id)).size).toBe(COLLECTIONS.length);
  });
});
