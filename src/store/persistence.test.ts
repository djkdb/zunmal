import { describe, expect, it } from 'vitest';
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
      gachaTickets: 5,
      ownedMalangs: { 'peach-mochi': { count: 3, firstObtainedAt: 100 } },
      partnerId: 'peach-mochi',
      pityCount: 12,
      settings: { muted: true },
      miniGameRecords: { 'button-malang': { bestScore: 300, lastScore: 120, plays: 4 } },
      dailyEarnedCoins: 800,
      lastDailyResetDate: '2026-05-05',
      totalPulls: 22,
    };
    expect(sanitizeSave(data, NOW)).toEqual(data);
  });

  it('손상된 필드는 기본값으로 보정', () => {
    const s = sanitizeSave(
      {
        coins: -50,
        gachaTickets: 'many',
        pityCount: 9999,
        ownedMalangs: {
          'peach-mochi': { count: 2, firstObtainedAt: 5 },
          'unknown-ip-character': { count: 1, firstObtainedAt: 5 },
          'soda-drop': { count: 0 },
          'grape-jelly': 'broken',
        },
        partnerId: 'unknown-ip-character',
        settings: { muted: 'yes' },
        miniGameRecords: { 'button-malang': { bestScore: NaN, plays: 2 }, bad: 3 },
        dailyEarnedCoins: Infinity,
        lastDailyResetDate: 'yesterday',
      },
      NOW,
    );
    expect(s.coins).toBe(0);
    expect(s.gachaTickets).toBe(0);
    expect(s.pityCount).toBe(49);
    expect(Object.keys(s.ownedMalangs)).toEqual(['peach-mochi']);
    expect(s.partnerId).toBe('peach-mochi');
    expect(s.settings.muted).toBe(false);
    expect(s.miniGameRecords).toEqual({ 'button-malang': { bestScore: 0, lastScore: 0, plays: 2 } });
    expect(s.dailyEarnedCoins).toBe(0);
    expect(s.lastDailyResetDate).toBe('2026-05-05');
  });

  it('소수 값은 내림', () => {
    expect(sanitizeSave({ coins: 10.9 }, NOW).coins).toBe(10);
  });
});

describe('migrateSave', () => {
  it('현재 버전은 1', () => {
    expect(SAVE_VERSION).toBe(1);
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
    expect(s.coins).toBe(500);
    expect(s.gachaTickets).toBe(3);
    expect(s.ownedMalangs['peach-mochi']?.count).toBe(2);
    expect(s.ownedMalangs['starry-night']?.count).toBe(1);
    expect(s.ownedMalangs['ghost-id']).toBeUndefined();
    expect(s.pityCount).toBe(7);
    expect(s.settings.muted).toBe(true);
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
