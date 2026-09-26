import { beforeEach, describe, expect, it } from 'vitest';
import { COLLECTIONS, findUnknownMembers } from '../data/collections';
import { DAILY_CAP, MISSION_ALL_CLEAR_BONUS, PULL_PRICE, SET_REWARD_COINS, STARTING_COINS } from '../economy/config';
import { generateDailyMissions } from '../missions/missions';
import { createSeededRng } from '../lib/rng';
import { SAVE_KEY, SAVE_VERSION, createInitialSave } from './persistence';
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

  it('코인이 부족하면 뽑을 수 없고 코인도 그대로', () => {
    const store = makeStore();
    store.setState({ coins: PULL_PRICE.multi - 1 });
    expect(store.getState().pull('multi')).toEqual({ ok: false, reason: 'insufficient-coins' });
    expect(store.getState().coins).toBe(PULL_PRICE.multi - 1);
  });

  it('1회 뽑기는 코인을 1회 가격만큼 차감', () => {
    const store = makeStore();
    store.setState({ coins: 250 });
    const res = store.getState().pull('single', createSeededRng(4));
    if (!res.ok) throw new Error('pull failed');
    expect(store.getState().coins).toBe(250 - PULL_PRICE.single + res.totalRefund);
  });

  it('10연 뽑기: 코인 차감, 보유 반영, 환급 지급', () => {
    const store = makeStore();
    store.setState({ coins: PULL_PRICE.multi });
    const res = store.getState().pull('multi', createSeededRng(9));
    if (!res.ok) throw new Error('pull failed');
    const s = store.getState();
    expect(res.items).toHaveLength(10);
    expect(s.totalPulls).toBe(10);
    expect(s.coins).toBe(res.totalRefund);
    const totalCount = Object.values(s.ownedMalangs).reduce((a, b) => a + b.count, 0);
    expect(totalCount).toBe(10);
    expect(s.partnerId).not.toBeNull();
  });

  it('미니게임 결과: 코인 지급, 최고 기록, 일일 상한', () => {
    const store = makeStore();
    const now = new Date('2026-05-05T03:00:00Z');
    store.setState({ coins: 0, lastDailyResetDate: '2026-05-05', dailyEarnedCoins: DAILY_CAP - 20 });
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
    expect(b.getState().settings).toEqual({ sfxOn: false, musicOn: false });
  });

  it('효과음과 배경음악은 따로 켜고 끈다', () => {
    const store = makeStore();
    store.getState().setMusicOn(false);
    expect(store.getState().settings).toEqual({ sfxOn: true, musicOn: false });
    store.getState().setSfxOn(false);
    expect(store.getState().settings).toEqual({ sfxOn: false, musicOn: false });
    store.getState().setMuted(false);
    expect(store.getState().settings).toEqual({ sfxOn: true, musicOn: true });
  });

  it('손상된 JSON이면 초기 상태로 시작', async () => {
    backend.setItem(SAVE_KEY, '{not json');
    const store = makeStore();
    await store.persist.rehydrate();
    expect(store.getState().coins).toBe(STARTING_COINS);
    expect(typeof store.getState().pull).toBe('function');
  });

  it('구버전(v0) 데이터를 마이그레이션', async () => {
    backend.setItem(SAVE_KEY, JSON.stringify({ version: 0, state: { coins: 900, tickets: 2, owned: ['ember-imp'] } }));
    const store = makeStore();
    await store.persist.rehydrate();
    // v0 뽑기권 2장 → 코인으로 합쳐짐
    expect(store.getState().coins).toBe(900 + 2 * 100);
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
    store.setState({ ownedMalangs: ownAll(set.memberIds.slice(1)), coins: 0 });
    expect(store.getState().claimSet(set.id)).toEqual({ ok: false, reason: 'incomplete' });
    store.setState({ ownedMalangs: ownAll(set.memberIds) });
    expect(store.getState().claimSet(set.id)).toEqual({ ok: true, coins: SET_REWARD_COINS[set.tier] });
    expect(store.getState().coins).toBe(SET_REWARD_COINS[set.tier]);
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
    store.setState({ coins: PULL_PRICE.single });
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

describe('일일 미션', () => {
  const NOW = new Date('2026-09-25T03:00:00Z'); // 서울 2026-09-25
  const missions = generateDailyMissions('2026-09-25');

  it('게임/뽑기/쓰다듬기가 미션 진행에 기록된다', () => {
    const store = makeStore();
    store.getState().chooseStarter('soda-drop');
    store.setState({ coins: PULL_PRICE.single, lastDailyResetDate: '2026-09-25' });
    store.getState().finishMiniGame('button-malang', 200, NOW);
    store.getState().pull('single', createSeededRng(1), NOW);
    store.getState().petMalang('soda-drop', 3, NOW);
    const p = store.getState().missions;
    expect(p.date).toBe('2026-09-25');
    expect(p.progress['play-games']).toBe(1);
    expect(p.progress['new-best']).toBe(1);
    expect(p.progress['earn-coins']).toBeGreaterThan(0);
    expect(p.progress.pull).toBe(1);
    expect(p.progress.pet).toBe(3);
  });

  it('완료한 미션 보상과 올클리어 보너스', () => {
    const store = makeStore();
    const progress = Object.fromEntries(missions.map((m) => [m.kind, m.target]));
    store.setState({ coins: 0, missions: { date: '2026-09-25', progress, claimed: [], bonusClaimed: false } });
    expect(store.getState().claimMissionBonus(NOW)).toBe(0);
    let total = 0;
    for (const m of missions) {
      const r = store.getState().claimMission(m.id, NOW);
      if (!r.ok) throw new Error('claim failed');
      total += r.coins;
    }
    expect(store.getState().claimMissionBonus(NOW)).toBe(MISSION_ALL_CLEAR_BONUS);
    expect(store.getState().claimMissionBonus(NOW)).toBe(0);
    expect(store.getState().coins).toBe(total + MISSION_ALL_CLEAR_BONUS);
  });

  it('다음 날에는 어제 진행이 사라진다', () => {
    const store = makeStore();
    store.setState({ missions: { date: '2026-09-24', progress: { pet: 99 }, claimed: [], bonusClaimed: false } });
    store.getState().refreshDaily(NOW);
    expect(store.getState().missions).toEqual({ date: '2026-09-25', progress: {}, claimed: [], bonusClaimed: false });
  });
});

describe('redeemCoupon', () => {
  it('오픈 기념 쿠폰은 한 번만 1000코인을 주고 일일 획득량에는 들어가지 않는다', () => {
    const store = makeStore();
    const before = store.getState().coins;
    const first = store.getState().redeemCoupon(' ZUN ');
    expect(first.ok).toBe(true);
    expect(store.getState().coins).toBe(before + 1000);
    expect(store.getState().dailyEarnedCoins).toBe(0);
    expect(store.getState().redeemedCoupons).toEqual(['open-2026']);
    expect(store.getState().redeemCoupon('zun')).toEqual({ ok: false, reason: 'used' });
    expect(store.getState().coins).toBe(before + 1000);
  });

  it('없는 코드는 코인을 주지 않는다', () => {
    const store = makeStore();
    const before = store.getState().coins;
    expect(store.getState().redeemCoupon('hello').ok).toBe(false);
    expect(store.getState().coins).toBe(before);
  });
});

describe('놀이방 (unboxed / playroom)', () => {
  it('시작 말랑이는 캡슐 없이 열린 채 매트에 나온다', () => {
    const store = makeStore();
    store.getState().chooseStarter('soda-drop');
    expect(store.getState().unboxed).toEqual(['soda-drop']);
    expect(store.getState().playroom.out).toEqual(['soda-drop']);
  });

  it('새로 뽑은 말랑이는 아직 열지 않은 캡슐', () => {
    const store = makeStore();
    store.getState().chooseStarter('soda-drop');
    store.setState({ coins: 100000 });
    const r = store.getState().pull('multi', createSeededRng(3));
    expect(r.ok).toBe(true);
    const ids = Object.keys(store.getState().ownedMalangs).filter((id) => id !== 'soda-drop');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(store.getState().unboxed).not.toContain(id);
    // 안 연 말랑이는 꺼낼 수 없다
    expect(store.getState().takeOutMalang(ids[0]!)).toBe(false);
  });

  it('캡슐을 열면 한 번만 기록되고 자리가 있으면 매트에 오른다', () => {
    const store = makeStore();
    store.getState().chooseStarter('soda-drop');
    store.setState({
      ownedMalangs: {
        ...store.getState().ownedMalangs,
        'ember-imp': { count: 1, shinyCount: 0, firstObtainedAt: 1 },
      },
    });
    expect(store.getState().unboxMalang('ember-imp', 3)).toBe(true);
    expect(store.getState().unboxed).toContain('ember-imp');
    expect(store.getState().playroom.out).toEqual(['soda-drop', 'ember-imp']);
    expect(store.getState().unboxMalang('ember-imp', 3)).toBe(false);
    expect(store.getState().unboxed.filter((id) => id === 'ember-imp')).toHaveLength(1);
    // 보유하지 않은 말랑이는 열 수 없다
    expect(store.getState().unboxMalang('grape-jelly', 3)).toBe(false);
  });

  it('꺼내기·넣기: 상한을 지키고 중복되지 않는다', () => {
    const store = makeStore();
    const owned = { count: 1, shinyCount: 0, firstObtainedAt: 1 };
    store.setState({
      ownedMalangs: { 'peach-mochi': owned, 'soda-drop': owned, 'matcha-bean': owned },
      unboxed: ['peach-mochi', 'soda-drop', 'matcha-bean'],
      playroom: { out: [], mat: 'cloud', props: [{ id: 'plant', x: 0.1, y: 0.2 }] },
    });
    const s = store.getState();
    expect(s.takeOutMalang('peach-mochi', 2)).toBe(true);
    expect(s.takeOutMalang('peach-mochi', 2)).toBe(false);
    expect(s.takeOutMalang('soda-drop', 2)).toBe(true);
    expect(s.takeOutMalang('matcha-bean', 2)).toBe(false);
    s.putBackMalang('peach-mochi');
    expect(store.getState().playroom.out).toEqual(['soda-drop']);
    expect(s.takeOutMalang('matcha-bean', 2)).toBe(true);
    expect(store.getState().playroom.out).toEqual(['soda-drop', 'matcha-bean']);
    // 꺼내고 넣어도 꾸미기는 그대로
    expect(store.getState().playroom.mat).toBe('cloud');
    expect(store.getState().playroom.props).toEqual([{ id: 'plant', x: 0.1, y: 0.2 }]);
  });

  it('들어올 때 한 마리만: 매트를 그 말랑이 하나로, 안 연 말랑이면 빈 매트', () => {
    const store = makeStore();
    const owned = { count: 1, shinyCount: 0, firstObtainedAt: 1 };
    store.setState({
      ownedMalangs: { 'peach-mochi': owned, 'soda-drop': owned, 'matcha-bean': owned },
      unboxed: ['peach-mochi', 'soda-drop'],
      playroom: { out: ['peach-mochi', 'soda-drop'], mat: 'cloud', props: [] },
    });
    const s = store.getState();
    s.soloMalang('soda-drop');
    expect(store.getState().playroom).toEqual({ out: ['soda-drop'], mat: 'cloud', props: [] });
    s.soloMalang('matcha-bean');
    expect(store.getState().playroom.out).toEqual([]);
    s.soloMalang('ghost');
    expect(store.getState().playroom.out).toEqual([]);
    s.soloMalang('peach-mochi');
    expect(s.takeOutMalang('soda-drop', 3)).toBe(true);
    expect(store.getState().playroom.out).toEqual(['peach-mochi', 'soda-drop']);
    s.soloMalang(null);
    expect(store.getState().playroom.out).toEqual([]);
  });

  it('꾸미기: 무늬 바꾸기, 소품 놓기·옮기기·치우기, 3개까지', () => {
    const store = makeStore();
    const s = store.getState();
    s.setPlayroomMat('star-night');
    expect(store.getState().playroom.mat).toBe('star-night');
    s.setPlayroomMat('plaid' as never);
    expect(store.getState().playroom.mat).toBe('star-night');
    expect(s.placeProp('cushion', 0.2, 0.3)).toBe(true);
    expect(s.placeProp('plant', 0.8, 0.3)).toBe(true);
    expect(s.placeProp('gift-box', 0.5, 0.9)).toBe(true);
    expect(s.placeProp('star-lamp', 0.5, 0.1)).toBe(false);
    expect(s.placeProp('cushion', 1.5, 0.4)).toBe(true);
    expect(store.getState().playroom.props[0]).toEqual({ id: 'cushion', x: 1, y: 0.4 });
    s.removeProp('plant');
    expect(store.getState().playroom.props.map((p) => p.id)).toEqual(['cushion', 'gift-box']);
    expect(store.getState().coins).toBe(createInitialSave().coins);
  });
});
