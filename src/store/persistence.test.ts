import { describe, expect, it } from 'vitest';
import { PULL_PRICE, STARTING_COINS } from '../economy/config';
import { SAVE_VERSION, createInitialSave, migrateSave, sanitizeSave } from './persistence';

const NOW = new Date('2026-05-05T03:00:00Z');

describe('sanitizeSave', () => {
  it.each([null, undefined, 42, 'text', [], true])('잘못된 루트 값(%j)은 초기 상태', (raw) => {
    expect(sanitizeSave(raw, NOW)).toEqual(createInitialSave(NOW));
  });

  it('정상 데이터는 그대로 유지', () => {
    const data = {
      ...createInitialSave(NOW),
      coins: 1234,
      ownedMalangs: { 'peach-mochi': { count: 3, shinyCount: 1, firstObtainedAt: 100 } },
      partnerId: 'peach-mochi',
      pityCount: 12,
      settings: { sfxOn: false, musicOn: true },
      miniGameRecords: { 'button-malang': { bestScore: 300, lastScore: 120, plays: 4 } },
      dailyEarnedCoins: 800,
      lastDailyResetDate: '2026-05-05',
      totalPulls: 22,
      claimedSets: ['dessert-shop'],
      affection: { 'peach-mochi': 42 },
      partnerShiny: true,
    };
    expect(sanitizeSave(data, NOW)).toEqual(data);
  });

  it('손상된 필드는 기본값으로 보정', () => {
    const s = sanitizeSave(
      {
        coins: -50,
        pityCount: 9999,
        ownedMalangs: {
          'peach-mochi': { count: 2, firstObtainedAt: 5 },
          'unknown-ip-character': { count: 1, firstObtainedAt: 5 },
          'soda-drop': { count: 0 },
          'grape-jelly': 'broken',
        },
        partnerId: 'unknown-ip-character',
        settings: { sfxOn: 'yes', musicOn: 0 },
        miniGameRecords: { 'button-malang': { bestScore: NaN, plays: 2 }, bad: 3 },
        dailyEarnedCoins: Infinity,
        lastDailyResetDate: 'yesterday',
      },
      NOW,
    );
    expect(s.coins).toBe(0);
    expect(s.pityCount).toBe(49);
    expect(Object.keys(s.ownedMalangs)).toEqual(['peach-mochi']);
    expect(s.partnerId).toBe('peach-mochi');
    expect(s.settings).toEqual({ sfxOn: true, musicOn: true });
    expect(s.miniGameRecords).toEqual({ 'button-malang': { bestScore: 0, lastScore: 0, plays: 2 } });
    expect(s.dailyEarnedCoins).toBe(0);
    expect(s.lastDailyResetDate).toBe('2026-05-05');
  });

  it('시작 선물 코인은 새 저장에만: 첫 뽑기 1회 가격', () => {
    expect(STARTING_COINS).toBe(PULL_PRICE.single);
    expect(createInitialSave(NOW).coins).toBe(STARTING_COINS);
    // 기존 저장은 코인이 그대로거나(0 포함), 없거나 손상돼도 선물을 다시 받지 않는다
    expect(sanitizeSave({ coins: 0, totalPulls: 3 }, NOW).coins).toBe(0);
    expect(sanitizeSave({ coins: 37 }, NOW).coins).toBe(37);
    expect(sanitizeSave({ totalPulls: 3 }, NOW).coins).toBe(0);
    expect(migrateSave({ coins: 0 }, 3, NOW).coins).toBe(0);
    expect(migrateSave({ coins: 0 }, SAVE_VERSION, NOW).coins).toBe(0);
  });

  it('소수 값은 내림', () => {
    expect(sanitizeSave({ coins: 10.9 }, NOW).coins).toBe(10);
  });
});

describe('migrateSave', () => {
  it('현재 버전은 5', () => {
    expect(SAVE_VERSION).toBe(5);
  });

  it('v4 → v5: 음소거였으면 효과음·배경음악 모두 끔', () => {
    const s = migrateSave({ coins: 5, settings: { muted: true } }, 4, NOW);
    expect(s.settings).toEqual({ sfxOn: false, musicOn: false });
    expect('muted' in s.settings).toBe(false);
  });

  it('v4 → v5: 소리를 켜 두었거나 설정이 없으면 둘 다 켬', () => {
    expect(migrateSave({ settings: { muted: false } }, 4, NOW).settings).toEqual({ sfxOn: true, musicOn: true });
    expect(migrateSave({ coins: 1 }, 4, NOW).settings).toEqual({ sfxOn: true, musicOn: true });
    expect(migrateSave({ settings: 'broken' }, 4, NOW).settings).toEqual({ sfxOn: true, musicOn: true });
  });

  it('새 플레이어는 효과음·배경음악 모두 켜진 상태로 시작', () => {
    expect(createInitialSave(NOW).settings).toEqual({ sfxOn: true, musicOn: true });
  });

  it('v5 설정은 각각 따로 유지', () => {
    const s = migrateSave({ settings: { sfxOn: true, musicOn: false } }, 5, NOW);
    expect(s.settings).toEqual({ sfxOn: true, musicOn: false });
  });

  it('v3 → v4: 미션 진행은 오늘 날짜의 빈 진행으로 시작', () => {
    const s = migrateSave({ coins: 5 }, 3, NOW);
    expect(s.missions).toEqual({ date: '2026-05-05', progress: {}, claimed: [], bonusClaimed: false });
  });

  it('손상된 미션 진행은 정화', () => {
    const s = sanitizeSave(
      { missions: { date: '2026-05-05', progress: { pet: 7.9, pull: -3, hack: 99 }, claimed: ['pet', 'pet', 'x'], bonusClaimed: 'yes' } },
      NOW,
    );
    expect(s.missions).toEqual({ date: '2026-05-05', progress: { pet: 7 }, claimed: ['pet'], bonusClaimed: false });
    expect(sanitizeSave({ missions: { date: 'bad' } }, NOW).missions.date).toBe('2026-05-05');
  });

  it('v2 → v3: 남은 뽑기권을 장당 100코인으로 바꿔 코인에 더한다', () => {
    const s = migrateSave({ coins: 250, gachaTickets: 12 }, 2, NOW);
    expect(s.coins).toBe(250 + 12 * 100);
    expect('gachaTickets' in s).toBe(false);
  });

  it('v2 → v3: 손상된 뽑기권 값은 무시', () => {
    expect(migrateSave({ coins: 10, gachaTickets: 'lots' }, 2, NOW).coins).toBe(10);
    expect(migrateSave({ coins: 10, gachaTickets: -5 }, 2, NOW).coins).toBe(10);
  });

  it('v1 데이터를 v2로: 반짝 0, 세트/친밀도 기본값', () => {
    const v1 = {
      coins: 120,
      ownedMalangs: { 'soda-drop': { count: 2, firstObtainedAt: 5 } },
      partnerId: 'soda-drop',
    };
    const s = migrateSave(v1, 1, NOW);
    expect(s.ownedMalangs['soda-drop']).toEqual({ count: 2, shinyCount: 0, firstObtainedAt: 5 });
    expect(s.claimedSets).toEqual([]);
    expect(s.affection).toEqual({});
    expect(s.partnerShiny).toBe(false);
  });

  it('v2 손상 필드 정화: 반짝 수는 보유 수를 넘지 않고, 모르는 세트/캐릭터는 제거', () => {
    const s = sanitizeSave(
      {
        ownedMalangs: { 'soda-drop': { count: 1, shinyCount: 9 } },
        claimedSets: ['dessert-shop', 'fake-set', 3, 'dessert-shop'],
        affection: { 'soda-drop': 12.7, ghost: 5, 'peach-mochi': -3 },
      },
      NOW,
    );
    expect(s.ownedMalangs['soda-drop']?.shinyCount).toBe(1);
    expect(s.claimedSets).toEqual(['dessert-shop']);
    expect(s.affection).toEqual({ 'soda-drop': 12 });
  });

  it('v0 형식을 v1로 변환', () => {
    const v0 = {
      coins: 500,
      tickets: 3,
      owned: ['peach-mochi', 'peach-mochi', 'starry-night', 'ghost-id'],
      pity: 7,
      muted: true,
      best: { 'button-malang': 210 },
    };
    const s = migrateSave(v0, 0, NOW);
    // v0 뽑기권 3장 → v3에서 코인 300으로 합쳐짐
    expect(s.coins).toBe(500 + 3 * 100);
    expect(s.ownedMalangs['peach-mochi']?.count).toBe(2);
    expect(s.ownedMalangs['starry-night']?.count).toBe(1);
    expect(s.ownedMalangs['ghost-id']).toBeUndefined();
    expect(s.pityCount).toBe(7);
    expect(s.settings).toEqual({ sfxOn: false, musicOn: false });
    expect(s.miniGameRecords['button-malang']?.bestScore).toBe(210);
    expect(s.partnerId).toBe('peach-mochi');
  });

  it('손상된 v0 데이터도 크래시하지 않음', () => {
    expect(() => migrateSave({ owned: 'nope', best: [1, 2] }, 0, NOW)).not.toThrow();
    expect(migrateSave('garbage', 0, NOW)).toEqual(createInitialSave(NOW));
  });

  it('미래 버전은 알 수 있는 필드만 살린다', () => {
    const s = migrateSave({ coins: 77, newField: { x: 1 } }, 99, NOW);
    expect(s.coins).toBe(77);
    expect('newField' in s).toBe(false);
  });
});
