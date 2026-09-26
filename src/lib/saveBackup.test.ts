import { describe, expect, it } from 'vitest';
import { BACKUP_SUFFIX, isUsableSave, mirrorSave, restoreSaveIfMissing } from './saveBackup';

const KEY = 'malang-gacha-save';
const GOOD = JSON.stringify({ state: { coins: 500 }, version: 4 });
const OLDER = JSON.stringify({ state: { coins: 100 }, version: 4 });

function mem(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceeded');
  },
};

describe('saveBackup', () => {
  it('isUsableSave: persist 형식만', () => {
    expect(isUsableSave(GOOD)).toBe(true);
    expect(isUsableSave(null)).toBe(false);
    expect(isUsableSave('{oops')).toBe(false);
    expect(isUsableSave('{"state":null}')).toBe(false);
    expect(isUsableSave('42')).toBe(false);
  });

  it('mirrorSave: 세션과 로컬 백업 키에 복사', () => {
    const local = mem({ [KEY]: GOOD });
    const session = mem();
    mirrorSave(KEY, { local, session });
    expect(session.data.get(KEY)).toBe(GOOD);
    expect(local.data.get(KEY + BACKUP_SUFFIX)).toBe(GOOD);
  });

  it('mirrorSave: 원본이 없거나 깨졌으면 좋은 백업을 덮지 않는다', () => {
    const local = mem({ [KEY]: '{broken', [KEY + BACKUP_SUFFIX]: GOOD });
    const session = mem({ [KEY]: GOOD });
    mirrorSave(KEY, { local, session });
    expect(session.data.get(KEY)).toBe(GOOD);
    expect(local.data.get(KEY + BACKUP_SUFFIX)).toBe(GOOD);
  });

  it('restore: 원본이 있으면 아무것도 안 한다', () => {
    const local = mem({ [KEY]: GOOD, [KEY + BACKUP_SUFFIX]: OLDER });
    expect(restoreSaveIfMissing(KEY, { local, session: mem({ [KEY]: OLDER }) })).toBeNull();
    expect(local.data.get(KEY)).toBe(GOOD);
  });

  it('restore: 지워졌으면 세션 복사본을 먼저', () => {
    const local = mem({ [KEY + BACKUP_SUFFIX]: OLDER });
    expect(restoreSaveIfMissing(KEY, { local, session: mem({ [KEY]: GOOD }) })).toBe('session');
    expect(local.data.get(KEY)).toBe(GOOD);
  });

  it('restore: 세션이 없으면 로컬 백업 키', () => {
    const local = mem({ [KEY]: 'not json', [KEY + BACKUP_SUFFIX]: GOOD });
    expect(restoreSaveIfMissing(KEY, { local, session: mem() })).toBe('local-backup');
    expect(local.data.get(KEY)).toBe(GOOD);
  });

  it('restore: 백업도 없으면 null (새로 시작)', () => {
    expect(restoreSaveIfMissing(KEY, { local: mem(), session: mem() })).toBeNull();
  });

  it('저장소 접근이 막혀도 throw하지 않는다', () => {
    expect(() => mirrorSave(KEY, { local: broken, session: broken })).not.toThrow();
    expect(restoreSaveIfMissing(KEY, { local: broken, session: mem({ [KEY]: GOOD }) })).toBeNull();
    expect(restoreSaveIfMissing(KEY, {})).toBeNull();
  });
});
