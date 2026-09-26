import { describe, expect, it } from 'vitest';
import { STARTING_COINS } from '../economy/config';
import { generateDailyMissions } from '../missions/missions';
import { readHub } from './hubState';
import { HOUR, NOW, TODAY, YESTERDAY, ownedMap, starterSave } from './testSave';
import { homeAlerts } from './alerts';
import { TODAY_ITEMS, todayLoop } from './today';

const hub = (patch: Parameters<typeof starterSave>[0] = {}, now = NOW) => readHub(starterSave(patch), now);
const stateOf = (patch: Parameters<typeof starterSave>[0], id: (typeof TODAY_ITEMS)[number]) =>
  todayLoop(hub(patch)).items.find((i) => i.id === id)?.state;

const oldPlayer = { ownedMalangs: ownedMap(['peach-mochi', 'custard-bun']), unboxed: ['peach-mochi', 'custard-bun'] };

describe('todayLoop', () => {
  it('순서: 선물 → 미션 → 가게 → 미니게임 → 뽑기', () => {
    expect(todayLoop(hub()).items.map((i) => i.id)).toEqual([...TODAY_ITEMS]);
  });

  it('시작한 날: 선물은 내일부터, 셀 칸에서 뺀다', () => {
    const loop = todayLoop(hub({ coins: STARTING_COINS }));
    expect(loop.items[0]?.state).toBe('later');
    expect(loop.total).toBe(4);
    expect(loop.items.find((i) => i.id === 'pull')?.state).toBe('ready');
  });

  it('선물: 왔으면 ready, 오늘 받았으면 done', () => {
    expect(stateOf({ ...oldPlayer, giftDay: YESTERDAY }, 'gift')).toBe('ready');
    expect(stateOf({ ...oldPlayer, giftDay: TODAY }, 'gift')).toBe('done');
  });

  it('미니게임·뽑기: 오늘 하루 기록으로 체크 (어제 기록은 무시)', () => {
    const today = { date: TODAY, progress: { 'play-games': 1, pull: 2 }, claimed: [], bonusClaimed: false };
    expect(stateOf({ ...oldPlayer, missions: today }, 'play')).toBe('done');
    expect(stateOf({ ...oldPlayer, missions: today }, 'pull')).toBe('done');
    const old = { ...today, date: YESTERDAY };
    expect(stateOf({ ...oldPlayer, coins: 0, missions: old }, 'play')).toBe('todo');
    expect(stateOf({ ...oldPlayer, coins: 0, missions: old }, 'pull')).toBe('todo');
  });

  it('가게: 오늘 받았으면 done, 다시 가득 차면 ready', () => {
    const claimed = { date: TODAY, progress: { 'shop-claim': 1 }, claimed: [], bonusClaimed: false };
    expect(stateOf({ ...oldPlayer, missions: claimed }, 'shop')).toBe('done');
    expect(stateOf({ ...oldPlayer, missions: claimed, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 10 * HOUR, banked: 0 } }, 'shop')).toBe(
      'ready',
    );
    expect(stateOf({ ...oldPlayer }, 'shop')).toBe('todo');
  });

  it('미션: 받을 게 있으면 ready, 보너스까지 받았으면 done', () => {
    const list = generateDailyMissions(TODAY);
    const first = list[0];
    if (!first) throw new Error('no mission');
    expect(stateOf({ missions: { date: TODAY, progress: { [first.kind]: first.target }, claimed: [], bonusClaimed: false } }, 'missions')).toBe(
      'ready',
    );
    expect(stateOf({ missions: { date: TODAY, progress: {}, claimed: list.map((m) => m.id), bonusClaimed: true } }, 'missions')).toBe('done');
  });

  it('done 수 세기', () => {
    const loop = todayLoop(
      hub({
        ...oldPlayer,
        giftDay: TODAY,
        missions: { date: TODAY, progress: { 'play-games': 1, pull: 1, 'shop-claim': 1 }, claimed: [], bonusClaimed: false },
      }),
    );
    expect(loop.done).toBe(4);
    expect(loop.total).toBe(5);
  });
});

describe('homeAlerts', () => {
  it('새 플레이어는 조용하다', () => {
    const a = homeAlerts(hub({ coins: STARTING_COINS }));
    expect(a.any).toBe(false);
    expect(a.label).toBe('');
  });

  it('선물·가게 가득 참·봉인 캡슐에도 점', () => {
    expect(homeAlerts(hub({ ...oldPlayer, giftDay: YESTERDAY })).gift).toBe(true);
    const full = homeAlerts(hub({ ...oldPlayer, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 9 * HOUR, banked: 0 } }));
    expect(full.shopFull).toBe(true);
    expect(full.label).toContain('가게');
    const sealed = homeAlerts(hub({ totalPulls: 1, ownedMalangs: { ...ownedMap(['peach-mochi']), ...ownedMap(['jellyfish', 'custard-bun'], NOW) } }));
    expect(sealed.sealed).toBe(2);
    expect(sealed.any).toBe(true);
    expect(sealed.label).toBe('열지 않은 캡슐 2개');
  });

  it('가게가 조금 쌓인 것으로는 켜지 않는다', () => {
    expect(homeAlerts(hub({ ...oldPlayer, shop: { staff: ['peach-mochi'], lastTickAt: NOW - 2 * HOUR, banked: 0 } })).any).toBe(false);
  });

  it('미션 보상', () => {
    const m = generateDailyMissions(TODAY)[0];
    if (!m) throw new Error('no mission');
    const a = homeAlerts(hub({ missions: { date: TODAY, progress: { [m.kind]: m.target }, claimed: [], bonusClaimed: false } }));
    expect(a.missions).toBe(true);
    expect(a.label).toBe('받을 미션 보상 있음');
  });
});
